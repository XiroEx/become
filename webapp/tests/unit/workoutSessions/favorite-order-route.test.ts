// Run with: npm run test:file tests/unit/workoutSessions/favorite-order-route.test.ts
//
// Auth + body-validation branches of PATCH /api/workouts/favorite-order.
// The 200 path touches MongoDB and is covered by the validator tests + Playwright.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { PATCH } from '../../../app/api/workouts/favorite-order/route'
import { signToken } from '../../../lib/auth'

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/workouts/favorite-order', {
    method: 'PATCH',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function authed() {
  return `Bearer ${await signToken({ userId: 'fake-user', email: 't@example.com' })}`
}

test('PATCH /api/workouts/favorite-order: no auth → 401', async () => {
  const res = await PATCH(makeRequest({ order: ['a'] }))
  assert.equal(res.status, 401)
})

test('PATCH /api/workouts/favorite-order: invalid JWT → 401', async () => {
  const res = await PATCH(makeRequest({ order: ['a'] }, 'Bearer garbage'))
  assert.equal(res.status, 401)
})

test('PATCH /api/workouts/favorite-order: invalid JSON → 400', async () => {
  const res = await PATCH(makeRequest('not-json{{{', await authed()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Invalid JSON body/)
})

test('PATCH /api/workouts/favorite-order: missing order → 400', async () => {
  const res = await PATCH(makeRequest({}, await authed()))
  assert.equal(res.status, 400)
})

test('PATCH /api/workouts/favorite-order: non-string entry → 400', async () => {
  const res = await PATCH(makeRequest({ order: ['a', 42] }, await authed()))
  assert.equal(res.status, 400)
})

test('PATCH /api/workouts/favorite-order: too many entries → 400', async () => {
  const res = await PATCH(
    makeRequest(
      { order: Array.from({ length: 201 }, (_, i) => `s${i}`) },
      await authed(),
    ),
  )
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /may not exceed 200/)
})
