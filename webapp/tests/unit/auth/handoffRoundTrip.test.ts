// Run with: npm run test:file tests/unit/auth/handoffRoundTrip.test.ts
//
// THE WHOLE HAND-OFF, END TO END, through both real route handlers and the
// real (loopback, disposable) database — because the thing a member feels is
// not "the code was single use", it is "I tapped Edit and the editor opened
// signed in".
//
// So: a real User row, a real session token, POST /api/auth/handoff, then
// GET /auth/handoff?code= — and the three refusals that must hold on the way
// (reused, expired, and a target that is not on the allow-list).

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { POST as MINT } from '../../../app/api/auth/handoff/route'
import { GET as REDEEM } from '../../../app/auth/handoff/route'
import User from '../../../models/User'
import HandoffCode, { createHandoffCode } from '../../../models/HandoffCode'
import { signToken, verifyToken } from '../../../lib/auth'

const DOMAIN = 'handoff-roundtrip.test'
const TARGET = '/dashboard/programs/68f1b2c3d4e5f60718293a4b/edit'

let userId = ''
let bearer = ''

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  const user = await User.create({
    name: 'Hand Off',
    email: `member@${DOMAIN}`,
    password: 'magic-link-auth-no-password',
  })
  userId = String(user._id)
  bearer = `Bearer ${await signToken({ userId, email: user.email, role: 'user' })}`
})

after(async () => {
  await User.deleteMany({ email: new RegExp(`@${DOMAIN}$`) })
  await HandoffCode.deleteMany({ userId })
  await mongoose.disconnect()
})

function mintRequest(path: unknown, auth = bearer) {
  return new NextRequest('http://localhost/api/auth/handoff', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json', Authorization: auth }),
    body: JSON.stringify({ path }),
  })
}

function redeemRequest(code: string) {
  return new NextRequest(`http://localhost/auth/handoff?code=${encodeURIComponent(code)}`, {
    method: 'GET',
  })
}

async function mint(path: string): Promise<string> {
  const res = await MINT(mintRequest(path))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(typeof body.code, 'string')
  assert.ok(body.code.length >= 32, 'a hand-off code must not be guessable')
  assert.equal(body.path, path)
  assert.equal(body.expiresInSeconds, 60)
  assert.match(res.headers.get('cache-control') ?? '', /no-store/)
  return body.code as string
}

function redirectTarget(res: Response): URL {
  assert.ok(res.status >= 300 && res.status < 400, `expected a redirect, got ${res.status}`)
  return new URL(res.headers.get('location') ?? '', 'http://localhost')
}

test('a code opens the web screen signed in, as the member who minted it', async () => {
  const code = await mint(TARGET)
  const res = await REDEEM(redeemRequest(code))

  const location = redirectTarget(res)
  assert.equal(location.pathname, '/auth/finish', 'the browser must land on the page that stores the token')
  assert.equal(location.searchParams.get('next'), TARGET, 'the hand-off lost its target')

  // The session, twice over: the cookie the middleware gates /dashboard on…
  const cookie = res.headers.get('set-cookie') ?? ''
  assert.match(cookie, /^auth_token=/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Path=\//)

  // …and the same JWT in the fragment, which /auth/finish puts in localStorage
  // where the web app's own fetches read it. Never on the query string.
  const token = decodeURIComponent(res.headers.get('location')?.split('#')[1] ?? '')
  assert.ok(token.length > 0, 'no token was handed to the page')
  assert.ok(cookie.includes(token), 'the cookie and the page hold different sessions')
  assert.equal(location.searchParams.get('token'), null)

  const payload = await verifyToken(token)
  assert.equal(payload.userId, userId, 'the hand-off signed in the wrong member')
  assert.equal(payload.email, `member@${DOMAIN}`)
  assert.equal(payload.scope, undefined, 'a hand-off must mint a full session, not a scoped token')
})

test('the same code a second time is refused, and signs nobody in', async () => {
  const code = await mint(TARGET)
  assert.equal(redirectTarget(await REDEEM(redeemRequest(code))).pathname, '/auth/finish')

  const replay = await REDEEM(redeemRequest(code))
  const location = redirectTarget(replay)
  assert.equal(location.pathname, '/login')
  assert.equal(location.searchParams.get('error'), 'handoff')
  assert.equal(replay.headers.get('set-cookie'), null, 'a replayed code set a session cookie')
})

test('an expired code is refused', async () => {
  // Minted two minutes ago: the route's own TTL is sixty seconds, so this is
  // what a member who left the browser sheet open comes back to.
  const { code } = await createHandoffCode({
    userId,
    path: TARGET,
    now: new Date(Date.now() - 2 * 60_000),
  })
  const location = redirectTarget(await REDEEM(redeemRequest(code)))
  assert.equal(location.pathname, '/login')
  assert.equal(location.searchParams.get('error'), 'handoff')
})

test('a target outside the allow-list is refused — at minting and at redemption', async () => {
  // The door in.
  const res = await MINT(mintRequest('/dashboard/settings'))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'path_not_allowed')
  assert.equal(await HandoffCode.countDocuments({ userId, path: '/dashboard/settings' }), 0)

  // And the door out, for a row written while the target WAS allow-listed.
  const { code } = await createHandoffCode({ userId, path: 'https://evil.example/' })
  const location = redirectTarget(await REDEEM(redeemRequest(code)))
  assert.equal(location.pathname, '/login')
  assert.equal(location.searchParams.get('error'), 'handoff')
})

test('an unknown code is refused', async () => {
  const location = redirectTarget(await REDEEM(redeemRequest('not-a-code')))
  assert.equal(location.pathname, '/login')
})
