import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import type { Feature } from '@/lib/entitlements'

/**
 * The follow-up ticket: proof that a member already paid for the OUTCOME they
 * are now refining.
 *
 * The plate correction loop is one outcome and N dispatches — "it was 6 tacos,
 * not 3" re-runs the estimate with the original image plus a note. Charging
 * each of those as a fresh estimate would leave a free member with one scan a
 * day and no way to fix it, which breaks the feature rather than pricing it.
 *
 * So the route that charged mints one of these once the dispatch exists and
 * returns it in the success body; the client hands it back on the correction,
 * and the route spends a bounded FOLLOW-UP instead of a fresh unit.
 *
 * ─── WHAT THE TICKET IS BOUND TO, AND WHY EACH BINDING IS THERE ──────────────
 *
 *   userId    a ticket for another member would spend from their allowance;
 *   feature   a cheap charge must not unlock an expensive one;
 *   bucketKey a ticket must not outlive the window that paid for it;
 *   runId     THE OUTCOME. Without it a ticket said only "this member paid for
 *             something today", so any request presenting it was treated as a
 *             correction — an unrelated description with no prior estimate
 *             came back 200, and every success minted the next ticket, so one
 *             charge chained into a day's worth of scans. The run is checked
 *             server-side (it must be a run WE dispatched for THIS member) and
 *             is spent ONCE, in lib/ai/runCharge.ts.
 *   rootRunId the first outcome in the chain, so a correction-of-a-correction
 *             is still traceable to the unit that was charged;
 *   seq       how many follow-ups this chain has already authorised, bounded
 *             by FOLLOW_UP_LIMITS independently of the window counter;
 *   jti       the redemption identity — the ticket is claimed under it.
 *
 * It is a JWT for one reason: the client holds it. An opaque id the server
 * merely recognised would be forgeable, and forging it is worth an unlimited
 * supply of vision calls. Signed with the app's own secret, scoped so a session
 * token can never be presented in its place. Short-lived: 30 minutes is longer
 * than any correction session and shorter than every window it could span.
 *
 * It is NOT a substitute for the counter. Redeeming one still writes — the
 * ticket says WHICH allowance to charge against, not whether to charge.
 */

const TICKET_SCOPE = 'allowance-followup'
const TICKET_TTL = '30m'

export interface AllowanceTicketClaims {
  userId: string
  feature: Feature
  /** The window the parent unit was charged in (windowBucket().key). */
  bucketKey: string
  /** The dispatched run this ticket was minted for. */
  runId: string
  /** The first run in this correction chain. */
  rootRunId: string
  /** 1 for the first correction of an outcome; bounded by FOLLOW_UP_LIMITS. */
  seq: number
  /** Redemption id — one ticket, one follow-up. */
  jti: string
}

export type AllowanceTicketRequest = Omit<AllowanceTicketClaims, 'jti'> & { jti?: string }

export async function mintAllowanceTicket(
  claims: AllowanceTicketRequest
): Promise<string | undefined> {
  if (!claims.userId || !claims.bucketKey || !claims.runId || !claims.rootRunId) return undefined
  if (!Number.isInteger(claims.seq) || claims.seq < 1) return undefined
  try {
    const { auth } = await getRuntimeConfig()
    return jwt.sign(
      { ...claims, jti: claims.jti ?? randomUUID(), scope: TICKET_SCOPE },
      auth.jwtSecret,
      { expiresIn: TICKET_TTL }
    )
  } catch {
    // No secret, no ticket. The correction then costs a full unit, which is the
    // safe direction to fail: over-charging is recoverable, free dispatches are
    // not.
    return undefined
  }
}

/**
 * Verify a ticket and return its claims, or null.
 *
 * `scope` is checked explicitly. Without it any valid session token would parse
 * as a ticket, and a session token is something every caller already holds.
 *
 * A ticket missing any binding is refused rather than partially honoured: an
 * old-shape ticket (no runId) is exactly the thing that could be replayed, and
 * a refused ticket costs a full unit rather than a free dispatch.
 */
export async function readAllowanceTicket(raw: unknown): Promise<AllowanceTicketClaims | null> {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const { auth } = await getRuntimeConfig()
    const decoded = jwt.verify(raw, auth.jwtSecret) as Record<string, unknown>
    if (decoded.scope !== TICKET_SCOPE) return null

    const str = (k: string): string | null =>
      typeof decoded[k] === 'string' && decoded[k] ? (decoded[k] as string) : null

    const userId = str('userId')
    const feature = str('feature')
    const bucketKey = str('bucketKey')
    const runId = str('runId')
    const rootRunId = str('rootRunId')
    const jti = str('jti')
    const seq = decoded.seq
    if (!userId || !feature || !bucketKey || !runId || !rootRunId || !jti) return null
    if (!Number.isInteger(seq) || (seq as number) < 1) return null

    return {
      userId,
      feature: feature as Feature,
      bucketKey,
      runId,
      rootRunId,
      seq: seq as number,
      jti,
    }
  } catch {
    // Expired, tampered with, or signed by something else — all one answer.
    return null
  }
}
