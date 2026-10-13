// SIGN IN WITH APPLE — the half that talks BACK to Apple.
//
// Two calls, and the second is the reason the first exists:
//
//   POST /auth/token   exchange the authorization code the device handed us
//                      for a REFRESH TOKEN, which is the only handle Apple
//                      gives us on the grant.
//   POST /auth/revoke  hand that refresh token back. Apple requires every app
//                      that offers Sign in with Apple AND account deletion to
//                      revoke the tokens it holds when the account goes
//                      (App Store Review Guideline 5.1.1(v) is the deletion
//                      half; the revocation requirement is Apple's REST API
//                      documentation for `revoke`). Without the stored refresh
//                      token there is nothing to revoke, so the exchange is
//                      not an optimisation — it is what makes deletion
//                      complete.
//
// AUTHENTICATION IS A JWT WE SIGN, NOT A SECRET WE HOLD. Apple has no
// "client secret" string: the secret is an ES256 JWT signed with the .p8
// private key from the Apple Developer portal, issued by the Team ID, keyed by
// the Key ID, audienced to Apple and subjected to the client id. It is minted
// per call and lives minutes, because there is no reason for it to live longer.
//
// EVERY NETWORK CALL IS INJECTABLE (`fetchImpl`, `baseUrl`). The tests for
// this card stand a real HTTP server up and point `baseUrl` at it, so the
// request Apple would receive is asserted byte for byte without the suite ever
// leaving the machine.

import { SignJWT, importPKCS8 } from 'jose'
import { APPLE_ISSUER } from './identityToken'

/** How long a minted client secret is good for. Apple's ceiling is 6 months;
 *  this one is used once, immediately. */
export const APPLE_CLIENT_SECRET_TTL_SECONDS = 5 * 60

/** The credential set the two REST calls need. All four or nothing. */
export interface AppleServiceCredentials {
  /** The bundle id (native) or Services ID (web) the grant belongs to. */
  clientId: string
  teamId: string
  keyId: string
  /** PKCS#8 PEM — the contents of the .p8 downloaded from Apple. */
  privateKey: string
}

export interface AppleRestDeps {
  /** Defaults to the runtime's fetch, read at CALL time so a test that
   *  replaces `globalThis.fetch` is honoured. */
  fetchImpl?: typeof fetch
  /** Defaults to Apple. Overridden ONLY by tests, which point it at a local
   *  stub of Apple's endpoints. */
  baseUrl?: string
  /** Injection point for the client secret's `iat`/`exp`. */
  now?: Date
}

export class AppleRestError extends Error {
  readonly status: number
  /** Apple's own `error` field when it sent one (e.g. `invalid_grant`). */
  readonly appleError?: string
  constructor(status: number, appleError?: string, message?: string) {
    super(message ?? `apple rest call failed: ${status}${appleError ? ` ${appleError}` : ''}`)
    this.name = 'AppleRestError'
    this.status = status
    this.appleError = appleError
  }
}

/** A .p8 pasted through an environment variable usually arrives with literal
 *  `\n` escapes instead of newlines, and importPKCS8 rejects that. */
export function normalizeApplePrivateKey(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n').trim() : value.trim()
}

/** All four fields, or null — there is no useful half-configuration. */
export function resolveAppleCredentials(
  apple: { bundleId?: string; teamId?: string; keyId?: string; privateKey?: string },
  clientId?: string,
): AppleServiceCredentials | null {
  const id = (clientId ?? apple.bundleId ?? '').trim()
  const teamId = (apple.teamId ?? '').trim()
  const keyId = (apple.keyId ?? '').trim()
  const privateKey = (apple.privateKey ?? '').trim()
  if (!id || !teamId || !keyId || !privateKey) return null
  return { clientId: id, teamId, keyId, privateKey }
}

/** The ES256 JWT that stands in for a client secret. */
export async function buildAppleClientSecret(
  creds: AppleServiceCredentials,
  options: { now?: Date; ttlSeconds?: number } = {},
): Promise<string> {
  const key = await importPKCS8(normalizeApplePrivateKey(creds.privateKey), 'ES256')
  const issuedAt = Math.floor((options.now?.getTime() ?? Date.now()) / 1000)
  const ttl = options.ttlSeconds ?? APPLE_CLIENT_SECRET_TTL_SECONDS
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: creds.keyId })
    .setIssuer(creds.teamId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttl)
    .setAudience(APPLE_ISSUER)
    .setSubject(creds.clientId)
    .sign(key)
}

function endpoint(deps: AppleRestDeps, path: string): string {
  const base = (deps.baseUrl ?? APPLE_ISSUER).replace(/\/$/, '')
  return `${base}${path}`
}

function doFetch(deps: AppleRestDeps): typeof fetch {
  if (deps.fetchImpl) return deps.fetchImpl
  // Resolved per call, NOT captured at import: a test that installs its own
  // global fetch after this module loaded must still be the one that answers.
  return (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)
}

async function postForm(
  deps: AppleRestDeps,
  path: string,
  form: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await doFetch(deps)(endpoint(deps, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  })
  const text = await res.text().catch(() => '')
  let body: Record<string, unknown> = {}
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
    } catch {
      // Apple answers JSON; anything else is reported by status alone.
    }
  }
  if (!res.ok) {
    throw new AppleRestError(res.status, typeof body.error === 'string' ? body.error : undefined)
  }
  return { status: res.status, body }
}

export interface AppleTokenExchange {
  refreshToken?: string
  accessToken?: string
  /** Apple returns an identity token here too; we already have a verified one. */
  idToken?: string
}

/** Exchange the one-time authorization code for the refresh token we must be
 *  able to revoke later. */
export async function exchangeAppleAuthorizationCode(
  code: string,
  creds: AppleServiceCredentials,
  deps: AppleRestDeps = {},
): Promise<AppleTokenExchange> {
  const clientSecret = await buildAppleClientSecret(creds, { now: deps.now })
  const { body } = await postForm(deps, '/auth/token', {
    client_id: creds.clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  })
  return {
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    accessToken: typeof body.access_token === 'string' ? body.access_token : undefined,
    idToken: typeof body.id_token === 'string' ? body.id_token : undefined,
  }
}

/** Hand a token back to Apple. Apple answers 200 with an empty body. */
export async function revokeAppleToken(
  token: string,
  tokenTypeHint: 'refresh_token' | 'access_token',
  creds: AppleServiceCredentials,
  deps: AppleRestDeps = {},
): Promise<void> {
  const clientSecret = await buildAppleClientSecret(creds, { now: deps.now })
  await postForm(deps, '/auth/revoke', {
    client_id: creds.clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: tokenTypeHint,
  })
}
