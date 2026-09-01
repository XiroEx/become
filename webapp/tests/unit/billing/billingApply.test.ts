// Run with: npx tsx --test tests/unit/billing/billingApply.test.ts
//
// applyBillingOutcome is where an event becomes a write, and every guard in it
// protects against a failure that is invisible until someone complains:
//
//   - Stripe delivers OUT OF ORDER. A late redelivery of a cancellation would
//     otherwise resurrect itself on top of a member who has resubscribed.
//   - Prod and beta share ONE database. A beta test-mode event must never
//     overwrite a live subscription.
//   - `grandfathered` is a promise made offline by the migration. No payment
//     event may take it back.
//
// deriveTier is INJECTED, so this file never imports lib/subscription. That is
// the decoupling that keeps billing one import line away from a tier model that
// might move — and the stub below is the §5 contract written out in full, so a
// change in the real deriveTier that breaks these rules is caught by
// tests/unit/entitlements/deriveTier.test.ts rather than silently here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBillingOutcome, isStaleEvent, type ApplyDeps, type ExistingBillingState } from '../../../lib/billing/apply'
import type { BillingOutcome } from '../../../lib/billing/webhookEvents'
import type { BillingConfig } from '../../../lib/billing/config'
import type { SubscriptionState } from '../../../lib/billing/subscriptionState'
import type { Tier } from '../../../lib/entitlements'
import type { IUserSubscription } from '../../../models/User'

const NOW = new Date('2026-09-01T12:00:00.000Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW.getTime() + days * DAY)
const secondsAt = (days: number) => Math.floor(at(days).getTime() / 1000)

const CFG: BillingConfig = {
  configured: true,
  mode: 'test',
  prices: { monthly: 'price_unit_monthly', annual: 'price_unit_annual' },
}

/** The §5 tier contract, stated independently of lib/subscription.ts. */
function stubDeriveTier(input: {
  subscription?: IUserSubscription | null
  grandfathered?: boolean
  role?: string
  now?: Date
}): Tier {
  if (input.role === 'admin') return 'plus'
  if (input.grandfathered === true) return 'plus'
  const sub = input.subscription
  if (!sub) return 'free'
  const now = (input.now ?? NOW).getTime()
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return 'plus'
    case 'canceled':
      return end !== null && end > now ? 'plus' : 'free'
    default:
      return 'free'
  }
}

interface Harness {
  deps: ApplyDeps
  writes: Array<{ userId: string; patch: Record<string, unknown> }>
  tierChanges: Array<{ userId: string; tier: Tier }>
}

function harness(existing: ExistingBillingState | null, overrides: Partial<ApplyDeps> = {}): Harness {
  const writes: Harness['writes'] = []
  const tierChanges: Harness['tierChanges'] = []
  return {
    writes,
    tierChanges,
    deps: {
      cfg: CFG,
      findUserId: async () => (existing ? 'user_1' : null),
      loadExisting: async () => existing,
      writeSubscription: async (userId, patch) => {
        writes.push({ userId, patch })
      },
      deriveTier: stubDeriveTier,
      onTierChanged: async (userId, tier) => {
        tierChanges.push({ userId, tier })
      },
      now: () => NOW,
      ...overrides,
    },
  }
}

function state(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    status: 'active',
    plan: 'monthly',
    currentPeriodEnd: at(30),
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: 'sub_test_1',
    stripePriceId: 'price_unit_monthly',
    mode: 'test',
    ...overrides,
  }
}

function subscriptionOutcome(overrides: Partial<SubscriptionState> = {}): BillingOutcome {
  return {
    kind: 'subscription',
    ref: { by: 'userId', userId: 'user_1' },
    customerId: 'cus_test_1',
    state: state(overrides),
    eventCreated: secondsAt(0),
  }
}

// ─── tier projection ─────────────────────────────────────────────────────────

test('an active subscription writes the state AND tier plus, in one patch', () => {
  const h = harness({ tier: 'free', subscription: null })
  return applyBillingOutcome(subscriptionOutcome(), h.deps, 'evt_1').then((result) => {
    assert.equal(result.applied, true)
    if (!result.applied) return
    assert.equal(result.tier, 'plus')
    assert.equal(h.writes.length, 1)

    const patch = h.writes[0].patch
    assert.equal(patch.tier, 'plus', 'tier must ride the same $set as the subscription')
    assert.equal(patch['subscription.status'], 'active')
    assert.equal(patch['subscription.plan'], 'monthly')
    assert.equal(patch['subscription.mode'], 'test')
    assert.equal(patch['subscription.lastEventId'], 'evt_1')
    assert.equal(patch['subscription.stripeTestCustomerId'], 'cus_test_1')
    assert.equal(patch['subscription.stripeCustomerId'], undefined, 'never the live field')
    assert.ok(patch['subscription.updatedAt'] instanceof Date)
  })
})

