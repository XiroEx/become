// Run with: npm run test:file tests/unit/auth/appleSignInRoute.test.ts
//
// SIGN IN WITH APPLE, END TO END, through the real route handlers and the real
// (loopback, disposable) database. Apple itself is replaced — tests/unit/auth/
// fakeApple.ts answers its three endpoints — so the tokens are real tokens,
// the verification is the real verification, and what is asserted is which
// ACCOUNT the member landed in.
//
// That is the whole risk in this card. "Sign-in worked" is easy; the failure
// nobody notices until a member emails support is sign-in working and landing
// them in a BRAND NEW account, empty, while their year of training sits in the
// row next to it.
//
//   • an existing member whose real address Apple shares lands in their
//     existing account, and there is still exactly one of them;
//   • the second sign-in — the one Apple sends with no email claim at all —
//     finds the same row by the subject;
//   • Hide My Email creates a separate account (it must: a relay alias is
//     nobody's address), and the "Already a member? Link your email" path then
//     ends with ONE account holding the identity;
//   • a token with the wrong audience, an expired one and one answering a
//     different nonce are all refused by the route, with no account created.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose, { Types } from 'mongoose'
import { NextRequest } from 'next/server'

import { POST as APPLE_SIGN_IN } from '../../../app/api/auth/apple/route'
import { POST as APPLE_LINK } from '../../../app/api/auth/apple/link/route'
import { POST as VERIFY_LINK } from '../../../app/api/auth/verify-link/route'
import User from '../../../models/User'
import UserProgress from '../../../models/UserProgress'
import MagicLink from '../../../models/MagicLink'
import { signToken, verifyToken } from '../../../lib/auth'
import { __resetRuntimeConfigForTests } from '../../../lib/runtimeConfig'
import { createFakeApple, type FakeApple } from './fakeApple'

const DOMAIN = 'apple-signin-route.test'
const MEMBER_EMAIL = `alex@${DOMAIN}`
const NONCE = 'nonce-for-this-sign-in'
const VISIBLE_SUB = '000111.visible-email-member.0001'
const RELAY_SUB = '000222.hide-my-email-member.0002'

let apple: FakeApple

function signInRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/apple', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function signIn(body: unknown) {
  const res = await APPLE_SIGN_IN(signInRequest(body))
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { res, body: json }
}

async function linkEmail(token: string, email: unknown) {
  const res = await APPLE_LINK(
    new NextRequest('http://localhost/api/auth/apple/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email }),
    }),
  )
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { res, body: json }
}

async function verifyLink(token: string) {
  const res = await VERIFY_LINK(
    new Request('http://localhost/api/auth/verify-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
  )
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { res, body: json }
}

/** Every account this file could have created — BY SUBJECT AS WELL AS BY
 *  ADDRESS, because the whole point of a relay account is that its address is
 *  not on our test domain. Counting only the domain is how "no duplicate
 *  account" would pass while a duplicate sat there. */
const accounts = () => User.countDocuments({
  $or: [
    { email: new RegExp(`@${DOMAIN}$`) },
    { 'apple.sub': { $in: [VISIBLE_SUB, RELAY_SUB] } },
  ],
})

async function appleRowFor(id: unknown) {
  return User.findById(id)
    .select('email name onboardingCompleted apple.sub apple.isPrivateEmail +apple.refreshToken')
    .lean<{
      email: string
      name: string
      onboardingCompleted?: boolean
      apple?: { sub?: string; refreshToken?: string; isPrivateEmail?: boolean }
    } | null>()
}

async function cleanup() {
  const users = await User.find(
    { $or: [{ email: new RegExp(`@${DOMAIN}$`) }, { 'apple.sub': { $in: [VISIBLE_SUB, RELAY_SUB] } }] },
    { _id: 1 },
  ).lean<{ _id: Types.ObjectId }[]>()
  const ids = users.map((u) => u._id)
  await Promise.all([
    User.deleteMany({ _id: { $in: ids } }),
    UserProgress.deleteMany({ userId: { $in: ids } }),
    MagicLink.deleteMany({ email: new RegExp(`@${DOMAIN}$`) }),
  ])
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  apple = await createFakeApple()
  apple.install()
  // The Apple Developer key the client secret is signed with. Under
  // NODE_ENV=test the runtime config resolves nothing from the secret store,
  // so the environment IS the config.
  process.env.APPLE_TEAM_ID = 'TEAMID1234'
  process.env.APPLE_KEY_ID = 'KEYID56789'
  process.env.APPLE_PRIVATE_KEY = apple.servicePrivateKeyPem
  __resetRuntimeConfigForTests()
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanup()
})

