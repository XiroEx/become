// Run with: npx tsx --test tests/unit/importProgram.test.ts
//
// normalizeImportedProgram() is the seam between the AI's best-effort JSON
// (workoutImportText / workoutImportPhoto — a small model, prone to missing
// fields, wrong types, or nothing usable at all) and ProgramCreator's
// initialProgram prop. It must defensively coerce or reject, never crash or
// pass through data ProgramCreator can't render.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeImportedProgram, flagImportedProgram, type ImportedProgram } from '../../lib/workout/importProgram'

test('a well-formed program passes through with its own values', () => {
  const result = normalizeImportedProgram({
    name: 'My Push Pull Legs',
    description: 'From my notes app',
    goal: 'Build muscle',
    duration_weeks: 8,
    training_days_per_week: 3,
    target_user: 'Advanced',
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1-8',
        focus: 'Hypertrophy',
        workouts: [
          {
            day: 'Day 1',
            title: 'Push',
            exercises: [
              { name: 'Bench Press', sets: 4, reps: '8', rest: '90s' },
              { name: 'Overhead Press', sets: 3, reps: '10', rest: '60s' },
            ],
          },
        ],
      },
    ],
  })

  assert.ok(result)
  assert.equal(result?.name, 'My Push Pull Legs')
  assert.equal(result?.duration_weeks, 8)
  assert.equal(result?.training_days_per_week, 3)
  assert.equal(result?.target_user, 'Advanced')
  assert.equal(result?.phases.length, 1)
  assert.equal(result?.phases[0].workouts[0].exercises.length, 2)
  assert.equal(result?.phases[0].workouts[0].exercises[0].name, 'Bench Press')
})

test('empty phases (nothing found in the input) returns null', () => {
  assert.equal(normalizeImportedProgram({ name: '', phases: [] }), null)
})

test('non-object input returns null instead of throwing', () => {
  assert.equal(normalizeImportedProgram(null), null)
  assert.equal(normalizeImportedProgram(undefined), null)
  assert.equal(normalizeImportedProgram('not a program'), null)
  assert.equal(normalizeImportedProgram(42), null)
})

test('exercises missing a name are dropped, not kept as blanks', () => {
  const result = normalizeImportedProgram({
    name: 'Test',
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1',
        focus: 'General',
        workouts: [
          {
            day: 'Day 1',
            title: 'Full Body',
            exercises: [
              { name: 'Squat', sets: 3, reps: '5' },
              { name: '', sets: 3, reps: '5' },
              { sets: 3, reps: '5' },
            ],
          },
        ],
      },
    ],
  })

  assert.ok(result)
  assert.equal(result?.phases[0].workouts[0].exercises.length, 1)
  assert.equal(result?.phases[0].workouts[0].exercises[0].name, 'Squat')
})

test('a workout with no valid exercises is dropped from its phase', () => {
  const result = normalizeImportedProgram({
    name: 'Test',
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1',
        focus: 'General',
        workouts: [
          { day: 'Day 1', title: 'Empty', exercises: [] },
          {
            day: 'Day 2',
            title: 'Legs',
            exercises: [{ name: 'Squat', sets: 3, reps: '5' }],
          },
        ],
      },
    ],
  })

  assert.ok(result)
  assert.equal(result?.phases[0].workouts.length, 1)
  assert.equal(result?.phases[0].workouts[0].day, 'Day 2')
})

test('a phase left with no workouts (all exercise-less) is dropped entirely', () => {
  const result = normalizeImportedProgram({
    name: 'Test',
    phases: [
      { phase: 'Phase 1', weeks: '1', focus: 'General', workouts: [{ day: 'Day 1', title: 'Empty', exercises: [] }] },
    ],
  })
  assert.equal(result, null)
})

test('missing top-level fields fall back to sane defaults', () => {
  const result = normalizeImportedProgram({
    phases: [
      {
        workouts: [
          { exercises: [{ name: 'Push-up' }] },
          { exercises: [{ name: 'Pull-up' }] },
        ],
      },
    ],
  })

  assert.ok(result)
  assert.equal(result?.name, 'Imported Program')
  assert.equal(result?.duration_weeks, 4)
  // Falls back to the first phase's workout count when unstated.
  assert.equal(result?.training_days_per_week, 2)
  assert.equal(result?.target_user, 'Intermediate')
  assert.equal(result?.phases[0].phase, 'Phase 1')
  assert.equal(result?.phases[0].weeks, '1')
  assert.equal(result?.phases[0].focus, 'General')
  assert.equal(result?.phases[0].workouts[0].day, 'Day 1')
  assert.equal(result?.phases[0].workouts[1].day, 'Day 2')
})

test('an invalid target_user string falls back to Intermediate instead of leaking through', () => {
  const result = normalizeImportedProgram({
    name: 'Test',
    target_user: 'Superhuman',
    phases: [{ workouts: [{ exercises: [{ name: 'Squat' }] }] }],
  })
  assert.equal(result?.target_user, 'Intermediate')
})

test('non-numeric duration/day counts fall back instead of propagating NaN', () => {
  const result = normalizeImportedProgram({
    name: 'Test',
    duration_weeks: 'a lot',
    training_days_per_week: null,
    phases: [{ workouts: [{ exercises: [{ name: 'Squat' }] }] }],
  })
  assert.equal(result?.duration_weeks, 4)
  assert.equal(result?.training_days_per_week, 1)
})

