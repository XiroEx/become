// Run with: npm run test:file tests/unit/billing/billingRefundDispute.test.ts
//
// The money going BACK. Until these events were handled, a refunded or disputed
// member kept Plus indefinitely unless an operator ALSO remembered to cancel the
// subscription by hand — so the exposure on an annual plan was the whole year of
// access on top of the $119.99 returned, and on a dispute a free year plus the
// fee Stripe keeps whichever way it goes.
//
// Three things here are easy to get wrong and expensive when you do:
//
//  1. A PARTIAL refund is a goodwill credit, not a cancellation. `charge.refunded`
//     fires for both, and revoking on a partial takes away a plan the member is
//     still paying for.
//  2. `currentPeriodEnd` must be CLEARED. deriveTier keeps a `canceled` member on
//     Plus while `now < currentPeriodEnd` — the "they paid through the month"
//     rule — and a refund is exactly the case where they did not.
//  3. Revoking cancels the Stripe subscription, and Stripe answers THAT with
//     `customer.subscription.deleted` carrying a FUTURE period end. Applied
//     naively it writes the refunded period straight back and the revoke quietly
//     undoes itself seconds later.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import {
  HANDLED_EVENT_TYPES,
  reduceStripeEvent,
  type BillingOutcome,
} from '../../../lib/billing/webhookEvents'
import { isFullRefund } from '../../../lib/billing/subscriptionState'
import {
  applyBillingOutcome,
  type ApplyDeps,
  type ExistingBillingState,
} from '../../../lib/billing/apply'
import type { BillingConfig } from '../../../lib/billing/config'
import type { Tier } from '../../../lib/entitlements'
import type { IUserSubscription } from '../../../models/User'

const CFG: BillingConfig = {
  configured: true,
  mode: 'test',
  secretKey: 'sk_test_becomeunittestfake',
  webhookSecret: 'whsec_become_unit_test_secret',
  prices: { monthly: 'price_unit_monthly', annual: 'price_unit_annual' },
}

const NOW = new Date('2026-09-09T12:00:00.000Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW.getTime() + days * DAY)
const CREATED = Math.floor(NOW.getTime() / 1000)

function event(type: string, object: unknown, livemode = false): Stripe.Event {
  return {
    id: `evt_${type.replace(/\W/g, '_')}`,
    object: 'event',
    created: CREATED,
    livemode,
    type,
    data: { object },
  } as unknown as Stripe.Event
}

/** An annual charge, refunded in full. */
function charge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ch_test_1',
    object: 'charge',
    amount: 11999,
    amount_captured: 11999,
    amount_refunded: 11999,
    refunded: true,
    customer: 'cus_test_1',
    metadata: {},
    ...overrides,
  }
}

function dispute(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'dp_test_1',
    object: 'dispute',
    amount: 11999,
    // A WEBHOOK payload is never expanded, so this is a bare id and the member
    // has to be resolved through it. That is the whole reason 'chargeId' exists.
    charge: 'ch_test_1',
    status: 'needs_response',
    ...overrides,
  }
}

// ─── what to subscribe the endpoint to ───────────────────────────────────────

test('the refund and dispute types are on the list an operator configures', () => {
  assert.ok(HANDLED_EVENT_TYPES.includes('charge.refunded'))
  assert.ok(HANDLED_EVENT_TYPES.includes('charge.dispute.created'))
})

test('EVERY type on that list actually reduces to something — the list is a promise', () => {
  // HANDLED_EVENT_TYPES is what gets typed into the Stripe dashboard. An entry
  // the reducer answers 'unhandled_type' to is a delivery we pay for and drop.
  const fixtures: Record<(typeof HANDLED_EVENT_TYPES)[number], unknown> = {
    'checkout.session.completed': {
      id: 'cs_1',
      object: 'checkout.session',
      mode: 'subscription',
      payment_status: 'paid',
      client_reference_id: 'user_1',
      customer: 'cus_test_1',
      subscription: 'sub_test_1',
    },
    'customer.subscription.created': { id: 'sub_test_1', status: 'active', customer: 'cus_test_1' },
    'customer.subscription.updated': { id: 'sub_test_1', status: 'active', customer: 'cus_test_1' },
    'customer.subscription.deleted': { id: 'sub_test_1', status: 'canceled', customer: 'cus_test_1' },
    'invoice.payment_failed': { id: 'in_1', object: 'invoice', customer: 'cus_test_1' },
    'charge.refunded': charge(),
    'charge.dispute.created': dispute(),
  }

  for (const type of HANDLED_EVENT_TYPES) {
    const outcome = reduceStripeEvent(event(type, fixtures[type]), CFG)
    assert.notEqual(
      outcome.kind === 'ignored' ? outcome.reason : '',
      'unhandled_type',
      `${type} is advertised as handled but the reducer does not know it`,
    )
  }
})

