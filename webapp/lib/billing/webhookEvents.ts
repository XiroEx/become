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
import { normalizeSubscription, refId, subscriptionRefFromInvoice, type SubscriptionState } from './subscriptionState'

/** How to find the member this event is about. */
export type UserRef =
  | { by: 'userId'; userId: string }
  | { by: 'customerId'; customerId: string; mode: StripeMode }
  | { by: 'subscriptionId'; subscriptionId: string; mode: StripeMode }

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
 * The types the Stripe dashboard endpoint should be subscribed to.
 * `customer.subscription.created` shares a branch with `.updated`: Stripe emits
 * it for every new subscription, and ignoring it delays activation until the
 * first unrelated update.
 */
export const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
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

    default:
      return { kind: 'ignored', reason: 'unhandled_type' }
  }
}
