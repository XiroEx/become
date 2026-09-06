// Run with: npm run test:file tests/unit/quickSession/plan-not-started.test.ts
//
// Bug: planning a quick session for today (Workout Overview → "Plan it") made
// the dashboard show it as "ACTIVE · <title> / Get back into the workout" —
// as if the member were already mid-workout, when they had only scheduled it.
// GET /api/workouts/in-progress now requires the log to carry `startedAt`
// (see workouts-in-progress.test.ts for the route-side assertions); this file
// locks in that every client call site sends the right `started` flag so
// that gate actually does something:
//   - a plan-only save (today or future, never opened live) sends
//     `started: false`, so the inserted/updated log has no startedAt.
//   - opening/continuing the live view sends `started: true`, so a
//     previously-planned session becomes genuinely resumable the moment it's
//     actually started.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..', '..', '..')
function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('quick-session overview "Plan it" / "Log it" forwards started: done', () => {
  const src = readSource('app/dashboard/workout/quick-session/page.tsx')
  // saveLog(title, done) backs both logAsDone() (done: true) and
  // planForLater() (done: false) — done already means "is this genuinely
  // performed", so the save body should reuse it verbatim for `started`.
  assert.match(
    src,
    /started:\s*done,/,
    'planForLater (done: false) must send started: false so a same-day/future plan has no startedAt',
  )
})

test('SessionBuilder\'s plan/log path (logQuickSession) forwards started: done', () => {
  const src = readSource('lib/quickSession/log.ts')
  assert.match(
    src,
    /started:\s*done,/,
    'planning a future session via SessionBuilder must send started: false — otherwise startedAt gets set at plan time and the bug reappears the moment the planned date arrives',
  )
})

test('the live workout view always sends started: true for a quick session save', () => {
  const src = readSource('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
  const start = src.indexOf('const saveBody = isQuick && quickSessionId')
  assert.ok(start !== -1, 'could not locate the quick-session saveBody')
  const quickBody = src.slice(start, start + 1100)
  assert.match(
    quickBody,
    /started:\s*true,/,
    'every live-view save (the instant-persist-on-open save and every autosave after) must send started: true so a planned session becomes resumable once actually opened',
  )
})
