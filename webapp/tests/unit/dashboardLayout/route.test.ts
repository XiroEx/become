// Run with: npx tsx --test tests/unit/dashboardLayout/route.test.ts
//
// Auth + body-validation branches of GET/PATCH /api/dashboard/layout.
// The 200 paths touch MongoDB (unavailable in the unit env) and are covered
// by the pure helper tests (migrate.test.ts proves "migrate exactly once,
// second GET stable" + "default for a fresh user"; validateLayout.test.ts
// proves ">20 and bad shape are rejected"). This mirrors the convention in
// dashboard-tiles-route.test.ts / pinned-tiles-route.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET, PATCH } from '../../../app/api/dashboard/layout/route'
import { signToken } from '../../../lib/auth'

function getRequest(authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/dashboard/layout', {
    method: 'GET',
    headers,
  })
}

function patchRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/dashboard/layout', {
    method: 'PATCH',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function authed() {
  return `Bearer ${signToken({ userId: 'fake-user', email: 't@example.com' })}`
}

test('GET /api/dashboard/layout: no auth → 401', async () => {
  const res = await GET(getRequest())
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.match(String(json.error), /Unauthorized/)
})

test('GET /api/dashboard/layout: invalid JWT → 401', async () => {
  const res = await GET(getRequest('Bearer garbage'))
  assert.equal(res.status, 401)
})

test('PATCH /api/dashboard/layout: no auth → 401', async () => {
  const res = await PATCH(patchRequest({ layout: [] }))
  assert.equal(res.status, 401)
})

test('PATCH /api/dashboard/layout: invalid JWT → 401', async () => {
  const res = await PATCH(patchRequest({ layout: [] }, 'Bearer garbage'))
  assert.equal(res.status, 401)
})

test('PATCH /api/dashboard/layout: invalid JSON → 400', async () => {
  const res = await PATCH(patchRequest('not-json{{{', authed()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Invalid JSON body/)
})

test('PATCH /api/dashboard/layout: missing layout array → 400', async () => {
  const res = await PATCH(patchRequest({}, authed()))
  assert.equal(res.status, 400)
})

test('PATCH /api/dashboard/layout: bad tile shape → 400', async () => {
  const res = await PATCH(
    patchRequest({ layout: [{ id: 'x', kind: 'nope', size: '1x1' }] }, authed())
  )
  assert.equal(res.status, 400)
})

test('PATCH /api/dashboard/layout: locked on non-smart-rotating tile → 400', async () => {
  const res = await PATCH(
    patchRequest(
      { layout: [{ id: 'streak', kind: 'stat', size: '1x1', locked: 'streak' }] },
      authed()
    )
  )
  assert.equal(res.status, 400)
})

test('PATCH /api/dashboard/layout: more than 20 tiles → 400', async () => {
  const layout = Array.from({ length: 21 }, (_, i) => ({
    id: `t${i}`,
    kind: 'stat',
    size: '1x1',
  }))
  const res = await PATCH(patchRequest({ layout }, authed()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /at most 20/)
})
