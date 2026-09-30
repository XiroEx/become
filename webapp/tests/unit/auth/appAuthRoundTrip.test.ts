// Run with: npm run test:file tests/unit/auth/appAuthRoundTrip.test.ts
//
// THE NATIVE SIGN-IN HAND-BACK, END TO END, through the real exchange route and
// the real (loopback, disposable) database — because the thing a member feels is
// not "the code was single use", it is "I tapped Continue with Google and landed
// in MY account".
//
// The mint here is the exact line /auth/callback/google runs after
// `bridgeToBecomeSession` (`createAppAuthCode({ userId, challenge })`); that
// route cannot be imported into a test because `@redbtn/redauth` publishes an
// `import`-only exports map, so the seam is taken one line later and the rest of
// the flow is the real thing.
//
// The four refusals that have to hold, each of them a 400 and each of them
// indistinguishable from the others:
//
//   • A REPLAYED CODE (the acceptance criterion: replaying a used code → 400).
//   • A wrong verifier — and it still BURNS the code, so it cannot be ground.
//   • An expired code, decided in code and not by mongod's TTL sweep.
//   • A member who no longer exists.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { POST as EXCHANGE } from '../../../app/api/auth/exchange/route'
import { APP_AUTH_CODE_TTL_MS, APP_AUTH_EXCHANGE_PATH } from '../../../lib/appAuthCode'
import User from '../../../models/User'
import AppAuthCode, {
  createAppAuthCode,
  hashAppAuthCode,
  hashAppAuthVerifier,
} from '../../../models/AppAuthCode'
import { verifyToken } from '../../../lib/auth'

const DOMAIN = 'app-auth-roundtrip.test'

let userId = ''

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  const user = await User.create({
    name: 'Google Member',
    email: `member@${DOMAIN}`,
    password: 'social-auth-no-password',
  })
  userId = String(user._id)
})

after(async () => {
  await User.deleteMany({ email: new RegExp(`@${DOMAIN}$`) })
  await AppAuthCode.deleteMany({ userId })
  await mongoose.disconnect()
})

/** A fresh (verifier, challenge) pair, exactly as the app makes one. */
function pair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url')
  return { verifier, challenge: hashAppAuthVerifier(verifier) }
}

