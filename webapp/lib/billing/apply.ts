/**
 * IO-free. Every side effect arrives as an injected dep, so the invariants that
 * actually protect money are exercised directly instead of through Mongo.
 *
 * The five that matter:
 *   1. Ordering  — Stripe delivers out of order. An event older than the state
 *                  already stored is dropped, not applied.
 *   2. Mode      — a test-mode event never overwrites live state (one database,
 *                  two channels).
 *   3. Grandfathered is never cleared. It is a promise made offline by the
 *      migration; no payment event may take it back.
 *   4. `tier` is written in the SAME $set as `subscription`, and it comes from
 *      the injected deriveTier — billing never hand-computes a tier.
 *   5. It runs regardless of ENTITLEMENTS_ENFORCED. The kill-switch governs
 *      whether tier is ENFORCED, not whether money is real.
 *   6. Only an event that CARRIED subscription state writes a tier. An event
 *      that learned nothing (a payment-failure notice, a checkout whose
 *      subscription we could not retrieve) would otherwise write back the row
 *      it just read and revert a concurrent, better-informed event.
 *   7. Whichever subscription an active row already names owns that row. A
 *      second subscription on the same customer is ignored until the first is
 *      no longer active.
 */

import type Stripe from 'stripe'
import type { Tier } from '@/lib/entitlements'
import type { IUserSubscription, UserRole } from '@/models/User'
import { canApplyMode, customerIdField, type StripeMode } from './mode'
import type { BillingConfig } from './config'
import { normalizeSubscription, type SubscriptionState } from './subscriptionState'
import type { BillingOutcome, UserRef } from './webhookEvents'

/** What the store hands back about the member we are about to write. */
export interface ExistingBillingState {
  subscription?: IUserSubscription | null
  grandfathered?: boolean
  role?: UserRole
  tier?: Tier
}

export interface ApplyDeps {
  /** Needed to name the plan behind a price id when the 'link' branch resolves
   *  a subscription itself. Also carries the mode this apply is running in. */
  cfg: BillingConfig
  findUserId(ref: UserRef): Promise<string | null>
  loadExisting(userId: string): Promise<ExistingBillingState | null>
  /**
   * `guard.eventCreated` is the SAME Stripe clock isStaleEvent() compares, handed
   * down so the store can re-assert the ordering check inside the update filter.
   * The check above is a read; between it and this write another delivery can
   * land, and the loser would then overwrite the newer state. A store that
   * ignores the guard is still correct, just racy — which is why it is optional.
   */
  writeSubscription(
    userId: string,
    patch: Record<string, unknown>,
    guard?: { eventCreated: number },
  ): Promise<void>
  /**
   * Resolve the subscription a completed checkout created. Optional: without it
   * the 'link' branch stores the ids and waits for
   * customer.subscription.created to supply the state.
   */
  retrieveSubscription?(id: string): Promise<Stripe.Subscription>
  /** lib/subscription.ts#deriveTier. Injected so billing owns ONE import of it. */
  deriveTier(input: {
    subscription?: IUserSubscription | null
    grandfathered?: boolean
    role?: UserRole
    now?: Date
  }): Tier
  /** Wired to bustTilesCache. Fires only when the tier actually changed. */
  onTierChanged?(userId: string, tier: Tier): Promise<void>
  now?(): Date
}

export type ApplyResult =
  | { applied: true; userId: string; tier: Tier; status: IUserSubscription['status'] }
  | {
      applied: false
      reason:
        | 'user_not_found'
        | 'stale_event'
        | 'mode_downgrade_blocked'
        | 'other_subscription'
        | 'ignored'
    }

/**
 * Is this event older than the event already applied to the document?
 *
 * BOTH sides are Stripe's own epoch-SECONDS clock: the incoming `event.created`
 * against `subscription.lastEventCreated`, the `created` of the last event we
 * applied. That is the whole point of storing it.
 *
 * It used to compare `event.created` against `subscription.updatedAt` — OUR
 * wall clock at the moment we wrote. Delivery plus processing latency is always
 * positive, so every event created at or before the previous write instant read
 * as stale, and Stripe emits these in bursts within the same second or two:
 * only the FIRST event of a burst was ever applied. `invoice.payment_failed`
 * and `customer.subscription.updated → past_due` arrive together, so whichever
 * landed second was dropped and the member kept Plus through the whole dunning
 * period.
 *
 * Equal timestamps are NOT stale. Stripe's `created` is second-granularity, so
 * order within one second is unknowable — and every event in that burst carries
 * real state. Only a STRICTLY older event is a late redelivery of something
 * already superseded, which is what would resurrect a cancelled subscription.
 */
