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

test('isStaleEvent compares Stripe seconds against STRIPE seconds', () => {
  const stored = secondsAt(0)
  assert.equal(isStaleEvent(stored - 1, stored), true)
  assert.equal(isStaleEvent(stored + 1, stored), false)
  assert.equal(isStaleEvent(stored - 1, null), false, 'nothing applied yet — apply it')
  assert.equal(isStaleEvent(stored - 1, undefined), false)
  // Same second is NOT stale: `created` is second-granularity, so order inside
  // one second is unknowable and every event in the burst carries real state.
  assert.equal(isStaleEvent(stored, stored), false)
})

test('isStaleEvent never reads OUR write clock — the burst-drop regression', () => {
  // Stripe emits checkout/subscription events in bursts: several events sharing
  // one `created` second, delivered and processed a beat later. After the first
  // is applied, the stored Stripe clock is that second.
  const burst = secondsAt(0)
  const ourWriteInstant = at(0).getTime() + 2000 // wall clock, ~2s after `created`

  // The sibling — same created second, delivered second — must still apply.
  assert.equal(isStaleEvent(burst, burst), false, 'a burst sibling must still apply')

  // The old comparison put OUR write instant (millis) on the right-hand side.
  // Delivery plus processing latency is always positive, so that same sibling
  // read as stale: only the FIRST event of any burst was ever applied.
  assert.ok(burst * 1000 < ourWriteInstant, 'the old comparison really did drop it')

  // A millis value can never sneak back in as the comparand undetected — it is
  // ~1000x larger than any `created` second, so everything reads stale.
  assert.equal(isStaleEvent(burst, ourWriteInstant), true)
  assert.notEqual(ourWriteInstant, burst, 'the two clocks are not interchangeable')
})

test('payment_failed and past_due in the SAME second both apply', async () => {
  // The exact pair Stripe emits together during dunning. Under the old
  // comparison whichever landed second was dropped, so past_due never reached
  // the user document about half the time and the member kept Plus through the
  // whole dunning period plus the 3-day grace.
  const burst = secondsAt(0)
  const h = harness({
    tier: 'plus',
    subscription: { status: 'active', mode: 'test', lastEventCreated: burst, updatedAt: at(0) },
  })

  const result = await applyBillingOutcome(
    { ...subscriptionOutcome({ status: 'past_due' }), eventCreated: burst } as BillingOutcome,
    h.deps,
    'evt_burst_2',
  )

  assert.equal(result.applied, true, 'the second event of a burst must not be dropped')
  if (!result.applied) return
  assert.equal(result.tier, 'free')
  assert.equal(h.writes[0].patch['subscription.status'], 'past_due')
  assert.equal(h.writes[0].patch['subscription.lastEventCreated'], burst)
})

test('a state-carrying branch stamps lastEventCreated; payment_failed must NOT', async () => {
  // The stamp is what "an older event has already been superseded" means, so
  // every branch that CHANGES subscription state has to leave one.
  const created = secondsAt(0)
  const linkOnly = harness({ tier: 'free', subscription: null })
  await applyBillingOutcome(
    {
      kind: 'link',
      ref: { by: 'userId', userId: 'user_1' },
      customerId: 'cus_test_1',
      subscriptionId: undefined,
      mode: 'test',
      eventCreated: created,
    } as BillingOutcome,
    linkOnly.deps,
    'evt_link',
  )
  assert.equal(linkOnly.writes[0].patch['subscription.lastEventCreated'], created)

  const subscribed = harness({ tier: 'free', subscription: null })
  await applyBillingOutcome(subscriptionOutcome(), subscribed.deps, 'evt_sub')
  assert.equal(subscribed.writes[0].patch['subscription.lastEventCreated'], secondsAt(0))

  // invoice.payment_failed is the exception, and it is the whole point. It is a
  // notification: it changes no state, so it must not become the ordering floor.
  // Stripe emits it alongside customer.subscription.updated -> past_due, and when
  // this one's `created` was the later of the two, stamping it here made the
  // past_due event read as stale and vanish - the member kept Plus through the
  // entire retry window.
  const failed = harness({ tier: 'plus', subscription: { status: 'active', mode: 'test' } })
  await applyBillingOutcome(
    {
      kind: 'payment_failed',
      ref: { by: 'userId', userId: 'user_1' },
      subscriptionId: 'sub_test_1',
      mode: 'test',
      eventCreated: created,
    } as BillingOutcome,
    failed.deps,
    'evt_failed',
  )
  const patch = failed.writes[0].patch
  assert.equal(patch['subscription.lastEventCreated'], undefined, 'a notice is not an ordering floor')
  assert.equal(patch['subscription.lastEventId'], undefined)
  assert.ok(patch['subscription.paymentFailedAt'] instanceof Date, 'but it still stamps the notice')
})