after(async () => {
  await cleanup()
  apple.restore()
  delete process.env.APPLE_TEAM_ID
  delete process.env.APPLE_KEY_ID
  delete process.env.APPLE_PRIVATE_KEY
  __resetRuntimeConfigForTests()
  await mongoose.disconnect()
})

beforeEach(async () => {
  await cleanup()
  apple.calls = []
  apple.tokenResponse = {
    status: 200,
    body: { refresh_token: 'apple-refresh-token', access_token: 'apple-access-token' },
  }
})

/** A member who already has an account, the ordinary way. */
async function existingMember() {
  return User.create({
    name: 'Alex Runner',
    email: MEMBER_EMAIL,
    password: 'magic-link-auth-no-password',
    onboardingCompleted: true,
  })
}

// ─── (e015c981) An existing member, visible email ────────────────────────────

test('an existing member signing in with Apple lands in their existing account', async () => {
  const member = await existingMember()

  const { res, body } = await signIn({
    identityToken: await apple.mintIdentityToken({ sub: VISIBLE_SUB, nonce: NONCE, email: MEMBER_EMAIL }),
    nonce: NONCE,
    authorizationCode: 'apple-auth-code',
    fullName: { givenName: 'Alex', familyName: 'Runner' },
  })

  assert.equal(res.status, 200, JSON.stringify(body))
  assert.equal(body.matchedBy, 'email', 'the member was not matched by their address')
  assert.equal(body.isNew, false)
  assert.equal((body.user as { id: string }).id, String(member._id), 'a different account was opened')
  assert.equal(body.canLinkEmail, false, 'a member with a real address must not be offered the link')

  // One JWT format: the same token every other auth path mints.
  const claims = await verifyToken(String(body.token))
  assert.equal(claims.userId, String(member._id))
  assert.equal(claims.email, MEMBER_EMAIL)
  assert.equal(claims.scope, undefined, 'an Apple session must be an ordinary session')

  // And the cookie the web middleware gates /dashboard on.
  const cookie = res.headers.get('set-cookie') ?? ''
  assert.match(cookie, /auth_token=/)
  assert.match(cookie, /HttpOnly/)

  // NO DUPLICATE. This is the assertion the card is about.
  assert.equal(await accounts(), 1, 'Apple sign-in created a second account for an existing member')

  const row = await appleRowFor(member._id)
  assert.equal(row?.apple?.sub, VISIBLE_SUB, 'the Apple subject was not attached to the member')
  assert.equal(row?.name, 'Alex Runner', 'the existing name was overwritten')
  assert.equal(row?.onboardingCompleted, true, 'an existing member was sent back through onboarding')

  // The authorization code was exchanged and the refresh token stored, because
  // deletion has to be able to revoke it.
  const exchange = apple.calls.find((c) => c.url.endsWith('/auth/token'))
  assert.ok(exchange, 'the authorization code was never exchanged')
  assert.equal(exchange!.form.grant_type, 'authorization_code')
  assert.equal(exchange!.form.code, 'apple-auth-code')
  assert.equal(exchange!.form.client_id, 'io.redbtn.become')
  assert.ok(exchange!.form.client_secret, 'no client secret was signed')
  assert.equal(row?.apple?.refreshToken, 'apple-refresh-token', 'nothing was stored to revoke later')
})

test('the next sign-in, which Apple sends with no email, finds the same row by subject', async () => {
  const member = await existingMember()
  await signIn({
    identityToken: await apple.mintIdentityToken({ sub: VISIBLE_SUB, nonce: NONCE, email: MEMBER_EMAIL }),
    nonce: NONCE,
  })

  const again = await signIn({
    identityToken: await apple.mintIdentityToken({ sub: VISIBLE_SUB, nonce: 'second-nonce', email: null }),
    nonce: 'second-nonce',
  })
  assert.equal(again.res.status, 200, JSON.stringify(again.body))
  assert.equal(again.body.matchedBy, 'apple_sub')
  assert.equal((again.body.user as { id: string }).id, String(member._id))
  assert.equal(await accounts(), 1, 'the second sign-in created another account')
})

