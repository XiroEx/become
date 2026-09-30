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
 *   8. A REVOKE (full refund, or any dispute) ends access immediately — it is
 *      the one branch that deliberately CLEARS `currentPeriodEnd`, because the
 *      "they paid through this period" rule does not apply to a period whose
 *      money went back. It writes first and cancels the Stripe subscription
 *      second, and the terminal event that cancel produces may not re-extend
 *      what it just ended. See revokedState / clampRevokedPeriodEnd /
 *      cancelRevokedSubscription below; all three are one mechanism.
 */

import type Stripe from 'stripe'
import type { Tier } from '@/lib/entitlements'
import type { IUserSubscription, UserRole } from '@/models/User'
import { canApplyMode, customerIdField, type StripeMode } from './mode'
import type { BillingConfig } from './config'
import { normalizeStatus, normalizeSubscription, type SubscriptionState } from './subscriptionState'
import type { BillingOutcome, UserRef } from './webhookEvents'

/** What the store hands back about the member we are about to write. */
export interface ExistingBillingState {
  subscription?: IUserSubscription | null
  grandfathered?: boolean
  role?: UserRole
  tier?: Tier
}

/**
 * What a store reports back about the write it was asked to make.
 *
 * `void` is still allowed and means "this store does not report", which is
 * taken as applied — the in-memory stubs the unit tests inject never refuse a
 * write. A store that DOES guard (mongoDeps re-asserts the ordering check in
 * its update filter) has to say so, because a skip that is not reported becomes
 * an `applied: true` result and a log line claiming a tier was written.
 */
export type WriteOutcome =
  | { applied: true }
  | { applied: false; reason: 'newer_state' | 'user_gone' }

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
   *
   * A store that DOES enforce the guard must return the WriteOutcome, so a
   * refused write is reported as one instead of being counted as applied.
   */
  writeSubscription(
    userId: string,
    patch: Record<string, unknown>,
    guard?: { eventCreated: number },
  ): Promise<WriteOutcome | void>
  /**
   * Resolve the subscription a completed checkout created. Optional: without it
   * the 'link' branch stores the ids and waits for
   * customer.subscription.created to supply the state.
   */
  retrieveSubscription?(id: string): Promise<Stripe.Subscription>
  /**
   * Cancel the subscription a refund or dispute has revoked, so Stripe stops
   * billing a member we have just cut off. Optional: without it the document is
   * still revoked and only the Stripe side is left for an operator.
   */
  cancelSubscription?(id: string): Promise<void>
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
        // The guarded write matched nothing: between the ordering READ above
        // and the write itself, a newer event landed. Same meaning as
        // 'stale_event', discovered one layer down — and a distinct reason so
        // the webhook log says which of the two it was.
        | 'skipped_newer_state'
        | 'mode_downgrade_blocked'
        | 'other_subscription'
        // A refund or dispute landed on a member who holds no subscription
        // state. Nothing to take away, and writing 'canceled' over 'none' would
        // invent a subscription they never had.
        | 'nothing_to_revoke'
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
 * What a member holds after the money went back: nothing.
 *
 * Built from the row rather than from the event, because neither
 * `charge.refunded` nor `charge.dispute.created` says one word about the
 * subscription — they are events about a charge.
 *
 * `currentPeriodEnd` is CLEARED, and that is the whole point. deriveTier keeps
 * a `canceled` member on Plus while `now < currentPeriodEnd`, which is the
 * "they already paid through this month" rule — and a refund is precisely the
 * case where they did not. Left in place on an annual plan it is twelve months
 * of free access on top of the $119.99 handed back.
 */
function revokedState(existing: IUserSubscription, mode: StripeMode): SubscriptionState {
  return {
    status: 'canceled',
    plan: existing.plan ?? undefined,
    currentPeriodEnd: undefined,
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: existing.stripeSubscriptionId ?? undefined,
    stripePriceId: existing.priceId ?? undefined,
    mode,
  }
}

/**
 * A terminal event may not RE-EXTEND access that has already been revoked.
 *
 * Revoking cancels the Stripe subscription, and Stripe answers that with
 * `customer.subscription.deleted` — which carries the item's
 * `current_period_end`, a date in the FUTURE, because it is the end of the
 * period the member had been billed for. Applied as-is it writes that date back
 * over the null the revoke just stored, and deriveTier puts the refunded member
 * straight back on Plus for exactly the period their money was returned for.
 * The revoke would appear to work and then quietly undo itself seconds later.
 *
 * The rule is deliberately narrow: only when the row is ALREADY `canceled` with
 * no period end, and the incoming terminal state names the SAME subscription.
 * An ordinary cancel-at-period-end never matches, because that row is still
 * `active` with a real period end when `deleted` arrives; nor does a genuine
 * re-subscribe, which arrives `active`.
 */
