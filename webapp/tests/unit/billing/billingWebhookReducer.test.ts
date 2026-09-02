// Run with: npx tsx --test tests/unit/billing/billingWebhookReducer.test.ts
//
// Two of these tests exist because of API shapes that moved and fail SILENTLY:
//
//   Subscription.current_period_end  →  items.data[].current_period_end
//   Invoice.subscription             →  parent.subscription_details.subscription
//
// Code written from memory or a pre-2025 doc reads the old field, gets
// undefined, and stores no period end. Because a `canceled` subscription keeps
// Plus only while `now < currentPeriodEnd`, an undefined period end downgrades
// someone the instant they cancel — mid-month, after paying for the month. The
// fixtures below carry the CURRENT shape, plus a legacy one to prove the
// fallback still resolves an older delivery.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type Stripe from 'stripe'
import { reduceStripeEvent } from '../../../lib/billing/webhookEvents'
import {
  periodEndFromSubscription,
  subscriptionRefFromInvoice,
} from '../../../lib/billing/subscriptionState'
import type { BillingConfig } from '../../../lib/billing/config'

const CFG: BillingConfig = {
  configured: true,
  mode: 'test',
  secretKey: 'sk_test_becomeunittestfake',
  webhookSecret: 'whsec_become_unit_test_secret',
  prices: { monthly: 'price_unit_monthly', annual: 'price_unit_annual' },
}

const LIVE_CFG: BillingConfig = { ...CFG, mode: 'live' }

const PERIOD_END = 1_759_000_000 // epoch seconds
const CREATED = 1_756_700_000

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

/** Current (v22 / 2026-08-26.dahlia) subscription shape. */
function subscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sub_test_1',
    object: 'subscription',
    status: 'active',
    customer: 'cus_test_1',
    cancel_at_period_end: false,
    metadata: { userId: 'user_1' },
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          object: 'subscription_item',
          current_period_end: PERIOD_END,
          price: { id: 'price_unit_monthly', object: 'price' },
        },
      ],
    },
    ...overrides,
  }
}

// ─── checkout.session.completed ──────────────────────────────────────────────

test('a completed checkout links by client_reference_id', () => {
  const outcome = reduceStripeEvent(
    event('checkout.session.completed', {
      id: 'cs_1',
      object: 'checkout.session',
      mode: 'subscription',
      payment_status: 'paid',
      client_reference_id: 'user_1',
      customer: 'cus_test_1',
      subscription: 'sub_test_1',
      metadata: {},
    }),
    CFG,
  )

  assert.equal(outcome.kind, 'link')
  if (outcome.kind !== 'link') return
  assert.deepEqual(outcome.ref, { by: 'userId', userId: 'user_1' })
  assert.equal(outcome.customerId, 'cus_test_1')
  assert.equal(outcome.subscriptionId, 'sub_test_1')
  assert.equal(outcome.mode, 'test')
})

test('a completed checkout falls back to metadata.userId', () => {
  const outcome = reduceStripeEvent(
    event('checkout.session.completed', {
      id: 'cs_2',
      object: 'checkout.session',
      mode: 'subscription',
      payment_status: 'paid',
      client_reference_id: null,
      customer: { id: 'cus_test_1', object: 'customer' },
      subscription: { id: 'sub_test_1', object: 'subscription' },
      metadata: { userId: 'user_1' },
    }),
    CFG,
  )

  assert.equal(outcome.kind, 'link')
  if (outcome.kind !== 'link') return
  assert.deepEqual(outcome.ref, { by: 'userId', userId: 'user_1' })
  // Expanded objects, not strings — Stripe is inconsistent about which it sends.
  assert.equal(outcome.customerId, 'cus_test_1')
  assert.equal(outcome.subscriptionId, 'sub_test_1')
})

test('a one-off payment or an unpaid session is ignored', () => {
  const oneOff = reduceStripeEvent(
    event('checkout.session.completed', {
      id: 'cs_3',
      mode: 'payment',
      payment_status: 'paid',
      client_reference_id: 'user_1',
    }),
    CFG,
  )
  assert.deepEqual(oneOff, { kind: 'ignored', reason: 'not_a_subscription_checkout' })

  const unpaid = reduceStripeEvent(
    event('checkout.session.completed', {
      id: 'cs_4',
      mode: 'subscription',
      payment_status: 'unpaid',
      client_reference_id: 'user_1',
    }),
    CFG,
  )
  assert.deepEqual(unpaid, { kind: 'ignored', reason: 'checkout_unpaid' })
})

