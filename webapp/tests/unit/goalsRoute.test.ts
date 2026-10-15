// Run with: npm run test:file tests/unit/goalsRoute.test.ts
//
// PUT /api/goals requires `tz` (minutes west of UTC) on every write.
//
// Root cause: PUT previously defaulted missing `tz` via `readOptionalTzOffsetFromBody(body) ?? 0`,
// which silently computed the freshly returned GET payload (then -> now -> next)
// on UTC days. For members west of UTC, saving a pace or training days bucketed their
// progress on the wrong day.
//
// This test asserts that:
// 1. PUT /api/goals with missing `tz` is refused with a 400 Bad Request ({ error: 'tz is required' })
// 2. PUT /api/goals with non-numeric / invalid `tz` is refused with a 400 Bad Request
// 3. PUT /api/goals with an unauthenticated request returns 401 Unauthorized

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { PUT } from '../../app/api/goals/route'
import { signToken } from '../../lib/auth'

const USER_ID = '65f00000000000000000fa01'

async function createAuthHeader(): Promise<string> {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  const token = await signToken({ userId: USER_ID, email: 'goals-test@example.com' })
  return `Bearer ${token}`
}

function putRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/goals', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
}

test('PUT /api/goals refuses missing tz with 400 (nutrition pillar)', async () => {
  const auth = await createAuthHeader()
  const req = putRequest({ pillar: 'nutrition', paceKgPerWeek: 0.5 }, auth)
  const res = await PUT(req)
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.equal(data.error, 'tz is required')
})

test('PUT /api/goals refuses missing tz with 400 (training pillar)', async () => {
  const auth = await createAuthHeader()
  const req = putRequest({ pillar: 'training', daysPerWeek: 3 }, auth)
  const res = await PUT(req)
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.equal(data.error, 'tz is required')
})

test('PUT /api/goals refuses non-numeric or invalid tz with 400', async () => {
  const auth = await createAuthHeader()

  for (const invalidTz of [null, 'America/New_York', '300', NaN, undefined]) {
    const req = putRequest({ pillar: 'nutrition', paceKgPerWeek: 0.5, tz: invalidTz }, auth)
    const res = await PUT(req)
    assert.equal(res.status, 400, `Expected 400 for tz=${String(invalidTz)}`)
    const data = await res.json()
    assert.equal(data.error, 'tz is required')
  }
})

test('PUT /api/goals refuses unauthenticated request with 401', async () => {
  const req = putRequest({ pillar: 'nutrition', paceKgPerWeek: 0.5, tz: 300 })
  const res = await PUT(req)
  assert.equal(res.status, 401)
  const data = await res.json()
  assert.equal(data.error, 'Unauthorized')
})