test('past_due writes tier free — a lapsed payment is not access', async () => {
  const h = harness({ tier: 'plus', subscription: { status: 'active' } })
  const result = await applyBillingOutcome(subscriptionOutcome({ status: 'past_due' }), h.deps)

  assert.equal(result.applied, true)
  if (!result.applied) return
  assert.equal(result.tier, 'free')
  assert.equal(h.writes[0].patch.tier, 'free')
  assert.equal(h.writes[0].patch['subscription.status'], 'past_due')
})

test('a canceled subscription keeps plus through the period already paid for', async () => {
  const future = harness({ tier: 'plus', subscription: { status: 'active' } })
  const stillPaid = await applyBillingOutcome(
    subscriptionOutcome({ status: 'canceled', currentPeriodEnd: at(5) }),
    future.deps,
  )
  assert.equal(stillPaid.applied && stillPaid.tier, 'plus')

  const lapsed = harness({ tier: 'plus', subscription: { status: 'active' } })
  const over = await applyBillingOutcome(
    subscriptionOutcome({ status: 'canceled', currentPeriodEnd: at(-1) }),
    lapsed.deps,
  )
  assert.equal(over.applied && over.tier, 'free')
})

test('grandfathered survives every event and is never in a patch', async () => {
  const h = harness({ tier: 'plus', grandfathered: true, subscription: { status: 'active' } })
  const result = await applyBillingOutcome(subscriptionOutcome({ status: 'canceled', currentPeriodEnd: at(-30) }), h.deps)

  assert.equal(result.applied, true)
  if (!result.applied) return
  assert.equal(result.tier, 'plus', 'a lapsed payment cannot revoke an offline promotion')

  const keys = Object.keys(h.writes[0].patch)
  assert.ok(!keys.includes('grandfathered'), 'grandfathered must never appear in a billing patch')
  assert.ok(!keys.some((k) => k.includes('grandfathered')))
})

// ─── ordering ────────────────────────────────────────────────────────────────

test('isStaleEvent compares Stripe seconds against our stored millis', () => {
  const stored = at(0)
  assert.equal(isStaleEvent(secondsAt(-1), stored), true)
  assert.equal(isStaleEvent(secondsAt(1), stored), false)
  assert.equal(isStaleEvent(secondsAt(-1), null), false, 'nothing stored yet — apply it')
  assert.equal(isStaleEvent(secondsAt(-1), undefined), false)
  assert.equal(isStaleEvent(0, stored), true)
})

test('an out-of-order event is dropped with ZERO writes', async () => {
  // The real scenario: a delayed `deleted` arrives after the member has already
  // resubscribed. Applying it would cancel a live subscription.
  const h = harness({
    tier: 'plus',
    subscription: { status: 'active', updatedAt: at(0), mode: 'test' },
  })
  const result = await applyBillingOutcome(
    { ...subscriptionOutcome({ status: 'canceled' }), eventCreated: secondsAt(-2) } as BillingOutcome,
    h.deps,
  )

  assert.deepEqual(result, { applied: false, reason: 'stale_event' })
  assert.equal(h.writes.length, 0, 'a stale event must not write anything at all')
  assert.equal(h.tierChanges.length, 0)
})

// ─── mode fence ──────────────────────────────────────────────────────────────

test('a test-mode event cannot overwrite live state — zero writes', async () => {
  const h = harness({
    tier: 'plus',
    subscription: { status: 'active', mode: 'live', currentPeriodEnd: at(20) },
  })
  const result = await applyBillingOutcome(subscriptionOutcome({ status: 'canceled' }), h.deps)

  assert.deepEqual(result, { applied: false, reason: 'mode_downgrade_blocked' })
  assert.equal(h.writes.length, 0, 'beta must never cancel a real subscription')
})

test('a live event DOES overwrite test state — real money wins', async () => {
  const h = harness({ tier: 'free', subscription: { status: 'canceled', mode: 'test' } })
  const result = await applyBillingOutcome(subscriptionOutcome({ mode: 'live' }), h.deps)

  assert.equal(result.applied, true)
  assert.equal(h.writes.length, 1)
  assert.equal(h.writes[0].patch['subscription.mode'], 'live')
  assert.equal(h.writes[0].patch['subscription.stripeCustomerId'], 'cus_test_1', 'live field')
})

