// Run with: npm run test:file tests/unit/widgets/token.test.ts
//
// THE WIDGETS TOKEN: what an OS widget extension carries instead of the
// member's 30-day session, and how it is taken away again.
//
// A WidgetKit / App Widget extension is a separate process with a separate
// lifetime. Whatever it holds sits on the device for months and is read by code
// the member never opened, so handing it the session — the credential that can
// log a workout, move a goal, start a checkout or delete the account — to draw a
// streak number is a grant wildly out of proportion to the job.
//
// Two halves, and this file holds both:
//
//   1. THE GRANT IS ONE ROUTE. `scope: 'widgets'` is refused everywhere except
//      GET /api/widgets/summary, because verifyAuth is default-deny for scoped
//      tokens. The route-level refusals (/api/auth/me, a write route,
//      POST /api/widgets/token itself) live in
//      tests/unit/auth/token-scope.test.ts, which also owns the assertion that
//      NO other route in the app opts in.
//
//   2. THE GRANT CAN BE WITHDRAWN. A 15-minute ai-tools token is safe to leave
//      stateless; a token that lives for months is not, and a JWT has no
//      revocation of its own. So it carries `widgetTokenVersion` — the counter
//      stored on the user at mint time — and the summary route compares it on
//      every read. Signing out in the app (POST /api/auth/logout) or requesting
//      deletion (DELETE /api/me/account) bumps the counter, and every token
//      minted before that stops working. One write, no revocation list.
//
// The database half is exercised through the INJECTABLE loader that
// isWidgetAuthAccepted takes (the same seam lib/redis.ts uses for its client),
// so the decision is pinned with no MongoDB — the convention every route test
// in this repo follows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

import { WIDGET_SCOPES, signToken, verifyAuth, type AuthResult } from '../../../lib/auth'
import {
  WIDGET_TOKEN_MAX_AGE_SECONDS,
  WIDGET_TOKEN_SCOPE,
  bumpWidgetTokenVersion,
  isWidgetAuthAccepted,
  isWidgetTokenCurrent,
  mintWidgetToken,
  normalizeWidgetTokenVersion,
  signOutRevocationTarget,
  type WidgetTokenVersionLoader,
} from '../../../lib/widgets/token'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const USER = 'u-widget-1'

function req(url: string, authHeader?: string, method = 'GET'): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest(`http://localhost${url}`, { method, headers })
}

/** A loader that answers a fixed stored counter, and counts its own calls. */
function storedVersion(value: number | null) {
  const calls: string[] = []
  const load: WidgetTokenVersionLoader = async (userId) => {
    calls.push(userId)
    return value
  }
  return { load, calls }
}

/**
 * Exactly what GET /api/widgets/summary does to decide, in the same order:
 * verifyAuth with the route's own opt-in, then the version gate. The assertion
 * that the route really is these two steps is at the bottom of this file.
 */
async function summaryGate(
  token: string,
  stored: number | null,
): Promise<{ auth: AuthResult; accepted: boolean }> {
  const auth = await verifyAuth(req('/api/widgets/summary', `Bearer ${token}`), {
    allowScopes: WIDGET_SCOPES,
  })
  if (!auth.success || !auth.userId) return { auth, accepted: false }
  return { auth, accepted: await isWidgetAuthAccepted(auth, storedVersion(stored).load) }
}

// ── What mintWidgetToken puts in the token ──────────────────────────────────

test('a widgets token is scoped, versioned, and long-lived', async () => {
  const token = await mintWidgetToken(USER, 'a@b.c', 4)
  const decoded = jwt.decode(token) as Record<string, unknown> & { iat: number; exp: number }

  assert.equal(decoded.scope, WIDGET_TOKEN_SCOPE)
  assert.equal(decoded.userId, USER)
  assert.equal(decoded.widgetTokenVersion, 4, 'the revocation handle must be IN the token')
  // Long on purpose: an OS refresh budget is measured in hours, and this is the
  // one token that can be revoked, so its life is not the control.
  assert.equal(decoded.exp - decoded.iat, WIDGET_TOKEN_MAX_AGE_SECONDS)
  assert.equal(WIDGET_TOKEN_MAX_AGE_SECONDS, 180 * 24 * 60 * 60)
})

test('an absent stored counter is version 0, so the first mint is well-defined', () => {
  assert.equal(normalizeWidgetTokenVersion(undefined), 0)
  assert.equal(normalizeWidgetTokenVersion(null), 0)
  assert.equal(normalizeWidgetTokenVersion('nonsense'), 0)
  assert.equal(normalizeWidgetTokenVersion(NaN), 0)
  assert.equal(normalizeWidgetTokenVersion(3), 3)
  assert.equal(normalizeWidgetTokenVersion('3'), 3)
})

// ── isWidgetTokenCurrent: the comparison, pure ──────────────────────────────

