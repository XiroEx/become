// Run with: npm run test:file tests/unit/auth/appAuthCode.test.ts
//
// THE NATIVE SIGN-IN HAND-BACK (NP-126), everywhere it can be pinned without a
// database: the rules in lib/appAuthCode.ts, the two routes that refuse before
// they touch Mongo, and the facts that make the feature work rather than merely
// compile —
//
//   • THE APP NEVER RECEIVES THE TOKEN. The URL the callback sends the app to
//     carries one parameter, `code`, and no fragment. That is the whole reason
//     this card exists, so it is asserted rather than assumed.
//   • THE TWO HALVES AGREE. The app mirrors four constants (the start path, the
//     exchange path, the return URL, the scheme) and computes the challenge
//     with its own SHA-256. This file READS expo/ — the way
//     tests/unit/account/storeReadiness.test.tsx does — so a drift fails here
//     instead of on a phone.
//
// The claim itself (single use, expiry, the race) is Mongo semantics and lives
// in appAuthRoundTrip.test.ts, which drives the real route against the loopback
// test database.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

import {
  APP_AUTH_CALLBACK_PATH,
  APP_AUTH_CODE_TTL_SECONDS,
  APP_AUTH_EXCHANGE_PATH,
  APP_AUTH_FLOW_COOKIE,
  APP_AUTH_RETURN_URL,
  APP_AUTH_SCHEME,
  APP_AUTH_START_PATH,
  appAuthCallbackUrl,
  appAuthFlowCookie,
  appAuthReturnUrl,
  clearedAppAuthFlowCookie,
  decideAppAuthExchange,
  isAppAuthChallenge,
  isAppAuthRequested,
  isAppAuthVerifier,
} from '../../../lib/appAuthCode'
import { hashAppAuthVerifier } from '../../../models/AppAuthCode'
import { POST as EXCHANGE } from '../../../app/api/auth/exchange/route'
import { GET as APP_CALLBACK } from '../../../app/auth/app-callback/route'

