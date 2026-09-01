import jwt from 'jsonwebtoken'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import type { Feature } from '@/lib/entitlements'

/**
 * The follow-up ticket: proof that a member already paid for the outcome they
 * are now refining.
 *
 * The plate correction loop is one outcome and N dispatches — "it was 6 tacos,
 * not 3" re-runs the estimate with the original image plus a note. Charging
 * each of those as a fresh estimate would leave a free member with one scan a
 * day and no way to fix it, which breaks the feature rather than pricing it.
 *
 * So the route that charged the estimate mints one of these and returns it in
 * the success body; the client hands it back on the correction, and the route
 * spends a bounded FOLLOW-UP instead of a fresh unit.
 *
 * It is a JWT for one reason: the client holds it. An opaque id the server
 * merely recognised would be forgeable, and forging it is worth an unlimited
 * supply of vision calls. Signed with the app's own secret, scoped so a session
 * token can never be presented in its place, and bound to the exact
 * (user, feature, window) it was issued for. Short-lived: 30 minutes is longer
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
}

export async function mintAllowanceTicket(
  claims: AllowanceTicketClaims
): Promise<string | undefined> {
  if (!claims.userId || !claims.bucketKey) return undefined
  try {
    const { auth } = await getRuntimeConfig()
    return jwt.sign({ ...claims, scope: TICKET_SCOPE }, auth.jwtSecret, {
      expiresIn: TICKET_TTL,
    })
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
 */
export async function readAllowanceTicket(raw: unknown): Promise<AllowanceTicketClaims | null> {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const { auth } = await getRuntimeConfig()
    const decoded = jwt.verify(raw, auth.jwtSecret) as {
      userId?: unknown
      feature?: unknown
      bucketKey?: unknown
      scope?: unknown
    }
    if (decoded.scope !== TICKET_SCOPE) return null
    if (
      typeof decoded.userId !== 'string' ||
      typeof decoded.feature !== 'string' ||
      typeof decoded.bucketKey !== 'string'
    ) {
      return null
    }
    return {
      userId: decoded.userId,
      feature: decoded.feature as Feature,
      bucketKey: decoded.bucketKey,
    }
  } catch {
    // Expired, tampered with, or signed by something else — all one answer.
    return null
  }
}