test('isWidgetTokenCurrent: the version it was minted at is the current one', () => {
  assert.equal(isWidgetTokenCurrent(0, undefined), true, 'minted before the first bump')
  assert.equal(isWidgetTokenCurrent(0, 0), true)
  assert.equal(isWidgetTokenCurrent(5, 5), true)
})

test('isWidgetTokenCurrent: ANY other version is stale', () => {
  assert.equal(isWidgetTokenCurrent(0, 1), false)
  assert.equal(isWidgetTokenCurrent(4, 5), false)
  // Lower is not "newer" — a token from the future is not trusted either.
  assert.equal(isWidgetTokenCurrent(6, 5), false)
})

test('isWidgetTokenCurrent: a token with NO version claim is refused, not assumed 0', () => {
  // A widgets token with no claim is a token nothing can ever revoke, which is
  // the exact property this file exists to remove.
  for (const claim of [undefined, null, '0', NaN, {}]) {
    assert.equal(isWidgetTokenCurrent(claim, 0), false, `claim ${String(claim)} was accepted`)
  }
})

// ── The gate the summary route runs ─────────────────────────────────────────

test('an unscoped session passes the gate without a database read at all', async () => {
  const { load, calls } = storedVersion(9)
  assert.equal(await isWidgetAuthAccepted({ userId: USER, scope: undefined }, load), true)
  assert.deepEqual(calls, [], 'a member reading their own feed must not pay for the widget check')
})

test('a widgets token with no version claim is refused BEFORE the load', async () => {
  const { load, calls } = storedVersion(0)
  assert.equal(await isWidgetAuthAccepted({ userId: USER, scope: 'widgets' }, load), false)
  assert.deepEqual(calls, [])
})

test('a widgets token for nobody is refused', async () => {
  const { load } = storedVersion(0)
  assert.equal(await isWidgetAuthAccepted({ scope: 'widgets', widgetTokenVersion: 0 }, load), false)
})

test('a widgets token whose member no longer exists is refused', async () => {
  // `null` would normalize to 0 — a purged account's first-ever token must not
  // keep reading the feed.
  const { load } = storedVersion(null)
  assert.equal(
    await isWidgetAuthAccepted({ userId: USER, scope: 'widgets', widgetTokenVersion: 0 }, load),
    false,
  )
})

// ── (id: e015caac) A widgets token READS THE SUMMARY ────────────────────────

test('a freshly minted widgets token passes the summary route gate', async () => {
  const { auth, accepted } = await summaryGate(await mintWidgetToken(USER, 'a@b.c', 0), 0)

  assert.equal(auth.success, true, 'the summary names the widgets scope, so verifyAuth accepts it')
  assert.equal(auth.scope, 'widgets')
  assert.equal(auth.userId, USER)
  assert.equal(accepted, true, 'and its version is the stored one, so the read proceeds')
})

test('a session token still passes the summary route gate untouched', async () => {
  const { auth, accepted } = await summaryGate(await signToken({ userId: USER, email: 'a@b.c' }), 7)
  assert.equal(auth.success, true)
  assert.equal(auth.scope, undefined)
  assert.equal(accepted, true, 'opting a route in must never change what a session can do')
})

// ── (id: e015caad) SIGN-OUT AND DELETION STOP IT WORKING ────────────────────

test('THE REVOCATION: a bump makes every token minted before it stale', async () => {
  const before = await mintWidgetToken(USER, 'a@b.c', 2)

  // Version 2 while the stored counter is still 2: it reads.
  assert.equal((await summaryGate(before, 2)).accepted, true)

  // Sign out, or ask to be deleted. `$inc` takes the counter to 3.
  assert.equal((await summaryGate(before, 3)).accepted, false, 'the old token must stop working')

  // And it stays dead — nothing brings a stale version back.
  assert.equal((await summaryGate(before, 4)).accepted, false)

  // The app asks for a fresh token at each open, and that one reads again.
  assert.equal((await summaryGate(await mintWidgetToken(USER, 'a@b.c', 3), 3)).accepted, true)
})

test('the very first bump kills a token minted when the field was absent', async () => {
  // The state every existing row is in: no `widgetTokenVersion` at all, so the
  // token was minted at 0 and `$inc` takes the stored value to 1.
  const first = await mintWidgetToken(USER, 'a@b.c', normalizeWidgetTokenVersion(undefined))
  assert.equal((await summaryGate(first, 0)).accepted, true, 'never bumped === version 0')
  assert.equal((await summaryGate(first, 1)).accepted, false, 'the first $inc kills it')
  assert.equal((await summaryGate(first, null)).accepted, false, 'and so does a purged row')
})

test('signOutRevocationTarget: a session signs its own widgets tokens out', () => {
  assert.equal(signOutRevocationTarget({ userId: USER }), USER)
})

test('signOutRevocationTarget: a SCOPED token cannot revoke anything', () => {
  // A widgets token lives in the least protected place on the device. It must
  // not be able to reach a write — not even this one.
  assert.equal(signOutRevocationTarget({ userId: USER, scope: 'widgets' }), null)
  assert.equal(signOutRevocationTarget({ userId: USER, scope: 'ai-tools' }), null)
})

