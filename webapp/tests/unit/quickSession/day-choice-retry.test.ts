// Run with: npm run test:file tests/unit/quickSession/day-choice-retry.test.ts
//
// Exiting the naming prompt has to file the workout under the day it was
// actually done. For a session that crossed midnight that day is the one the
// member picked in the day-choice modal, carried to the server as
// `performedAt` from `logDateOverrideRef`.
//
// The ref used to be read AND cleared while the request body was being built,
// before the request was sent. So a completing save that failed consumed the
// choice anyway, and the naming prompt — which deliberately stays open on a
// failure so the member can retry — sent the retry with no `performedAt` at
// all. The server then dated the log to whenever the retry happened: a session
// finished after midnight and assigned to yesterday came back named
// "9/9/26 workout" and filed under 9/10, which is the exact mismatch this
// whole flow exists to prevent.
//
// There is no jsdom in this repo and `saveWorkout` lives inside a ~2,900-line
// client component, so what is pinned here is the ORDER of the three points
// that make the retry correct: read the choice, send it, and only consume it
// once the server has accepted the save. A regression moves the consume back
// above the fetch, and that is what these tests fail on.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const LIVE = join(__dirname, '../../..', 'app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
const source = readFileSync(LIVE, 'utf8')

/**
 * The body of `saveWorkout`, so an occurrence somewhere else in the file (the
 * ref's declaration, resolveDayChoice's assignment) cannot satisfy an
 * assertion about this function.
 */
function saveWorkoutBody(): string {
  const start = source.indexOf('const saveWorkout = useCallback(async (')
  assert.notEqual(start, -1, 'saveWorkout is no longer declared as a useCallback')
  const end = source.indexOf('\n  // Save immediately when user leaves the app', start)
  assert.notEqual(end, -1, 'could not find the end of saveWorkout')
  return source.slice(start, end)
}

const body = saveWorkoutBody()

const readAt = body.indexOf('const logDateOverride = isComplete ? logDateOverrideRef.current : null;')
const fetchAt = body.indexOf('await fetch("/api/workouts"')
const notOkAt = body.indexOf('if (!res.ok) return false;')
const clearAt = body.indexOf('logDateOverrideRef.current = null;')

test('the day choice is read before the request is built', () => {
  assert.notEqual(readAt, -1, 'saveWorkout no longer reads the day-choice override')
  assert.notEqual(fetchAt, -1, 'saveWorkout no longer POSTs to /api/workouts')
  assert.ok(readAt < fetchAt, 'the day choice must be read before the request is sent')
})

test('the day choice is still what gets sent as performedAt', () => {
  // Both bodies — a quick session and a program day — carry it.
  assert.equal(
    body.split('...(logDateOverride && { performedAt: logDateOverride }),').length - 1,
    2,
    'performedAt is no longer sent from the day-choice override on both save bodies',
  )
})

test('the day choice is consumed only after the server accepted the save', () => {
  assert.notEqual(clearAt, -1, 'saveWorkout never clears the day-choice override')
  assert.notEqual(notOkAt, -1, 'saveWorkout no longer checks the response before succeeding')
  assert.ok(
    clearAt > notOkAt,
    'the day-choice override must survive a failed completing save: clearing it before the '
      + 'response is checked leaves a retry with no performedAt, and the server re-dates the '
      + 'workout to the day the retry happened',
  )
  // Only ever consumed on a completing save, so an auto-save cannot eat it.
  assert.match(body.slice(clearAt - 40, clearAt + 40), /if \(isComplete\) logDateOverrideRef\.current = null;/)
})

test('the override is consumed exactly once', () => {
  assert.equal(
    body.split('logDateOverrideRef.current = null').length - 1,
    1,
    'a second consume in saveWorkout would put the clear back in front of the response check',
  )
})

test('the naming prompt is still reachable for the retry it protects', () => {
  // The prompt stays mounted on a failed save (it surfaces the error and
  // re-enables its buttons), so the retry this file is about is a real path
  // and not a hypothetical one.
  const prompt = readFileSync(join(__dirname, '../../..', 'components/workout/QuickSessionNamePrompt.tsx'), 'utf8')
  assert.match(prompt, /setError\([^)]*\)\n\s*setSkipping\(false\)/)
  assert.match(prompt, /setError\([^)]*\)\n\s*setSaving\(false\)/)
  // And the finish path reports failure rather than closing over it.
  assert.match(source, /if \(!saved\) throw new Error\("Could not finish the workout\. Try again\."\);/)
})