test('an out-of-order event is dropped with ZERO writes', async () => {
  // The real scenario: a delayed `deleted` arrives after the member has already
  // resubscribed. Applying it would cancel a live subscription.
  const h = harness({
    tier: 'plus',
    subscription: { status: 'active', lastEventCreated: secondsAt(0), updatedAt: at(0), mode: 'test' },
  })
  const result = await applyBillingOutcome(
    { ...subscriptionOutcome({ status: 'canceled' }), eventCreated: secondsAt(-2) } as BillingOutcome,
    h.deps,
  )

  assert.deepEqual(result, { applied: false, reason: 'stale_event' })
  assert.equal(h.writes.length, 0, 'a stale event must not write anything at all')
  assert.equal(h.tierChanges.length, 0)
})

test('a fresh document with only updatedAt set is NOT treated as ordered state', async () => {
  // Migration reality: every existing subscription row has updatedAt and no
  // lastEventCreated. Those must all apply, not silently drop.
  const h = harness({
    tier: 'free',
    subscription: { status: 'active', mode: 'test', updatedAt: at(10) },
  })
  const result = await applyBillingOutcome(
    { ...subscriptionOutcome({ status: 'canceled', currentPeriodEnd: at(-1) }), eventCreated: secondsAt(-5) } as BillingOutcome,
    h.deps,
  )
  assert.equal(result.applied, true, 'no stored Stripe clock means nothing to be older than')
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
  // No state read means no tier WRITTEN at all - not even the one the row
  // already had. Re-asserting a snapshot is how a concurrent, better-informed
  // event gets reverted; the subscription events supply the tier moments later.
  assert.equal(patch.tier, undefined, 'no state read means no tier write')
  assert.equal(result.applied && result.tier, 'free', 'still REPORTED, just not written')
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

test('a failed payment stamps the timestamp and writes NO tier at all', async () => {
  // The downgrade is customer.subscription.updated → past_due. Doing it here
  // too would race that event and cut off someone whose retry succeeded.
  //
  // But the old code did something subtler and worse than downgrading: it wrote
  // the tier it derived from the row it had just READ. The row still said
  // `active`, so it wrote 'plus' - a fact about the past, dressed as a decision.
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
  assert.equal(patch.tier, undefined, 'a notification may not write a tier - even the same one')
  assert.deepEqual(
    Object.keys(patch).sort(),
    ['subscription.mode', 'subscription.paymentFailedAt', 'subscription.updatedAt'],
    'and it writes nothing else either',
  )
  assert.equal(h.tierChanges.length, 0)
})

test('the dunning pair: payment_failed landing LAST cannot undo the past_due downgrade', async () => {
  // The exact concurrency Stripe produces. Both events are created in the same
  // second and both handlers read the document while it still says `active`:
  //
  //   customer.subscription.updated → past_due   derives 'free', writes it
  //   invoice.payment_failed                     derives from its own stale read
  //
  // Whichever lands second is the one that decides what is in the database. The
  // fix is not to order them - they are concurrent - but to make the second one
  // harmless, by giving it nothing to say about tier.
  const burst = secondsAt(0)
  const beforeEither: ExistingBillingState = {
    tier: 'plus',
    subscription: {
      status: 'active',
      currentPeriodEnd: at(20),
      mode: 'test',
      stripeSubscriptionId: 'sub_test_1',
    },
  }

  const pastDue = harness(beforeEither)
  const downgrade = await applyBillingOutcome(
    { ...subscriptionOutcome({ status: 'past_due' }), eventCreated: burst } as BillingOutcome,
    pastDue.deps,
    'evt_updated',
  )
  assert.equal(downgrade.applied && downgrade.tier, 'free')
  assert.equal(pastDue.writes[0].patch.tier, 'free')

  // Same starting snapshot - that IS the race - and this one lands afterwards.
  const failed = harness(beforeEither)
  const notice = await applyBillingOutcome(
    {
      kind: 'payment_failed',
      ref: { by: 'userId', userId: 'user_1' },
      subscriptionId: 'sub_test_1',
      mode: 'test',
      eventCreated: burst,
    },
    failed.deps,
    'evt_invoice',
  )

  assert.equal(notice.applied, true)
  const late = failed.writes[0].patch
  assert.equal(late.tier, undefined, 'the late write must not resurrect plus')
  assert.equal(late['subscription.status'], undefined)

  // Merge them in the order that used to lose, and past_due's decision survives.
  const merged = { ...pastDue.writes[0].patch, ...late }
  assert.equal(merged.tier, 'free', 'a member in dunning does not keep Plus')
  assert.equal(merged['subscription.status'], 'past_due')
})

test('payment_failed does not advance the ordering floor past its sibling', async () => {
  // The other half of the same pair: when the invoice event carries the LATER
  // `created` of the two, stamping it here made the past_due event that arrived
  // a moment later read as strictly older - and it was dropped with zero writes.
  const h = harness({
    tier: 'plus',
    subscription: { status: 'active', mode: 'test', stripeSubscriptionId: 'sub_test_1' },
  })
  await applyBillingOutcome(
    {
      kind: 'payment_failed',
      ref: { by: 'userId', userId: 'user_1' },
      subscriptionId: 'sub_test_1',
      mode: 'test',
      eventCreated: secondsAt(0) + 1, // the later of the pair
    },
    h.deps,
    'evt_invoice',
  )

  const stamped = h.writes[0].patch['subscription.lastEventCreated'] as number | undefined
  assert.equal(stamped, undefined)
  // Nothing was stamped, so the sibling created a second earlier still applies.
  assert.equal(isStaleEvent(secondsAt(0), stamped), false)
})

// ─── a second subscription on one customer ─────────────────────────────

test('a DIFFERENT subscription cannot speak for an active one', async () => {
  // Checkout used to let a past_due member buy again (past_due derives to free,
  // so the CTA was showing), leaving two live subscriptions on one customer.
  // When dunning finally killed the first, its terminal event would land here
  // and downgrade a member the second one is billing every month.
  const h = harness({
    tier: 'plus',
    subscription: {
      status: 'active',
      mode: 'test',
      currentPeriodEnd: at(20),
      stripeSubscriptionId: 'sub_the_one_paying',
    },
  })
  const result = await applyBillingOutcome(
    subscriptionOutcome({ status: 'canceled', stripeSubscriptionId: 'sub_the_dead_one' }),
    h.deps,
  )

  assert.deepEqual(result, { applied: false, reason: 'other_subscription' })
  assert.equal(h.writes.length, 0)
})

test('but a re-subscribe after a cancellation DOES apply', async () => {
  // Scoped to active|trialing on purpose: once the stored subscription is no
  // longer live, a new id is the member coming back, not a stray sibling.
  const h = harness({
    tier: 'free',
    subscription: {
      status: 'canceled',
      mode: 'test',
      currentPeriodEnd: at(-1),
      stripeSubscriptionId: 'sub_old',
    },
  })
  const result = await applyBillingOutcome(
    subscriptionOutcome({ stripeSubscriptionId: 'sub_new' }),
    h.deps,
  )

  assert.equal(result.applied && result.tier, 'plus')
  assert.equal(h.writes[0].patch['subscription.stripeSubscriptionId'], 'sub_new')
})

test('the SAME subscription updating itself is never mistaken for a sibling', async () => {
  const h = harness({
    tier: 'plus',
    subscription: {
      status: 'active',
      mode: 'test',
      currentPeriodEnd: at(20),
      stripeSubscriptionId: 'sub_test_1',
    },
  })
  const result = await applyBillingOutcome(subscriptionOutcome({ status: 'past_due' }), h.deps)
  assert.equal(result.applied && result.tier, 'free')
})

// ─── the ordering guard is handed to the store ─────────────────────────

test('every write carries the event clock, so the store can re-assert ordering', async () => {
  // The stale check in applyBillingOutcome is a READ. Between it and the write,
  // a second delivery can complete; the loser would then overwrite newer state
  // with older. mongoDeps re-asserts the comparison inside the update filter,
  // which it can only do if the clock reaches it.
  const guards: Array<{ eventCreated: number } | undefined> = []
  const h = harness(
    { tier: 'free', subscription: null },
    {
      writeSubscription: async (_userId, _patch, guard) => {
        guards.push(guard)
      },
    },
  )

  await applyBillingOutcome(subscriptionOutcome(), h.deps, 'evt_1')
  await applyBillingOutcome(
    {
      kind: 'payment_failed',
      ref: { by: 'userId', userId: 'user_1' },
      subscriptionId: 'sub_test_1',
      mode: 'test',
      eventCreated: secondsAt(1),
    },
    h.deps,
    'evt_2',
  )

  assert.deepEqual(guards, [{ eventCreated: secondsAt(0) }, { eventCreated: secondsAt(1) }])
})

// ─── a refused write is reported as one ────────────────────────────────

test('a store that refuses the write is NOT reported as applied', async () => {
  // The store's guard re-asserts the ordering check inside the update filter,
  // so it can legitimately match nothing: a newer event landed between the READ
  // above and this write. That skip is correct. What was wrong is that the
  // store returned void either way, so applyBillingOutcome could not tell the
  // two apart — it fired onTierChanged and answered `applied: true`, and the
  // webhook logged `applied tier=plus` for a write Mongo had just rejected. An
  // operator debugging a tier dispute reads that line and believes it.
  const h = harness(
    { tier: 'free', subscription: { status: 'none', mode: 'test' } },
    { writeSubscription: async () => ({ applied: false, reason: 'newer_state' }) },
  )

  const result = await applyBillingOutcome(subscriptionOutcome(), h.deps, 'evt_late')

  assert.deepEqual(result, { applied: false, reason: 'skipped_newer_state' })
  assert.equal(h.tierChanges.length, 0, 'no tier moved, so no cache may be busted')
})

test('the skip has its own reason, distinct from the stale-event read', async () => {
  // Same meaning, one layer down — and worth telling apart in the log: either
  // the read caught it (stale_event) or the write filter did.
  const h = harness(
    { tier: 'plus', subscription: { status: 'active', mode: 'test' } },
    { writeSubscription: async () => ({ applied: false, reason: 'newer_state' }) },
  )
  const result = await applyBillingOutcome(subscriptionOutcome({ status: 'canceled' }), h.deps)
  assert.equal(result.applied, false)
  if (result.applied) return
  assert.equal(result.reason, 'skipped_newer_state')
})

test('a document that vanished mid-write reports user_not_found', async () => {
  const h = harness(
    { tier: 'free', subscription: null },
    { writeSubscription: async () => ({ applied: false, reason: 'user_gone' }) },
  )
  const result = await applyBillingOutcome(subscriptionOutcome(), h.deps)
  assert.deepEqual(result, { applied: false, reason: 'user_not_found' })
  assert.equal(h.tierChanges.length, 0)
})

test('a store that reports nothing still counts as applied', async () => {
  // Reporting is opt-in: the in-memory stubs throughout this file return void,
  // and a store that does not guard its write has nothing to report. Only an
  // explicit `applied: false` may turn into a skip.
  const h = harness({ tier: 'free', subscription: null })
  const result = await applyBillingOutcome(subscriptionOutcome(), h.deps, 'evt_ok')
  assert.equal(result.applied, true)
  assert.equal(h.writes.length, 1)
  assert.deepEqual(h.tierChanges, [{ userId: 'user_1', tier: 'plus' }])
})

test('an applied write is still reported as applied when the store confirms it', async () => {
  const h = harness(
    { tier: 'free', subscription: null },
    { writeSubscription: async () => ({ applied: true }) },
  )
  const result = await applyBillingOutcome(subscriptionOutcome(), h.deps, 'evt_ok')
  assert.equal(result.applied, true)
  if (!result.applied) return
  assert.equal(result.tier, 'plus')
  assert.deepEqual(h.tierChanges, [{ userId: 'user_1', tier: 'plus' }])
})
