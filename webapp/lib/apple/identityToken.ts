// SIGN IN WITH APPLE — the verification half. Nothing here touches the
// database; it answers one question: "is this identity token really Apple's,
// really for OUR app, really fresh, and really the answer to the challenge this
// device raised?"
//
// The token arrives from the device, so every one of those checks is load
// bearing. A verifier that only checked the signature would accept a token
// minted for a DIFFERENT app by the same issuer (Apple signs everybody's with
// the same keys) — which is why `aud` is checked against our bundle id and not
// merely present. A verifier that skipped the nonce would accept a token
// replayed from another session.
//
// FIVE CHECKS, AND THE ORDER MATTERS
//
//   1. signature, against Apple's published JWKS (RS256 only — `alg: none` and
//      a symmetric alg are both refused by naming the algorithms);
//   2. issuer  === https://appleid.apple.com;
//   3. audience === the bundle id (plus the web Services ID once that exists);
//   4. exp/nbf, with NO clock tolerance;
//   5. the nonce, AFTER the signature — an unverified claim is not evidence.
//
// THE NONCE, AND WHY TWO FORMS ARE ACCEPTED
//
// Apple echoes `ASAuthorizationAppleIDRequest.nonce` into the token verbatim.
// The widespread convention (Firebase's, and what some SDK versions do for
// you) is to send Apple the SHA-256 of a random value and keep the raw value
// for the server, so the raw nonce never appears inside a token. Both are
// equally bound to the same one-shot random value, so both are accepted — and
// a value that is neither is a mismatch.

import crypto from 'crypto'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/** Apple's issuer, and also the audience of the client secret we sign for it. */
export const APPLE_ISSUER = 'https://appleid.apple.com'

/** Apple's published signing keys. Fetched and cached by jose. */
export const APPLE_JWKS_URL = `${APPLE_ISSUER}/auth/keys`

/** The iOS bundle id (expo/app.json → `ios.bundleIdentifier`) — the audience
 *  of every identity token the native app receives. */
export const APPLE_BUNDLE_ID = 'io.redbtn.become'

/** The domain Apple's "Hide My Email" relay addresses live on. */
export const APPLE_PRIVATE_RELAY_DOMAIN = 'privaterelay.appleid.com'

/** Apple signs identity tokens with RS256 and nothing else. */
export const APPLE_TOKEN_ALGORITHMS = ['RS256'] as const

/** Why a token was refused. Kept as a closed set so the route can answer with
 *  it and tests can assert on it without matching prose. */
export type AppleTokenFailure =
  | 'malformed'
  | 'bad_signature'
  | 'wrong_issuer'
  | 'wrong_audience'
  | 'expired'
  | 'nonce_mismatch'
  | 'no_subject'

export class AppleTokenError extends Error {
  readonly reason: AppleTokenFailure
  constructor(reason: AppleTokenFailure, message?: string) {
    super(message ?? `apple identity token rejected: ${reason}`)
    this.name = 'AppleTokenError'
    this.reason = reason
  }
}

/** The verified facts, and the only thing callers get. */
export interface AppleIdentity {
  /** Apple's stable subject for (this user, this team). THE join key. */
  sub: string
  /** Lower-cased. Absent when the member shared no address at all. */
  email?: string
  /** Apple's `email_verified`. A private relay address is verified too. */
  emailVerified: boolean
  /** True for a "Hide My Email" relay address — the reason this whole card
   *  exists: matching such an address to a member would create a second
   *  account for somebody who already has one. */
  isPrivateEmail: boolean
}

/** Is this one of Apple's relay addresses? */
export function isPrivateRelayEmail(email?: string | null): boolean {
  if (!email) return false
  return email.trim().toLowerCase().endsWith(`@${APPLE_PRIVATE_RELAY_DOMAIN}`)
}

/** Apple sends its booleans as the STRINGS 'true'/'false' in some responses
 *  and as real booleans in others. Both mean the same thing. */
