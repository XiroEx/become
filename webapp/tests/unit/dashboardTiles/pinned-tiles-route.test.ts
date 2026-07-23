// Run with: npx tsx --test tests/unit/dashboardTiles/pinned-tiles-route.test.ts
//
// Auth + body-validation branches of PATCH /api/dashboard/pinned-tiles.
// The 200 path touches MongoDB and is covered by helper tests + Playwright.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { PATCH } from '../../../app/api/dashboard/pinned-tiles/route'
import { signToken } from '../../../lib/auth'

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/dashboard/pinned-tiles', {
    method: 'PATCH',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function authed() {
  return `Bearer ${await signToken({ userId: 'fake-user', email: 't@example.com' })}`
}

test('PATCH /api/dashboard/pinned-tiles: no auth → 401', async () => {
  const res = await PATCH(makeRequest({ pinnedTiles: ['a'] }))
  assert.equal(res.status, 401)
})

test('PATCH /api/dashboard/pinned-tiles: invalid JWT → 401', async () => {
  const res = await PATCH(makeRequest({ pinnedTiles: ['a'] }, 'Bearer garbage'))
  assert.equal(res.status, 401)
})

test('PATCH /api/dashboard/pinned-tiles: invalid JSON → 400', async () => {
  const res = await PATCH(makeRequest('not-json{{{', await authed()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Invalid JSON body/)
})

test('PATCH /api/dashboard/pinned-tiles: missing pinnedTiles → 400', async () => {
  const res = await PATCH(makeRequest({}, await authed()))
  assert.equal(res.status, 400)
})

test('PATCH /api/dashboard/pinned-tiles: non-string entry → 400', async () => {
  const res = await PATCH(
    makeRequest({ pinnedTiles: ['a', 42] }, await authed()),
  )
  assert.equal(res.status, 400)
})

test('PATCH /api/dashboard/pinned-tiles: too many entries → 400', async () => {
  const res = await PATCH(
    makeRequest(
      { pinnedTiles: Array.from({ length: 21 }, (_, i) => `t${i}`) },
      await authed(),
    ),
  )
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /may not exceed 20/)
})
