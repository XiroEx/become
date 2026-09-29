// Run with: npm run test:file tests/unit/auth/handoff.test.ts
//
// The one-time session hand-off, everywhere it can be pinned without a
// database: the rules in lib/authHandoff.ts, the refusal branches of both
// routes, and the two facts that make the feature actually work rather than
// merely compile —
//
//   • every allow-listed target resolves to a REAL page under app/. The native
//     helpers this replaces pointed at `/dashboard/programming/<id>/edit` and
//     `/dashboard/nutrition/recipes/create`; neither is a page, and nothing in
//     either codebase said so;
//   • no allow-listed target is swallowed by a redirect in next.config.ts,
//     which is what turned that first link into `/dashboard/workout/<id>/edit`
//     — a 404 with a plausible name.
//
// The claim itself (single use, expiry) is Mongo semantics and lives in
// handoffCode.test.ts, which drives the real model against the loopback test
// database — the convention every route test in this repo follows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

import {
  HANDOFF_ALLOWED_PATHS,
  HANDOFF_CODE_TTL_SECONDS,
  HANDOFF_MINT_PATH,
  HANDOFF_REDEEM_PATH,
  decideRedemption,
  isHandoffPathAllowed,
  normalizeHandoffPath,
} from '../../../lib/authHandoff'
import { POST as MINT } from '../../../app/api/auth/handoff/route'
import { GET as REDEEM } from '../../../app/auth/handoff/route'
import { signToken } from '../../../lib/auth'
import { mintToolToken } from '../../../lib/ai/routeHelpers'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

function req(url: string, init: { method?: string; body?: unknown; auth?: string } = {}) {
  const headers = new Headers()
  if (init.auth) headers.set('Authorization', init.auth)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
}

const session = async () => `Bearer ${await signToken({ userId: 'u1', email: 'a@b.c' })}`

// ─── The allow-list ──────────────────────────────────────────────────────────

test('the allow-listed shapes are accepted, with a real id in the slot', () => {
  const accepted = [
    '/dashboard',
    '/dashboard/programs/new',
    '/dashboard/programs/68f1b2c3d4e5f60718293a4b/edit',
    '/dashboard/recipes/new',
    '/dashboard/recipes/68f1b2c3d4e5f60718293a4b/edit',
    '/dashboard/admin/foods/68f1b2c3d4e5f60718293a4b',
    '/dashboard/admin/exercises/new',
    '/dashboard/admin/exercises/barbell-back-squat/edit',
    '/dashboard/admin/users',
    '/dashboard/admin/users/68f1b2c3d4e5f60718293a4b',
  ]
  for (const p of accepted) {
    assert.equal(isHandoffPathAllowed(p), true, `${p} should be allow-listed`)
    assert.equal(normalizeHandoffPath(p), p, `${p} should pass through unchanged`)
  }
  // A trailing slash is the same target, not a different one.
  assert.equal(normalizeHandoffPath('/dashboard/programs/new/'), '/dashboard/programs/new')
})

test('a path outside the allow-list is refused', () => {
  const refused = [
    // Not on the list.
    '/dashboard/settings',
    '/dashboard/admin',
    '/dashboard/admin/users/abc/delete',
    '/login',
    '/',
    // Another origin, in every spelling that has ever worked as one.
    'https://evil.example/dashboard',
    '//evil.example/dashboard',
    '/\\evil.example/dashboard',
    'dashboard/programs/new',
    // Traversal and empty segments.
    '/dashboard/programs/../../etc/passwd',
    '/dashboard//programs/new',
    '/dashboard/programs//edit',
    // A query or a fragment is not part of a target.
    '/dashboard/programs/new?next=https://evil.example',
    '/dashboard/programs/new#x',
    // A param slot takes one plain segment, and never nothing.
    '/dashboard/programs//edit',
    '/dashboard/programs/a%2Fb/edit',
    '/dashboard/programs/a b/edit',
    // Not a string at all.
    '',
  ]
  for (const p of refused) {
    assert.equal(normalizeHandoffPath(p), null, `${p} must be refused`)
  }
  for (const p of [null, undefined, 42, {}, ['/dashboard']]) {
    assert.equal(normalizeHandoffPath(p), null, `${JSON.stringify(p)} must be refused`)
  }
})

test('every allow-listed target is a page that exists', () => {
  for (const pattern of HANDOFF_ALLOWED_PATHS) {
    let dir = path.join(ROOT, 'app')
    for (const segment of pattern.split('/').slice(1)) {
      const dirs = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
      const next = segment.startsWith(':')
        ? dirs.find((name) => /^\[[^\]]+\]$/.test(name))
        : dirs.find((name) => name === segment)
      assert.ok(next, `${pattern}: no route directory for "${segment}" under ${dir}`)
      dir = path.join(dir, next)
    }
    assert.ok(
      existsSync(path.join(dir, 'page.tsx')) || existsSync(path.join(dir, 'page.ts')),
      `${pattern} resolves to ${dir}, which has no page`,
    )
  }
})

