// Run with: npx tsx --test tests/unit/workouts-post-continuation.test.ts
//
// POST /api/workouts used to match "the log to continue" by a today's-local-
// calendar-day date window. A workout opened at 11:58pm got its first
// autosave dated just before midnight; any LATER autosave (including the
// final, completing one) recomputed "today" as the NEW day, missed that
// window entirely, and — since the insert-guard only checked for an entry
// dated today — pushed a second, empty workoutLog for the same program/day.
// The original stayed open forever, orphaned; the member's progress read as
// gone. Auth/validation branches are exercised directly (no DB touched); the
// query-shape fix is locked in with a source assertion, mirroring the
// pattern in workouts-delete-in-progress.test.ts and
// workoutLogCorrections.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { POST } from '../../app/api/workouts/route'
import { signToken } from '../../lib/auth'

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/workouts', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

async function authedHeader() {
  const token = await signToken({ userId: 'fake-test-user', email: 't@example.com' })
  return `Bearer ${token}`
}

test('POST /api/workouts: no auth header → 401 (no DB touched)', async () => {
  const res = await POST(makeRequest({ programId: 'p1', phase: 1, day: 'Day 1', exercises: [], completed: false }))
  assert.equal(res.status, 401)
})

test('POST /api/workouts: authed + missing programId/phase/day → 400 (no DB touched)', async () => {
  const res = await POST(makeRequest({ exercises: [], completed: false }, await authedHeader()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /Missing required fields/)
})

// ── Source guards: lock in the "continue the open log, don't fork it" fix ──

function readPostHandler(): string {
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')
  const start = src.indexOf('export async function POST')
  assert.ok(start !== -1, 'could not locate the POST handler')
  return src.slice(start)
}

test('the program-workout save resolves the log to update by completed:false within a rolling window, not a calendar-day one', () => {
  const postFn = readPostHandler()

  // The primary findOneAndUpdate that resolves "the log this save continues"
  // must match on completed:false, bounded (if at all) by the same rolling
  // IN_PROGRESS_WINDOW_MS cutoff GET/in-progress uses — never by a `today`/
  // `tomorrow` calendar-day pair, which is exactly what let an open log fall
  // out of "today" at midnight and get shadowed by a freshly-inserted
  // duplicate.
  const idx = postFn.indexOf('arrayFilters:')
  assert.ok(idx !== -1, 'could not find the primary arrayFilters clause')
  const clause = postFn.slice(idx, idx + 200)
  assert.ok(clause.includes('elem.completed'), 'primary match must key off elem.completed')
  assert.equal(
    clause.includes('today') || clause.includes('tomorrow'),
    false,
    'primary match must not reintroduce a today/tomorrow calendar-day window — that is the midnight bug',
  )
  if (clause.includes('elem.date')) {
    assert.ok(
      clause.includes('openLogCutoff'),
      'any date bound on the primary match must be the rolling openLogCutoff, not a calendar-day pair',
    )
  }
})

test('a program workout can be logged under an explicit day, mirroring the quick-session performedAt contract', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'route.ts'),
    'utf8',
  )
  const quickStart = src.indexOf('async function handleQuickSessionSave')
  assert.ok(quickStart !== -1, 'could not locate handleQuickSessionSave')
  const programOnly = src.slice(0, quickStart)

  assert.match(src, /performedAt\?:\s*string/, 'WorkoutSaveRequest must accept an optional performedAt override')
  assert.match(
    programOnly,
    /resolvePerformedAt\(body\.performedAt, tzOffset\)/,
    'program branch (not just the pre-existing quick-session branch) must resolve performedAt',
  )
})
