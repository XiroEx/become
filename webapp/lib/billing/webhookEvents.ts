/**
 * PURE. Stripe event → what we intend to do about it. No IO, no Mongo, no SDK
 * calls — which is what makes the whole webhook contract cheap to test against
 * fixtures instead of against Stripe.
 *
 * Everything the route does after this is mechanical: claim the event id, apply
 * the outcome, answer 200.
 */

import type Stripe from 'stripe'
import type { BillingConfig } from './config'
import type { StripeMode } from './mode'
import {
  chargeIdFromDispute,
  isFullRefund,
  normalizeSubscription,
  refId,
  subscriptionRefFromInvoice,
  type SubscriptionState,
} from './subscriptionState'

/** How to find the member this event is about. */
export type UserRef =
  | { by: 'userId'; userId: string }
  | { by: 'customerId'; customerId: string; mode: StripeMode }
  | { by: 'subscriptionId'; subscriptionId: string; mode: StripeMode }
  /**
   * A charge id, and the ONLY ref that cannot be resolved by a database read
   * alone. A dispute names a charge and nothing else — `Dispute.charge` is a
   * bare id in a webhook payload, and `Charge.invoice` no longer exists in the
   * v22 SDK — so the customer has to be fetched from Stripe before the usual
   * customer-id lookup can run. `findUserIdByRef` owns that hop, which keeps
   * this reducer pure.
   */
  | { by: 'chargeId'; chargeId: string; mode: StripeMode }

export type BillingOutcome =
  | { kind: 'ignored'; reason: string }
  | {
      kind: 'link'
      ref: UserRef
      customerId?: string
      subscriptionId?: string
      mode: StripeMode
      eventCreated: number
    }
  | {
      kind: 'subscription'
      ref: UserRef
      customerId?: string
      state: SubscriptionState
      eventCreated: number
    }
  | {
      kind: 'payment_failed'
      ref: UserRef
      subscriptionId?: string
      mode: StripeMode
      eventCreated: number
    }
  /**
   * The money came back. End access now, and cancel the subscription behind it.
   *
   * Distinct from 'subscription' because it carries no Stripe subscription
   * state at all — a refund and a dispute are both events about a CHARGE, and
   * Stripe says nothing about the subscription in either. What the member is
   * left holding is worked out in apply.ts from the row we already have.
   */
  | {
      kind: 'revoke'
      ref: UserRef
      customerId?: string
      mode: StripeMode
      /** Logged, never stored: `models/User.ts` owns the subscription schema and
       *  a `$set` on a path it does not declare is dropped by strict mode. */
      reason: 'refund' | 'dispute'
      eventCreated: number
    }

/**
 * The types the Stripe dashboard endpoint should be subscribed to.
 * `customer.subscription.created` shares a branch with `.updated`: Stripe emits
 * it for every new subscription, and ignoring it delays activation until the
 * first unrelated update.
 *
 * `charge.refunded` and `charge.dispute.created` are the money-BACK half, and
 * without them a refunded or disputed member kept Plus indefinitely unless an
 * operator remembered to cancel the subscription by hand as well. The exposure
 * on an annual plan is the full year of access on top of the refunded $119.99;
 * on a dispute it is a free year plus the fee Stripe keeps whichever way the
 * dispute goes.
 */
export const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
] as const

function metadataUserId(metadata: Stripe.Metadata | null | undefined): string | undefined {
  const value = metadata?.userId
  return typeof value === 'string' && value ? value : undefined
}

/**
 * Reduce one event. Anything unrecognised is `ignored`, and the route answers
 * 200 for it — a 4xx tells Stripe the delivery failed and it keeps retrying an
 * event we will never care about.
 */
