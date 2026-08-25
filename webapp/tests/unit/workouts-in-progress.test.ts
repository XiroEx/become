// Run with: npx tsx --test tests/unit/workouts-in-progress.test.ts
//
// GET /api/workouts/in-progress drives the dashboard's "get back into the
// workout" pill. It used to scope an open log to the caller's local
// CALENDAR DAY, which discarded a workout started right before midnight the
// instant the clock rolled over — reported as the pill (and the workout)
// vanishing. Auth/validation branches are exercised directly (no DB touched);
// the rolling-window contract that replaced the calendar-day scoping is
// locked in with a source-shape assertion, mirroring the pattern in
// workouts-delete-in-progress.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { GET } from '../../app/api/workouts/in-progress/route'
import { IN_PROGRESS_WINDOW_MS } from '../../lib/dayWindow'

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

test('the in-progress lookup is a rolling window, not the caller local calendar day', () => {
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'in-progress', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')

  // Must anchor "in progress" to a rolling cutoff off real elapsed time...
  assert.ok(
    src.includes('IN_PROGRESS_WINDOW_MS') && src.includes('Date.now()'),
    'in-progress route must use a rolling Date.now()-based cutoff',
  )
  // ...and must NOT reintroduce a caller-local-calendar-day boundary, which is
  // exactly the bug: a log started at 11:58pm falls outside "today" a couple
  // of minutes later even though it is not remotely stale.
  assert.equal(
    src.includes('localDayWindowForKey') || src.includes('localDateKey('),
    false,
    'in-progress route must not scope resumability to the caller local calendar day',
  )
})
