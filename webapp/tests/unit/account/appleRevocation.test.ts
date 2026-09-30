// Run with: npm run test:file tests/unit/account/appleRevocation.test.ts
//
// DELETING AN ACCOUNT THAT SIGNED IN WITH APPLE MUST HAND THE GRANT BACK.
//
// Apple requires an app that offers Sign in with Apple to revoke the tokens it
// holds when the member deletes their account. It is not a nicety: without it
// Become stays in the member's "Apps Using Apple ID" list forever, pointing at
// an account that no longer exists, and the refresh token we stored keeps
// working.
//
// Apple is stubbed (tests/unit/auth/fakeApple.ts answers its endpoints), so
// what is asserted is the request Apple would have received — the refresh
// token, the client id, and a real ES256 client secret issued by the Team ID —
// and then the thing that actually matters:
//
//   • the daily purge revokes BEFORE it deletes the row that stores the token;
//   • a refusal from Apple HOLDS THE PURGE BACK, so the next run retries,
//     rather than losing the only handle on the grant;
//   • that wait is bounded by the 30 days the Privacy Policy promises — a
//     mis-pasted .p8 must not keep a deleted member's data alive forever.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose, { Types } from 'mongoose'
import { NextRequest } from 'next/server'
import { decodeJwt, decodeProtectedHeader } from 'jose'

import { POST as PURGE, GET as PURGE_DRY_RUN } from '../../../app/api/cron/purge-deletions/route'
import User from '../../../models/User'
import UserProgress from '../../../models/UserProgress'
import { __resetRuntimeConfigForTests } from '../../../lib/runtimeConfig'
import { LEGAL_DELETION_DAYS } from '../../../lib/legal'
import { RESTORE_WINDOW_DAYS } from '../../../lib/accountDeletion'
import { purgeMayProceed, revokeAppleIdentity } from '../../../lib/apple/deletion'
import { createFakeApple, type FakeApple } from '../auth/fakeApple'

const DOMAIN = 'apple-revocation.test'
const CRON_SECRET = 'apple-revocation-cron-secret'
const SUB = '000333.deleting-member.0003'
const DAY_MS = 24 * 60 * 60 * 1000

let apple: FakeApple

function config() {
  return {
    bundleId: 'io.redbtn.become',
    teamId: 'TEAMID1234',
    keyId: 'KEYID56789',
    privateKey: apple.servicePrivateKeyPem,
  }
}

function purgeRequest(secret = CRON_SECRET) {
  return new NextRequest('http://localhost/api/cron/purge-deletions', {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  })
}

async function runPurge() {
  const res = await PURGE(purgeRequest())
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { res, body }
}

/** A member who asked to be deleted `daysAgo` days ago and is now due. */
async function dueMember(options: { daysAgo?: number; refreshToken?: string | null } = {}) {
  const daysAgo = options.daysAgo ?? RESTORE_WINDOW_DAYS + 1
  const requestedAt = new Date(Date.now() - daysAgo * DAY_MS)
  const user = await User.create({
    name: 'Leaving Member',
    email: `leaving@${DOMAIN}`,
    password: 'magic-link-auth-no-password',
    apple: {
      sub: SUB,
      ...(options.refreshToken === null ? {} : { refreshToken: options.refreshToken ?? 'apple-refresh-token' }),
      linkedAt: requestedAt,
    },
    deletion: {
      requestedAt,
      purgeAfter: new Date(requestedAt.getTime() + RESTORE_WINDOW_DAYS * DAY_MS),
      requestedFrom: 'ios',
    },
  })
  return user
}

async function cleanup() {
  const users = await User.find(
    { $or: [{ email: new RegExp(`@${DOMAIN}$`) }, { 'apple.sub': SUB }] },
    { _id: 1 },
  ).lean<{ _id: Types.ObjectId }[]>()
  const ids = users.map((u) => u._id)
  await Promise.all([
    User.deleteMany({ _id: { $in: ids } }),
    UserProgress.deleteMany({ userId: { $in: ids } }),
  ])
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  apple = await createFakeApple()
  apple.install()
  process.env.CRON_SECRET = CRON_SECRET
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
  delete process.env.CRON_SECRET
  delete process.env.APPLE_TEAM_ID
  delete process.env.APPLE_KEY_ID
  delete process.env.APPLE_PRIVATE_KEY
  __resetRuntimeConfigForTests()
  await mongoose.disconnect()
})