// ─── full vs partial ─────────────────────────────────────────────────────────

test('a FULL refund revokes, and resolves the member through the customer', () => {
  const outcome = reduceStripeEvent(event('charge.refunded', charge()), CFG)
  assert.equal(outcome.kind, 'revoke')
  assert.deepEqual(outcome.ref, { by: 'customerId', customerId: 'cus_test_1', mode: 'test' })
  assert.equal(outcome.reason, 'refund')
  assert.equal(outcome.customerId, 'cus_test_1')
  assert.equal(outcome.eventCreated, CREATED)
})

test('A PARTIAL REFUND DOES NOT REVOKE — it is a goodwill credit', () => {
  const outcome = reduceStripeEvent(
    event('charge.refunded', charge({ refunded: false, amount_refunded: 3000 })),
    CFG,
  )
  assert.equal(outcome.kind, 'ignored')
  assert.equal(outcome.reason, 'partial_refund')
})

test('isFullRefund reads the CAPTURED amount, not the authorised one', () => {
  // Only the captured part was ever money, so refunding all of it is a full
  // refund even though amount_refunded < amount.
  assert.equal(
    isFullRefund({ refunded: false, amount: 11999, amount_captured: 5000, amount_refunded: 5000 }),
    true,
  )
  assert.equal(
    isFullRefund({ refunded: false, amount: 11999, amount_captured: 5000, amount_refunded: 4999 }),
    false,
  )
  // Stripe's own boolean is authoritative when it is set.
  assert.equal(isFullRefund({ refunded: true }), true)
  // Nothing captured is not a refund of anything.
  assert.equal(isFullRefund({ refunded: false, amount: 0, amount_captured: 0, amount_refunded: 0 }), false)
  assert.equal(isFullRefund({}), false)
  assert.equal(isFullRefund(null), false)
})

test('a refund nobody can be attributed to is ignored, never guessed at', () => {
  const outcome = reduceStripeEvent(
    event('charge.refunded', charge({ customer: null, metadata: {} })),
    CFG,
  )
  assert.equal(outcome.kind, 'ignored')
  assert.equal(outcome.reason, 'unattributable_charge')
})

// ─── disputes ────────────────────────────────────────────────────────────────

test('ANY dispute revokes, by charge id — the only ref that costs an API call', () => {
  const outcome = reduceStripeEvent(event('charge.dispute.created', dispute()), CFG)
  assert.equal(outcome.kind, 'revoke')
  assert.deepEqual(outcome.ref, { by: 'chargeId', chargeId: 'ch_test_1', mode: 'test' })
  assert.equal(outcome.reason, 'dispute')
})

test('an expanded dispute.charge resolves the same way', () => {
  const outcome = reduceStripeEvent(
    event('charge.dispute.created', dispute({ charge: charge() })),
    CFG,
  )
  assert.equal(outcome.kind, 'revoke')
  assert.deepEqual(outcome.ref, { by: 'chargeId', chargeId: 'ch_test_1', mode: 'test' })
})

test('a dispute with no charge on it is ignored', () => {
  const outcome = reduceStripeEvent(event('charge.dispute.created', dispute({ charge: null })), CFG)
  assert.equal(outcome.kind, 'ignored')
  assert.equal(outcome.reason, 'unattributable_dispute')
})

test('the mode fence still drops both, before anything can reach a user', () => {
  // A live-mode refund must not be applied by the test-mode (beta) workspace.
  for (const [type, object] of [
    ['charge.refunded', charge()],
    ['charge.dispute.created', dispute()],
  ] as const) {
    const outcome = reduceStripeEvent(event(type, object, true), CFG)
    assert.equal(outcome.kind, 'ignored')
    assert.equal(outcome.reason, 'livemode_mismatch')
  }
})

