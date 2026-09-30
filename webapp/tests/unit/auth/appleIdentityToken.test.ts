// Run with: npm run test:file tests/unit/auth/appleIdentityToken.test.ts
//
// SIGN IN WITH APPLE — the verifier, on its own, with no database and no
// network. A real RSA key pair stands in for Apple's: tokens are minted here
// exactly as Apple mints them and handed to the real verifier through a local
// JWKS, so every refusal below is the refusal a device would get.
//
// The three the card names — A WRONG AUDIENCE, AN EXPIRED TOKEN, A NONCE
// MISMATCH — are the three that are dangerous to get wrong and invisible when
// you do:
//
//   • wrong audience: Apple signs EVERY app's identity tokens with the same
//     keys. A verifier that checks the signature and not the audience accepts
//     a token minted for somebody else's app, i.e. anyone with an App Store
//     account can sign in as anyone;
//   • expired: the whole point of a 10-minute token is that a captured one
//     stops working;
//   • nonce: without it a token captured from one sign-in replays into
//     another.
//
// Plus the ones that are the same class of mistake: a wrong issuer, a token
// signed by a key that is not Apple's, and a token whose `alg` was swapped for
// something we never agreed to.

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose'

import {
  APPLE_BUNDLE_ID,
  APPLE_ISSUER,
  AppleTokenError,
  isPrivateRelayEmail,
  nonceMatches,
  verifyAppleIdentityToken,
  type AppleTokenFailure,
} from '../../../lib/apple/identityToken'
import {
  applePlaceholderEmail,
  canMatchAppleEmailToMember,
  isApplePlaceholderEmail,
  isRealMemberAddress,
} from '../../../lib/apple/email'
import { appleDisplayName } from '../../../lib/apple/fullName'

const KID = 'test-apple-key'
const OTHER_KID = 'not-apples-key'
const SUB = '000123.deadbeefdeadbeefdeadbeef.0001'
const NONCE = 'a-random-nonce-for-this-sign-in'

let signingKey: CryptoKey
let otherSigningKey: CryptoKey
let keys: JWTVerifyGetKey

before(async () => {
  const apple = await generateKeyPair('RS256', { extractable: true })
  const impostor = await generateKeyPair('RS256', { extractable: true })
  signingKey = apple.privateKey as CryptoKey
  otherSigningKey = impostor.privateKey as CryptoKey
  const appleJwk = { ...(await exportJWK(apple.publicKey)), kid: KID, alg: 'RS256', use: 'sig' } as JWK
  const impostorJwk = {
    ...(await exportJWK(impostor.publicKey)),
    kid: OTHER_KID,
    alg: 'RS256',
    use: 'sig',
  } as JWK
  // Only Apple's key is in the set the verifier trusts; the impostor's public
  // key is deliberately NOT, which is what makes the "signed by someone else"
  // case a real test rather than a key-id typo.
  void impostorJwk
  keys = createLocalJWKSet({ keys: [appleJwk] })
})

interface MintOptions {
  audience?: string | string[]
  issuer?: string
  nonce?: string | null
  email?: string | null
  emailVerified?: unknown
  isPrivateEmail?: unknown
  sub?: string
  expiresAt?: number
  issuedAt?: number
  key?: CryptoKey
  alg?: string
  kid?: string
}

/** An identity token shaped exactly like Apple's. */
async function mint(options: MintOptions = {}): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  const claims: Record<string, unknown> = {}
  if (options.nonce !== null) claims.nonce = options.nonce ?? NONCE
  if (options.email !== null) claims.email = options.email ?? 'member@example.test'
  claims.email_verified = options.emailVerified ?? 'true'
  if (options.isPrivateEmail !== undefined) claims.is_private_email = options.isPrivateEmail

  return new SignJWT(claims)
    .setProtectedHeader({ alg: options.alg ?? 'RS256', kid: options.kid ?? KID })
    .setIssuer(options.issuer ?? APPLE_ISSUER)
    .setAudience(options.audience ?? APPLE_BUNDLE_ID)
    .setSubject(options.sub ?? SUB)
    .setIssuedAt(options.issuedAt ?? nowSec)
    .setExpirationTime(options.expiresAt ?? nowSec + 600)
    .sign(options.key ?? signingKey)
}

