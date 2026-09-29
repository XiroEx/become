// Run with: npm run test:file tests/unit/workoutAttemptId.test.ts
//
// The client half of "a workout save is safe to replay": every save of one
// attempt at a program day has to carry the SAME id, or the server has nothing
// to recognise a replay by. That means the id survives autosaves, the
// completing save, a retry of it, a flip between the Track and Live views and
// a reload — so it lives in storage, not in component state.
//
// Two things it must NOT do: reach across a finished workout (the next one on
// the same day label is a new attempt, and reusing the id would have the
// server rewrite the previous log), and reach back past the rolling window the
// server itself stops continuing an open log within.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ── localStorage shim (the helper is client-only) ────────────────────────────
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null }
  setItem(k: string, v: string) { this.map.set(k, String(v)) }
  removeItem(k: string) { this.map.delete(k) }
  clear() { this.map.clear() }
}
const memory = new MemoryStorage()
;(globalThis as { localStorage?: unknown }).localStorage = memory
;(globalThis as { window?: unknown }).window = { localStorage: memory }

import { workoutAttemptId, clearWorkoutAttemptId } from '../../lib/workout/attemptId'
import { IN_PROGRESS_WINDOW_MS } from '../../lib/dayWindow'

test('every save of one attempt gets the same id', () => {
  memory.clear()
  const first = workoutAttemptId('prog-1', 'Day 1')
  const autosave = workoutAttemptId('prog-1', 'Day 1')
  const completing = workoutAttemptId('prog-1', 'Day 1')

  assert.ok(first.length > 0)
  assert.equal(autosave, first)
  assert.equal(completing, first, 'a retry of the completing save must replay, not fork')
})

test('a different program day is a different attempt', () => {
  memory.clear()
  const dayOne = workoutAttemptId('prog-1', 'Day 1')
  const dayTwo = workoutAttemptId('prog-1', 'Day 2')
  const otherProgram = workoutAttemptId('prog-2', 'Day 1')

  assert.notEqual(dayTwo, dayOne)
  assert.notEqual(otherProgram, dayOne)
})

test('finishing the workout ends the attempt — the next one mints a new id', () => {
  memory.clear()
  const finished = workoutAttemptId('prog-1', 'Day 1')
  clearWorkoutAttemptId('prog-1', 'Day 1')
  const nextWeek = workoutAttemptId('prog-1', 'Day 1')

  assert.notEqual(
    nextWeek,
    finished,
    'reusing a finished attempt\'s id would have the server read the new workout as a replay of the old one',
  )
})

test('an id older than the server\'s in-progress window is not reused', () => {
  memory.clear()
  const start = Date.now()
  const original = workoutAttemptId('prog-1', 'Day 1', start)

  // Still inside the window the server continues an open log within…
  assert.equal(workoutAttemptId('prog-1', 'Day 1', start + IN_PROGRESS_WINDOW_MS - 60_000), original)
  // …and past it, where the server would start a new log anyway.
  assert.notEqual(workoutAttemptId('prog-1', 'Day 1', start + IN_PROGRESS_WINDOW_MS + 60_000), original)
})

test('a corrupt stored value is replaced, not thrown on', () => {
  memory.clear()
  memory.setItem('workout_attempt_prog-1_Day 1', '{not json')
  const id = workoutAttemptId('prog-1', 'Day 1')
  assert.ok(id.length > 0)
  assert.equal(workoutAttemptId('prog-1', 'Day 1'), id, 'and the replacement is then stable')
})

// ── The views that have to send it ───────────────────────────────────────────
//
// The server can only dedupe saves that carry the id, so the web entry points
// that save a PROGRAM workout must attach one. Quick sessions are excluded on
// purpose: they are already keyed by `sessionId`.

function readSource(...parts: string[]): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8')
}

test('the live view sends the attempt id on its program saves and clears it on completion', () => {
  const src = readSource('app', 'dashboard', 'workout', '[programId]', 'workout', 'live', 'LiveWorkoutClient.tsx')
  assert.match(src, /attemptId: workoutAttemptId\(programId, workout\.day\)/)
  assert.match(src, /clearWorkoutAttemptId\(programId, workout\.day\)/)
})

test('the Track view sends the attempt id on its program saves and clears it on completion', () => {
  const src = readSource('app', 'dashboard', 'workout', '[programId]', 'workout', 'WorkoutFormClient.tsx')
  assert.match(src, /attemptId: workoutAttemptId\(programId, workout\.day\)/)
  assert.match(src, /clearWorkoutAttemptId\(programId, workout\.day\)/)
})