test('exercise fields of the wrong type are dropped rather than coerced', () => {
  const result = normalizeImportedProgram({
    name: 'Test',
    phases: [
      {
        workouts: [
          { exercises: [{ name: 'Squat', sets: '3 sets', reps: 5, rest: 90 }] },
        ],
      },
    ],
  })
  const ex = result?.phases[0].workouts[0].exercises[0]
  assert.equal(ex?.name, 'Squat')
  assert.equal(ex?.sets, undefined) // 'sets' must be a number — string is dropped
  assert.equal(ex?.reps, undefined) // 'reps' must be a string — number is dropped
  assert.equal(ex?.rest, undefined) // 'rest' must be a string — number is dropped
})

// flagImportedProgram — review flags shown in the import UI before saving.

function programWithExercises(
  exercises: Array<{ name: string; sets?: number; reps?: string; rest?: string; details?: string }>,
): ImportedProgram {
  return {
    name: 'Test',
    description: '',
    goal: 'Follow my own program',
    duration_weeks: 4,
    training_days_per_week: 1,
    target_user: 'Intermediate',
    phases: [
      {
        phase: 'Phase 1',
        weeks: '1',
        focus: 'General',
        workouts: [{ day: 'Day 1', title: 'Full Body', exercises }],
      },
    ],
  }
}

function flagsFor(program: ImportedProgram, known: Set<string> = new Set()) {
  const flagged = flagImportedProgram(program, known)
  return flagged.phases[0].workouts[0].exercises.map((e) => e.importFlags ?? [])
}

test('a fully-specified, library-known exercise gets no flags', () => {
  const program = programWithExercises([{ name: 'Bench Press', sets: 4, reps: '8', rest: '90s' }])
  const [flags] = flagsFor(program, new Set(['bench press']))
  assert.deepEqual(flags, [])
})

test('a name absent from the known-exercise set is flagged new', () => {
  const program = programWithExercises([{ name: 'Zercher Squat', sets: 3, reps: '5', rest: '2min' }])
  const [flags] = flagsFor(program, new Set(['bench press']))
  assert.deepEqual(flags, ['new'])
})

test('matching is case/whitespace-insensitive against the known set', () => {
  const program = programWithExercises([{ name: '  Bench Press  ', sets: 4, reps: '8' }])
  const [flags] = flagsFor(program, new Set(['bench press']))
  assert.deepEqual(flags, [])
})

test('an exercise with no sets/reps/rest/details is flagged broken', () => {
  const program = programWithExercises([{ name: 'Bench Press' }])
  const [flags] = flagsFor(program, new Set(['bench press']))
  assert.deepEqual(flags, ['broken'])
})

test('an exercise with details but no sets/reps counts as specified, not broken', () => {
  const program = programWithExercises([{ name: 'Plank', details: '3 rounds, 45s hold' }])
  const [flags] = flagsFor(program, new Set(['plank']))
  assert.deepEqual(flags, [])
})

test('a too-short name is flagged broken regardless of other fields', () => {
  const program = programWithExercises([{ name: 'X', sets: 3, reps: '10' }])
  const [flags] = flagsFor(program, new Set())
  assert.ok(flags.includes('broken'))
})

test('a leading superset-style label flags grouped', () => {
  const program = programWithExercises([
    { name: 'A1. Bench Press', sets: 4, reps: '8' },
    { name: '1b) Bent-Over Row', sets: 4, reps: '8' },
    { name: 'B2: Lat Pulldown', sets: 3, reps: '12' },
  ])
  const flags = flagsFor(program, new Set(['bench press', 'bent-over row', 'lat pulldown']))
  assert.ok(flags[0].includes('grouped'), 'A1. prefix should flag grouped')
  assert.ok(flags[1].includes('grouped'), '1b) prefix should flag grouped')
  assert.ok(flags[2].includes('grouped'), 'B2: prefix should flag grouped')
})

test('the word "superset" in details flags grouped even without a label prefix', () => {
  const program = programWithExercises([
    { name: 'Bench Press', sets: 4, reps: '8', details: 'Superset with Row' },
  ])
  const [flags] = flagsFor(program, new Set(['bench press']))
  assert.ok(flags.includes('grouped'))
})

test('an ordinary exercise name is not mistaken for a group label', () => {
  const program = programWithExercises([
    { name: 'Bench Press', sets: 4, reps: '8' },
    { name: '5k Run', sets: undefined, reps: undefined, details: 'easy pace' },
  ])
  const flags = flagsFor(program, new Set(['bench press', '5k run']))
  assert.deepEqual(flags[0], [])
  assert.ok(!flags[1].includes('grouped'), '"5k Run" should not trigger the group heuristic')
})

test('a clean exercise can still carry multiple flags at once', () => {
  const program = programWithExercises([{ name: 'A1. Zercher Squat' }])
  const [flags] = flagsFor(program, new Set())
  assert.deepEqual(new Set(flags), new Set(['new', 'broken', 'grouped']))
})

test('flagImportedProgram does not mutate its input', () => {
  const program = programWithExercises([{ name: 'Bench Press', sets: 4, reps: '8' }])
  const snapshotBefore = JSON.stringify(program)
  flagImportedProgram(program, new Set())
  assert.equal(JSON.stringify(program), snapshotBefore)
})