test('no allow-listed target is swallowed by a redirect in next.config.ts', () => {
  const sources = [...read('next.config.ts').matchAll(/source:\s*'([^']+)'/g)].map((m) => m[1])
  assert.ok(sources.length > 0, 'next.config.ts no longer declares any redirect/header sources')
  const redirectPrefixes = sources
    // Only the redirects block matters; header sources are regex-ish and match
    // everything by design.
    .filter((s) => s.startsWith('/dashboard'))
    .map((s) => s.split('/:')[0])
  for (const pattern of HANDOFF_ALLOWED_PATHS) {
    for (const prefix of redirectPrefixes) {
      assert.ok(
        pattern !== prefix && !pattern.startsWith(`${prefix}/`),
        `${pattern} is redirected by next.config.ts source "${prefix}" — a hand-off would land elsewhere`,
      )
    }
  }
})

// ─── The redemption decision ─────────────────────────────────────────────────

test('a code lives sixty seconds, and not a millisecond longer', () => {
  assert.equal(HANDOFF_CODE_TTL_SECONDS, 60)

  const now = new Date('2026-09-29T12:00:00.000Z')
  const claim = (expiresAt: Date) => ({ userId: 'u1', path: '/dashboard/programs/new', expiresAt })

  const fresh = decideRedemption(claim(new Date(now.getTime() + 1)), now)
  assert.deepEqual(fresh, { ok: true, userId: 'u1', path: '/dashboard/programs/new' })

  // Exactly at the expiry instant it is already dead: `<=`, never `<`.
  assert.deepEqual(decideRedemption(claim(now), now), { ok: false, reason: 'expired' })
  assert.deepEqual(decideRedemption(claim(new Date(now.getTime() - 1)), now), {
    ok: false,
    reason: 'expired',
  })
  assert.deepEqual(
    decideRedemption({ userId: 'u1', path: '/dashboard', expiresAt: 'not-a-date' }, now),
    { ok: false, reason: 'expired' },
  )
})

test('a code that is already spent (or never existed) is refused identically', () => {
  const now = new Date()
  // The atomic claim answers null for BOTH, and this is where that is honoured:
  // a caller must not be able to tell them apart.
  assert.deepEqual(decideRedemption(null, now), { ok: false, reason: 'unknown_or_used' })
  assert.deepEqual(decideRedemption(undefined, now), { ok: false, reason: 'unknown_or_used' })
})

test('the allow-list is checked again at redemption, on the stored path', () => {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30_000)
  // A code minted while a path was allow-listed must stop working the moment
  // the path leaves the list — the codes already in flight are the ones that
  // matter when a target is removed because it was a mistake.
  assert.deepEqual(decideRedemption({ userId: 'u1', path: '/dashboard/settings', expiresAt }, now), {
    ok: false,
    reason: 'path_not_allowed',
  })
  assert.deepEqual(
    decideRedemption({ userId: 'u1', path: 'https://evil.example/', expiresAt }, now),
    { ok: false, reason: 'path_not_allowed' },
  )
  assert.deepEqual(decideRedemption({ userId: '', path: '/dashboard', expiresAt }, now), {
    ok: false,
    reason: 'unknown_or_used',
  })
})

// ─── POST /api/auth/handoff — minting ────────────────────────────────────────

test('minting needs a session', async () => {
  const body = { path: '/dashboard/programs/new' }
  assert.equal((await MINT(req(HANDOFF_MINT_PATH, { method: 'POST', body }))).status, 401)
  assert.equal(
    (await MINT(req(HANDOFF_MINT_PATH, { method: 'POST', body, auth: 'Bearer garbage' }))).status,
    401,
  )
})

test('minting refuses a scoped token — the ai-tools token is not a session', async () => {
  const scoped = await mintToolToken('u1', 'a@b.c')
  assert.ok(scoped, 'mintToolToken should mint in the unit env')
  const res = await MINT(
    req(HANDOFF_MINT_PATH, {
      method: 'POST',
      body: { path: '/dashboard/programs/new' },
      auth: `Bearer ${scoped}`,
    }),
  )
  assert.equal(res.status, 401, 'a 15-minute tool token must not buy a 30-day browser session')
})

test('minting refuses a path outside the allow-list, before it touches the database', async () => {
  for (const p of [
    undefined,
    '',
    '/login',
    '/dashboard/settings',
    'https://evil.example/dashboard',
    '//evil.example/dashboard',
    '/dashboard/programs/new?x=1',
  ]) {
    const res = await MINT(
      req(HANDOFF_MINT_PATH, { method: 'POST', body: { path: p }, auth: await session() }),
    )
    assert.equal(res.status, 400, `path ${JSON.stringify(p)} was not refused`)
    assert.equal((await res.json()).error, 'path_not_allowed')
  }

  // And it is refused BEFORE dbConnect(), so a hostile target never costs a
  // connection and can never be written.
  const src = read('app/api/auth/handoff/route.ts')
  assert.ok(
    src.indexOf('normalizeHandoffPath(') < src.indexOf('await dbConnect()'),
    'the mint route connects to Mongo before it validates the target path',
  )
})

