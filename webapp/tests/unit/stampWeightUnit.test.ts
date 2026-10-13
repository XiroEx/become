// NP-209: lib/workout/stampWeightUnit.ts — the server-side stamp that writes
// a member's CURRENT profile.weightUnit onto every set of a save, so the
// stored ISetLog/IPRDimension carries a unit even though the client never
// sends one. Pure, no IO — see the file for why that matters.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stampWeightUnit } from '../../lib/workout/stampWeightUnit'

interface Set { weight?: number; weightUnit?: 'lbs' | 'kg'; reps?: number; completed: boolean }
interface Exercise { name: string; exerciseSlug?: string; sets: Set[] }

test('stamps every set with the given unit', () => {
  const exercises: Exercise[] = [
    { name: 'Bench Press', exerciseSlug: 'bench-press', sets: [
      { weight: 135, reps: 5, completed: true },
      { weight: 145, reps: 3, completed: true },
    ] },
  ]
  const out = stampWeightUnit(exercises, 'kg')
  assert.equal(out[0].sets[0].weightUnit, 'kg')
  assert.equal(out[0].sets[1].weightUnit, 'kg')
  // Every other field on the set and the exercise is preserved.
  assert.equal(out[0].sets[0].weight, 135)
  assert.equal(out[0].exerciseSlug, 'bench-press')
})

test('unit undefined (member never chosen) leaves sets exactly as they came in — no silent lbs default', () => {
  const exercises: Exercise[] = [
    { name: 'Squat', sets: [{ weight: 225, reps: 5, completed: true }] },
  ]
  const out = stampWeightUnit(exercises, undefined)
  assert.equal(out, exercises) // same reference — short-circuited, not re-mapped
  assert.equal('weightUnit' in out[0].sets[0], false)
})

test('unit null behaves the same as undefined', () => {
  const exercises: Exercise[] = [{ name: 'Squat', sets: [{ weight: 225, reps: 5, completed: true }] }]
  const out = stampWeightUnit(exercises, null)
  assert.equal('weightUnit' in out[0].sets[0], false)
})

test('does not mutate the input array/objects', () => {
  const original: Exercise[] = [{ name: 'Deadlift', sets: [{ weight: 315, reps: 3, completed: true }] }]
  const out = stampWeightUnit(original, 'lbs')
  assert.notEqual(out, original)
  assert.equal('weightUnit' in original[0].sets[0], false)
  assert.equal(out[0].sets[0].weightUnit, 'lbs')
})

test('an empty exercises array stays empty', () => {
  assert.deepEqual(stampWeightUnit([], 'kg'), [])
})