export function appleClaimIsTrue(value: unknown): boolean {
  return value === true || value === 'true'
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

/** Does the token's `nonce` claim answer the challenge this sign-in raised?
 *  Accepts the raw value and its SHA-256 hex digest — see the header. */
export function nonceMatches(claim: unknown, expected: string): boolean {
  if (typeof claim !== 'string' || claim.length === 0) return false
  if (typeof expected !== 'string' || expected.length === 0) return false
  if (constantTimeEquals(claim, expected)) return true
  const digest = crypto.createHash('sha256').update(expected, 'utf8').digest('hex')
  return constantTimeEquals(claim.toLowerCase(), digest)
}

let cachedJwks: JWTVerifyGetKey | null = null

/** Apple's key set, fetched once per process and refreshed by jose on a
 *  `kid` it has not seen (Apple rotates them without notice). */
export function appleJwks(): JWTVerifyGetKey {
  if (!cachedJwks) cachedJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL))
  return cachedJwks
}

/** Turn jose's error vocabulary into ours. The distinction is not cosmetic:
 *  "expired" and "wrong audience" are different operational problems and the
 *  tests for this card name both. */
function refusalFor(err: unknown): AppleTokenError {
  const code = (err as { code?: string } | null)?.code
  const claim = (err as { claim?: string } | null)?.claim
  switch (code) {
    case 'ERR_JWT_EXPIRED':
      return new AppleTokenError('expired')
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
      if (claim === 'aud') return new AppleTokenError('wrong_audience')
      if (claim === 'iss') return new AppleTokenError('wrong_issuer')
      if (claim === 'nbf') return new AppleTokenError('expired', 'token is not valid yet')
      return new AppleTokenError('malformed', `claim '${claim}' failed validation`)
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
    case 'ERR_JWKS_NO_MATCHING_KEY':
    case 'ERR_JWKS_MULTIPLE_MATCHING_KEYS':
    case 'ERR_JOSE_ALG_NOT_ALLOWED':
      return new AppleTokenError('bad_signature')
    default:
      return new AppleTokenError('malformed')
  }
}

export interface VerifyAppleIdentityTokenOptions {
  identityToken: string
  /** The value the device generated for THIS sign-in. */
  nonce: string
  /** Defaults to the bundle id. A string or a list (bundle id + Services ID). */
  audience?: string | string[]
  /** Injection point: the tests hand in a local key set instead of Apple's. */
  keys?: JWTVerifyGetKey
  /** Injection point for exp/nbf. Defaults to now. */
  now?: Date
}

/** Verify an Apple identity token and return the facts it proves. Throws
 *  AppleTokenError — never a bare jose error — for every refusal. */
export async function verifyAppleIdentityToken(
  options: VerifyAppleIdentityTokenOptions,
): Promise<AppleIdentity> {
  const { identityToken, nonce } = options
  if (typeof identityToken !== 'string' || identityToken.split('.').length !== 3) {
    throw new AppleTokenError('malformed', 'identityToken is not a JWS')
  }
  if (typeof nonce !== 'string' || nonce.length === 0) {
    throw new AppleTokenError('nonce_mismatch', 'no nonce was presented')
  }

  let payload: Record<string, unknown>
  try {
    const verified = await jwtVerify(identityToken, options.keys ?? appleJwks(), {
      issuer: APPLE_ISSUER,
      audience: options.audience ?? APPLE_BUNDLE_ID,
      algorithms: [...APPLE_TOKEN_ALGORITHMS],
      // No tolerance. An expired token is a refusal, not a rounding error.
      clockTolerance: 0,
      ...(options.now ? { currentDate: options.now } : {}),
    })
    payload = verified.payload as Record<string, unknown>
  } catch (err) {
    throw refusalFor(err)
  }

  // AFTER the signature: an unverified claim is not evidence.
  if (!nonceMatches(payload.nonce, nonce)) {
    throw new AppleTokenError('nonce_mismatch')
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : ''
  if (!sub) throw new AppleTokenError('no_subject')

  const email = typeof payload.email === 'string' && payload.email.includes('@')
    ? payload.email.trim().toLowerCase()
    : undefined

  return {
    sub,
    email,
    emailVerified: appleClaimIsTrue(payload.email_verified),
    // Apple's own flag, OR the address being on the relay domain. Either is
    // enough to mean "do not match this address to an existing member".
    isPrivateEmail: appleClaimIsTrue(payload.is_private_email) || isPrivateRelayEmail(email),
  }
}