beforeEach(async () => {
  await cleanup()
  apple.calls = []
  apple.revokeResponse = { status: 200, body: {} }
})

// ─── The call itself, against a stubbed Apple ────────────────────────────────

test('the revocation posts the refresh token, signed as Apple requires', async () => {
  const outcome = await revokeAppleIdentity({ sub: SUB, refreshToken: 'apple-refresh-token' }, config())
  assert.equal(outcome.state, 'revoked', JSON.stringify(outcome))

  const call = apple.calls.find((c) => c.url.endsWith('/auth/revoke'))
  assert.ok(call, 'Apple was never asked to revoke anything')
  assert.equal(call!.method, 'POST')
  assert.equal(call!.url, 'https://appleid.apple.com/auth/revoke')
  assert.equal(call!.form.token, 'apple-refresh-token')
  assert.equal(call!.form.token_type_hint, 'refresh_token')
  assert.equal(call!.form.client_id, 'io.redbtn.become')

  // Apple has no client "secret": it is an ES256 JWT we sign with the .p8,
  // issued by the Team ID and subjected to the client id. A wrong shape here
  // is a 401 from Apple and a revocation that never happens.
  const secret = call!.form.client_secret
  assert.ok(secret, 'no client secret was sent')
  const header = decodeProtectedHeader(secret)
  assert.equal(header.alg, 'ES256')
  assert.equal(header.kid, 'KEYID56789')
  const claims = decodeJwt(secret)
  assert.equal(claims.iss, 'TEAMID1234')
  assert.equal(claims.sub, 'io.redbtn.become')
  assert.equal(claims.aud, 'https://appleid.apple.com')
  assert.ok(typeof claims.exp === 'number' && claims.exp > Math.floor(Date.now() / 1000))
})

test('the states that are not failures: no identity, no token, no key', async () => {
  assert.equal((await revokeAppleIdentity(null, config())).state, 'not_applicable')
  assert.equal((await revokeAppleIdentity({}, config())).state, 'not_applicable')
  assert.equal((await revokeAppleIdentity({ sub: SUB }, config())).state, 'no_token')
  assert.equal(
    (await revokeAppleIdentity({ sub: SUB, refreshToken: 't' }, { bundleId: 'io.redbtn.become' })).state,
    'not_configured',
    'a missing .p8 must be reported, not thrown',
  )
  assert.equal(apple.calls.length, 0, 'Apple was called with nothing to say')
})

test("Apple's 'already revoked' is a success, and anything else is retryable", async () => {
  apple.revokeResponse = { status: 400, body: { error: 'invalid_grant' } }
  const gone = await revokeAppleIdentity({ sub: SUB, refreshToken: 't' }, config())
  assert.equal(gone.state, 'revoked', 'a grant Apple has already forgotten is the state we wanted')

  apple.revokeResponse = { status: 401, body: { error: 'invalid_client' } }
  const refused = await revokeAppleIdentity({ sub: SUB, refreshToken: 't' }, config())
  assert.equal(refused.state, 'failed')
  assert.equal(refused.detail, 'invalid_client')

  apple.revokeResponse = { status: 503, body: {} }
  const down = await revokeAppleIdentity({ sub: SUB, refreshToken: 't' }, config())
  assert.equal(down.state, 'failed')
  assert.equal(down.detail, 'http_503')
})

// ─── The rule the purge applies to the outcome ──────────────────────────────

test('only a FAILED revocation holds the purge back, and not past the promise', () => {
  const requestedAt = new Date(Date.now() - (RESTORE_WINDOW_DAYS + 1) * DAY_MS)
  for (const state of ['not_applicable', 'revoked', 'no_token', 'not_configured'] as const) {
    assert.equal(purgeMayProceed({ state }, { requestedAt }), true, `${state} blocked the purge`)
  }
  assert.equal(purgeMayProceed({ state: 'failed' }, { requestedAt }), false)

  // …but the wait is bounded by the outer promise in the Privacy Policy.
  const old = new Date(Date.now() - (LEGAL_DELETION_DAYS + 1) * DAY_MS)
  assert.equal(purgeMayProceed({ state: 'failed' }, { requestedAt: old }), true)
  assert.ok(LEGAL_DELETION_DAYS > RESTORE_WINDOW_DAYS, 'the promise must outlast the window')
})

