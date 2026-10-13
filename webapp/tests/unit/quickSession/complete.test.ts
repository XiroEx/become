// Run with: npm run test:file tests/unit/quickSession/complete.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCompleteSessionBody } from '../../../lib/quickSession/complete'

test('parseCompleteSessionBody rejects a missing or empty exercises array', () => {
  assert.equal(parseCompleteSessionBody(undefined).ok, false)
  assert.equal(parseCompleteSessionBody({}).ok, false)
  assert.equal(parseCompleteSessionBody({ exercises: [] }).ok, false)
  assert.equal(parseCompleteSessionBody({ exercises: 'squat' }).ok, false)
})

test('parseCompleteSessionBody preserves draft prescriptions and defaults omitted fields', () => {
  const parsed = parseCompleteSessionBody({
    exercises: [
      {
        exerciseSlug: 'back-squat',
        name: 'Back Squat',
        trackingType: 'reps_weight',
        sets: 5,
        reps: '3-5',
        rest: '180s',
        duration: '',
      },
      { exerciseSlug: 'custom-movement' },
    ],
    mode: 'finish',
    suggestionCount: 99,
    seed: 17,
  })

  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(parsed.value.exercises[0], {
    exerciseSlug: 'back-squat',
    name: 'Back Squat',
    trackingType: 'reps_weight',
    sets: 5,
    reps: '3-5',
    rest: '180s',
    duration: '',
  })
  assert.deepEqual(parsed.value.exercises[1], { exerciseSlug: 'custom-movement' })
  assert.equal(parsed.value.suggestionCount, 6)
  assert.equal(parsed.value.seed, 17)
})

test('parseCompleteSessionBody defaults finish mode and clamps suggestion count', () => {
  const defaulted = parseCompleteSessionBody({ exercises: [{ exerciseSlug: 'squat' }] })
  assert.equal(defaulted.ok, true)
  if (!defaulted.ok) return
  assert.equal(defaulted.value.mode, 'finish')
  assert.equal(defaulted.value.suggestionCount, 3)

  const clamped = parseCompleteSessionBody({ exercises: [{ exerciseSlug: 'squat' }], mode: 'suggest', suggestionCount: 0.9 })
  assert.equal(clamped.ok, true)
  if (!clamped.ok) return
  assert.equal(clamped.value.suggestionCount, 1)
})

test('parseCompleteSessionBody rejects malformed exercise and option fields', () => {
  assert.equal(parseCompleteSessionBody({ exercises: [{ exerciseSlug: '' }] }).ok, false)
  assert.equal(parseCompleteSessionBody({ exercises: [{ exerciseSlug: 'squat', sets: '3' }] }).ok, false)
  assert.equal(parseCompleteSessionBody({ exercises: [{ exerciseSlug: 'squat' }], mode: 'replace' }).ok, false)
  assert.equal(parseCompleteSessionBody({ exercises: [{ exerciseSlug: 'squat' }], equipment: ['barbell', 2] }).ok, false)
})
