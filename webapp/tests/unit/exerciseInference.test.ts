// Run with: npm run test:file tests/unit/exerciseInference.test.ts
//
// Card: "Put as much data as possible for them and flag what needs to be
// flagged." These pin what a name is allowed to tell us — and, just as
// importantly, what it is not: an unrecognised name gets a blank
// classification, never a guessed muscle.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inferExerciseFields } from '../../lib/exerciseInference'

test('a sled push is strongman, sled-loaded, and measured in time and distance', () => {
  const f = inferExerciseFields('Sled Push')
  assert.equal(f.category, 'strongman')
  assert.equal(f.trackingType, 'time_distance')
  assert.deepEqual(f.equipment, ['sled'])
  assert.deepEqual(f.primaryMuscles, ['quads', 'glutes'])
  assert.equal(f.bodyRegion, 'lower_body')
  assert.equal(f.mechanics, 'compound')
})

test('shorthand is read before anything else — "DB RDL" is a hinge', () => {
  const f = inferExerciseFields('DB RDL')
  assert.deepEqual(f.movementPatterns, ['hinge'])
  assert.deepEqual(f.primaryMuscles, ['hamstrings', 'glutes'])
  assert.deepEqual(f.equipment, ['dumbbell'])
})

test('the narrow phrase wins over the broad one it contains', () => {
  assert.deepEqual(inferExerciseFields('Seated Leg Curl').primaryMuscles, ['hamstrings'])
  assert.deepEqual(inferExerciseFields('Barbell Curl').primaryMuscles, ['biceps'])
  assert.deepEqual(inferExerciseFields('Hammer Curl').primaryMuscles, ['brachialis', 'biceps'])
  assert.deepEqual(inferExerciseFields('Standing Calf Raise').primaryMuscles, ['calves'])
  assert.deepEqual(inferExerciseFields('Cable Lateral Raise').primaryMuscles, ['side_delts'])
})

test('a hold is tracked in time, a rest in nothing at all', () => {
  assert.equal(inferExerciseFields('Plank').trackingType, 'time')
  assert.equal(inferExerciseFields('Side Plank').primaryMuscles[0], 'obliques')
  const rest = inferExerciseFields('Rest')
  assert.equal(rest.trackingType, 'none')
  assert.equal(rest.category, 'cooldown')
  assert.equal(rest.laterality, 'n/a')
})

test('single-arm and alternating work is read off the name', () => {
  assert.equal(inferExerciseFields('Single-Arm Cable Row').laterality, 'unilateral')
  assert.equal(inferExerciseFields('Alternating Dumbbell Curl').laterality, 'alternating')
  assert.equal(inferExerciseFields('Barbell Row').laterality, 'bilateral')
})

test('isolation work is tagged as accessory, compound work as compound', () => {
  const curl = inferExerciseFields('Preacher Curl')
  assert.equal(curl.mechanics, 'isolation')
  assert.equal(curl.role, 'accessory')

  const squat = inferExerciseFields('Barbell Back Squat')
  assert.equal(squat.mechanics, 'compound')
  assert.equal(squat.role, 'compound')
})

test('machines and bars are recognised as equipment', () => {
  assert.deepEqual(inferExerciseFields('Leg Press').equipment, ['leg_press'])
  assert.deepEqual(inferExerciseFields('EZ-Bar Curl').equipment, ['ez_bar'])
  assert.deepEqual(inferExerciseFields('Trap Bar Deadlift').equipment, ['trap_bar'])
  assert.deepEqual(inferExerciseFields('Kettlebell Swing').equipment, ['kettlebell'])
})

test('a body-part spread across regions is full body', () => {
  assert.equal(inferExerciseFields('Burpee').bodyRegion, 'full_body')
  assert.equal(inferExerciseFields('Up-Downs').category, 'conditioning')
  assert.equal(inferExerciseFields('Ab Circuit').category, 'conditioning')
})

// ─── the floor, and why it is blank ───────────────────────────────────────

test('an unrecognised name gets no muscles and no patterns, not a guess', () => {
  const f = inferExerciseFields('Serve The Plate')
  assert.equal(f.category, 'strength')
  assert.deepEqual(f.primaryMuscles, [])
  assert.deepEqual(f.secondaryMuscles, [])
  assert.deepEqual(f.movementPatterns, [])
  assert.equal(f.mechanics, 'n/a')
  assert.equal(f.bodyRegion, 'full_body')
})

test('every field comes back set, so a minted row is never half-built', () => {
  for (const name of ['Sled Push', 'Rest', 'Up-Downs', 'Something Nobody Has Heard Of']) {
    const f = inferExerciseFields(name)
    for (const [key, value] of Object.entries(f)) {
      assert.notEqual(value, undefined, `${name}: ${key} is undefined`)
    }
    assert.ok(f.category, `${name}: no category`)
    assert.ok(f.bodyRegion, `${name}: no bodyRegion`)
    assert.ok(f.trackingType, `${name}: no trackingType`)
  }
})

test('a name that is only rep-scheme noise does not crash', () => {
  const f = inferExerciseFields('3x10')
  assert.equal(f.category, 'strength')
  assert.deepEqual(f.primaryMuscles, [])
})
