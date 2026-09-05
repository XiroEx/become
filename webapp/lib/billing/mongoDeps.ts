// SERVER-ONLY. The Mongo half of billing: everything lib/billing/apply.ts and
// lib/billing/customer.ts take as an injected dep, wired to real collections.
//
// It is a separate module so those two stay IO-free and testable, and so this
// file is the ONE place a field name on user.subscription is spelled out.

import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { bustTilesCache } from '@/lib/redis'
import { deriveTier } from '@/lib/subscription'
import type { IUserSubscription, UserRole } from '@/models/User'
import type { Tier } from '@/lib/entitlements'
import { customerIdField, type StripeMode } from './mode'
import type { BillingConfig } from './config'
import type { ApplyDeps, ExistingBillingState } from './apply'
import type { UserRef } from './webhookEvents'
import { getStripe } from './stripeClient'

/** Resolve the member an event is about, by whichever handle it carried. */
export async function findUserIdByRef(ref: UserRef): Promise<string | null> {
  await dbConnect()

  if (ref.by === 'userId') {
    // Validate rather than trust: userId comes from Stripe metadata, which is
    // free-form text, and a malformed one would throw a CastError mid-webhook.
    const found = await User.findById(ref.userId).select('_id').lean<{ _id: unknown } | null>()
      .catch(() => null)
    return found ? String(found._id) : null
  }

  const filter =
    ref.by === 'customerId'
      ? { [`subscription.${customerIdField(ref.mode)}`]: ref.customerId }
      : { 'subscription.stripeSubscriptionId': ref.subscriptionId }

  const found = await User.findOne(filter).select('_id').lean<{ _id: unknown } | null>()
  return found ? String(found._id) : null
}

export async function loadExistingBillingState(
  userId: string,
): Promise<ExistingBillingState | null> {
  await dbConnect()
  const user = await User.findById(userId)
    .select('role tier grandfathered subscription')
    .lean<{
      role?: UserRole
      tier?: Tier
      grandfathered?: boolean
      subscription?: IUserSubscription
    } | null>()
  if (!user) return null
  return {
    role: user.role,
    tier: user.tier,
    grandfathered: user.grandfathered === true,
    subscription: user.subscription ?? null,
  }
}

/**
 * Guarded customer-id write. Matches ONLY a document whose mode-specific field
 * is still empty, so a concurrent second writer modifies nothing and is told so.
 *
 * It writes the ID AND NOTHING ELSE. In particular it must never touch
 * `subscription.mode`: that field is subscription STATE, owned by apply.ts, and
 * it is the exact value canApplyMode() reads to refuse a test-mode event against
 * live state. Writing it from here meant merely OPENING checkout on beta flipped
 * a live subscriber's stored mode to 'test' — after which beta's webhooks were
 * cleared to overwrite a real, paying subscription, and one test cancellation
 * dropped them to free while Stripe kept charging the card. A customer id is a
 * handle, not a statement about who is paying.
 */
export async function writeCustomerIdIfAbsent(
  userId: string,
  mode: StripeMode,
  customerId: string,
): Promise<{ id: string; won: boolean }> {
  await dbConnect()
  const field = `subscription.${customerIdField(mode)}`

  const result = await User.updateOne(
    {
      _id: userId,
      $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }],
    },
    { $set: { [field]: customerId } },
  )

  if (result.modifiedCount > 0) return { id: customerId, won: true }

  // Lost the race (or the field was already set). Re-read and use the winner.
  const stored = await readCustomerId(userId, mode)
  return stored ? { id: stored, won: false } : { id: customerId, won: true }
}

export async function readCustomerId(
  userId: string,
  mode: StripeMode,
): Promise<string | undefined> {
  await dbConnect()
  const user = await User.findById(userId)
    .select('subscription')
    .lean<{ subscription?: IUserSubscription } | null>()
  const value = user?.subscription?.[customerIdField(mode)]
  return typeof value === 'string' && value ? value : undefined
}

/**
 * The webhook's dependency bundle.
 *
 * `deriveTier` is imported HERE and nowhere else in billing — it is the single
 * line to change if the tier model ever moves, and every billing unit test
 * injects a stub instead of importing it.
 */
export function mongoApplyDeps(cfg: BillingConfig): ApplyDeps {
  return {
    cfg,
    findUserId: findUserIdByRef,
    loadExisting: loadExistingBillingState,
    async writeSubscription(userId, patch, guard) {
      await dbConnect()

      // The ordering check in apply.ts is a READ. Between it and this write a
      // second delivery can complete, and the loser of that race would then
      // overwrite newer state with older — precisely the resurrection the check
      // exists to prevent. Re-asserting it in the filter closes the window:
      // Mongo evaluates it against the document as it is at write time.
      //
      // `{ field: null }` matches missing as well as null in Mongo, so a row
      // that has never carried a Stripe clock (every row written before
      // lastEventCreated existed) still matches and still applies.
      const eventCreated = guard?.eventCreated
      const filter: Record<string, unknown> =
        typeof eventCreated === 'number' && Number.isFinite(eventCreated)
          ? {
              _id: userId,
              $or: [
                { 'subscription.lastEventCreated': null },
                { 'subscription.lastEventCreated': { $lte: eventCreated } },
              ],
            }
          : { _id: userId }

      const result = await User.updateOne(filter, { $set: patch })

      // Not an error. A miss means a strictly newer event already landed, which
      // is the same outcome as the stale-event branch: skip, keep the newer
      // state, and let the webhook answer 200 so Stripe stops retrying.
      if (result.matchedCount === 0 && typeof eventCreated === 'number') {
        console.warn(
          `[billing] write skipped for ${userId}: a newer event is already applied`,
        )
      }
    },
    async retrieveSubscription(id) {
      const stripe = await getStripe()
      if (!stripe) throw new Error('stripe_unconfigured')
      return stripe.subscriptions.retrieve(id)
    },
    deriveTier,
    // Fail-soft by construction (see lib/redis.ts) — a cache miss just means
    // the dashboard recomputes.
    onTierChanged: (userId) => bustTilesCache(userId),
  }
}
