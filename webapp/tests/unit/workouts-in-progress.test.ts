// Run with: npx tsx --test tests/unit/workouts-in-progress.test.ts
//
// GET /api/workouts/in-progress drives the dashboard's "get back into the
// workout" pill. It used to scope an open log to the caller's local
// CALENDAR DAY, which discarded a workout started right before midnight the
// instant the clock rolled over — reported as the pill (and the workout)
// vanishing. It later also surfaced a quick session PLANNED for a future
// date (Calendar → "Plan it") as if the member were mid-workout in it right
// now, because the rolling window only checked the log wasn't too OLD and
// never checked it wasn't dated in the FUTURE. Auth/validation branches are
// exercised directly (no DB touched); the window contract is locked in via
// isWithinInProgressWindow (unit-tested directly) plus a source-shape
// assertion, mirroring the pattern in workouts-delete-in-progress.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { GET } from '../../app/api/workouts/in-progress/route'
import { IN_PROGRESS_WINDOW_MS, isWithinInProgressWindow } from '../../lib/dayWindow'

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/workouts/in-progress?tz=300', {
    headers,
  })
}

test('GET /api/workouts/in-progress: no auth header → 401 (no DB touched)', async () => {
  const res = await GET(makeRequest())
  assert.equal(res.status, 401)
})

test('GET /api/workouts/in-progress: invalid JWT → 401 (no DB touched)', async () => {
  const res = await GET(makeRequest('Bearer garbage'))
  assert.equal(res.status, 401)
})

test('IN_PROGRESS_WINDOW_MS is a rolling 24h window', () => {
  assert.equal(IN_PROGRESS_WINDOW_MS, 24 * 60 * 60 * 1000)
})

test('isWithinInProgressWindow: accepts a log started a few minutes ago', () => {
  const now = new Date('2026-08-31T12:00:00.000Z')
  const startedRecently = new Date('2026-08-31T11:45:00.000Z')
  assert.equal(isWithinInProgressWindow(startedRecently, now), true)
})

test('isWithinInProgressWindow: accepts a log started just before midnight, checked just after', () => {
  const now = new Date('2026-08-31T00:10:00.000Z')
  const startedLastNight = new Date('2026-08-30T23:58:00.000Z')
  assert.equal(isWithinInProgressWindow(startedLastNight, now), true)
})

test('isWithinInProgressWindow: rejects a log older than the rolling window', () => {
  const now = new Date('2026-08-31T12:00:00.000Z')
  const stale = new Date('2026-08-29T12:00:00.000Z')
  assert.equal(isWithinInProgressWindow(stale, now), false)
})

test('isWithinInProgressWindow: rejects a quick session PLANNED for a future date', () => {
  // This is the reported bug: "Plan it" on the Calendar for tomorrow writes an
  // incomplete quick-session log dated tomorrow, immediately. It must not read
  // back as "in progress right now".
  const now = new Date('2026-08-31T12:00:00.000Z')
  const plannedForTomorrow = new Date('2026-09-01T12:00:00.000Z')
  assert.equal(isWithinInProgressWindow(plannedForTomorrow, now), false)
})

test('isWithinInProgressWindow: rejects a date even a few minutes in the future', () => {
  const now = new Date('2026-08-31T12:00:00.000Z')
  const soon = new Date('2026-08-31T12:05:00.000Z')
  assert.equal(isWithinInProgressWindow(soon, now), false)
})

test('isWithinInProgressWindow: accepts a log dated exactly now', () => {
  const now = new Date('2026-08-31T12:00:00.000Z')
  assert.equal(isWithinInProgressWindow(now, now), true)
})

test('the in-progress lookup is a rolling window, not the caller local calendar day', () => {
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'in-progress', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')

  // Must anchor "in progress" to the shared, both-sides-bounded window helper...
  assert.ok(
    src.includes('isWithinInProgressWindow'),
    'in-progress route must use isWithinInProgressWindow (bounded on both sides of now)',
  )
  // ...and must NOT reintroduce a caller-local-calendar-day boundary, which is
  // exactly the earlier bug: a log started at 11:58pm falls outside "today" a
  // couple of minutes later even though it is not remotely stale.
  assert.equal(
    src.includes('localDayWindowForKey') || src.includes('localDateKey('),
    false,
    'in-progress route must not scope resumability to the caller local calendar day',
  )
})
