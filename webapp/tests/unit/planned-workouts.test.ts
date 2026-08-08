import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapPlannedLog, type RawLog } from '../../lib/quickSession/planned'

const future = '2099-01-01T12:00:00.000Z'

function map(exercises: RawLog['exercises'], trackingTypes: ReadonlyMap<string, unknown> = new Map()) {
  return mapPlannedLog(
    {
      kind: 'quick',
      sessionId: 'planned-1',
      date: future,
      completed: false,
      exercises,
    },
    trackingTypes,
  ).exercises
}

test('catalog trackingType wins and logged weight is carried through', () => {
  const [exercise] = map(
    [{
      name: 'Weighted Pull-Up',
      exerciseSlug: 'weighted-pull-up',
      sets: [{ reps: 5, weight: 25, completed: false }],
    }],
    new Map([['weighted-pull-up', 'reps_bodyweight']]),
  )

  assert.equal(exercise.trackingType, 'reps_bodyweight')
  assert.equal(exercise.weight, '25')
  assert.equal(exercise.reps, '5')
})

test('duration-shaped input falls back to the valid time enum', () => {
  const [exercise] = map([{
    name: 'Plank',
    exerciseSlug: 'missing-plank',
    sets: [{ duration: 45, completed: false }],
  }])

  assert.equal(exercise.trackingType, 'time')
})

test('rep-shaped slug-less and unknown-slug inputs fall back to reps_weight', () => {
  const [slugless, unknown] = map([
    { name: 'Custom Lift', sets: [{ reps: 8, weight: 50, completed: false }] },
    { name: 'Unknown Lift', exerciseSlug: 'not-in-catalog', sets: [{ reps: 6, completed: false }] },
  ])

  assert.equal(slugless.trackingType, 'reps_weight')
  assert.equal(unknown.trackingType, 'reps_weight')
  assert.equal(slugless.weight, '50')
})

test('invalid catalog values still fall back to an enum member', () => {
  const [exercise] = map(
    [{ name: 'Bench Press', exerciseSlug: 'bench-press', sets: [{ reps: 5 }] }],
    new Map([['bench-press', 'reps']]),
  )

  assert.equal(exercise.trackingType, 'reps_weight')
  assert.notEqual(exercise.trackingType, 'reps')
})
