// Run with: npx tsx --test tests/unit/suggestions/dismiss-route.test.ts
//
// Exercises auth + body-validation branches of POST /api/suggestions/dismiss
// without MongoDB. The 200 success path (which depends on dbConnect +
// UserProgress.findOne/save) is unit-tested via applyDismissal and will be
// covered end-to-end by a Playwright spec.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { POST } from '../../../app/api/suggestions/dismiss/route'
import { signToken } from '../../../lib/auth'

function makeRequest(body: unknown | undefined, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/suggestions/dismiss', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function authedHeader() {
  // verifyAuth is JWT-only (no DB lookup), so any signed token is accepted.
  const token = signToken({ userId: 'fake-test-user', email: 't@example.com' })
  return `Bearer ${token}`
}

test('POST /api/suggestions/dismiss: no auth header → 401', async () => {
  const res = await POST(makeRequest({ id: 'log-weight' }))
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.match(String(json.error), /Unauthorized/)
})

test('POST /api/suggestions/dismiss: invalid JWT → 401', async () => {
  const res = await POST(makeRequest({ id: 'log-weight' }, 'Bearer garbage'))
  assert.equal(res.status, 401)
})

test('POST /api/suggestions/dismiss: authed + missing id → 400 (no DB touched)', async () => {
  const res = await POST(makeRequest({}, authedHeader()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Missing required field: id/)
})

test('POST /api/suggestions/dismiss: authed + empty-string id → 400', async () => {
  const res = await POST(makeRequest({ id: '   ' }, authedHeader()))
  assert.equal(res.status, 400)
})

test('POST /api/suggestions/dismiss: authed + non-string id → 400', async () => {
  const res = await POST(makeRequest({ id: 42 }, authedHeader()))
  assert.equal(res.status, 400)
})

test('POST /api/suggestions/dismiss: authed + invalid JSON body → 400', async () => {
  const headers = new Headers()
  headers.set('Authorization', authedHeader())
  headers.set('Content-Type', 'application/json')
  const req = new NextRequest('http://localhost/api/suggestions/dismiss', {
    method: 'POST',
    headers,
    body: 'not-json{{{',
  })
  const res = await POST(req)
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Invalid JSON body/)
})
