// Run with: npm run test:file tests/unit/stampWeightUnit.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stampSetWeightUnit } from '../../lib/workout/stampWeightUnit'

test('stamps weightUnit AND unit onto every set, leaving other fields alone', () => {
  const exercises = [
    { name: 'Bench Press', exerciseSlug: 'bench-press', sets: [{ weight: 135, reps: 5, completed: true }] },
  ]
  const out = stampSetWeightUnit(exercises, 'kg')
  assert.equal(out[0].name, 'Bench Press')
  assert.equal(out[0].exerciseSlug, 'bench-press')
  assert.deepEqual(out[0].sets[0], { weight: 135, reps: 5, completed: true, weightUnit: 'kg', unit: 'kg' })
})

test('defaults to lbs when the caller passes lbs', () => {
  const out = stampSetWeightUnit([{ sets: [{ weight: 100, completed: true }] }], 'lbs')
  assert.equal(out[0].sets[0].weightUnit, 'lbs')
  assert.equal(out[0].sets[0].unit, 'lbs')
})

test('tolerates null/missing sets and a null/undefined exercises array', () => {
  assert.deepEqual(stampSetWeightUnit(null, 'lbs'), [])
  assert.deepEqual(stampSetWeightUnit(undefined, 'lbs'), [])
  const out = stampSetWeightUnit([{ name: 'Phantom', sets: null }], 'lbs')
  assert.deepEqual(out[0].sets, [])
})