// ─── The purge, end to end ──────────────────────────────────────────────────

test('deleting an account with an Apple identity revokes its Apple token', async () => {
  const user = await dueMember()

  const { res, body } = await runPurge()
  assert.equal(res.status, 200, JSON.stringify(body))
  assert.equal(body.purged, 1, JSON.stringify(body))

  // The revocation happened, with the token that was on the row.
  const call = apple.calls.find((c) => c.url.endsWith('/auth/revoke'))
  assert.ok(call, 'the account was deleted without revoking its Apple token')
  assert.equal(call!.form.token, 'apple-refresh-token')

  // …and the row is gone, so the revocation could only have come first.
  assert.equal(await User.countDocuments({ _id: user._id }), 0, 'the member survived the purge')
})

test('a dry run revokes nothing — it is a plan, not a deletion', async () => {
  const user = await dueMember()
  const res = await PURGE_DRY_RUN(
    new NextRequest('http://localhost/api/cron/purge-deletions', {
      method: 'GET',
      headers: { 'x-cron-secret': CRON_SECRET },
    }),
  )
  const body = (await res.json()) as Record<string, unknown>
  assert.equal(body.dryRun, true)
  assert.equal(body.purged, 0)
  assert.equal(apple.calls.length, 0, 'a dry run spent the grant')
  assert.equal(await User.countDocuments({ _id: user._id }), 1)
})

test('an account with no Apple identity is purged without calling Apple', async () => {
  const requestedAt = new Date(Date.now() - (RESTORE_WINDOW_DAYS + 1) * DAY_MS)
  const user = await User.create({
    name: 'Magic Link Member',
    email: `plain@${DOMAIN}`,
    password: 'magic-link-auth-no-password',
    deletion: {
      requestedAt,
      purgeAfter: new Date(requestedAt.getTime() + RESTORE_WINDOW_DAYS * DAY_MS),
      requestedFrom: 'web',
    },
  })
  const { body } = await runPurge()
  assert.equal(body.purged, 1)
  assert.equal(apple.calls.length, 0)
  assert.equal(await User.countDocuments({ _id: user._id }), 0)
})

test('an Apple refusal holds the row back, and the next run retries it', async () => {
  const user = await dueMember()
  apple.revokeResponse = { status: 503, body: {} }

  const first = await runPurge()
  assert.equal(first.body.purged, 0, 'the row was purged despite a failed revocation')
  assert.deepEqual(
    (first.body.deferred as { userId: string }[]).map((d) => d.userId),
    [String(user._id)],
  )
  assert.equal(await User.countDocuments({ _id: user._id }), 1, 'the only handle on the grant was destroyed')

  // Apple recovers; the next daily run finishes the job.
  apple.revokeResponse = { status: 200, body: {} }
  const second = await runPurge()
  assert.equal(second.body.purged, 1)
  assert.ok(apple.calls.filter((c) => c.url.endsWith('/auth/revoke')).length >= 2)
  assert.equal(await User.countDocuments({ _id: user._id }), 0)
})

test('the wait is bounded: past the promised day, the data goes anyway', async () => {
  const user = await dueMember({ daysAgo: LEGAL_DELETION_DAYS + 2 })
  apple.revokeResponse = { status: 503, body: {} }

  const { body } = await runPurge()
  assert.equal(body.purged, 1, 'a broken Apple config kept a deleted member forever')
  assert.equal(await User.countDocuments({ _id: user._id }), 0)
})

test('an account whose refresh token was never stored is still purged', async () => {
  const user = await dueMember({ refreshToken: null })
  const { body } = await runPurge()
  assert.equal(body.purged, 1)
  assert.equal(apple.calls.length, 0)
  assert.equal(await User.countDocuments({ _id: user._id }), 0)
})

test('the purge still refuses a wrong cron secret', async () => {
  await dueMember()
  const res = await PURGE(purgeRequest('not-the-secret'))
  assert.equal(res.status, 401)
  assert.equal(apple.calls.length, 0)
})
