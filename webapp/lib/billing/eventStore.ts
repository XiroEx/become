/**
 * Webhook idempotency.
 *
 * Stripe retries any delivery that did not answer 2xx, and occasionally
 * redelivers one that did. Without a claim, a retried
 * `customer.subscription.deleted` re-runs after the member has already
 * resubscribed, and the second apply undoes the first.
 *
 * The claim is an INSERT, not a read-then-write: two concurrent deliveries of
 * the same event both read "not seen" and both proceed. The unique index on
 * StripeEvent.eventId decides the race, and E11000 is the loser's answer.
 */

import dbConnect from '@/lib/mongodb'
import StripeEvent from '@/models/StripeEvent'
import type { StripeMode } from './mode'

export interface EventClaimStore {
  claim(eventId: string, type: string, mode: StripeMode): Promise<'claimed' | 'duplicate'>
  markProcessed(eventId: string): Promise<void>
  /** Drop the claim so Stripe's retry can take it again. */
  release(eventId: string): Promise<void>
}

function isDuplicateKeyError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  return code === 11000 || code === 11001
}

export function mongoEventClaimStore(): EventClaimStore {
  return {
    async claim(eventId, type, mode) {
      await dbConnect()
      try {
        await StripeEvent.create({ eventId, type, mode, status: 'processing' })
        return 'claimed'
      } catch (error) {
        if (isDuplicateKeyError(error)) return 'duplicate'
        throw error
      }
    },
    async markProcessed(eventId) {
      await dbConnect()
      await StripeEvent.updateOne(
        { eventId },
        { $set: { status: 'processed', processedAt: new Date() } },
      )
    },
    async release(eventId) {
      await dbConnect()
      await StripeEvent.deleteOne({ eventId })
    },
  }
}

export type ClaimedRun<T> = { duplicate: true } | { duplicate: false; result: T }

/**
 * Run `run` exactly once per event id.
 *
 * On a throw the claim is RELEASED before rethrowing, so the route's 500 leads
 * to a Stripe retry that can actually re-claim. Leaving the row behind would
 * make every retry a silent no-op and the event would be lost forever — the
 * failure mode is invisible, which is why the release is not optional.
 */
export async function withEventClaim<T>(
  store: EventClaimStore,
  eventId: string,
  type: string,
  mode: StripeMode,
  run: () => Promise<T>,
): Promise<ClaimedRun<T>> {
  const claimed = await store.claim(eventId, type, mode)
  if (claimed === 'duplicate') return { duplicate: true }

  let result: T
  try {
    result = await run()
  } catch (error) {
    try {
      await store.release(eventId)
    } catch {
      // A failed release must not mask the original error. Worst case the event
      // is stuck claimed and Stripe's retries no-op — visible in the logs as a
      // 500 with no follow-up apply.
    }
    throw error
  }

  await store.markProcessed(eventId)
  return { duplicate: false, result }
}