test('a malformed body is refused, not treated as an empty target', async () => {
  const request = new NextRequest(`http://localhost${HANDOFF_MINT_PATH}`, {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      Authorization: await session(),
    }),
    body: 'not-json{{{',
  })
  const res = await MINT(request)
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'path_not_allowed')
})

// ─── GET /auth/handoff — redeeming ───────────────────────────────────────────

test('redeeming without a code lands on /login and never on a dashboard', async () => {
  const res = await REDEEM(req(`${HANDOFF_REDEEM_PATH}`))
  assert.ok(res.status >= 300 && res.status < 400, `expected a redirect, got ${res.status}`)
  const location = new URL(res.headers.get('location') ?? '', 'http://localhost')
  assert.equal(location.pathname, '/login')
  assert.equal(location.searchParams.get('error'), 'handoff')
  assert.equal(res.headers.get('set-cookie'), null, 'a refusal must not set a session cookie')
  assert.match(res.headers.get('cache-control') ?? '', /no-store/)
})

test('the redeem route claims the code atomically and never re-reads it', () => {
  const src = read('app/auth/handoff/route.ts')
  assert.match(src, /claimHandoffCode\(/, 'the redeem route no longer claims the code')
  assert.match(src, /decideRedemption\(/, 'the redeem route no longer applies the rules')
  assert.doesNotMatch(src, /findOne\(/, 'the redeem route reads the code outside the atomic claim')

  const model = read('models/HandoffCode.ts')
  assert.match(
    model,
    /findOneAndUpdate\(\s*\{\s*codeHash:[^}]*usedAt:\s*null\s*\}/,
    'the claim is no longer filtered on an unused code — it would be reusable',
  )
  assert.match(model, /\$set:\s*\{\s*usedAt:\s*now\s*\}/, 'the claim no longer burns the code')
  assert.match(
    model,
    /expireAfterSeconds/,
    'spent and expired rows are never swept, so the collection grows for ever',
  )
  assert.doesNotMatch(
    model,
    /code:\s*\{\s*type:\s*String/,
    'the raw code is stored — only its hash may be',
  )
})

test('the session the hand-off mints comes from the database, not from the code', () => {
  const src = read('app/auth/handoff/route.ts')
  assert.match(src, /User\.findById\(decision\.userId\)/)
  assert.match(src, /signToken\(\{[^}]*userId: decision\.userId/)
  assert.match(src, /role: user\.role/, 'the role is taken from anywhere but the row')
  assert.match(src, /authCookie\(token\)/, 'the redeem route no longer sets the session cookie')
  // The token travels in the FRAGMENT, which no server and no proxy logs.
  assert.match(src, /finishUrl\.hash = encodeURIComponent\(token\)/)
  assert.doesNotMatch(src, /searchParams\.set\('token'/, 'the JWT is on the query string')
})

test('/auth/finish will not redirect anywhere the allow-list refuses', () => {
  const page = read('app/auth/finish/page.tsx')
  assert.match(page, /normalizeHandoffPath\(url\.searchParams\.get\('next'\)\) \?\? '\/dashboard'/)
})

// ─── The native half ─────────────────────────────────────────────────────────

test('the native helper calls the routes this repo actually serves', () => {
  // The one check that can see both codebases (the Expo sources are read as
  // text, exactly as tests/unit/account/storeReadiness.test.tsx does it): a
  // native helper pointing at a path the webapp does not serve is precisely the
  // bug this card exists to fix.
  const helper = readFileSync(
    path.join(ROOT, '..', 'expo', 'lib', 'web', 'openWebSignedIn.ts'),
    'utf8',
  )
  assert.match(helper, new RegExp(`HANDOFF_MINT_PATH = "${HANDOFF_MINT_PATH}"`))
  assert.match(helper, new RegExp(`HANDOFF_REDEEM_PATH = "${HANDOFF_REDEEM_PATH}"`))
  assert.ok(
    existsSync(path.join(ROOT, 'app', 'api', 'auth', 'handoff', 'route.ts')),
    'the mint route the native helper posts to does not exist',
  )
  assert.ok(
    existsSync(path.join(ROOT, 'app', 'auth', 'handoff', 'route.ts')),
    'the redeem route the native helper opens does not exist',
  )
  // It takes a PATH and prefixes our own base URL: only Become domains are ever
  // opened as Become pages.
  assert.match(helper, /WEBAPP_BASE_URL/)
  assert.match(helper, /\$\{base\}\$\{target\}/, 'the plain-URL fallback is gone')
})