test('a rotated refresh token replaces the stored one', async () => {
  const member = await existingMember()
  await signIn({
    identityToken: await apple.mintIdentityToken({ sub: VISIBLE_SUB, nonce: NONCE, email: MEMBER_EMAIL }),
    nonce: NONCE,
    authorizationCode: 'code-1',
  })
  apple.tokenResponse = { status: 200, body: { refresh_token: 'apple-refresh-token-2' } }
  await signIn({
    identityToken: await apple.mintIdentityToken({ sub: VISIBLE_SUB, nonce: 'n2', email: MEMBER_EMAIL }),
    nonce: 'n2',
    authorizationCode: 'code-2',
  })
  const row = await appleRowFor(member._id)
  assert.equal(row?.apple?.refreshToken, 'apple-refresh-token-2')
})

test('a failing code exchange does not fail the sign-in', async () => {
  const member = await existingMember()
  apple.tokenResponse = { status: 400, body: { error: 'invalid_grant' } }
  const { res, body } = await signIn({
    identityToken: await apple.mintIdentityToken({ sub: VISIBLE_SUB, nonce: NONCE, email: MEMBER_EMAIL }),
    nonce: NONCE,
    authorizationCode: 'stale-code',
  })
  assert.equal(res.status, 200, 'a member was locked out by an Apple-side failure')
  assert.equal((body.user as { id: string }).id, String(member._id))
  const row = await appleRowFor(member._id)
  assert.equal(row?.apple?.sub, VISIBLE_SUB)
  assert.equal(row?.apple?.refreshToken, undefined)
})

// ─── (e015c982) Hide My Email, and the way back to one account ───────────────

test('Hide My Email creates its own account and offers the email link', async () => {
  await existingMember()

  const { res, body } = await signIn({
    identityToken: await apple.mintIdentityToken({
      sub: RELAY_SUB,
      nonce: NONCE,
      email: 'zq7x8@privaterelay.appleid.com',
      isPrivateEmail: 'true',
    }),
    nonce: NONCE,
  })

  assert.equal(res.status, 200, JSON.stringify(body))
  assert.equal(body.matchedBy, 'created')
  assert.equal(body.isNew, true)
  assert.equal(body.canLinkEmail, true, 'the member has no way to say they are already a member')

  const created = await appleRowFor((body.user as { id: string }).id)
  assert.equal(created?.onboardingCompleted, false, 'a new account must start onboarding')
  assert.equal(created?.apple?.isPrivateEmail, true)
  assert.equal(created?.email, 'zq7x8@privaterelay.appleid.com')

  // The trap, stated: two accounts, and only the member knows they are one
  // person. The link below is how they say so.
  assert.equal(await accounts(), 2)
})

