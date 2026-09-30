// The WIDGETS token: what an OS widget extension carries instead of the
// member's session.
//
// WHY A SEPARATE TOKEN AT ALL
//
// A WidgetKit / App Widget extension is a different process with a different
// lifetime from the app. Whatever it holds sits on the device for months and is
// read by code the member never opened. Handing it the 30-day session — the
// credential that can log a workout, change a goal, start a Stripe checkout or
// delete the account — to draw a streak number is a grant wildly out of
// proportion to the job. So the extension gets a token whose `scope` claim
// makes it useless everywhere except `GET /api/widgets/summary`: verifyAuth is
// default-deny for scoped tokens, so the refusal is the behaviour of every
// other route in the app without any of them being edited.
//
// A WIDGETS TOKEN READS THE FEED AND NOTHING ELSE. That is the whole grant.
//
// WHY A VERSION
//
// `ai-tools` tokens are safe to leave stateless because they expire in 15
// minutes. This one cannot be: an OS refresh budget is measured in hours and a
// widget that has to re-authenticate every quarter of an hour is a widget that
// shows a stale number all day. A long life needs a way back, and a JWT has
// none by itself — so the token carries `widgetTokenVersion`, the value of
// `User.widgetTokenVersion` at mint time, and the summary route compares it
// against the stored one on every read. Bumping the stored number
// (`bumpWidgetTokenVersion`) invalidates every token minted before it, with one
// write and no revocation list:
//
//   • the member signs out in the app  → POST /api/auth/logout
//   • the member asks to be deleted    → DELETE /api/me/account
//
// The app asks for a fresh token at each open, so a bump costs a signed-in
// member nothing more than one request.

import jwt from 'jsonwebtoken'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import User from '@/models/User'
import type { TokenScope } from '@/lib/auth'

/** The one scope a widget extension ever holds. */
export const WIDGET_TOKEN_SCOPE: TokenScope = 'widgets'

/**
 * Long-lived ON PURPOSE — see the header. 180 days is longer than the 30-day
 * session precisely because this token can be revoked and that one cannot; the
 * `widgetTokenVersion` check, not the expiry, is what ends it.
 */
export const WIDGET_TOKEN_MAX_AGE_SECONDS = 180 * 24 * 60 * 60

/**
 * The stored version as a number. Absent means 0: the field is missing on every
 * row written before this feature existed, and `$inc` turns absent into 1, so
 * "never bumped" and "version 0" have to be the same thing.
 */
export function normalizeWidgetTokenVersion(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

/**
 * Is the version claim on a presented widgets token still the current one?
 *
 * DEFAULT-DENY on a MISSING claim. A widgets token with no `widgetTokenVersion`
 * is a token nothing can ever revoke, which is the exact property this file
 * exists to remove — so it is refused rather than treated as version 0.
 *
 * Pure, so the rule is testable without a database.
 */
export function isWidgetTokenCurrent(claim: unknown, stored: unknown): boolean {
  if (typeof claim !== 'number' || !Number.isFinite(claim)) return false
  return Math.trunc(claim) === normalizeWidgetTokenVersion(stored)
}

/**
 * Mint the token a widget extension carries. Minted only by
 * `POST /api/widgets/token`, which requires a full (unscoped) session — a
 * widgets token cannot mint another one, because verifyAuth refuses it there.
 */
export async function mintWidgetToken(
  userId: string,
  email: string | undefined,
  widgetTokenVersion: number,
): Promise<string> {
  const { auth } = await getRuntimeConfig()
  return jwt.sign(
    {
      userId,
      email,
      scope: WIDGET_TOKEN_SCOPE,
      widgetTokenVersion: normalizeWidgetTokenVersion(widgetTokenVersion),
    },
    auth.jwtSecret,
    { expiresIn: WIDGET_TOKEN_MAX_AGE_SECONDS },
  )
}

/**
 * Invalidate every widgets token this member currently holds.
 *
 * `$inc` rather than `$set`, which is also why the field has no schema default:
 * absent → 1 on the first bump, so "never bumped" (absent, read as 0 by
 * normalizeWidgetTokenVersion) and "bumped once" can never collide.
 *
 * FAIL-SOFT AT THE CALL SITES, NOT HERE: signing out may not fail because a
 * database write did, so the callers swallow the error. They log it, because a
 * bump that silently did not happen is a token that silently still works.
 */
export async function bumpWidgetTokenVersion(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $inc: { widgetTokenVersion: 1 } })
}

/**
 * Whose widgets tokens a sign-out must kill, given the token the client
 * presented — or `null` when there is nothing to revoke.
 *
 * A SCOPED TOKEN IS NOT A SESSION AND CANNOT SIGN ONE OUT. Without that line a
 * widgets token, which is handed to an OS extension and therefore lives in the
 * least protected place on the device, could reach `POST /api/auth/logout` and
 * invalidate the member's other widgets — a write, from the one credential that
 * is supposed to be read-only.
 *
 * Pure, so the rule is testable without a database.
 */
export function signOutRevocationTarget(
  payload: { userId?: string; scope?: TokenScope } | null | undefined,
): string | null {
  if (!payload?.userId) return null
  if (payload.scope) return null
  return payload.userId
}

/** Reads the stored counter for a member. `null` = no such member. */
export type WidgetTokenVersionLoader = (userId: string) => Promise<number | null>

/** The real loader: one indexed read by `_id`, projected to the one field. */
export const loadWidgetTokenVersion: WidgetTokenVersionLoader = async (userId) => {
  const row = await User.findById(userId)
    .select('widgetTokenVersion')
    .lean<{ widgetTokenVersion?: number } | null>()
  return row ? normalizeWidgetTokenVersion(row.widgetTokenVersion) : null
}

/**
 * THE GATE `GET /api/widgets/summary` runs after verifyAuth, and the only place
 * a `widgets` token's version is ever checked.
 *
 * An unscoped session passes untouched and costs nothing — a member reading
 * their own feed in the app must not pay for a widget's revocation check. A
 * widgets token is checked against the stored counter, and a token whose claim
 * does not match it is refused: that is what "signing out ends the widget"
 * means when the credential is a stateless JWT.
 *
 * The missing-claim case short-circuits BEFORE the load, so a token nothing
 * could ever revoke is refused without touching the database.
 *
 * `load` is injectable for the same reason lib/redis's client is: the decision
 * is then exercisable with no database at all.
 */
export async function isWidgetAuthAccepted(
  auth: { userId?: string; scope?: TokenScope; widgetTokenVersion?: number },
  load: WidgetTokenVersionLoader = loadWidgetTokenVersion,
): Promise<boolean> {
  if (auth.scope !== WIDGET_TOKEN_SCOPE) return true
  if (!auth.userId) return false
  const claim = auth.widgetTokenVersion
  if (typeof claim !== 'number' || !Number.isFinite(claim)) return false
  const stored = await load(auth.userId)
  // No row = no member. Checked explicitly: `null` would normalize to 0 and let
  // a purged account's first-ever token keep reading.
  if (stored === null) return false
  return isWidgetTokenCurrent(claim, stored)
}