// ─── applying it ─────────────────────────────────────────────────────────────

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
  writes: Array<Record<string, unknown>>
  cancelled: string[]
  sequence: string[]
}

function harness(existing: ExistingBillingState | null, overrides: Partial<ApplyDeps> = {}): Harness {
  const writes: Harness['writes'] = []
  const cancelled: string[] = []
  const sequence: string[] = []
  return {
    writes,
    cancelled,
    sequence,
    deps: {
      cfg: CFG,
      findUserId: async () => (existing ? 'user_1' : null),
      loadExisting: async () => existing,
      writeSubscription: async (_userId, patch) => {
        sequence.push('write')
        writes.push(patch)
      },
      cancelSubscription: async (id) => {
        sequence.push('cancel')
        cancelled.push(id)
      },
      deriveTier: stubDeriveTier,
      now: () => NOW,
      ...overrides,
    },
  }
}

/** A live annual subscriber, mid-period. */
function paying(overrides: Partial<IUserSubscription> = {}): ExistingBillingState {
  return {
    tier: 'plus',
    subscription: {
      status: 'active',
      plan: 'annual',
      currentPeriodEnd: at(300),
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: 'sub_test_1',
      priceId: 'price_unit_annual',
      mode: 'test',
      ...overrides,
    },
  }
}

function revoke(reason: 'refund' | 'dispute' = 'refund'): BillingOutcome {
  return {
    kind: 'revoke',
    ref: { by: 'customerId', customerId: 'cus_test_1', mode: 'test' },
    customerId: 'cus_test_1',
    mode: 'test',
    reason,
    eventCreated: CREATED,
  }
}

test('a revoke ENDS access now: the period end is cleared and the tier is free', () => {
  const h = harness(paying())
  return applyBillingOutcome(revoke(), h.deps, 'evt_1').then((result) => {
    assert.equal(result.applied, true)
    assert.equal(result.applied && result.tier, 'free')

    const patch = h.writes[0]
    assert.equal(patch['subscription.status'], 'canceled')
    // THE line. Leave the date in and deriveTier hands back the whole year the
    // member was just refunded for.
    assert.equal(patch['subscription.currentPeriodEnd'], null)
    assert.equal(patch['subscription.cancelAtPeriodEnd'], false)
    assert.equal(patch.tier, 'free')
    // Ordering is still Stripe's clock against Stripe's clock.
    assert.equal(patch['subscription.lastEventCreated'], CREATED)
    assert.equal(patch['subscription.lastEventId'], 'evt_1')
  })
})

test('the Stripe subscription is cancelled, and only AFTER the write', () => {
  // Cancelling first makes Stripe emit customer.subscription.deleted with a
  // LATER event.created; if that delivery wins the race, the ordering guard
  // refuses our own revoke as stale and the member keeps Plus.
  const h = harness(paying())
  return applyBillingOutcome(revoke('dispute'), h.deps, 'evt_1').then(() => {
    assert.deepEqual(h.cancelled, ['sub_test_1'])
    assert.deepEqual(h.sequence, ['write', 'cancel'])
  })
})

test('a subscription Stripe has already cancelled is not cancelled twice', () => {
  // The COMMON path: an operator issuing a refund has usually cancelled first.
  const h = harness(paying(), {
    retrieveSubscription: async () => ({ id: 'sub_test_1', status: 'canceled' }) as Stripe.Subscription,
  })
  return applyBillingOutcome(revoke(), h.deps).then((result) => {
    assert.equal(result.applied, true)
    assert.deepEqual(h.cancelled, [])
  })
})

test('a cancel that fails is logged, never fatal — access is already revoked', () => {
  const h = harness(paying(), {
    cancelSubscription: async () => {
      throw new Error('stripe_down')
    },
  })
  return applyBillingOutcome(revoke(), h.deps).then((result) => {
    // Throwing would 500 the webhook and make Stripe retry an event whose
    // access half already succeeded — for three days, on a permanent failure.
    assert.equal(result.applied, true)
    assert.equal(result.applied && result.tier, 'free')
  })
})

