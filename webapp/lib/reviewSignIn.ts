/**
 * The reviewer demo sign-in — the RULES, with no database and no framework.
 *
 * Apple and Google reviewers must be handed credentials that work (App Store
 * Review Guideline 2.1 / Play's "provide login credentials"), and Become is
 * passwordless: there is no password to hand over, and a reviewer has no access
 * to the inbox a magic link lands in. So there is exactly ONE narrow door — a
 * single designated demo account that signs in with a fixed code held in the
 * runtime config, typed on the normal sign-in screen.
 *
 * Everything the safety of that door rests on lives HERE so it can be read in
 * one place and tested without a database:
 *
 *   • ONE ACCOUNT. The code is checked against the configured demo email and
 *     nothing else. It cannot be used for any other address, and the refusal
 *     for a wrong address is byte-identical to the refusal for a wrong code —
 *     so the door is not also an oracle for "is this the demo account?".
 *   • OFF BY DEFAULT, AND SWITCHABLE OFF. `review.enabled` must be explicitly
 *     true AND an email and a code must be configured. All three live in
 *     `BECOME_RUNTIME_CONFIG` (redsecrets), which is data, not a deploy — see
 *     REVIEW_CONFIG_MAX_AGE_MS for how fast a flip takes effect.
 *   • A WEAK CODE IS NO CODE. A configured code shorter than
 *     REVIEW_CODE_MIN_LENGTH is treated as unconfigured. A four-character
 *     review code that is rate limited is still a four-character review code.
 *   • RATE LIMITED. REVIEW_MAX_ATTEMPTS tries per REVIEW_ATTEMPT_WINDOW_MS,
 *     counted per email AND per client address, so the fixed code cannot be
 *     guessed by volume. The limit is checked BEFORE the code is compared.
 *   • CONSTANT-TIME COMPARE. The code is a shared secret typed into a form;
 *     comparing it with `===` leaks its length and its prefix to anyone
 *     willing to measure. See constantTimeEquals.
 *
 * The account the code opens is the seeded demo account and never a real
 * member's: enforcement of that lives next to the database, in
 * lib/reviewAccount.ts (`User.isReviewAccount`), because it is a fact about a
 * row rather than about the request.
 */

/** Where a review code is spent. The web form and both store builds POST here. */
export const REVIEW_SIGN_IN_PATH = '/api/auth/review-sign-in'

/**
 * Shortest code this door will accept from config. Long enough that
 * REVIEW_MAX_ATTEMPTS per window is not a meaningful fraction of the space.
 */
export const REVIEW_CODE_MIN_LENGTH = 12

/** Failed-or-not attempts allowed per key inside the window below. */
export const REVIEW_MAX_ATTEMPTS = 5

/** The rate-limit window. Five tries per ten minutes, per email and per IP. */
export const REVIEW_ATTEMPT_WINDOW_MS = 10 * 60 * 1000

/**
 * How stale the cached runtime config may be when this door reads it.
 *
 * `getRuntimeConfig()` caches for the life of the process, which is right for
 * a database URI and wrong for a switch someone needs to throw in a hurry:
 * turning the review door off has to be a config change, not a deploy and not
 * a restart. The route therefore asks for a value no older than this, so a
 * flip of `review.enabled` in `BECOME_RUNTIME_CONFIG` takes effect within a
 * minute on every running instance.
 */
export const REVIEW_CONFIG_MAX_AGE_MS = 60 * 1000

/** What the reviewer is told when the code is wrong — for ANY reason. */
export const REVIEW_INVALID_MESSAGE =
  'That review code is not valid for this email address.'

/** What the reviewer is told when the door is shut. */
export const REVIEW_DISABLED_MESSAGE = 'Review sign-in is not available.'

/** The review section of the runtime config, exactly as it is stored. */
export interface ReviewAccountConfig {
  /** Must be explicitly true. Absent or false = the door does not exist. */
  enabled?: boolean
  /** The ONE account the code may sign in. */
  email?: string
  /** The fixed code, at least REVIEW_CODE_MIN_LENGTH long. */
  code?: string
}

/** A review config that is actually usable. */
export interface ResolvedReviewAccount {
  email: string
  code: string
}

/** Lowercased and trimmed, the way User.email is stored. */
export function normalizeReviewEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

/**
 * The config, or null when the door is shut. Null covers all four ways it can
 * be shut — switched off, no email, no code, or a code too short to be one —
 * because the answer the caller must give is the same for every one of them.
 */
export function resolveReviewAccount(
  config: ReviewAccountConfig | null | undefined,
): ResolvedReviewAccount | null {
  if (!config || config.enabled !== true) return null
  const email = normalizeReviewEmail(config.email)
  const code = typeof config.code === 'string' ? config.code.trim() : ''
  if (!email || !email.includes('@')) return null
  if (code.length < REVIEW_CODE_MIN_LENGTH) return null
  return { email, code }
}

