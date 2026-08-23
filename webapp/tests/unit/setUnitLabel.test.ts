// Run with: npx tsx --test tests/unit/setUnitLabel.test.ts
//
// A member created "Stairmaster" as a `time` tracking exercise (PR #922 fixed
// the picker itself), then immediately hit a second bug: every surface that
// prescribes or logs a "how many" count for an exercise said "Sets" no matter
// what tracking type was picked — "3 Sets, 45 Seconds" for a stopwatch cardio
// machine reads like sets of reps that don't exist. "Pretty sure it says
// 'sets' for anything I pick and that doesn't make sense to me."
//
// setUnitLabel() is the one place that now decides the word: "Set" for
// counted work (reps_weight / reps_bodyweight / reps_only), "Round" for timed
// work (time / time_distance / intervals) — reusing the vocabulary the live
// workout screen already had for intervals ("Round N"), just no longer
// limited to that one tracking type.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

import { setUnitLabel, tracksTime } from '@/lib/workout/tracking'

const ROOT = path.join(__dirname, '../..')

describe('setUnitLabel', () => {
  it('says "Set(s)" for counted work', () => {
    assert.equal(setUnitLabel('reps_weight', 3), 'Sets')
    assert.equal(setUnitLabel('reps_weight', 1), 'Set')
    assert.equal(setUnitLabel('reps_bodyweight', 3), 'Sets')
    assert.equal(setUnitLabel('reps_only', 3), 'Sets')
  })

  it('says "Round(s)" for timed work — including plain "time", not just intervals', () => {
    assert.equal(setUnitLabel('time', 3), 'Rounds')
    assert.equal(setUnitLabel('time', 1), 'Round')
    assert.equal(setUnitLabel('time_distance', 3), 'Rounds')
    assert.equal(setUnitLabel('intervals', 3), 'Rounds')
  })

  it('falls back to "Set(s)" for an unset/unknown tracking type, matching the app default', () => {
    assert.equal(setUnitLabel(undefined, 3), 'Sets')
    assert.equal(setUnitLabel(null, 3), 'Sets')
    assert.equal(setUnitLabel('none', 3), 'Sets')
  })

  it('agrees with tracksTime() on which types are timed — no type is timed for one and counted for the other', () => {
    const allTypes = ['reps_weight', 'reps_bodyweight', 'reps_only', 'time', 'time_distance', 'intervals', 'none']
    for (const t of allTypes) {
      const timed = tracksTime(t)
      const label = setUnitLabel(t, 3)
      assert.equal(label, timed ? 'Rounds' : 'Sets', `mismatch for tracking type "${t}"`)
    }
  })
})

// ─── Regression: every surface that used to hardcode "Sets"/"sets" now asks
// setUnitLabel instead ─────────────────────────────────────────────────────

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

const SURFACES_WIRED_TO_SET_UNIT_LABEL = [
  'components/workout/AddExerciseSheet.tsx',
  'components/SessionBuilder.tsx',
  'components/workout/SessionEditor.tsx',
  'app/dashboard/workout/library/ExerciseLibraryClient.tsx',
  'app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx',
  'app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx',
  // ExerciseSwapModal's own "Default Sets" field moved into the shared
  // create/edit form below — it no longer computes the label itself.
  'components/workout/CustomExerciseFields.tsx',
]

describe('REGRESSION: create/prescribe/log surfaces no longer hardcode a "Sets" label', () => {
  for (const file of SURFACES_WIRED_TO_SET_UNIT_LABEL) {
    it(`${file} derives its sets/rounds wording from setUnitLabel()`, () => {
      const src = readSource(file)
      assert.match(
        src,
        /setUnitLabel\(/,
        `expected ${file} to compute its count label via setUnitLabel() instead of a literal "Sets" string`,
      )
    })
  }

  it('AddExerciseSheet no longer hardcodes label="Sets" on the count stepper', () => {
    const src = readSource('components/workout/AddExerciseSheet.tsx')
    assert.doesNotMatch(src, /label="Sets"/, 'still hardcodes label="Sets" regardless of trackingType')
  })

  it('SessionBuilder no longer hardcodes the pluralized "set(s)" chip text', () => {
    const src = readSource('components/SessionBuilder.tsx')
    assert.doesNotMatch(
      src,
      /set\{ex\.sets !== 1 \? "s" : ""\}/,
      'still hardcodes "set(s)" wording regardless of trackingType',
    )
  })

  it('the exercise-definition forms (library + swap modal + the shared create/edit fields) no longer hardcode "Default Sets"', () => {
    for (const file of [
      'app/dashboard/workout/library/ExerciseLibraryClient.tsx',
      'components/ExerciseSwapModal.tsx',
      'components/workout/CustomExerciseFields.tsx',
    ]) {
      const src = readSource(file)
      assert.doesNotMatch(
        src,
        />Default Sets</,
        `${file} still hardcodes the "Default Sets" label regardless of trackingType`,
      )
    }
  })

  it('the live workout and track view no longer say "Skip Set?" unconditionally', () => {
    for (const file of [
      'app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx',
      'app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx',
    ]) {
      const src = readSource(file)
      assert.doesNotMatch(
        src,
        />\s*Skip Set\?\s*</,
        `${file} still hardcodes "Skip Set?" regardless of trackingType`,
      )
    }
  })
})
