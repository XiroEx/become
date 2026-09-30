/**
 * NATIVE SIGN-IN HAND-BACK — the one-time code, in the direction that ends in
 * the APP. No database and no framework in this file, so the rules can be read
 * in one place and tested without either.
 *
 * NP-121 (lib/authHandoff.ts) trades the session the APP is holding for a code
 * a BROWSER may spend once. This is the mirror image: the browser has just
 * finished a Google sign-in and the session has to reach the app.
 *
 * WHY NOT THE FRAGMENT THE WEB USES. `/auth/callback/google` ends at
 * `/auth/finish#<jwt>`, which is right for a browser tab — the fragment never
 * reaches a server or an access log. It is wrong for an app: the only way a
 * URL gets from the system authentication session back into the app is a
 * scheme the OS routes, and a scheme can be claimed by ANY app on the device.
 * A JWT handed over it is a session handed to whoever claimed it.
 *
 * So the app never receives the token. It receives a CODE, and the code is
 * worthless to anybody but the app that started the flow:
 *
 *   1. the app invents a VERIFIER (kept on the device, never in a URL) and
 *      sends only its SHA-256 — the CHALLENGE — when it starts the flow at
 *      `GET /api/auth/google?app=1&challenge=…`;
 *   2. Google returns to `/auth/callback/google`, which mints a code bound to
 *      that member AND that challenge and redirects to
 *      `/auth/app-callback?code=…` (never the token);
 *   3. the app exchanges the code at `POST /api/auth/exchange` WITH the
 *      verifier. Anything that intercepted the code cannot produce the
 *      verifier, so the code alone buys nothing.
 *
 * THE TWO RULES THAT TRAVEL, exactly as they do for the hand-off:
 *
 *   • SINGLE USE — enforced by the atomic claim in models/AppAuthCode.ts and
 *     decided here: a claim that came back empty is refused, never treated as
 *     "probably fine". A replay is a refusal, not a second session.
 *   • SIXTY SECONDS, DECIDED IN CODE — never left to mongod's TTL sweep, which
 *     runs about once a minute and would therefore honour a dead code.
 *
 * And one this direction adds:
 *
 *   • ONE DEVICE — the verifier. Without it a code lifted out of the callback
 *     URL would be a session for the taking.
 */

/** A code is worthless sixty seconds after it is minted. Same as NP-121. */
export const APP_AUTH_CODE_TTL_SECONDS = 60
export const APP_AUTH_CODE_TTL_MS = APP_AUTH_CODE_TTL_SECONDS * 1000

/** Where the app starts the flow (the existing web entry point, with `app=1`). */
export const APP_AUTH_START_PATH = '/api/auth/google'

/**
 * Where the provider callback lands a code for the app. A Become HTTPS path,
 * not a scheme: it is the URL the card names, and the only thing it ever
 * carries is a single-use code.
 */
export const APP_AUTH_CALLBACK_PATH = '/auth/app-callback'

/** Where the app spends the code for a session. */
export const APP_AUTH_EXCHANGE_PATH = '/api/auth/exchange'

/**
 * The URL that closes the system authentication session and hands the code to
 * the app that opened it. `become` is `expo.scheme` in expo/app.json, and this
 * value is mirrored in expo/lib/auth/googleSignIn.ts — the two are pinned
 * together by tests/unit/auth/appAuthCode.test.ts, which reads that file.
 *
 * A custom scheme is safe HERE and would not be for a token: this URL carries
 * a code that cannot be spent without the verifier, which never left the
 * device that generated it.
 */
export const APP_AUTH_SCHEME = 'become'
export const APP_AUTH_RETURN_URL = `${APP_AUTH_SCHEME}:/${APP_AUTH_CALLBACK_PATH}`

/**
 * The cookie that remembers "this Google round-trip belongs to the app", set
 * when the flow starts and spent by the callback.
 *
 * It holds the CHALLENGE, which is a hash and therefore not a secret; it is
 * HttpOnly anyway because nothing in a page has any business reading it. A
 * cookie rather than redAuth's `redirect` state because the callback must know
 * the answer before it decides what to redirect to, and because it is cleared
 * on the way out — a browser cannot be left in "app mode" for a later web
 * sign-in.
 */
export const APP_AUTH_FLOW_COOKIE = 'become_app_auth'

/** Long enough for a member to pick an account and type a password. */
export const APP_AUTH_FLOW_COOKIE_MAX_AGE_SECONDS = 600

/** SHA-256, base64url: 32 bytes → 43 characters, no padding. */
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/