test('a member using Hide My Email can link their email, and ends with one account', async () => {
  const member = await existingMember()
  const memberId = String(member._id)

  const signedIn = await signIn({
    identityToken: await apple.mintIdentityToken({
      sub: RELAY_SUB,
      nonce: NONCE,
      email: 'zq7x8@privaterelay.appleid.com',
      isPrivateEmail: 'true',
    }),
    nonce: NONCE,
    authorizationCode: 'apple-auth-code',
  })
  assert.equal(signedIn.body.canLinkEmail, true)
  const relayId = (signedIn.body.user as { id: string }).id
  assert.notEqual(relayId, memberId)
  assert.equal(await accounts(), 2)

  // "Already a member? Link your email" — the offer, from the session Apple
  // just minted. The mail itself cannot go out from a test (no SMTP
  // credentials), so what is asserted is that the request was ACCEPTED and the
  // link was minted carrying the intent.
  const asked = await linkEmail(String(signedIn.body.token), MEMBER_EMAIL)
  assert.ok(
    ![400, 401, 404, 409, 429].includes(asked.res.status),
    `the link was refused: ${asked.res.status} ${JSON.stringify(asked.body)}`,
  )
  const link = await MagicLink.findOne({ email: MEMBER_EMAIL }).lean<{
    token: string
    mode: string
    appleLinkUserId?: string
  } | null>()
  assert.ok(link, 'no sign-in link was minted for the real address')
  assert.equal(link!.appleLinkUserId, relayId, 'the link does not carry the Apple account it came from')
  assert.equal(link!.mode, 'login')

  // The member taps the link in their inbox.
  const verified = await verifyLink(link!.token)
  assert.equal(verified.res.status, 200, JSON.stringify(verified.body))
  assert.equal(verified.body.appleLinked, true)
  assert.equal(
    (verified.body.user as { id: string }).id,
    memberId,
    'the link signed them into the wrong account',
  )
  const linkedClaims = await verifyToken(String(verified.body.token))
  assert.equal(linkedClaims.userId, memberId)

  // ONE ACCOUNT. The identity moved to the member's row and the throwaway row
  // is gone — not orphaned, not left signed-in-able.
  assert.equal(await accounts(), 1, 'the member still has two accounts')
  assert.equal(await User.countDocuments({ _id: relayId }), 0, 'the Apple-created row survived')

  const row = await appleRowFor(memberId)
  assert.equal(row?.apple?.sub, RELAY_SUB, 'the Apple subject did not move to the existing account')
  assert.equal(row?.apple?.refreshToken, 'apple-refresh-token', 'the token to revoke was lost in the move')
  assert.equal(row?.email, MEMBER_EMAIL)
  assert.equal(row?.name, 'Alex Runner')

  // And the next sign-in from that phone now lands in the member's account by
  // subject alone — which is the point of moving it rather than copying it.
  const next = await signIn({
    identityToken: await apple.mintIdentityToken({
      sub: RELAY_SUB,
      nonce: 'third-nonce',
      email: null,
    }),
    nonce: 'third-nonce',
  })
  assert.equal(next.res.status, 200)
  assert.equal((next.body.user as { id: string }).id, memberId)
  assert.equal(await accounts(), 1)
})

test('linking an address nobody is registered under simply adopts it', async () => {
  const signedIn = await signIn({
    identityToken: await apple.mintIdentityToken({
      sub: RELAY_SUB,
      nonce: NONCE,
      email: 'zq7x8@privaterelay.appleid.com',
      isPrivateEmail: 'true',
    }),
    nonce: NONCE,
  })
  const relayId = (signedIn.body.user as { id: string }).id
  const fresh = `new-member@${DOMAIN}`

  await linkEmail(String(signedIn.body.token), fresh)
  const link = await MagicLink.findOne({ email: fresh }).lean<{ token: string } | null>()
  assert.ok(link)

  const verified = await verifyLink(link!.token)
  assert.equal(verified.res.status, 200, JSON.stringify(verified.body))
  assert.equal((verified.body.user as { id: string }).id, relayId, 'a second account was created')
  assert.equal(await accounts(), 1)
  const row = await appleRowFor(relayId)
  assert.equal(row?.email, fresh, 'the account is still only reachable at the relay alias')
  assert.equal(row?.apple?.sub, RELAY_SUB)
})

test('the link offer is refused for a session that is not eligible for it', async () => {
  const member = await existingMember()

  // No session at all.
  assert.equal((await linkEmail('not-a-token', MEMBER_EMAIL)).res.status, 401)

  // A member whose address is already a real one: the merge deletes the row it
  // moves the identity off, so it may never be offered on an account in use.
  const memberToken = await signToken({ userId: String(member._id), email: MEMBER_EMAIL })
  const refused = await linkEmail(memberToken, `someone-else@${DOMAIN}`)
  assert.equal(refused.res.status, 409)
  assert.equal(refused.body.error, 'link_not_available')
  assert.equal(await MagicLink.countDocuments({ email: `someone-else@${DOMAIN}` }), 0)

  // A relay-created account may not link a relay address (mail to nowhere) or
  // an address it already holds.
  const signedIn = await signIn({
    identityToken: await apple.mintIdentityToken({
      sub: RELAY_SUB,
      nonce: NONCE,
      email: 'zq7x8@privaterelay.appleid.com',
      isPrivateEmail: 'true',
    }),
    nonce: NONCE,
  })
  const relayToken = String(signedIn.body.token)
  assert.equal((await linkEmail(relayToken, 'other@privaterelay.appleid.com')).res.status, 400)
  assert.equal((await linkEmail(relayToken, 'zq7x8@privaterelay.appleid.com')).res.status, 400)
  assert.equal((await linkEmail(relayToken, 'not-an-email')).res.status, 400)
})