function clampRevokedPeriodEnd(
  state: SubscriptionState,
  existing: IUserSubscription | null,
): SubscriptionState {
  if (state.status !== 'canceled') return state
  if (!existing || existing.status !== 'canceled' || existing.currentPeriodEnd) return state
  if (
    existing.stripeSubscriptionId &&
    state.stripeSubscriptionId &&
    existing.stripeSubscriptionId !== state.stripeSubscriptionId
  ) {
    return state
  }
  return { ...state, currentPeriodEnd: undefined }
}

/**
 * Stop Stripe billing a subscription we have just revoked.
 *
 * Runs AFTER the document write, and the order is load-bearing. Cancelling
 * first makes Stripe emit `customer.subscription.deleted` with a LATER
 * `event.created` than the refund we are handling; if that delivery wins the
 * race, the ordering guard in writeSubscription refuses our own revoke as
 * stale and the member keeps Plus. Writing first means the revoke is already
 * the floor, and the `deleted` that follows is clamped above.
 *
 * A failure is logged and NEVER thrown. The document is already revoked, which
 * is the half that controls access; a subscription Stripe still bills is money
 * moving the wrong way and an operator can end it in the dashboard. Throwing
 * would 500 the webhook and make Stripe retry an event whose access half
 * already succeeded — every few hours for three days, if the cancel is failing
 * for a permanent reason.
 */
async function cancelRevokedSubscription(
  subscriptionId: string | null | undefined,
  reason: string,
  deps: ApplyDeps,
): Promise<void> {
  if (!subscriptionId || !deps.cancelSubscription) return
  try {
    // Already terminal in Stripe? Nothing to do — and this is the COMMON path,
    // not an edge case: an operator issuing a refund has usually cancelled the
    // subscription first, in the same sitting.
    if (deps.retrieveSubscription) {
      const current = await deps.retrieveSubscription(subscriptionId)
      const status = normalizeStatus(current?.status)
      if (status === 'canceled' || status === 'incomplete_expired') return
    }
    await deps.cancelSubscription(subscriptionId)
  } catch (error) {
    console.error(
      `[billing] ${reason} revoke: could not cancel ${subscriptionId}; access is revoked but Stripe may still bill:`,
      (error as Error)?.name ?? 'unknown',
    )
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
      // The clamp is what keeps our OWN cancel — the one a revoke performs —
      // from handing the refunded period straight back.
      nextState = clampRevokedPeriodEnd(outcome.state, existingSub)
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

    case 'revoke': {
      // Nothing to revoke. A charge can be refunded on a member who never held
      // a subscription — findUserIdByRef matched them by a customer id from an
      // abandoned checkout — and stamping 'canceled' over 'none' would invent a
      // subscription they never had, then report a tier change for it.
      if (!existingSub || existingSub.status === 'none') {
        return { applied: false, reason: 'nothing_to_revoke' }
      }

      nextState = revokedState(existingSub, outcome.mode)
      patch = subscriptionPatch(nextState, eventId, outcome.eventCreated, now)
      if (outcome.customerId) {
        patch[`subscription.${customerIdField(outcome.mode)}`] = outcome.customerId
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

  const write = await deps.writeSubscription(userId, patch, {
    eventCreated: outcome.eventCreated,
  })

  // A store that guards its write can refuse it, and everything after this
  // point is a claim about a document that was NOT modified. Firing
  // onTierChanged would bust a cache for a tier change that never happened;
  // returning `applied: true` put `applied tier=plus` in the webhook log for a
  // write Mongo rejected, which is the single most misleading line an operator
  // can read while debugging a tier dispute. Report the skip.
  if (write && write.applied === false) {
    return {
      applied: false,
      reason: write.reason === 'user_gone' ? 'user_not_found' : 'skipped_newer_state',
    }
  }

  // The write landed, so the revoke is now the ordering floor and it is safe to
  // let Stripe emit the `deleted` this cancel produces. Only ever after.
  if (outcome.kind === 'revoke') {
    await cancelRevokedSubscription(existingSub?.stripeSubscriptionId, outcome.reason, deps)
  }

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