// ─── attribution ─────────────────────────────────────────────────────────────

test('an event for a member we cannot find writes nothing', async () => {
  const h = harness(null)
  const result = await applyBillingOutcome(subscriptionOutcome(), h.deps)

  assert.deepEqual(result, { applied: false, reason: 'user_not_found' })
  assert.equal(h.writes.length, 0)
})

test('an ignored outcome is a no-op', async () => {
  const h = harness({ tier: 'free' })
  const result = await applyBillingOutcome({ kind: 'ignored', reason: 'unhandled_type' }, h.deps)

  assert.deepEqual(result, { applied: false, reason: 'ignored' })
  assert.equal(h.writes.length, 0)
})

// ─── cache invalidation ──────────────────────────────────────────────────────

test('onTierChanged fires only when the tier actually changes', async () => {
  const changed = harness({ tier: 'free', subscription: { status: 'none' } })
  await applyBillingOutcome(subscriptionOutcome(), changed.deps)
  assert.deepEqual(changed.tierChanges, [{ userId: 'user_1', tier: 'plus' }])

  const unchanged = harness({ tier: 'plus', subscription: { status: 'active' } })
  await applyBillingOutcome(subscriptionOutcome(), unchanged.deps)
  assert.equal(unchanged.tierChanges.length, 0, 'a renewal must not churn the cache')
  assert.equal(unchanged.writes.length, 1, 'but the state is still written')
})

// ─── the link branch ─────────────────────────────────────────────────────────

test('a checkout link stores the ids even when the subscription cannot be read', async () => {
  const h = harness(
    { tier: 'free', subscription: null },
    {
      retrieveSubscription: async () => {
        throw new Error('stripe is down')
      },
    },
  )
  const result = await applyBillingOutcome(
    {
      kind: 'link',
      ref: { by: 'userId', userId: 'user_1' },
      customerId: 'cus_test_1',
      subscriptionId: 'sub_test_1',
      mode: 'test',
      eventCreated: secondsAt(0),
    },
    h.deps,
    'evt_link',
  )

  // Non-fatal: customer.subscription.created carries the same state and is
  // idempotent, so waiting for it costs seconds, not a lost subscription.
  assert.equal(result.applied, true)
  const patch = h.writes[0].patch
  assert.equal(patch['subscription.stripeTestCustomerId'], 'cus_test_1')
  assert.equal(patch['subscription.stripeSubscriptionId'], 'sub_test_1')
  assert.equal(patch.tier, 'free', 'no state read means no tier granted yet')
})

test('a checkout link upgrades to full state when the subscription resolves', async () => {
  const h = harness(
    { tier: 'free', subscription: null },
    {
      retrieveSubscription: async () =>
        ({
          id: 'sub_test_1',
          status: 'active',
          cancel_at_period_end: false,
          items: {
            data: [
              {
                current_period_end: Math.floor(at(30).getTime() / 1000),
                price: { id: 'price_unit_monthly' },
              },
            ],
          },
        }) as never,
    },
  )
  const result = await applyBillingOutcome(
    {
      kind: 'link',
      ref: { by: 'userId', userId: 'user_1' },
      customerId: 'cus_test_1',
      subscriptionId: 'sub_test_1',
      mode: 'test',
      eventCreated: secondsAt(0),
    },
    h.deps,
  )

  assert.equal(result.applied && result.tier, 'plus')
  assert.equal(h.writes[0].patch['subscription.status'], 'active')
  assert.equal(h.writes[0].patch['subscription.plan'], 'monthly')
})

// ─── payment_failed ──────────────────────────────────────────────────────────

test('a failed payment stamps the timestamp but does NOT change tier', async () => {
  // The downgrade is customer.subscription.updated → past_due. Doing it here
  // too would race that event and cut off someone whose retry succeeded.
  const h = harness({
    tier: 'plus',
    subscription: { status: 'active', currentPeriodEnd: at(20), mode: 'test' },
  })
  const result = await applyBillingOutcome(
    {
      kind: 'payment_failed',
      ref: { by: 'userId', userId: 'user_1' },
      subscriptionId: 'sub_test_1',
      mode: 'test',
      eventCreated: secondsAt(0),
    },
    h.deps,
    'evt_failed',
  )

  assert.equal(result.applied, true)
  const patch = h.writes[0].patch
  assert.ok(patch['subscription.paymentFailedAt'] instanceof Date)
  assert.equal(patch['subscription.status'], undefined, 'status is not this branch to set')
  assert.equal(patch.tier, 'plus', 'still active until Stripe says otherwise')
  assert.equal(h.tierChanges.length, 0)
})
