// Run with: npx tsx --test tests/unit/workouts-delete-in-progress.test.ts
//
// Exercises auth + validation branches of DELETE /api/workouts — the
// hold-to-delete primitive behind the Resume pill — without MongoDB. The
// 200 success path (which depends on dbConnect + UserProgress.updateOne)
// is covered end-to-end by a Playwright spec, mirroring
// tests/unit/suggestions/dismiss-route.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { DELETE } from '../../app/api/workouts/route'
import { signToken } from '../../lib/auth'

function makeRequest(query: string, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest(`http://localhost/api/workouts${query}`, {
    method: 'DELETE',
    headers,
  })
}

async function authedHeader() {
  // verifyAuth is JWT-only (no DB lookup), so any signed token is accepted.
  const token = await signToken({ userId: 'fake-test-user', email: 't@example.com' })
  return `Bearer ${token}`
}

test('DELETE /api/workouts: no auth header → 401', async () => {
  const res = await DELETE(makeRequest('?programId=p1&day=Day%201'))
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.match(String(json.error), /No token provided/)
})

test('DELETE /api/workouts: invalid JWT → 401', async () => {
  const res = await DELETE(makeRequest('?programId=p1&day=Day%201', 'Bearer garbage'))
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.match(String(json.error), /Invalid token/)
})

test('DELETE /api/workouts: authed + missing programId → 400 (no DB touched)', async () => {
  const res = await DELETE(makeRequest('?day=Day%201', await authedHeader()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /programId and day are required/)
})

test('DELETE /api/workouts: authed + missing day → 400 (no DB touched)', async () => {
  const res = await DELETE(makeRequest('?programId=p1', await authedHeader()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /programId and day are required/)
})

test('DELETE /api/workouts: authed + missing both → 400', async () => {
  const res = await DELETE(makeRequest('', await authedHeader()))
  assert.equal(res.status, 400)
})

// ── Source guards: lock in the "hard delete, never a skip" contract ────────

test('DELETE /api/workouts pulls only the incomplete log for today, and never touches Schedule', () => {
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')

  const start = src.indexOf('export async function DELETE')
  const end = src.indexOf('export async function POST')
  assert.ok(start !== -1 && end !== -1 && end > start, 'could not isolate the DELETE handler body')
  const deleteFn = src.slice(start, end)

  // Must scope the $pull to an incomplete log — a completed workout must
  // never be reachable through this endpoint.
  assert.ok(
    deleteFn.includes('completed: false'),
    'DELETE handler must only ever pull logs with completed: false',
  )
  // Must not write to the Schedule collection — deleting an in-progress log
  // is a hard delete, not a recorded outcome like 'skipped'.
  assert.equal(
    deleteFn.includes('Schedule.'),
    false,
    'DELETE handler must not touch the Schedule collection — see route.ts comment for why',
  )
})