export function isStaleEvent(
  eventCreated: number,
  lastEventCreated: number | null | undefined,
): boolean {
  if (typeof lastEventCreated !== 'number' || !Number.isFinite(lastEventCreated)) return false
  return eventCreated < lastEventCreated
}

/** The ordering stamp every branch writes: Stripe's clock, not ours. */
function orderingPatch(eventId: string | undefined, eventCreated: number): Record<string, unknown> {
  return {
    ...(eventId ? { 'subscription.lastEventId': eventId } : {}),
    ...(Number.isFinite(eventCreated) ? { 'subscription.lastEventCreated': eventCreated } : {}),
  }
}

function subscriptionPatch(
  state: SubscriptionState,
  eventId: string | undefined,
  eventCreated: number,
  now: Date,
): Record<string, unknown> {
  return {
    'subscription.status': state.status,
    'subscription.currentPeriodEnd': state.currentPeriodEnd ?? null,
    'subscription.cancelAtPeriodEnd': state.cancelAtPeriodEnd,
    'subscription.stripeSubscriptionId': state.stripeSubscriptionId ?? null,
    'subscription.priceId': state.stripePriceId ?? null,
    'subscription.plan': state.plan ?? null,
    'subscription.mode': state.mode,
    'subscription.updatedAt': now,
    ...orderingPatch(eventId, eventCreated),
  }
}

/**
 * The projected subscription, as deriveTier will see it AFTER this write.
 * Derived from the incoming state rather than re-reading the document, because
 * the write has not happened yet and deriveTier must judge the new truth.
 */
function projectedSubscription(state: SubscriptionState): IUserSubscription {
  return {
    status: state.status,
    currentPeriodEnd: state.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    stripeSubscriptionId: state.stripeSubscriptionId ?? null,
    priceId: state.stripePriceId ?? null,
    plan: state.plan ?? null,
    mode: state.mode,
  }
}