const ROOT = path.join(__dirname, '../../..')
const REPO = path.join(ROOT, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const readRepo = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8')

const VERIFIER = crypto.randomBytes(32).toString('base64url')
const CHALLENGE = hashAppAuthVerifier(VERIFIER)

function get(url: string, cookie?: string) {
  const headers = new Headers()
  if (cookie) headers.set('Cookie', cookie)
  return new NextRequest(`http://localhost${url}`, { method: 'GET', headers })
}

function post(body: unknown) {
  return new NextRequest(`http://localhost${APP_AUTH_EXCHANGE_PATH}`, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
}

// ─── The shapes ──────────────────────────────────────────────────────────────

test('a code lives sixty seconds — the same life a hand-off code has', () => {
  assert.equal(APP_AUTH_CODE_TTL_SECONDS, 60)
})

test('the challenge is a SHA-256 in base64url, and nothing else passes', () => {
  assert.equal(CHALLENGE.length, 43)
  assert.equal(isAppAuthChallenge(CHALLENGE), true)
  for (const bad of [
    '',
    'short',
    `${CHALLENGE}=`, // padded
    `${CHALLENGE}a`, // too long
    CHALLENGE.replace(/.$/, '+'), // base64, not base64url
    CHALLENGE.replace(/.$/, '/'),
    null,
    undefined,
    42,
    { toString: () => CHALLENGE },
  ]) {
    assert.equal(isAppAuthChallenge(bad), false, `${String(bad)} must be refused`)
  }
})

test('a verifier is 32 bytes of base64url at least, and bounded above', () => {
  assert.equal(isAppAuthVerifier(VERIFIER), true)
  assert.equal(isAppAuthVerifier('a'.repeat(43)), true)
  assert.equal(isAppAuthVerifier('a'.repeat(128)), true)
  assert.equal(isAppAuthVerifier('a'.repeat(42)), false)
  assert.equal(isAppAuthVerifier('a'.repeat(129)), false)
  assert.equal(isAppAuthVerifier('a'.repeat(43) + '!'), false)
  assert.equal(isAppAuthVerifier(null), false)
})

test('only app=1 asks for the app flow', () => {
  const params = (q: string) => new URL(`http://x/${q}`).searchParams
  assert.equal(isAppAuthRequested(params('?app=1')), true)
  assert.equal(isAppAuthRequested(params('?app=0')), false)
  assert.equal(isAppAuthRequested(params('?app=true')), false)
  assert.equal(isAppAuthRequested(params('')), false)
})

test('THE JWT NEVER TRAVELS TO THE APP: the callback url carries a code and nothing else', () => {
  const url = new URL(appAuthCallbackUrl('https://become.redbtn.io', { code: 'abc123' }))
  assert.equal(url.origin, 'https://become.redbtn.io')
  assert.equal(url.pathname, APP_AUTH_CALLBACK_PATH)
  assert.equal(url.hash, '', 'a fragment is how the WEB flow hands over the token')
  assert.deepEqual([...url.searchParams.keys()], ['code'])
  assert.equal(url.searchParams.get('code'), 'abc123')

  // A failure is named, and still carries no session of any kind.
  const failed = new URL(appAuthCallbackUrl('https://become.redbtn.io', { error: 'google' }))
  assert.deepEqual([...failed.searchParams.keys()], ['error'])
})

test('the return url is the app scheme declared in app.json, with the code escaped', () => {
  assert.equal(APP_AUTH_RETURN_URL, `${APP_AUTH_SCHEME}://auth/app-callback`)
  assert.equal(
    appAuthReturnUrl({ code: 'a b+c/d' }),
    `${APP_AUTH_RETURN_URL}?code=a%20b%2Bc%2Fd`,
  )
  assert.equal(appAuthReturnUrl({ error: 'google' }), `${APP_AUTH_RETURN_URL}?error=google`)

  const appJson = JSON.parse(readRepo('expo/app.json')) as { expo: { scheme?: string } }
  assert.equal(
    appJson.expo.scheme,
    APP_AUTH_SCHEME,
    'the app no longer claims the scheme this redirect uses',
  )
})

test('the flow cookie is HttpOnly, short lived, and can be taken back', () => {
  const set = appAuthFlowCookie(CHALLENGE, true)
  assert.match(set, new RegExp(`^${APP_AUTH_FLOW_COOKIE}=${CHALLENGE};`))
  assert.match(set, /HttpOnly/)
  assert.match(set, /Max-Age=600/)
  assert.match(set, /SameSite=Lax/)
  assert.match(set, /Secure/)
  // Lax is deliberate: the cookie has to survive Google's top-level redirect
  // back to us, which Strict would drop.
  assert.doesNotMatch(set, /SameSite=Strict/)

  const cleared = clearedAppAuthFlowCookie(true)
  assert.match(cleared, new RegExp(`^${APP_AUTH_FLOW_COOKIE}=;`))
  assert.match(cleared, /Max-Age=0/)
})

// ─── The decision ────────────────────────────────────────────────────────────

test('a claim that matched nothing is refused — a replay is never "probably fine"', () => {
  const now = new Date()
  assert.deepEqual(decideAppAuthExchange(null, CHALLENGE, now), {
    ok: false,
    reason: 'unknown_or_used',
  })
  assert.deepEqual(decideAppAuthExchange(undefined, CHALLENGE, now), {
    ok: false,
    reason: 'unknown_or_used',
  })
})

test('sixty seconds is decided here, not by mongod', () => {
  const now = new Date('2026-09-30T12:00:00.000Z')
  const claim = (expiresAt: Date | string | number) => ({
    userId: 'u1',
    challenge: CHALLENGE,
    expiresAt,
  })
  assert.deepEqual(decideAppAuthExchange(claim(new Date(now.getTime() + 1)), CHALLENGE, now), {
    ok: true,
    userId: 'u1',
  })
  // Exactly on the boundary is dead: the code was minted for a window, and the
  // window is closed.
  assert.deepEqual(decideAppAuthExchange(claim(now), CHALLENGE, now), {
    ok: false,
    reason: 'expired',
  })
  assert.deepEqual(decideAppAuthExchange(claim(new Date(now.getTime() - 1)), CHALLENGE, now), {
    ok: false,
    reason: 'expired',
  })
  assert.deepEqual(decideAppAuthExchange(claim('not a date'), CHALLENGE, now), {
    ok: false,
    reason: 'expired',
  })
})

test('the verifier is what binds the code to ONE device', () => {
  const now = new Date()
  const claim = { userId: 'u1', challenge: CHALLENGE, expiresAt: new Date(now.getTime() + 1000) }
  assert.deepEqual(decideAppAuthExchange(claim, CHALLENGE, now), { ok: true, userId: 'u1' })
  // Another device's verifier hashes to something else.
  const other = hashAppAuthVerifier(crypto.randomBytes(32).toString('base64url'))
  assert.deepEqual(decideAppAuthExchange(claim, other, now), {
    ok: false,
    reason: 'verifier_mismatch',
  })
  // And an empty hash never passes, however empty the stored challenge is.
  assert.deepEqual(decideAppAuthExchange(claim, '', now), {
    ok: false,
    reason: 'verifier_mismatch',
  })
  assert.deepEqual(
    decideAppAuthExchange({ ...claim, challenge: '' }, '', now),
    { ok: false, reason: 'verifier_mismatch' },
  )
})

test('the app hashes the verifier exactly the way the server does', () => {
  // Node's own SHA-256/base64url, spelled out, against the helper the model and
  // the app agree on. The native side computes this in plain TypeScript
  // (expo/lib/auth/sha256.ts) and expo/__tests__/sha256.test.ts checks that
  // implementation against these same values.
  assert.equal(
    hashAppAuthVerifier('become-np-126'),
    crypto.createHash('sha256').update('become-np-126', 'utf8').digest('base64url'),
  )
  assert.equal(hashAppAuthVerifier(VERIFIER).length, 43)
  assert.equal(isAppAuthChallenge(hashAppAuthVerifier(VERIFIER)), true)
})

// ─── The routes, on the paths that refuse before Mongo ───────────────────────

test('POST /api/auth/exchange answers 400 to a body that is not a code and a verifier', async () => {
  for (const body of [
    {},
    { code: '' },
    { code: 'x' },
    { code: 'x', verifier: 'too-short' },
    { code: 'x', verifier: 123 },
    { verifier: VERIFIER },
    { code: 42, verifier: VERIFIER },
  ]) {
    const res = await EXCHANGE(post(body))
    assert.equal(res.status, 400, `${JSON.stringify(body)} must be refused`)
    assert.deepEqual(await res.json(), { error: 'invalid_code' })
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
  }
})

test('GET /auth/app-callback hands the code to the app over the scheme it claims', async () => {
  const res = await APP_CALLBACK(get(`${APP_AUTH_CALLBACK_PATH}?code=abc%20123`))
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('Location'), `${APP_AUTH_RETURN_URL}?code=abc%20123`)
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
  // Nothing about a session leaves this route.
  assert.equal(res.headers.get('Set-Cookie'), null)
})

test('GET /auth/app-callback with no code still closes the session, with a reason', async () => {
  const named = await APP_CALLBACK(get(`${APP_AUTH_CALLBACK_PATH}?error=google_email`))
  assert.equal(named.headers.get('Location'), `${APP_AUTH_RETURN_URL}?error=google_email`)

  const empty = await APP_CALLBACK(get(APP_AUTH_CALLBACK_PATH))
  assert.equal(empty.headers.get('Location'), `${APP_AUTH_RETURN_URL}?error=google`)
})

test('GET /api/auth/google refuses app=1 without a usable challenge, before redAuth', () => {
  // This route cannot be IMPORTED here: `@redbtn/redauth` publishes an exports
  // map with an `import` condition only, which node's CJS resolver (what tsx
  // gives a test file) cannot resolve — it is fine in the Next build, which is
  // ESM. So the shape of the guard is read instead, and the rule it enforces is
  // covered above by isAppAuthChallenge.
  const src = read('app/api/auth/google/route.ts')
  const guard = src.indexOf('isAppAuthChallenge(challenge)')
  const redauth = src.indexOf('await getRedAuth()')
  assert.ok(guard > 0, 'the app flow no longer checks the challenge')
  assert.ok(redauth > 0, 'the route no longer asks redAuth for the auth url')
  assert.ok(
    guard < redauth,
    'the challenge must be refused BEFORE the flow starts: a flow that started'
      + ' would end with a token in a fragment no app can read',
  )
  assert.match(src, /error=google_app/, 'a refused app flow has nowhere to land')
  // Armed on the way in, disarmed on the way in too: a browser that once did
  // an app sign-in must not still be in app mode for the next ordinary one.
  assert.match(src, /appAuthFlowCookie\(challenge\)/)
  assert.match(src, /clearedAppAuthFlowCookie\(\)/)
})

test('the Google callback sends the app a code and the browser the fragment', () => {
  // Same import problem, same answer: the branch is read, and what it DOES is
  // covered by appAuthRoundTrip.test.ts from `createAppAuthCode` onwards (which
  // is the line below) through the exchange route against a real database.
  const src = read('app/auth/callback/google/route.ts')
  const appBranch = /if \(appFlow\) \{[\s\S]*?\n    \}/.exec(src)
  assert.ok(appBranch, 'the callback no longer has an app branch')
  assert.match(appBranch![0], /createAppAuthCode\(/)
  assert.match(appBranch![0], /appAuthCallbackUrl\(origin, \{ code: minted\.code \}\)/)
  assert.doesNotMatch(appBranch![0], /token/, 'the app branch must not touch the JWT')
  assert.doesNotMatch(appBranch![0], /hash/, 'the fragment is the WEB ending')
  assert.doesNotMatch(appBranch![0], /authCookie/, 'no session is left in the sheet')
  // The web ending is untouched.
  assert.match(src, /finishUrl\.hash = encodeURIComponent\(token\)/)
})

// ─── The two halves ──────────────────────────────────────────────────────────

test('the app mirrors the paths, the return url and the verifier length', () => {
  const native = readRepo('expo/lib/auth/googleSignIn.ts')
  const constant = (name: string): string => {
    const m = new RegExp(`${name} = "([^"]+)"`).exec(native)
    assert.ok(m, `expo/lib/auth/googleSignIn.ts no longer declares ${name}`)
    return m![1]
  }
  assert.equal(constant('GOOGLE_AUTH_START_PATH'), APP_AUTH_START_PATH)
  assert.equal(constant('APP_AUTH_EXCHANGE_PATH'), APP_AUTH_EXCHANGE_PATH)
  assert.equal(constant('APP_AUTH_RETURN_URL'), APP_AUTH_RETURN_URL)
  // 32 bytes, the same strength the server mints its own codes with.
  assert.match(native, /APP_AUTH_VERIFIER_BYTES = 32/)
  // The app opens the SYSTEM authentication session — the whole reason this
  // card exists. An in-app browser is what Google refuses.
  assert.match(native, /openAuthSessionAsync/)
  assert.doesNotMatch(native, /openBrowserAsync/)
})

test('the app sends the challenge and keeps the verifier', () => {
  const native = readRepo('expo/lib/auth/googleSignIn.ts')
  const startUrl = /export function googleAuthStartUrl[\s\S]*?\n}/.exec(native)
  assert.ok(startUrl, 'googleAuthStartUrl has moved')
  assert.match(startUrl![0], /app=1/)
  assert.match(startUrl![0], /challenge=\$\{encodeURIComponent\(challenge\)\}/)
  assert.doesNotMatch(startUrl![0], /verifier/)
})