async function refusal(
  identityToken: string,
  opts: { nonce?: string; audience?: string | string[]; now?: Date } = {},
): Promise<AppleTokenFailure> {
  try {
    await verifyAppleIdentityToken({
      identityToken,
      nonce: opts.nonce ?? NONCE,
      audience: opts.audience,
      keys,
      ...(opts.now ? { now: opts.now } : {}),
    })
  } catch (err) {
    assert.ok(err instanceof AppleTokenError, `expected an AppleTokenError, got ${String(err)}`)
    return (err as AppleTokenError).reason
  }
  assert.fail('the token was accepted')
}

// ─── It accepts what Apple actually sends ────────────────────────────────────

test('a real Apple token yields the subject, the address and the flags', async () => {
  const identity = await verifyAppleIdentityToken({
    identityToken: await mint(),
    nonce: NONCE,
    keys,
  })
  assert.equal(identity.sub, SUB)
  assert.equal(identity.email, 'member@example.test')
  assert.equal(identity.emailVerified, true, "Apple's string 'true' is a true")
  assert.equal(identity.isPrivateEmail, false)
})

test('a Hide My Email token is flagged private, by the claim OR by the domain', async () => {
  const byClaim = await verifyAppleIdentityToken({
    identityToken: await mint({ email: 'abc123@privaterelay.appleid.com', isPrivateEmail: 'true' }),
    nonce: NONCE,
    keys,
  })
  assert.equal(byClaim.isPrivateEmail, true)

  // The claim is absent (older tokens) — the domain alone is enough.
  const byDomain = await verifyAppleIdentityToken({
    identityToken: await mint({ email: 'abc123@privaterelay.appleid.com' }),
    nonce: NONCE,
    keys,
  })
  assert.equal(byDomain.isPrivateEmail, true)
})

test('a token with no email claim is accepted — Apple shares it once', async () => {
  const identity = await verifyAppleIdentityToken({
    identityToken: await mint({ email: null }),
    nonce: NONCE,
    keys,
  })
  assert.equal(identity.email, undefined)
  assert.equal(identity.sub, SUB)
})

test('the audience may be a list, so a web Services ID can be added later', async () => {
  const identity = await verifyAppleIdentityToken({
    identityToken: await mint({ audience: 'io.redbtn.become.service' }),
    nonce: NONCE,
    audience: [APPLE_BUNDLE_ID, 'io.redbtn.become.service'],
    keys,
  })
  assert.equal(identity.sub, SUB)
})

// ─── A WRONG AUDIENCE ───────────────────────────────────────────────────────

test('a token minted for another app is refused (wrong audience)', async () => {
  assert.equal(await refusal(await mint({ audience: 'com.someone.else' })), 'wrong_audience')
  // And the default audience is our bundle id, not "whatever was asked for".
  assert.equal(await refusal(await mint({ audience: 'io.redbtn.become.evil' })), 'wrong_audience')
})

// ─── AN EXPIRED TOKEN ───────────────────────────────────────────────────────

test('an expired token is refused, with no clock tolerance', async () => {
  const nowSec = Math.floor(Date.now() / 1000)
  assert.equal(
    await refusal(await mint({ issuedAt: nowSec - 1200, expiresAt: nowSec - 600 })),
    'expired',
  )
  // One second past is past. A tolerance here would be a tolerance forever.
  assert.equal(
    await refusal(await mint({ issuedAt: nowSec - 600, expiresAt: nowSec - 1 })),
    'expired',
  )
  // The same token, checked at a moment before it expired, is fine — so the
  // refusal above is the clock and not a broken token.
  const stillValid = await mint({ issuedAt: nowSec - 600, expiresAt: nowSec - 1 })
  const identity = await verifyAppleIdentityToken({
    identityToken: stillValid,
    nonce: NONCE,
    keys,
    now: new Date((nowSec - 300) * 1000),
  })
  assert.equal(identity.sub, SUB)
})

// ─── A NONCE MISMATCH ───────────────────────────────────────────────────────

test('a token answering a different challenge is refused (nonce mismatch)', async () => {
  assert.equal(await refusal(await mint({ nonce: 'some-other-sign-ins-nonce' })), 'nonce_mismatch')
  assert.equal(await refusal(await mint(), { nonce: 'not-what-the-token-carries' }), 'nonce_mismatch')
})

test('a token with no nonce at all is refused, and so is a request with none', async () => {
  assert.equal(await refusal(await mint({ nonce: null })), 'nonce_mismatch')
  assert.equal(await refusal(await mint(), { nonce: '' }), 'nonce_mismatch')
})