/**
 * Compare two secrets without leaking how far the comparison got.
 *
 * Length is compared separately and the loop always walks the WHOLE candidate,
 * so the work done does not depend on where the first difference is. Written
 * without `crypto.timingSafeEqual` on purpose: this module is the shared rule
 * book and must stay importable anywhere, including a test that runs with no
 * Node built-ins mocked out from under it.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const aLen = a.length
  const bLen = b.length
  let diff = aLen ^ bLen
  for (let i = 0; i < aLen; i++) {
    // Compare against a real character of `b` when there is one; the modulo
    // keeps the loop doing identical work for a candidate of any length.
    diff |= a.charCodeAt(i) ^ b.charCodeAt(bLen ? i % bLen : 0)
  }
  return diff === 0
}

/**
 * The address the attempt came from, for the rate limit's second key.
 *
 * `x-forwarded-for` is a LIST when there is more than one proxy in the chain,
 * and only the FIRST entry is the client; taking the last one would key every
 * attempt to the same edge node and turn a per-address limit into a global
 * one. Returns null when nothing usable is present — the email key still
 * applies, so a missing address weakens the limit rather than removing it.
 */
export function clientAddressFromHeaders(
  getHeader: (name: string) => string | null | undefined,
): string | null {
  const forwarded = getHeader('x-forwarded-for')
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  for (const name of ['x-real-ip', 'cf-connecting-ip']) {
    const value = getHeader(name)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** Why a review sign-in was refused. Never sent to the client — see below. */
export type ReviewRefusalReason =
  /** The door is off, or is not configured well enough to be on. */
  | 'disabled'
  /** No email or no code in the request body. */
  | 'malformed'
  /** Too many attempts for this email or this address. */
  | 'rate_limited'
  /** A real code, aimed at an account that is not the demo account. */
  | 'wrong_account'
  /** The demo account, wrong code. */
  | 'wrong_code'

export interface ReviewSignInRefusal {
  ok: false
  reason: ReviewRefusalReason
  status: 400 | 403 | 404 | 429
  /** What the client is shown. Identical for wrong_account and wrong_code. */
  message: string
  /** Set on 'rate_limited' only. */
  retryAfterSeconds?: number
}

export interface ReviewSignInGrant {
  ok: true
  /** The demo account's email, normalized — the row to sign in. */
  email: string
}

export type ReviewSignInDecision = ReviewSignInGrant | ReviewSignInRefusal

export interface ReviewSignInAttemptInput {
  config: ReviewAccountConfig | null | undefined
  /** Email as typed on the sign-in screen. */
  email: unknown
  /** Code as typed. */
  code: unknown
  /** Attempts already made in the window by this email or address — NOT
   *  counting the one being decided. */
  priorAttempts?: number
  /** Milliseconds until the oldest attempt in the window falls out of it.
   *  Used for Retry-After; defaults to the whole window. */
  retryAfterMs?: number
}

/**
 * The whole decision, in one pure function.
 *
 * ORDER MATTERS, and it is: shut door → malformed request → rate limit →
 * account → code. The rate limit is ahead of both comparisons so a locked-out
 * caller learns nothing about either, and the two comparisons answer with the
 * same status and the same sentence so a caller cannot tell which of them
 * refused — the demo account's address is not a secret worth much, but leaking
 * it turns one guessable code into a known target.
 */
export function decideReviewSignIn(
  input: ReviewSignInAttemptInput,
): ReviewSignInDecision {
  const resolved = resolveReviewAccount(input.config)
  if (!resolved) {
    return {
      ok: false,
      reason: 'disabled',
      // 404: with the door shut there is no such capability to talk about.
      status: 404,
      message: REVIEW_DISABLED_MESSAGE,
    }
  }

  const email = normalizeReviewEmail(input.email)
  const code = typeof input.code === 'string' ? input.code.trim() : ''
  if (!email || !code) {
    return {
      ok: false,
      reason: 'malformed',
      status: 400,
      message: 'An email address and a review code are both required.',
    }
  }

  const priorAttempts = Number.isFinite(input.priorAttempts)
    ? Number(input.priorAttempts)
    : 0
  if (priorAttempts >= REVIEW_MAX_ATTEMPTS) {
    const retryAfterMs = Number.isFinite(input.retryAfterMs)
      ? Math.max(1, Number(input.retryAfterMs))
      : REVIEW_ATTEMPT_WINDOW_MS
    return {
      ok: false,
      reason: 'rate_limited',
      status: 429,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      message: 'Too many attempts. Please wait and try again.',
    }
  }

  // Both comparisons run, and both run in constant time, so neither the
  // address nor the code can be recovered by measuring this call.
  const accountMatches = constantTimeEquals(email, resolved.email)
  const codeMatches = constantTimeEquals(code, resolved.code)

  if (!accountMatches) {
    return {
      ok: false,
      reason: 'wrong_account',
      status: 403,
      message: REVIEW_INVALID_MESSAGE,
    }
  }
  if (!codeMatches) {
    return {
      ok: false,
      reason: 'wrong_code',
      status: 403,
      message: REVIEW_INVALID_MESSAGE,
    }
  }

  return { ok: true, email: resolved.email }
}