test('signOutRevocationTarget: nothing to revoke is not an error', () => {
  assert.equal(signOutRevocationTarget(null), null)
  assert.equal(signOutRevocationTarget(undefined), null)
  assert.equal(signOutRevocationTarget({}), null)
  assert.equal(signOutRevocationTarget({ userId: '' }), null)
})

// ── The two bump call sites ─────────────────────────────────────────────────

test('POST /api/auth/logout bumps the counter, through the pure rule', () => {
  const src = read('app/api/auth/logout/route.ts')
  assert.match(src, /signOutRevocationTarget/, 'the decision must be the shared rule')
  assert.match(src, /bumpWidgetTokenVersion/, 'signing out must revoke the widgets tokens')
  // The web sends the HttpOnly cookie and no Authorization header; native sends
  // the header and no cookie. Both have to sign the widgets out.
  assert.match(src, /getTokenFromRequest/)
  assert.match(src, /cookies\.get\('auth_token'\)/)
})

test('POST /api/auth/logout always succeeds and always clears the cookie', async () => {
  // Signing out may never fail: not on a missing token, not on a rotten one,
  // not because the bump could not be written. Every branch below reaches the
  // same 200 and the same expired cookie.
  const { POST } = await import('../../../app/api/auth/logout/route')
  for (const header of [undefined, 'Bearer garbage', `Bearer ${await mintWidgetToken(USER, 'a@b.c', 0)}`]) {
    const res = await POST(req('/api/auth/logout', header, 'POST'))
    assert.equal(res.status, 200, `header ${String(header)} did not get a clean sign-out`)
    assert.match(String(res.headers.get('set-cookie')), /auth_token=;/)
    assert.match(String(res.headers.get('set-cookie')), /Max-Age=0/)
  }
})

test('DELETE /api/me/account bumps the counter in the same write as the request', () => {
  const src = read('app/api/me/account/route.ts')
  const del = src.slice(src.indexOf('export async function DELETE'), src.indexOf('export async function POST'))
  assert.match(
    del,
    /\$inc:\s*\{\s*widgetTokenVersion:\s*1\s*\}/,
    'a member who asked to be deleted must stop feeding a widget that minute',
  )
  // And it must ride the SAME updateOne as the deletion plan, or a half-failed
  // request could schedule the purge while leaving the widgets reading.
  assert.match(del, /\$set:\s*\{\s*deletion:\s*plan\s*\}[\s\S]{0,80}\$inc/)
})

test('bumpWidgetTokenVersion uses $inc, which is what makes "absent" safe', () => {
  const src = read('lib/widgets/token.ts')
  assert.match(src, /\$inc:\s*\{\s*widgetTokenVersion:\s*1\s*\}/)
  assert.doesNotMatch(
    src,
    /\$set:\s*\{\s*widgetTokenVersion/,
    '$set would have to know the current value, and a default of 0 collides with the first bump',
  )
  assert.equal(typeof bumpWidgetTokenVersion, 'function')
})

test('the User schema carries the counter with NO default', () => {
  const src = read('models/User.ts')
  assert.match(src, /widgetTokenVersion\?: number/, 'the interface must declare it')
  assert.match(src, /widgetTokenVersion:\s*\{\s*type:\s*Number\s*\}/)
})

// ── The summary route really is that gate, in that order ────────────────────

test('GET /api/widgets/summary checks the version BEFORE it reads the cache', () => {
  // A revoked token must not be able to read a warm 60s entry. Order is the
  // whole assertion, so it is pinned by position rather than by presence.
  const src = read('app/api/widgets/summary/route.ts')
  const get = src.slice(src.indexOf('export async function GET'))

  const gate = get.indexOf('isWidgetAuthAccepted')
  const cache = get.indexOf('cacheGetJson')
  const load = get.indexOf('loadWidgetFeed')

  assert.ok(gate > 0, 'the summary must run the version gate')
  assert.ok(cache > 0 && load > 0)
  assert.ok(gate < cache, 'a revoked token must not be able to read a cached feed')
  assert.ok(gate < load, 'a revoked token must not be able to load a feed')
  assert.match(get, /allowScopes:\s*WIDGET_SCOPES/)
})

test('POST /api/widgets/token mints from a session only, and writes nothing', () => {
  const src = read('app/api/widgets/token/route.ts')
  // No allowScopes anywhere in the file: default-deny means a widgets token
  // cannot mint another one. (token-scope.test.ts asserts the 401 as well.)
  assert.doesNotMatch(src, /allowScopes/, 'minting must require a full session')
  assert.match(src, /mintWidgetToken/)
  assert.doesNotMatch(
    src,
    /updateOne|deleteOne|deleteMany|\$set|\$inc|\.save\(/,
    'the app hits this on every open — it must not touch the member row',
  )
})