export function reduceStripeEvent(event: Stripe.Event, cfg: BillingConfig): BillingOutcome {
  // Mode fence. Production (live) and beta (test) share one database, so an
  // event from the wrong Stripe account must never reach a user document. This
  // is cheaper and stricter than sorting it out at write time.
  if (event.livemode !== (cfg.mode === 'live')) {
    return { kind: 'ignored', reason: 'livemode_mismatch' }
  }

  const eventCreated = typeof event.created === 'number' ? event.created : 0

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode !== 'subscription') {
        return { kind: 'ignored', reason: 'not_a_subscription_checkout' }
      }
      if (session.payment_status === 'unpaid') {
        return { kind: 'ignored', reason: 'checkout_unpaid' }
      }

      // client_reference_id is set by our own checkout route; metadata.userId is
      // the belt to that braces (a session created by hand in the dashboard).
      const userId = session.client_reference_id || metadataUserId(session.metadata)
      const customerId = refId(session.customer)
      if (!userId && !customerId) {
        return { kind: 'ignored', reason: 'unattributable_checkout' }
      }

      return {
        kind: 'link',
        ref: userId
          ? { by: 'userId', userId }
          : { by: 'customerId', customerId: customerId!, mode: cfg.mode },
        customerId,
        subscriptionId: refId(session.subscription),
        mode: cfg.mode,
        eventCreated,
      }
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const state = normalizeSubscription(sub, cfg)

      // A deletion is terminal regardless of the status Stripe stamped on the
      // final object. The period end is KEPT: a member who cancelled mid-month
      // has paid through it and deriveTier honours that.
      if (event.type === 'customer.subscription.deleted') {
        state.status = 'canceled'
      }

      const userId = metadataUserId(sub.metadata)
      const customerId = refId(sub.customer)
      if (!userId && !customerId) {
        return { kind: 'ignored', reason: 'unattributable_subscription' }
      }

      return {
        kind: 'subscription',
        ref: userId
          ? { by: 'userId', userId }
          : { by: 'customerId', customerId: customerId!, mode: cfg.mode },
        customerId,
        state,
        eventCreated,
      }
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const { id: subscriptionId, userId } = subscriptionRefFromInvoice(invoice)
      const customerId = refId(invoice.customer)

      const ref: UserRef | undefined = userId
        ? { by: 'userId', userId }
        : customerId
          ? { by: 'customerId', customerId, mode: cfg.mode }
          : subscriptionId
            ? { by: 'subscriptionId', subscriptionId, mode: cfg.mode }
            : undefined

      if (!ref) return { kind: 'ignored', reason: 'unattributable_invoice' }

      // Stamps paymentFailedAt for messaging ONLY. The downgrade is the
      // customer.subscription.updated → past_due event's job; doing it here too
      // would race that event and turn a retried card into a lost session.
      return { kind: 'payment_failed', ref, subscriptionId, mode: cfg.mode, eventCreated }
    }

    case 'charge.refunded': {
      const charge = event.data.object

      // PARTIAL REFUNDS DO NOT REVOKE. `charge.refunded` fires for both, and a
      // partial refund is a goodwill credit against a plan the member still
      // holds and is still paying for. Revoking on one would take away the
      // thing we just apologised with.
      if (!isFullRefund(charge)) {
        return { kind: 'ignored', reason: 'partial_refund' }
      }

      // A charge in v22 carries NO invoice reference, so the customer is the
      // path: it is stamped on every subscription charge, and
      // findUserIdByRef only matches a member who already has that customer id
      // stored, so an unrelated charge resolves to nobody.
      const customerId = refId(charge.customer)
      const userId = metadataUserId(charge.metadata)
      if (!userId && !customerId) {
        return { kind: 'ignored', reason: 'unattributable_charge' }
      }

      return {
        kind: 'revoke',
        ref: userId
          ? { by: 'userId', userId }
          : { by: 'customerId', customerId: customerId!, mode: cfg.mode },
        customerId,
        mode: cfg.mode,
        reason: 'refund',
        eventCreated,
      }
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object

      // ANY dispute revokes. Unlike a refund there is no partial case worth
      // honouring: the bank has taken the money back pending the outcome, and
      // Stripe keeps its fee either way. Waiting for `charge.dispute.closed`
      // would hand out the whole disputed period for free while it ran.
      const chargeId = chargeIdFromDispute(dispute)
      if (!chargeId) return { kind: 'ignored', reason: 'unattributable_dispute' }

      // A dispute knows only the charge id (webhook payloads are never
      // expanded), so the customer hop happens in findUserIdByRef.
      return {
        kind: 'revoke',
        ref: { by: 'chargeId', chargeId, mode: cfg.mode },
        mode: cfg.mode,
        reason: 'dispute',
        eventCreated,
      }
    }

    default:
      return { kind: 'ignored', reason: 'unhandled_type' }
  }
}
