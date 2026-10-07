/**
 * One-time session hand-off — the RULES, with no database and no framework.
 *
 * A Tier-3 surface (the program editor, the recipe editor, the admin screens)
 * is opened from the native app in an in-app browser, and that browser has no
 * Become session: the member lands on /login instead of the screen they tapped.
 * The fix is a code, not a token in a URL that stays in a URL —
 *
 *   1. `POST /api/auth/handoff` (session required) mints a random code, bound
 *      to that member AND to one target path, good for sixty seconds, once;
 *   2. `GET /auth/handoff?code=` claims it, mints the member's normal session,
 *      sets the cookie, and hands the browser to the target path.
 *
 * Everything the security of that rests on lives HERE so it can be read in one
 * place and tested without a database:
 *
 *   • single use — enforced by the atomic claim in models/HandoffCode.ts, and
 *     decided here: a claim that came back empty is refused as
 *     `unknown_or_used`, never as "probably fine";
 *   • short lived — HANDOFF_CODE_TTL_SECONDS, checked in code, never left to
 *     mongod's TTL sweep (which runs about once a minute and would therefore
 *     honour a code long after it died);
 *   • one member — the code carries the userId it was minted for; the session
 *     that comes out is that member's and nobody else's;
 *   • allow-listed targets only — a code cannot redirect anywhere but a path in
 *     HANDOFF_ALLOWED_PATHS, so a hand-off can never be aimed at another origin
 *     or at a path picked by whoever got hold of the URL.
 *
 * This module is imported by client components (app/auth/finish), so it must
 * stay free of `crypto`, mongoose and anything else that is server-only.
 */

/** A code is worthless sixty seconds after it is minted. */
export const HANDOFF_CODE_TTL_SECONDS = 60
export const HANDOFF_CODE_TTL_MS = HANDOFF_CODE_TTL_SECONDS * 1000

/** Where a code is minted. The native helper posts here. */
export const HANDOFF_MINT_PATH = '/api/auth/handoff'

/** Where a code is redeemed. The native helper opens this. */
export const HANDOFF_REDEEM_PATH = '/auth/handoff'

/**
 * Every path a hand-off may land on. `:name` matches exactly ONE segment.
 *
 * A path that is not on this list cannot be minted and cannot be redirected to,
 * and `tests/unit/auth/handoff.test.ts` fails if an entry here does not resolve
 * to a real page under `app/` — the native helpers used to point at
 * `/dashboard/programming/<id>/edit` and `/dashboard/nutrition/recipes/create`,
 * neither of which is a page, and nothing said so.
 */
export const HANDOFF_ALLOWED_PATHS = [
  '/dashboard',
  // Programs — the program editor (NP-135) and creating one.
  '/dashboard/programs/new',
  '/dashboard/programs/:programId/edit',
  // Recipes — create and edit (NP-144).
  '/dashboard/recipes/new',
  '/dashboard/recipes/:recipeId/edit',
  // Workout — the hub (NP-239/NP-328: Sessions, Programs and custom Exercise Library with video upload).
  '/dashboard/workout/hub',
  '/dashboard/workout/library',
  // Admin (NP-122). Coach-only screens; the session minted is still the
  // member's own, so these open with exactly the rights they already had.
  '/dashboard/admin',
  '/dashboard/admin/foods/:foodId',
  '/dashboard/admin/exercises/new',
  '/dashboard/admin/exercises/:slug/edit',
  '/dashboard/admin/users',
  '/dashboard/admin/users/:userId',
] as const

export type HandoffAllowedPath = (typeof HANDOFF_ALLOWED_PATHS)[number]

/**
 * What a `:param` segment may contain. Deliberately narrow — ids are ObjectId
 * hex and slugs are kebab-case, so nothing here needs a `%`, a dot-dot or a
 * character that changes meaning when a browser or a proxy re-parses the URL.
 */
const PARAM_SEGMENT = /^[A-Za-z0-9_-]+$/

function matchesPattern(pattern: string, segments: string[]): boolean {
  const patternSegments = pattern.split('/').slice(1)
  if (patternSegments.length !== segments.length) return false
  return patternSegments.every((expected, i) => {
    const actual = segments[i]
    if (expected.startsWith(':')) return PARAM_SEGMENT.test(actual)
    return expected === actual
  })
}

/** Is this exact pathname one of the allow-listed targets? */
export function isHandoffPathAllowed(path: string): boolean {
  if (typeof path !== 'string' || !path.startsWith('/')) return false
  const segments = path.split('/').slice(1)
  if (segments.some((s) => s.length === 0)) return false
  return HANDOFF_ALLOWED_PATHS.some((pattern) => matchesPattern(pattern, segments))
}

/**
 * The one door a target path comes through, on the way IN (minting) and on the
 * way OUT (redirecting). Returns the path to use, or null to refuse.
 *
 * Refuses, in order: anything that is not a string; anything that does not
 * start with a single `/` (an absolute URL, `//host` which is another origin,
 * or a relative path); a backslash, which some clients read as a separator; a
 * query string or a fragment, which are not part of a target and are the usual
 * way an open redirect is smuggled; control characters; and finally anything
 * that is not on the allow-list.
 */
export function normalizeHandoffPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return null
  if (trimmed.startsWith('//')) return null
  if (trimmed.includes('\\')) return null
  if (trimmed.includes('?') || trimmed.includes('#')) return null
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null
  const path = trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
  return isHandoffPathAllowed(path) ? path : null
}

/** A row as it stood at the moment this call claimed it. */
export interface HandoffClaim {
  userId: string
  path: string
  expiresAt: Date | string | number
}

export type HandoffRefusal = 'unknown_or_used' | 'expired' | 'path_not_allowed'

export type HandoffRedemption =
  | { ok: true; userId: string; path: string }
  | { ok: false; reason: HandoffRefusal }

/**
 * Whether a claimed row may be turned into a session, and where it goes.
 *
 * `claim` is null when the atomic claim matched nothing — no such code, or
 * somebody already redeemed it. Both are refused identically: a caller must not
 * be able to tell "never existed" from "already used".
 *
 * The allow-list is checked AGAIN here, on the stored path, so that shrinking
 * HANDOFF_ALLOWED_PATHS takes effect for codes that are already in flight.
 */
export function decideRedemption(
  claim: HandoffClaim | null | undefined,
  now: Date,
): HandoffRedemption {
  if (!claim) return { ok: false, reason: 'unknown_or_used' }

  const expiresAt =
    claim.expiresAt instanceof Date ? claim.expiresAt : new Date(claim.expiresAt)
  if (!Number.isFinite(expiresAt.getTime())) return { ok: false, reason: 'expired' }
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' }

  const path = normalizeHandoffPath(claim.path)
  if (!path) return { ok: false, reason: 'path_not_allowed' }

  const userId = String(claim.userId ?? '')
  if (!userId) return { ok: false, reason: 'unknown_or_used' }

  return { ok: true, userId, path }
}