function exchangeRequest(body: unknown) {
  return new NextRequest(`http://localhost${APP_AUTH_EXCHANGE_PATH}`, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
}

async function exchange(code: string, verifier: string) {
  const res = await EXCHANGE(exchangeRequest({ code, verifier }))
  return { status: res.status, body: await res.json(), headers: res.headers }
}

/** What the Google callback does once the member is resolved. */
async function mint(challenge: string, options: { expiresAt?: Date; forUser?: string } = {}) {
  const { code } = await createAppAuthCode({
    userId: options.forUser ?? userId,
    challenge,
  })
  if (options.expiresAt) {
    await AppAuthCode.updateOne(
      { codeHash: hashAppAuthCode(code) },
      { $set: { expiresAt: options.expiresAt } },
    )
  }
  return code
}

// ─── The happy path ──────────────────────────────────────────────────────────

test('a code plus the verifier is the member\'s own session', async () => {
  const { verifier, challenge } = pair()
  const code = await mint(challenge)

  const { status, body, headers } = await exchange(code, verifier)
  assert.equal(status, 200)

  const payload = await verifyToken((body as { token: string }).token)
  assert.equal(payload.userId, userId, 'the session belongs to the member who signed in')
  assert.equal(payload.email, `member@${DOMAIN}`)
  assert.deepEqual((body as { user: unknown }).user, {
    id: userId,
    name: 'Google Member',
    email: `member@${DOMAIN}`,
  })
  // The same 30-day HttpOnly cookie every other auth route sets.
  assert.match(headers.get('Set-Cookie') ?? '', /^auth_token=[^;]+; HttpOnly; Path=\/;/)
  assert.equal(headers.get('Cache-Control'), 'no-store')
})

test('the code is 60 seconds old at the moment it is minted', async () => {
  const { challenge } = pair()
  const before = Date.now()
  const code = await mint(challenge)
  const row = await AppAuthCode.findOne({ codeHash: hashAppAuthCode(code) }).lean<{
    expiresAt: Date
    usedAt: Date | null
    challenge: string
    provider: string
  } | null>()
  assert.ok(row)
  assert.equal(row!.usedAt, null)
  assert.equal(row!.challenge, challenge)
  assert.equal(row!.provider, 'google')
  const life = row!.expiresAt.getTime() - before
  assert.ok(
    life > APP_AUTH_CODE_TTL_MS - 2000 && life <= APP_AUTH_CODE_TTL_MS + 100,
    `expected a ~60s life, got ${life}ms`,
  )
})

test('THE CODE IS NEVER STORED, and neither is the verifier', async () => {
  const { verifier, challenge } = pair()
  const code = await mint(challenge)
  const rows = await AppAuthCode.find({ userId }).lean()
  const dump = JSON.stringify(rows)
  assert.ok(!dump.includes(code), 'the collection holds a usable code')
  assert.ok(!dump.includes(verifier), 'the collection holds the verifier')
  assert.ok(dump.includes(hashAppAuthCode(code)), 'the hash is what is looked up')
})

// ─── The refusals ────────────────────────────────────────────────────────────

test('REPLAYING A USED CODE RETURNS 400', async () => {
  const { verifier, challenge } = pair()
  const code = await mint(challenge)

  const first = await exchange(code, verifier)
  assert.equal(first.status, 200)

  // The same code, the same verifier, immediately afterwards.
  const replay = await exchange(code, verifier)
  assert.equal(replay.status, 400)
  assert.deepEqual(replay.body, { error: 'invalid_code' })

  // And a third time, for the same 400 — nothing about the refusal changes.
  const again = await exchange(code, verifier)
  assert.equal(again.status, 400)
  assert.deepEqual(again.body, { error: 'invalid_code' })
})

test('a code that was never minted is refused identically', async () => {
  const { verifier } = pair()
  const { status, body } = await exchange(crypto.randomBytes(32).toString('base64url'), verifier)
  assert.equal(status, 400)
  assert.deepEqual(body, { error: 'invalid_code' })
})

test('the wrong verifier is refused — and the code is burned by the attempt', async () => {
  const { verifier, challenge } = pair()
  const other = pair()
  const code = await mint(challenge)

  const wrong = await exchange(code, other.verifier)
  assert.equal(wrong.status, 400)
  assert.deepEqual(wrong.body, { error: 'invalid_code' })

  // The real app cannot spend it either: one attempt is one attempt, which is
  // what stops a code being ground against a guessed verifier.
  const right = await exchange(code, verifier)
  assert.equal(right.status, 400)
})

test('an expired code is refused even while its row still exists', async () => {
  const { verifier, challenge } = pair()
  const code = await mint(challenge, {
    // Minted a minute and a second ago. The TTL index sweeps minutes later, so
    // the row is still there — which is exactly why expiry is decided in code.
    expiresAt: new Date(Date.now() - 1000),
  })
  const row = await AppAuthCode.findOne({ codeHash: hashAppAuthCode(code) })
  assert.ok(row, 'the row must still exist for this test to mean anything')

  const { status, body } = await exchange(code, verifier)
  assert.equal(status, 400)
  assert.deepEqual(body, { error: 'invalid_code' })
})

test('a code for an account that has gone signs nobody in', async () => {
  const gone = await User.create({
    name: 'Deleted',
    email: `gone@${DOMAIN}`,
    password: 'social-auth-no-password',
  })
  const { verifier, challenge } = pair()
  const code = await mint(challenge, { forUser: String(gone._id) })
  await User.deleteOne({ _id: gone._id })

  const { status, body } = await exchange(code, verifier)
  assert.equal(status, 400)
  assert.deepEqual(body, { error: 'invalid_code' })
  await AppAuthCode.deleteMany({ userId: String(gone._id) })
})

test('two callers racing one code produce exactly one session', async () => {
  const { verifier, challenge } = pair()
  const code = await mint(challenge)

  const results = await Promise.all([
    exchange(code, verifier),
    exchange(code, verifier),
    exchange(code, verifier),
  ])
  const ok = results.filter((r) => r.status === 200)
  const refused = results.filter((r) => r.status === 400)
  assert.equal(ok.length, 1, 'the atomic claim let more than one caller win')
  assert.equal(refused.length, 2)
})