export async function applyBillingOutcome(
  outcome: BillingOutcome,
  deps: ApplyDeps,
  eventId?: string,
): Promise<ApplyResult> {
  if (outcome.kind === 'ignored') return { applied: false, reason: 'ignored' }

  const now = deps.now?.() ?? new Date()

  const userId = await deps.findUserId(outcome.ref)
  if (!userId) return { applied: false, reason: 'user_not_found' }

  const existing = await deps.loadExisting(userId)
  const existingSub = existing?.subscription ?? null

  if (isStaleEvent(outcome.eventCreated, existingSub?.lastEventCreated)) {
    return { applied: false, reason: 'stale_event' }
  }

  const incomingMode: StripeMode =
    outcome.kind === 'subscription' ? outcome.state.mode : outcome.mode
  const existingMode = (existingSub?.mode ?? undefined) as StripeMode | undefined
  if (!canApplyMode(existingMode, incomingMode)) {
    return { applied: false, reason: 'mode_downgrade_blocked' }
  }

  // A DIFFERENT subscription must not speak for the one that is actually paying.
  //
  // Checkout used to admit a `past_due` member (they derive to free, so they saw
  // the upgrade CTA), which put two live subscriptions on one Stripe customer.
  // Both bill. Worse, the OLD one's terminal event — `deleted`, or the
  // `unpaid`/`canceled` Stripe writes when dunning gives up — would land on the
  // document and downgrade a member the new subscription is charging monthly.
  //
  // Checkout now refuses that second purchase (409 fix_payment_method), and this
  // is the other half: whichever subscription the document holds while it is
  // active or trialing is the one that owns the row. Deliberately scoped to
  // active|trialing so a genuine RE-subscribe after a cancellation still applies.
  if (
    outcome.kind === 'subscription' &&
    (existingSub?.status === 'active' || existingSub?.status === 'trialing') &&
    existingSub.stripeSubscriptionId &&
    outcome.state.stripeSubscriptionId &&
    outcome.state.stripeSubscriptionId !== existingSub.stripeSubscriptionId
  ) {
    return { applied: false, reason: 'other_subscription' }
  }

  // grandfathered lives OUTSIDE subscription and is never in a patch below —
  // that is how "never cleared" is guaranteed rather than remembered.
  const grandfathered = existing?.grandfathered === true
  const role = existing?.role

  let patch: Record<string, unknown>
  let nextState: SubscriptionState | null = null

  switch (outcome.kind) {
    case 'link': {
      // Checkout finished. Store the ids immediately so a member who lands back
      // on the app before customer.subscription.created arrives is already
      // linked, then upgrade to full state if we can retrieve the subscription.
      const field = customerIdField(outcome.mode)
      patch = {
        ...(outcome.customerId ? { [`subscription.${field}`]: outcome.customerId } : {}),
        ...(outcome.subscriptionId
          ? { 'subscription.stripeSubscriptionId': outcome.subscriptionId }
          : {}),
        'subscription.mode': outcome.mode,
        'subscription.updatedAt': now,
        ...orderingPatch(eventId, outcome.eventCreated),
      }

      if (outcome.subscriptionId && deps.retrieveSubscription) {
        try {
          const sub = await deps.retrieveSubscription(outcome.subscriptionId)
          nextState = normalizeSubscription(sub, deps.cfg)
        } catch {
          // Non-fatal. The subscription events carry the same state and are
          // idempotent, so waiting for one costs at most a few seconds.
          nextState = null
        }
      }
      if (nextState) {
        patch = { ...patch, ...subscriptionPatch(nextState, eventId, outcome.eventCreated, now) }
      }
      break
    }

    case 'subscription': {
      nextState = outcome.state
      patch = subscriptionPatch(nextState, eventId, outcome.eventCreated, now)
      if (outcome.customerId) {
        patch[`subscription.${customerIdField(nextState.mode)}`] = outcome.customerId
      }
      break
    }

    case 'payment_failed': {
      // NOTIFICATION ONLY. No status, no tier, and — deliberately — no ordering
      // stamp either. Both omissions are load-bearing.
      //
      // Stripe emits `invoice.payment_failed` and `customer.subscription.updated
      // → past_due` together, inside a second or two, and both handlers read the
      // document while it still says `active`:
      //
      //   • writing `tier` here wrote the tier that stale read implied ('plus').
      //     Landing second, it silently undid the past_due downgrade and the
      //     member kept Plus through the entire dunning window plus the 3-day
      //     grace — while Stripe was retrying a card that had already failed.
      //   • stamping lastEventCreated made this event the ordering floor. When
      //     its `created` was the later of the pair, the `updated → past_due`
      //     that followed read as stale and was dropped outright.
      //
      // Neither is winnable by ordering the pair, because they are concurrent.
      // The fix is to stop writing state Stripe never told us about: a failed
      // invoice says a charge failed, not what the subscription now IS.
      patch = {
        'subscription.paymentFailedAt': now,
        'subscription.mode': outcome.mode,
        'subscription.updatedAt': now,
      }
      break
    }
  }

  const projected = nextState ? projectedSubscription(nextState) : existingSub
  const tier = deps.deriveTier({ subscription: projected, grandfathered, role, now })

  // Only an event that CARRIED subscription state may write a tier.
  //
  // Without `nextState` the only thing left to derive from is `existingSub` —
  // the row read a moment ago — so writing the result back is re-asserting a
  // snapshot, not applying news. Two events in flight together, and the one
  // that learned nothing lands last and reverts the one that did. That is
  // exactly how `invoice.payment_failed` kept a dunning member on Plus. The
  // unresolvable-checkout `link` is the same shape and gets the same rule: it
  // stores the ids, and the subscription events supply the tier.
  //
  // `result.tier` still reports the derived value; it is the WRITE that is
  // withheld.
  const writesTier = nextState !== null
  if (writesTier) patch.tier = tier

  await deps.writeSubscription(userId, patch, { eventCreated: outcome.eventCreated })

  if (writesTier && existing?.tier !== tier && deps.onTierChanged) {
    await deps.onTierChanged(userId, tier)
  }

  return {
    applied: true,
    userId,
    tier,
    status: projected?.status ?? existingSub?.status ?? 'none',
  }
}