// ─── customer.subscription.* ─────────────────────────────────────────────────

test('an active subscription resolves status, plan and the v22 period end', () => {
  const outcome = reduceStripeEvent(
    event('customer.subscription.updated', subscription()),
    CFG,
  )

  assert.equal(outcome.kind, 'subscription')
  if (outcome.kind !== 'subscription') return
  assert.deepEqual(outcome.ref, { by: 'userId', userId: 'user_1' })
  assert.equal(outcome.state.status, 'active')
  assert.equal(outcome.state.plan, 'monthly')
  assert.equal(outcome.state.stripePriceId, 'price_unit_monthly')
  assert.equal(outcome.state.mode, 'test')
  assert.equal(
    outcome.state.currentPeriodEnd?.getTime(),
    PERIOD_END * 1000,
    'period end must come from items.data[].current_period_end',
  )
})

test('the period end is read from items, from a legacy top level, or is undefined', () => {
  // Current shape.
  assert.equal(periodEndFromSubscription(subscription())?.getTime(), PERIOD_END * 1000)

  // Legacy pre-2025 payload — still honoured so an older delivery resolves.
  assert.equal(
    periodEndFromSubscription({ current_period_end: PERIOD_END, items: { data: [] } })?.getTime(),
    PERIOD_END * 1000,
  )

  // Multi-item: the LAST paid period wins, not the first.
  const multi = subscription({
    items: {
      data: [
        { current_period_end: PERIOD_END, price: { id: 'price_unit_monthly' } },
        { current_period_end: PERIOD_END + 86_400, price: { id: 'price_unit_annual' } },
      ],
    },
  })
  assert.equal(periodEndFromSubscription(multi)?.getTime(), (PERIOD_END + 86_400) * 1000)

  // Neither shape present → undefined, never a bogus epoch-0 date.
  assert.equal(periodEndFromSubscription({ items: { data: [{}] } }), undefined)
  assert.equal(periodEndFromSubscription({ current_period_end: 0 }), undefined)
  assert.equal(periodEndFromSubscription(null), undefined)
  assert.equal(periodEndFromSubscription('nonsense'), undefined)
})

test('past_due is carried through verbatim — the tier rule lives elsewhere', () => {
  const outcome = reduceStripeEvent(
    event('customer.subscription.updated', subscription({ status: 'past_due' })),
    CFG,
  )
  assert.equal(outcome.kind, 'subscription')
  if (outcome.kind !== 'subscription') return
  assert.equal(outcome.state.status, 'past_due')
})

test('cancel_at_period_end is preserved while the status is still active', () => {
  // A member who has cancelled but not yet lapsed is STILL active and still
  // owed Plus. Collapsing this to canceled would cut them off early.
  const outcome = reduceStripeEvent(
    event('customer.subscription.updated', subscription({ cancel_at_period_end: true })),
    CFG,
  )
  assert.equal(outcome.kind, 'subscription')
  if (outcome.kind !== 'subscription') return
  assert.equal(outcome.state.status, 'active')
  assert.equal(outcome.state.cancelAtPeriodEnd, true)
})

test('a deleted subscription is canceled but KEEPS its period end', () => {
  const outcome = reduceStripeEvent(
    event('customer.subscription.deleted', subscription({ status: 'active' })),
    CFG,
  )
  assert.equal(outcome.kind, 'subscription')
  if (outcome.kind !== 'subscription') return
  assert.equal(outcome.state.status, 'canceled')
  assert.equal(
    outcome.state.currentPeriodEnd?.getTime(),
    PERIOD_END * 1000,
    'dropping this is what downgrades a paid-through member instantly',
  )
})

test('customer.subscription.created is handled, not ignored', () => {
  // Stripe emits it for every new subscription; ignoring it delays activation
  // until some later unrelated update.
  const outcome = reduceStripeEvent(event('customer.subscription.created', subscription()), CFG)
  assert.equal(outcome.kind, 'subscription')
})

test('a subscription with no metadata falls back to the customer id', () => {
  const outcome = reduceStripeEvent(
    event('customer.subscription.updated', subscription({ metadata: {} })),
    CFG,
  )
  assert.equal(outcome.kind, 'subscription')
  if (outcome.kind !== 'subscription') return
  assert.deepEqual(outcome.ref, { by: 'customerId', customerId: 'cus_test_1', mode: 'test' })
})

