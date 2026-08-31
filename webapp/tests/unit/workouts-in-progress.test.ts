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
//
// Neither fix covered a quick session planned for TODAY: its date already
// satisfies the window (today isn't the future), so "Plan it" for later the
// same day still showed the pill worded "Get back into the workout" for a
// session nobody had opened yet. Fixed by requiring `startedAt` — only
// written once the live view is genuinely engaged (see IWorkoutLog.startedAt
// and the `started` field on POST /api/workouts) — in addition to the
// existing completed/window checks.
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

// ── Same-day "Plan it" must not read back as "in progress" ────────────────
//
// A quick session planned for TODAY has a `date` that already satisfies
// isWithinInProgressWindow (it isn't in the future), so the window check
// alone can't tell "planned for later today" apart from "genuinely mid-
// workout right now". `startedAt` is the extra signal: it's only present
// once the live view has actually been opened (see the `started` field on
// POST /api/workouts and IWorkoutLog.startedAt).

test('the in-progress lookup requires startedAt, not just completed:false + window', () => {
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'in-progress', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')
  const filterStart = src.indexOf('const open = logs')
  assert.ok(filterStart !== -1, 'could not locate the open-log filter')
  const filterSrc = src.slice(filterStart, filterStart + 300)

  assert.match(
    filterSrc,
    /startedAt\s*!=\s*null/,
    'a same-day plan (completed:false, date within window, no startedAt) must be excluded — that is exactly the reported bug: "Plan it" for today showing as an in-progress workout',
  )
})

test('handleQuickSessionSave: a plan-only insert (started: false) omits startedAt entirely', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'route.ts'), 'utf8')
  const start = src.indexOf('async function handleQuickSessionSave')
  assert.ok(start !== -1)
  const fn = src.slice(start, start + 4500)

  const pushIdx = fn.indexOf('$push: {')
  assert.ok(pushIdx !== -1, 'could not locate the insert $push')
  const insertClause = fn.slice(pushIdx, pushIdx + 800)
  assert.match(
    insertClause,
    /\.\.\.\(started !== false && \{ startedAt: workoutDate \}\)/,
    'the insert branch must only set startedAt when the caller did not explicitly say started: false',
  )
})

test('handleQuickSessionSave: an update only stamps startedAt on explicit started: true, never on a plan edit', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'route.ts'), 'utf8')
  const start = src.indexOf('async function handleQuickSessionSave')
  assert.ok(start !== -1)
  const fn = src.slice(start, start + 4500)

  const setIdx = fn.indexOf('$set: {')
  const pushIdx = fn.indexOf('$push: {')
  assert.ok(setIdx !== -1 && pushIdx !== -1 && setIdx < pushIdx)
  const updateClause = fn.slice(setIdx, pushIdx)

  assert.match(
    updateClause,
    /\.\.\.\(started === true && \{ 'workoutLogs\.\$\[elem\]\.startedAt': workoutDate \}\)/,
    'an update must gate startedAt on started === true — an edit to an existing plan (which sends neither started nor performedAt) must leave a never-started log without startedAt, or editing it would wake it up as "in progress"',
  )
})

test('the calendar re-date (PATCH /api/workouts/session) must not stamp startedAt', () => {
  // Otherwise dragging a never-started planned quick session onto today (or
  // any past day) would reproduce the exact same bug via a different path.
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'session', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')
  const dateSetIdx = src.indexOf("set['workoutLogs.$[elem].date'] = d")
  assert.ok(dateSetIdx !== -1, 'could not locate the re-date assignment')
  assert.equal(
    src.includes("set['workoutLogs.$[elem].startedAt']"),
    false,
    'PATCH /api/workouts/session must never assign workoutLogs.$[elem].startedAt',
  )
})