test('the link cannot take over an account that already has another Apple identity', async () => {
  // The member already signed in with Apple on a different Apple ID.
  const member = await existingMember()
  await User.updateOne(
    { _id: member._id },
    { $set: { apple: { sub: VISIBLE_SUB, linkedAt: new Date() } } },
  )

  const signedIn = await signIn({
    identityToken: await apple.mintIdentityToken({
      sub: RELAY_SUB,
      nonce: NONCE,
      email: 'zq7x8@privaterelay.appleid.com',
      isPrivateEmail: 'true',
    }),
    nonce: NONCE,
  })
  const relayId = (signedIn.body.user as { id: string }).id

  await linkEmail(String(signedIn.body.token), MEMBER_EMAIL)
  const link = await MagicLink.findOne({ email: MEMBER_EMAIL }).lean<{ token: string } | null>()
  assert.ok(link)
  const verified = await verifyLink(link!.token)

  assert.equal(verified.res.status, 400, 'one Apple identity was silently replaced by another')
  assert.equal(verified.body.reason, 'existing_has_apple')
  const row = await appleRowFor(member._id)
  assert.equal(row?.apple?.sub, VISIBLE_SUB, "the other device's sign-in was severed")
  assert.equal(await User.countDocuments({ _id: relayId }), 1, 'the relay account was deleted anyway')
})

// ─── (e015c984) The route refuses a bad token ────────────────────────────────

test('the route refuses a wrong audience, an expired token and a nonce mismatch', async () => {
  const cases: { label: string; body: Record<string, unknown>; reason: string }[] = [
    {
      label: 'wrong audience',
      body: {
        identityToken: await apple.mintIdentityToken({
          sub: VISIBLE_SUB,
          nonce: NONCE,
          email: MEMBER_EMAIL,
          audience: 'com.someone.else',
        }),
        nonce: NONCE,
      },
      reason: 'wrong_audience',
    },
    {
      label: 'expired',
      body: {
        identityToken: await apple.mintIdentityToken({
          sub: VISIBLE_SUB,
          nonce: NONCE,
          email: MEMBER_EMAIL,
          expiresInSeconds: -60,
        }),
        nonce: NONCE,
      },
      reason: 'expired',
    },
    {
      label: 'nonce mismatch',
      body: {
        identityToken: await apple.mintIdentityToken({
          sub: VISIBLE_SUB,
          nonce: 'the-nonce-of-another-sign-in',
          email: MEMBER_EMAIL,
        }),
        nonce: NONCE,
      },
      reason: 'nonce_mismatch',
    },
    {
      label: 'wrong issuer',
      body: {
        identityToken: await apple.mintIdentityToken({
          sub: VISIBLE_SUB,
          nonce: NONCE,
          email: MEMBER_EMAIL,
          issuer: 'https://accounts.google.com',
        }),
        nonce: NONCE,
      },
      reason: 'wrong_issuer',
    },
  ]

  for (const { label, body, reason } of cases) {
    const { res, body: answered } = await signIn(body)
    assert.equal(res.status, 401, `${label} was not refused`)
    assert.equal(answered.error, 'apple_token_rejected')
    assert.equal(answered.reason, reason, `${label} was refused for the wrong reason`)
    assert.equal(answered.token, undefined, `${label} minted a session`)
    assert.equal(res.headers.get('set-cookie'), null)
    assert.equal(await accounts(), 0, `${label} created an account`)
  }
})

test('a request with no token or no nonce is a 400, and creates nothing', async () => {
  for (const body of [{}, { identityToken: 'x.y.z' }, { nonce: NONCE }, { identityToken: '', nonce: '' }]) {
    const { res } = await signIn(body)
    assert.equal(res.status, 400, `${JSON.stringify(body)} was not refused`)
  }
  assert.equal(await accounts(), 0)
})