test('an unrecognised price yields no plan, and does not disturb the status', () => {
  const outcome = reduceStripeEvent(
    event(
      'customer.subscription.updated',
      subscription({
        items: { data: [{ current_period_end: PERIOD_END, price: { id: 'price_renamed' } }] },
      }),
    ),
    CFG,
  )
  assert.equal(outcome.kind, 'subscription')
  if (outcome.kind !== 'subscription') return
  assert.equal(outcome.state.plan, undefined, 'a renamed price must not strand a paying member')
  assert.equal(outcome.state.status, 'active')
})

test('a status Stripe knows and we do not maps to none, never to plus', () => {
  for (const status of ['paused', 'incomplete_expired']) {
    const outcome = reduceStripeEvent(
      event('customer.subscription.updated', subscription({ status })),
      CFG,
    )
    assert.equal(outcome.kind, 'subscription')
    if (outcome.kind !== 'subscription') continue
    assert.equal(outcome.state.status, status, `${status} is a real Stripe status we persist`)
  }

  const future = reduceStripeEvent(
    event('customer.subscription.updated', subscription({ status: 'some_future_status' })),
    CFG,
  )
  assert.equal(future.kind, 'subscription')
  if (future.kind !== 'subscription') return
  assert.equal(future.state.status, 'none', 'fail closed on a vocabulary we have not read')
})

// ─── invoice.payment_failed ──────────────────────────────────────────────────

test('a failed invoice resolves through parent.subscription_details (v22 shape)', () => {
  const invoice = {
    id: 'in_1',
    object: 'invoice',
    customer: 'cus_test_1',
    parent: {
      type: 'subscription_details',
      subscription_details: {
        subscription: 'sub_test_1',
        metadata: { userId: 'user_1' },
      },
    },
  }

  assert.deepEqual(subscriptionRefFromInvoice(invoice), {
    id: 'sub_test_1',
    userId: 'user_1',
  })

  const outcome = reduceStripeEvent(event('invoice.payment_failed', invoice), CFG)
  assert.equal(outcome.kind, 'payment_failed')
  if (outcome.kind !== 'payment_failed') return
  assert.deepEqual(outcome.ref, { by: 'userId', userId: 'user_1' })
  assert.equal(outcome.subscriptionId, 'sub_test_1')
})

test('a failed invoice still resolves through the legacy top-level subscription', () => {
  const legacy = { id: 'in_2', object: 'invoice', customer: 'cus_test_1', subscription: 'sub_test_1' }
  assert.deepEqual(subscriptionRefFromInvoice(legacy), { id: 'sub_test_1', userId: undefined })

  const outcome = reduceStripeEvent(event('invoice.payment_failed', legacy), CFG)
  assert.equal(outcome.kind, 'payment_failed')
  if (outcome.kind !== 'payment_failed') return
  // No metadata snapshot, so it falls through to the customer id.
  assert.deepEqual(outcome.ref, { by: 'customerId', customerId: 'cus_test_1', mode: 'test' })
})

test('an invoice with nothing to attribute it to is ignored, not applied', () => {
  const outcome = reduceStripeEvent(
    event('invoice.payment_failed', { id: 'in_3', object: 'invoice' }),
    CFG,
  )
  assert.deepEqual(outcome, { kind: 'ignored', reason: 'unattributable_invoice' })
})

// ─── fences ──────────────────────────────────────────────────────────────────

test('a livemode mismatch is dropped before anything can touch a user', () => {
  // Prod and beta share one database. A live event reaching the test-mode
  // deployment (or the reverse) must never get as far as a write.
  assert.deepEqual(
    reduceStripeEvent(event('customer.subscription.updated', subscription(), true), CFG),
    { kind: 'ignored', reason: 'livemode_mismatch' },
  )
  assert.deepEqual(
    reduceStripeEvent(event('customer.subscription.updated', subscription(), false), LIVE_CFG),
    { kind: 'ignored', reason: 'livemode_mismatch' },
  )
  // Matching modes pass.
  assert.equal(
    reduceStripeEvent(event('customer.subscription.updated', subscription(), true), LIVE_CFG).kind,
    'subscription',
  )
})

test('an unhandled event type is ignored so the route can answer 200', () => {
  // A 4xx would tell Stripe the delivery failed and it would retry forever.
  assert.deepEqual(reduceStripeEvent(event('customer.created', { id: 'cus_x' }), CFG), {
    kind: 'ignored',
    reason: 'unhandled_type',
  })
  assert.deepEqual(reduceStripeEvent(event('invoice.paid', { id: 'in_x' }), CFG), {
    kind: 'ignored',
    reason: 'unhandled_type',
  })
})