test('the SHA-256 form of the nonce is accepted, because some SDKs hash it', async () => {
  const raw = 'raw-value-the-device-kept'
  const hashed = crypto.createHash('sha256').update(raw).digest('hex')
  const identity = await verifyAppleIdentityToken({
    identityToken: await mint({ nonce: hashed }),
    nonce: raw,
    keys,
  })
  assert.equal(identity.sub, SUB)
  assert.equal(nonceMatches(hashed, raw), true)
  assert.equal(nonceMatches(hashed, 'a-different-raw-value'), false)
  assert.equal(nonceMatches(undefined, raw), false)
  assert.equal(nonceMatches('', raw), false)
})

// ─── The rest of the signature/issuer surface ───────────────────────────────

test('a token signed by anyone but Apple is refused', async () => {
  // Right kid, wrong key: the signature does not verify against Apple's.
  assert.equal(await refusal(await mint({ key: otherSigningKey })), 'bad_signature')
  // A key id nobody published.
  assert.equal(await refusal(await mint({ kid: OTHER_KID })), 'bad_signature')
})

test('a token from another issuer is refused', async () => {
  assert.equal(
    await refusal(await mint({ issuer: 'https://accounts.google.com' })),
    'wrong_issuer',
  )
})

test('an unsigned or symmetric token is refused, not read', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', kid: KID })).toString('base64url')
  const body = Buffer.from(
    JSON.stringify({ iss: APPLE_ISSUER, aud: APPLE_BUNDLE_ID, sub: SUB, nonce: NONCE, exp: Math.floor(Date.now() / 1000) + 600 }),
  ).toString('base64url')
  assert.equal(await refusal(`${header}.${body}.`), 'bad_signature')

  assert.equal(await refusal('not-a-jwt'), 'malformed')
  assert.equal(await refusal('two.parts'), 'malformed')
})

// ─── The address rules (lib/apple/email.ts) ─────────────────────────────────

test('a relay address is never matched to an existing member', () => {
  assert.equal(isPrivateRelayEmail('x7y@privaterelay.appleid.com'), true)
  assert.equal(isPrivateRelayEmail('member@example.test'), false)

  // The whole rule, case by case.
  assert.equal(
    canMatchAppleEmailToMember({ email: 'member@example.test', emailVerified: true, isPrivateEmail: false }),
    true,
  )
  assert.equal(
    canMatchAppleEmailToMember({ email: 'x7y@privaterelay.appleid.com', emailVerified: true, isPrivateEmail: true }),
    false,
    'a relay alias must not match a member — that is how a duplicate account is created',
  )
  assert.equal(
    canMatchAppleEmailToMember({ email: 'x7y@privaterelay.appleid.com', emailVerified: true, isPrivateEmail: false }),
    false,
    'the domain alone is enough, even when Apple omits the flag',
  )
  assert.equal(
    canMatchAppleEmailToMember({ email: 'member@example.test', emailVerified: false, isPrivateEmail: false }),
    false,
    'an unverified address is not proof of anything',
  )
  assert.equal(canMatchAppleEmailToMember({ emailVerified: true, isPrivateEmail: false }), false)
})

test('the placeholder address is unroutable, stable and recognisable', () => {
  const placeholder = applePlaceholderEmail(SUB)
  assert.match(placeholder, /@appleid\.invalid$/)
  assert.equal(applePlaceholderEmail(SUB), placeholder, 'not stable across sign-ins')
  assert.equal(isApplePlaceholderEmail(placeholder), true)
  assert.equal(isRealMemberAddress(placeholder), false)
  assert.equal(isRealMemberAddress('member@example.test'), true)
  // A subject with characters that are not valid in a local part still yields
  // one address and nothing else.
  assert.match(applePlaceholderEmail('AB/CD+EF'), /^apple-abcdef@appleid\.invalid$/)
})

test("Apple's fullName arrives as an object, and only once", () => {
  assert.equal(appleDisplayName({ givenName: 'Alex', familyName: 'Runner' }), 'Alex Runner')
  assert.equal(appleDisplayName({ givenName: 'Alex' }), 'Alex')
  assert.equal(appleDisplayName({ givenName: null, familyName: null, nickname: 'Al' }), 'Al')
  assert.equal(appleDisplayName('Alex Runner'), 'Alex Runner')
  assert.equal(appleDisplayName(undefined), undefined)
  assert.equal(appleDisplayName({}), undefined)
  assert.equal(appleDisplayName({ givenName: '   ' }), undefined)
})
