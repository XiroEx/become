// What a graph run and the allowance unit that paid for it know about each
// other. Both halves live on the AiRun row (models/AiRun.ts) because that row
// is the only thing that outlives the request in which the charge happened.
//
//   BIND    the refund handle to the run, so a run that is killed before it
//           executes can give the unit back (a webhook that was ACCEPTED is not
//           a run that RAN — see refundIfSkipped below).
//   CLAIM   a follow-up ticket against the outcome it names, once, so a
//           correction cannot be replayed into a day's worth of scans.
//
// Every function here fails SOFT: a metering row that cannot be written must
// never take the feature away from the member using it.

import dbConnect from '@/lib/mongodb'
import AiRun from '@/models/AiRun'
import { refundAllowance } from '@/lib/allowances'

/**
 * How long the SAME ticket may be re-presented and still count as the same
 * redemption.
 *
 * A correction whose dispatch failed leaves the client holding the ticket it
 * sent (the new one rode a success body that never arrived), so the member's
 * retry presents it again. Refusing that would charge a fresh unit for the same
 * correction and raise an upgrade sheet on a failure that was ours. Five
 * minutes covers a retry and nothing else; the window is anchored at the FIRST
 * claim ($min below) so replaying cannot extend it.
 */
export const FOLLOW_UP_RECLAIM_MS = 5 * 60_000

export interface FollowUpClaim {
  runId: string
  userId: string
  jti: string
  now?: Date
}

export interface RunChargeStore {
  /**
   * Spend a follow-up ticket against the outcome it names. False when the run
   * is not this member's, does not exist, or has already been refined under a
   * different ticket — in every case the caller charges a full unit instead.
   */
  claimFollowUp(input: FollowUpClaim): Promise<boolean>
  /**
   * Undo a claim whose dispatch never happened. Nothing was queued, so the
   * member's retry must still count as the same correction rather than a
   * second scan — the same reason the allowance unit itself is refunded on
   * that branch.
   */
  releaseFollowUp(input: { runId: string; jti: string }): Promise<void>
  /** Remember which allowance unit paid for this run. */
  bindCharge(input: { runId: string; userId: string; ticketId: string }): Promise<void>
}

export const mongoRunChargeStore: RunChargeStore = {
  async claimFollowUp({ runId, userId, jti, now = new Date() }): Promise<boolean> {
    if (!runId || !userId || !jti) return false
    try {
      await dbConnect()
      const doc = await AiRun.findOneAndUpdate(
        {
          runId,
          userId,
          $or: [
            // Never refined before.
            { followUpJti: { $exists: false } },
            { followUpJti: null },
            // The same ticket, still inside the retry window.
            { followUpJti: jti, followUpAt: { $gt: new Date(now.getTime() - FOLLOW_UP_RECLAIM_MS) } },
          ],
        },
        // $min, not $set: the retry window is measured from the first claim, so
        // a replay flood cannot keep pushing it forward.
        { $set: { followUpJti: jti }, $min: { followUpAt: now } },
        { new: true, projection: { _id: 1 } }
      ).lean()
      return !!doc
    } catch (err) {
      // A ticket we cannot verify is not a ticket. Charging a full unit is the
      // safe direction: the member keeps their correction, we keep the count.
      console.error('[runCharge] follow-up claim failed', { runId, err })
      return false
    }
  },

  async releaseFollowUp({ runId, jti }): Promise<void> {
    if (!runId || !jti) return
    try {
      await dbConnect()
      // Scoped to the jti: a release can only ever undo the claim it made.
      await AiRun.updateOne(
        { runId, followUpJti: jti },
        { $unset: { followUpJti: '', followUpAt: '' } }
      )
    } catch (err) {
      console.error('[runCharge] follow-up release failed', { runId, err })
    }
  },

  async bindCharge({ runId, userId, ticketId }): Promise<void> {
    if (!runId || !userId || !ticketId) return
    try {
      await dbConnect()
      await AiRun.updateOne({ runId, userId }, { $set: { allowanceTicket: ticketId } })
    } catch (err) {
      // Losing the binding only costs the refund below; the run still runs.
      console.error('[runCharge] charge binding failed', { runId, err })
    }
  },
}

/**
 * Give the unit back for a run that was accepted and then killed WITHOUT ever
 * executing.
 *
 * The become-ai automation is single-flight: an overlapping trigger is answered
 * 200 by the webhook and reaped by the worker ~15ms later with
 * '[worker:concurrency-skip] Run skipped: automation already running',
 * nodesExecuted 0 and an empty execution path. triggerOwnedRun cannot see any
 * of that — it returns ok as soon as the webhook accepts — so three of those in
 * a week left a free member with no generations and nothing to show for them.
 *
 * This is NOT the "a run failed, give me my money back" button, which does not
 * and must not exist: a run that STARTED and then failed is non-refundable,
 * because the graph ran and "it didn't work" is a claim only the client can
 * make. The distinction is server-observed and comes from the run record
 * itself (lib/ai/becomeGraph.ts#isSkippedRun), never from the caller.
 *
 * Claim first, refund second: `refundedAt` is set by the same conditional
 * update that reads the ticket, so two polls landing together refund once and
 * a third one — or a re-poll an hour later — finds nothing left to claim.
 */
export interface SkipRefundDeps {
  /** Take the run's charge, exactly once. Returns the ticket, or null. */
  claimTicket: (runId: string, userId: string) => Promise<string | null>
  refund: (ticketId: string) => Promise<void>
}

export const mongoSkipRefundDeps: SkipRefundDeps = {
  async claimTicket(runId, userId) {
    await dbConnect()
    const claimed = await AiRun.findOneAndUpdate(
      {
        runId,
        userId,
        allowanceTicket: { $exists: true, $ne: null },
        refundedAt: { $exists: false },
      },
      { $set: { refundedAt: new Date() } },
      { new: false, projection: { allowanceTicket: 1 } }
    ).lean<{ allowanceTicket?: string } | null>()
    return claimed?.allowanceTicket ?? null
  },
  refund: refundAllowance,
}

export async function refundIfSkipped(
  runId: string,
  userId: string,
  deps: SkipRefundDeps = mongoSkipRefundDeps
): Promise<boolean> {
  if (!runId || !userId) return false
  try {
    const ticketId = await deps.claimTicket(runId, userId)
    if (!ticketId) return false
    await deps.refund(ticketId)
    return true
  } catch (err) {
    console.error('[runCharge] skip refund failed', { runId, err })
    return false
  }
}
