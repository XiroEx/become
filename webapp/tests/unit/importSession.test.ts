// Run with: npx tsx --test tests/unit/importSession.test.ts
//
// normalizeImportedSession() flattens the same AI extraction importProgram.ts
// normalizes into a single quick session (no days/phases). resolveImportedSession()
// then turns parsed names into real DraftExercises against a caller-supplied
// name index, or lists them as unresolved rather than guessing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeImportedSession,
  resolveImportedSession,
  type ImportedSession,
  type ResolvableExercise,
} from '../../lib/quickSession/importSession'

test('a single-day workout flattens to one session with its exercises in order', () => {
  const result = normalizeImportedSession({
    name: 'My Program',
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1',
        focus: 'General',
        workouts: [
          {
            day: 'Day 1',
            title: 'Push',
            exercises: [
              { name: 'Bench Press', sets: 4, reps: '8', rest: '90s' },
              { name: 'Overhead Press', sets: 3, reps: '10' },
            ],
          },
        ],
      },
    ],
  })

  assert.ok(result)
  assert.equal(result?.title, 'Push')
  assert.equal(result?.exercises.length, 2)
  assert.equal(result?.exercises[0].name, 'Bench Press')
  assert.equal(result?.exercises[0].sets, 4)
  assert.equal(result?.exercises[1].name, 'Overhead Press')
})

test('multiple workouts/phases flatten into one session, deduped by name', () => {
  const result = normalizeImportedSession({
    name: 'Test',
    phases: [
      {
        workouts: [
          { day: 'Day 1', exercises: [{ name: 'Squat', sets: 3, reps: '5' }] },
          { day: 'Day 2', exercises: [{ name: 'Squat', sets: 5, reps: '5' }, { name: 'Deadlift', sets: 1, reps: '5' }] },
        ],
      },
    ],
  })

  assert.ok(result)
  assert.equal(result?.exercises.length, 2)
  assert.equal(result?.exercises[0].name, 'Squat')
  // First occurrence wins.
  assert.equal(result?.exercises[0].sets, 3)
  assert.equal(result?.exercises[1].name, 'Deadlift')
})

test('falls back to the program name when the workout title was defaulted', () => {
  const result = normalizeImportedSession({
    name: 'Leg Day Notes',
    phases: [{ workouts: [{ exercises: [{ name: 'Squat' }] }] }],
  })
  assert.equal(result?.title, 'Leg Day Notes')
})

test('falls back to "Imported Session" when nothing was stated at all', () => {
  const result = normalizeImportedSession({
    phases: [{ workouts: [{ exercises: [{ name: 'Squat' }] }] }],
  })
  assert.equal(result?.title, 'Imported Session')
})

test('nothing usable returns null, same as normalizeImportedProgram', () => {
  assert.equal(normalizeImportedSession(null), null)
  assert.equal(normalizeImportedSession({ name: 'Test', phases: [] }), null)
})

// ─── resolveImportedSession ─────────────────────────────────────────────────

function session(exercises: ImportedSession['exercises']): ImportedSession {
  return { title: 'My Session', exercises }
}

function library(entries: ResolvableExercise[]): Map<string, ResolvableExercise> {
  return new Map(entries.map((e) => [e.name.toLowerCase(), e]))
}

test('an exact name match resolves to a real DraftExercise', () => {
  const result = resolveImportedSession(
    session([{ name: 'Bench Press', sets: 4, reps: '8', rest: '90s' }]),
    library([{ slug: 'bench-press', name: 'Bench Press', trackingType: 'reps_weight' }]),
  )
  assert.equal(result.exercises.length, 1)
  assert.deepEqual(result.unresolved, [])
  assert.equal(result.exercises[0].exerciseSlug, 'bench-press')
  assert.equal(result.exercises[0].sets, 4)
  assert.equal(result.exercises[0].reps, '8')
  assert.equal(result.exercises[0].rest, '90s')
})

test('matching is case/whitespace-insensitive', () => {
  const result = resolveImportedSession(
    session([{ name: '  bench press  ' }]),
    library([{ slug: 'bench-press', name: 'Bench Press', trackingType: 'reps_weight' }]),
  )
  assert.equal(result.exercises.length, 1)
})

test('an unmatched name is listed as unresolved, not guessed at', () => {
  const result = resolveImportedSession(
    session([{ name: 'Zercher Squat' }]),
    library([{ slug: 'bench-press', name: 'Bench Press', trackingType: 'reps_weight' }]),
  )
  assert.equal(result.exercises.length, 0)
  assert.deepEqual(result.unresolved, ['Zercher Squat'])
})

test('missing sets/reps fall back to sane defaults for the matched tracking type', () => {
  const result = resolveImportedSession(
    session([{ name: 'Plank' }]),
    library([{ slug: 'plank', name: 'Plank', trackingType: 'time' }]),
  )
  assert.equal(result.exercises[0].sets, 3)
  assert.equal(result.exercises[0].reps, '') // time-based tracking has no rep count

  const result2 = resolveImportedSession(
    session([{ name: 'Squat' }]),
    library([{ slug: 'squat', name: 'Squat', trackingType: 'reps_weight' }]),
  )
  assert.equal(result2.exercises[0].reps, '8-12')
})

test('a duplicate parsed name resolving to the same exercise is not added twice', () => {
  const result = resolveImportedSession(
    session([{ name: 'Squat' }, { name: 'squat' }]),
    library([{ slug: 'squat', name: 'Squat', trackingType: 'reps_weight' }]),
  )
  assert.equal(result.exercises.length, 1)
  assert.deepEqual(result.unresolved, ['squat'])
})

test('does not mutate its inputs', () => {
  const s = session([{ name: 'Bench Press' }])
  const lib = library([{ slug: 'bench-press', name: 'Bench Press', trackingType: 'reps_weight' }])
  const snapshotSession = JSON.stringify(s)
  const snapshotLib = JSON.stringify(Array.from(lib.entries()))
  resolveImportedSession(s, lib)
  assert.equal(JSON.stringify(s), snapshotSession)
  assert.equal(JSON.stringify(Array.from(lib.entries())), snapshotLib)
})