/**
 * The verifier the app keeps. 43 characters is 32 random bytes in base64url —
 * the floor, matching the challenge — and 128 is a ceiling so a caller cannot
 * post a megabyte to be hashed.
 */
const VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/

/** Did this request ask for the app flow? `app=1`, and nothing else counts. */
export function isAppAuthRequested(params: { get(name: string): string | null }): boolean {
  return params.get('app') === '1'
}

export function isAppAuthChallenge(value: unknown): value is string {
  return typeof value === 'string' && CHALLENGE_PATTERN.test(value)
}

export function isAppAuthVerifier(value: unknown): value is string {
  return typeof value === 'string' && VERIFIER_PATTERN.test(value)
}

/** Set-Cookie for the start of an app flow. */
export function appAuthFlowCookie(
  challenge: string,
  isProduction = process.env.NODE_ENV === 'production',
): string {
  return (
    `${APP_AUTH_FLOW_COOKIE}=${challenge}; HttpOnly; Path=/;`
    + ` Max-Age=${APP_AUTH_FLOW_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax;`
    + `${isProduction ? ' Secure;' : ''}`
  )
}

/**
 * Set-Cookie that removes it. Sent by the callback whether or not the flow was
 * an app flow, so a browser that once did one cannot fall into app mode on a
 * later, ordinary web sign-in.
 */
export function clearedAppAuthFlowCookie(
  isProduction = process.env.NODE_ENV === 'production',
): string {
  return (
    `${APP_AUTH_FLOW_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax;`
    + `${isProduction ? ' Secure;' : ''}`
  )
}

/** What the callback hands the app: a code, or a reason it failed. */
export type AppAuthOutcome = { code: string } | { error: string }

/** `https://<origin>/auth/app-callback?code=…` — the URL the card names. */
export function appAuthCallbackUrl(origin: string, outcome: AppAuthOutcome): string {
  const url = new URL(APP_AUTH_CALLBACK_PATH, origin)
  if ('code' in outcome) url.searchParams.set('code', outcome.code)
  else url.searchParams.set('error', outcome.error)
  return url.toString()
}

/**
 * `become://auth/app-callback?code=…` — what actually closes the system
 * authentication session and resolves `WebBrowser.openAuthSessionAsync` in the
 * app that opened it.
 */
export function appAuthReturnUrl(outcome: AppAuthOutcome): string {
  const query =
    'code' in outcome
      ? `code=${encodeURIComponent(outcome.code)}`
      : `error=${encodeURIComponent(outcome.error)}`
  return `${APP_AUTH_RETURN_URL}?${query}`
}

/** A row as it stood at the moment this call claimed it. */
export interface AppAuthClaim {
  userId: string
  /** SHA-256 of the verifier, base64url — what the app must now prove. */
  challenge: string
  expiresAt: Date | string | number
}

export type AppAuthRefusal = 'unknown_or_used' | 'expired' | 'verifier_mismatch'

export type AppAuthExchange =
  | { ok: true; userId: string }
  | { ok: false; reason: AppAuthRefusal }

/**
 * Whether a claimed row may be turned into a session.
 *
 * `claim` is null when the atomic claim matched nothing — no such code, or
 * somebody already spent it. Both are refused identically, and the route
 * answers 400 for every reason here: a caller must not be able to tell "never
 * existed" from "already used" from "wrong verifier".
 *
 * `verifierHash` is the SHA-256 of what the app just sent
 * (models/AppAuthCode.ts#hashAppAuthVerifier). Comparing hashes rather than
 * storing the verifier means a dump of the collection is not a pile of usable
 * ones — the same reason the code itself is only ever stored as a hash.
 */
export function decideAppAuthExchange(
  claim: AppAuthClaim | null | undefined,
  verifierHash: string,
  now: Date,
): AppAuthExchange {
  if (!claim) return { ok: false, reason: 'unknown_or_used' }

  const expiresAt = claim.expiresAt instanceof Date ? claim.expiresAt : new Date(claim.expiresAt)
  if (!Number.isFinite(expiresAt.getTime())) return { ok: false, reason: 'expired' }
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' }

  const challenge = String(claim.challenge ?? '')
  if (!challenge || !verifierHash || challenge !== verifierHash) {
    return { ok: false, reason: 'verifier_mismatch' }
  }

  const userId = String(claim.userId ?? '')
  if (!userId) return { ok: false, reason: 'unknown_or_used' }

  return { ok: true, userId }
}