test('a refund on a member holding no subscription writes nothing at all', () => {
  const h = harness({ tier: 'free', subscription: null })
  return applyBillingOutcome(revoke(), h.deps).then((result) => {
    assert.equal(result.applied, false)
    assert.equal(result.applied === false && result.reason, 'nothing_to_revoke')
    assert.equal(h.writes.length, 0, 'never invent a subscription that was never held')
    assert.deepEqual(h.cancelled, [])
  })
})

test('grandfathered survives a refund — it is a promise no payment event may take back', () => {
  const h = harness({ ...paying(), grandfathered: true })
  return applyBillingOutcome(revoke(), h.deps).then((result) => {
    assert.equal(result.applied && result.tier, 'plus')
    const patch = h.writes[0]
    assert.equal(patch['subscription.status'], 'canceled')
    assert.ok(!('grandfathered' in patch), 'grandfathered is never in a billing patch')
  })
})

test('a test-mode refund cannot revoke LIVE state', () => {
  const h = harness(paying({ mode: 'live' }))
  return applyBillingOutcome(revoke(), h.deps).then((result) => {
    assert.equal(result.applied, false)
    assert.equal(result.applied === false && result.reason, 'mode_downgrade_blocked')
    assert.equal(h.writes.length, 0)
  })
})

// ─── the follow-on deleted event ─────────────────────────────────────────────

/** What Stripe sends after the revoke's own cancel: canceled, future period end. */
function deletedAfterRevoke(subscriptionId = 'sub_test_1'): BillingOutcome {
  return {
    kind: 'subscription',
    ref: { by: 'customerId', customerId: 'cus_test_1', mode: 'test' },
    customerId: 'cus_test_1',
    state: {
      status: 'canceled',
      plan: 'annual',
      currentPeriodEnd: at(300),
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: 'price_unit_annual',
      mode: 'test',
    },
    eventCreated: CREATED + 2,
  }
}

/** The row as the revoke above leaves it. */
const REVOKED: ExistingBillingState = {
  tier: 'free',
  subscription: {
    status: 'canceled',
    plan: 'annual',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: 'sub_test_1',
    priceId: 'price_unit_annual',
    mode: 'test',
    lastEventCreated: CREATED,
  },
}

test('THE REVOKE DOES NOT UNDO ITSELF: the deleted event may not restore the period', () => {
  const h = harness(REVOKED)
  return applyBillingOutcome(deletedAfterRevoke(), h.deps).then((result) => {
    assert.equal(result.applied, true)
    assert.equal(
      result.applied && result.tier,
      'free',
      'this is the bug: cancelling for a refund makes Stripe hand the refunded year back',
    )
    assert.equal(h.writes[0]['subscription.currentPeriodEnd'], null)
    assert.equal(h.writes[0].tier, 'free')
  })
})

test('an ORDINARY cancel-at-period-end still keeps the period the member paid for', () => {
  // The clamp must be narrow. Here the row is still `active` with a real period
  // end when `deleted` arrives, so nothing is clamped and the member keeps Plus
  // through the month they bought.
  const h = harness(paying({ cancelAtPeriodEnd: true }))
  return applyBillingOutcome(deletedAfterRevoke(), h.deps).then((result) => {
    assert.equal(result.applied && result.tier, 'plus')
    assert.deepEqual(h.writes[0]['subscription.currentPeriodEnd'], at(300))
  })
})

test('a DIFFERENT subscription is not clamped by an old revoked row', () => {
  const h = harness(REVOKED)
  return applyBillingOutcome(deletedAfterRevoke('sub_test_2'), h.deps).then(() => {
    assert.deepEqual(h.writes[0]['subscription.currentPeriodEnd'], at(300))
  })
})

test('a refunded member who subscribes again is not clamped — only terminal state is', () => {
  const h = harness(REVOKED)
  const resubscribe: BillingOutcome = {
    kind: 'subscription',
    ref: { by: 'customerId', customerId: 'cus_test_1', mode: 'test' },
    customerId: 'cus_test_1',
    state: {
      status: 'active',
      plan: 'monthly',
      currentPeriodEnd: at(30),
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: 'sub_test_9',
      stripePriceId: 'price_unit_monthly',
      mode: 'test',
    },
    eventCreated: CREATED + 100,
  }
  return applyBillingOutcome(resubscribe, h.deps).then((result) => {
    assert.equal(result.applied && result.tier, 'plus')
    assert.deepEqual(h.writes[0]['subscription.currentPeriodEnd'], at(30))
  })
})
