// Run with: npm run test:file tests/unit/quickSession/favorite-route.test.ts
//
// "Add favorites for sessions": a quick session on the Sessions list can be
// starred for quick access. Favorite is threaded through the same
// PATCH /api/workouts/session endpoint that already toggles `skipped`,
// keyed by the client-generated sessionId via arrayFilters — see
// rename-route.test.ts for the sibling `title` coverage this mirrors.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { PATCH } from '../../../app/api/workouts/session/route'
import { signToken } from '../../../lib/auth'

function patchRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/workouts/session', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

async function authedHeader(): Promise<string> {
  process.env.JWT_SECRET ||= 'unit-test-placeholder'
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/become-unit-test'
  const token = await signToken({ userId: 'favorite-test-user', email: 'favorite@example.com' })
  return `Bearer ${token}`
}

test('quick-session PATCH favorite toggle requires authentication (no DB touched)', async () => {
  const res = await PATCH(patchRequest({ id: 'session-id', favorite: true }))
  assert.equal(res.status, 401)
})

test('quick-session PATCH still requires at least one supported change, and now mentions favorite', async () => {
  const res = await PATCH(patchRequest({ id: 'session-id' }, await authedHeader()))
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(String(body.error), /favorite/)
})

test('quick-session PATCH requires an id even when only favorite is sent (no DB touched)', async () => {
  const res = await PATCH(patchRequest({ favorite: true }, await authedHeader()))
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(String(body.error), /id is required/)
})

// ── Source guard: lock in the arrayFilters-by-sessionId shape ──

function readPatchHandler(): string {
  const routePath = path.join(__dirname, '..', '..', '..', 'app', 'api', 'workouts', 'session', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')
  const start = src.indexOf('export async function PATCH')
  assert.ok(start !== -1, 'could not locate the PATCH handler')
  return src.slice(start)
}

test('favorite writes workoutLogs.$[elem].favorite, matched by sessionId + kind:quick like skipped', () => {
  const patchFn = readPatchHandler()

  assert.match(patchFn, /body\.favorite !== undefined/, 'must branch on body.favorite explicitly (undefined vs false matters)')

  // ONE derived boolean drives both the quota gate and the write. `body` is
  // unvalidated JSON, so a gate reading `body.favorite === true` beside a write
  // doing `!!body.favorite` was a bypass: PATCH {"favorite": 1} skipped
  // requireQuota and still starred the session. The two must not be able to
  // disagree about what "favorite" means.
  assert.match(
    patchFn,
    /const wantsFavorite = body\.favorite !== undefined && !!body\.favorite/,
    'the coercion must be derived once',
  )
  assert.match(
    patchFn,
    /set\['workoutLogs\.\$\[elem\]\.favorite'\]\s*=\s*wantsFavorite/,
    'the write must use the derived boolean, not re-coerce the raw body',
  )
  assert.match(
    patchFn,
    /if \(wantsFavorite\) \{\s*\n\s*const gate = await requireQuota\(request, 'custom-sessions'\)/,
    'the quota gate must read the SAME derived boolean the write does',
  )
  assert.doesNotMatch(
    patchFn,
    /body\.favorite === true/,
    'a truthiness check on the raw body is the bypass this replaces',
  )

  // Same arrayFilters clause skipped/title/date already share — favorite must
  // not introduce a second, differently-scoped update.
  const idx = patchFn.indexOf('arrayFilters:')
  assert.ok(idx !== -1, 'could not find the arrayFilters clause')
  const clause = patchFn.slice(idx, idx + 200)
  assert.ok(clause.includes("'elem.sessionId': id"), 'must key off elem.sessionId')
  assert.ok(clause.includes("'elem.kind': 'quick'"), 'must stay scoped to quick sessions')
})
