// A FAKE APPLE, for the tests that have to go through the real routes.
//
// Not a mock of our own code: the routes run unmodified and Apple is what gets
// replaced. `globalThis.fetch` is swapped for a handler that answers the three
// endpoints Apple actually exposes to us —
//
//   GET  /auth/keys    the JWKS the identity token is verified against
//   POST /auth/token   the authorization-code exchange
//   POST /auth/revoke  the revocation account deletion must perform
//
// — so a test can mint tokens Apple would have minted, see the exact form
// bodies Apple would have received (`calls`), and make Apple refuse.
//
// It is a plain .ts helper rather than a .test.ts file so the unit glob does
// not try to run it.

import {
  SignJWT,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  type JWK,
} from 'jose'

export const APPLE_KID = 'fake-apple-key'
export const APPLE_BASE = 'https://appleid.apple.com'

export interface FakeAppleCall {
  url: string
  method: string
  form: Record<string, string>
}

export interface MintTokenOptions {
  sub: string
  nonce: string
  audience?: string
  issuer?: string
  email?: string | null
  emailVerified?: unknown
  isPrivateEmail?: unknown
  /** Seconds from now. Negative mints an already-expired token. */
  expiresInSeconds?: number
}

export interface FakeApple {
  /** The private key the .p8 config points at (PKCS#8 PEM, ES256). */
  servicePrivateKeyPem: string
  mintIdentityToken(options: MintTokenOptions): Promise<string>
  /** Every form POST Apple received, in order. */
  calls: FakeAppleCall[]
  /** What the next code exchange answers. */
  tokenResponse: { status: number; body: Record<string, unknown> }
  /** What the next revocation answers. */
  revokeResponse: { status: number; body: Record<string, unknown> }
  install(): void
  restore(): void
}

export async function createFakeApple(): Promise<FakeApple> {
  const signing = await generateKeyPair('RS256', { extractable: true })
  const service = await generateKeyPair('ES256', { extractable: true })
  const jwk = {
    ...(await exportJWK(signing.publicKey)),
    kid: APPLE_KID,
    alg: 'RS256',
    use: 'sig',
  } as JWK
  const servicePrivateKeyPem = await exportPKCS8(service.privateKey as CryptoKey)

  const realFetch = globalThis.fetch

  const fake: FakeApple = {
    servicePrivateKeyPem,
    calls: [],
    tokenResponse: {
      status: 200,
      body: { refresh_token: 'apple-refresh-token', access_token: 'apple-access-token' },
    },
    revokeResponse: { status: 200, body: {} },

    async mintIdentityToken(options: MintTokenOptions): Promise<string> {
      const nowSec = Math.floor(Date.now() / 1000)
      const claims: Record<string, unknown> = { nonce: options.nonce }
      if (options.email !== null) claims.email = options.email ?? 'member@example.test'
      claims.email_verified = options.emailVerified ?? 'true'
      if (options.isPrivateEmail !== undefined) claims.is_private_email = options.isPrivateEmail
      return new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: APPLE_KID })
        .setIssuer(options.issuer ?? APPLE_BASE)
        .setAudience(options.audience ?? 'io.redbtn.become')
        .setSubject(options.sub)
        .setIssuedAt(nowSec - 10)
        .setExpirationTime(nowSec + (options.expiresInSeconds ?? 600))
        .sign(signing.privateKey)
    },

    install(): void {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const method = (init?.method ?? 'GET').toUpperCase()

        if (url.endsWith('/auth/keys')) {
          return new Response(JSON.stringify({ keys: [jwk] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }

        const form: Record<string, string> = {}
        if (typeof init?.body === 'string') {
          for (const [key, value] of new URLSearchParams(init.body)) form[key] = value
        }
        fake.calls.push({ url, method, form })

        if (url.endsWith('/auth/token')) {
          return new Response(JSON.stringify(fake.tokenResponse.body), {
            status: fake.tokenResponse.status,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.endsWith('/auth/revoke')) {
          return new Response(JSON.stringify(fake.revokeResponse.body), {
            status: fake.revokeResponse.status,
            headers: { 'content-type': 'application/json' },
          })
        }

        throw new Error(`the fake Apple was asked for ${method} ${url}`)
      }) as typeof fetch
    },

    restore(): void {
      globalThis.fetch = realFetch
    },
  }

  return fake
}
