// Run with: npm run test:file tests/unit/quickSession/rename-route.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
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
  // Keep the focused one-file command self-contained; the full test script
  // supplies its own test-only runtime configuration.
  process.env.JWT_SECRET ||= 'unit-test-placeholder'
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/become-unit-test'
  const token = await signToken({ userId: 'rename-test-user', email: 'rename@example.com' })
  return `Bearer ${token}`
}

test('quick-session PATCH requires authentication', async () => {
  const res = await PATCH(patchRequest({ id: 'session-id', title: 'Push day' }))
  assert.equal(res.status, 401)
})

test('quick-session PATCH requires at least one supported change', async () => {
  const res = await PATCH(patchRequest({ id: 'session-id' }, await authedHeader()))
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(String(body.error), /title/)
})

test('quick-session PATCH rejects blank and non-string titles before touching MongoDB', async () => {
  for (const title of ['   ', 123, null]) {
    const res = await PATCH(patchRequest({ id: 'session-id', title }, await authedHeader()))
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.match(String(body.error), /must not be empty/)
  }
})
