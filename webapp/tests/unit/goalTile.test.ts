// Run with: npx tsx --test tests/unit/goalTile.test.ts
//
// The Goal tile used to show `currentWeek / totalWeeks` captioned "Annual
// goal". These pin down what it says now, for the goals members actually set.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeGoal, formatWeightDelta } from '../../lib/dashboard/goalTile'

const KG = 0.45359237

test("Jon: build muscle, target 205, weighing 208 → '3 lbs to go', direction down", () => {
  const v = describeGoal({
    fitnessGoal: 'gain_muscle',
    nutritionDirection: 'lose',
    targetWeightKg: 205 * KG,
    startWeightKg: 208 * KG,
    latestWeight: 208,
    weightUnit: 'lbs',
    program: { name: 'The Jon Don Split', completedWorkouts: 5, totalWorkouts: 20, currentWeek: 1, totalWeeks: 4, programId: 'x' },
  })
  assert.equal(v.kind, 'weight')
  assert.equal(v.label, 'Goal · Build muscle')
  assert.equal(v.value, '3 lbs to go')
  assert.equal(v.footer, '208 → 205 lbs')
  assert.equal(v.direction, 'down', 'target below current weight → down, whatever the goal is called')
  assert.equal(v.pct, 0, 'no movement since onboarding yet')
  assert.equal(v.href, '/dashboard/nutrition/goals', 'the goal opens its plan, not the training log')
})

test('progress bar runs from the onboarding weight to the target', () => {
  const v = describeGoal({
    fitnessGoal: 'lose_weight',
    targetWeightKg: 180 * KG,
    startWeightKg: 200 * KG,
    latestWeight: 190,
    weightUnit: 'lbs',
  })
  assert.equal(v.pct, 50)
  assert.equal(v.value, '10 lbs to go')
})

test('drifting the wrong way reads 0%, never negative', () => {
  const v = describeGoal({
    fitnessGoal: 'lose_weight',
    targetWeightKg: 180 * KG,
    startWeightKg: 200 * KG,
    latestWeight: 204,
    weightUnit: 'lbs',
  })
  assert.equal(v.pct, 0)
  assert.equal(v.value, '24 lbs to go')
})

test('within 2 lbs of target is "Goal reached", not "0.6 lbs to go"', () => {
  const v = describeGoal({ fitnessGoal: 'maintain', targetWeightKg: 205 * KG, latestWeight: 205.6, weightUnit: 'lbs' })
  assert.equal(v.value, 'Goal reached 🎉')
  assert.equal(v.footer, 'Holding 205 lbs')
  assert.equal(v.pct, 100)
  assert.equal(v.direction, 'hold')
})

test('gain direction when the target is above', () => {
  const v = describeGoal({ fitnessGoal: 'gain_muscle', targetWeightKg: 175 * KG, startWeightKg: 160 * KG, latestWeight: 165, weightUnit: 'lbs' })
  assert.equal(v.direction, 'up')
  assert.equal(v.value, '10 lbs to go')
  assert.equal(v.pct, 33)
})

test('kg members see kg with one decimal', () => {
  const v = describeGoal({ fitnessGoal: 'lose_weight', targetWeightKg: 80, startWeightKg: 90, latestWeight: 84.4, weightUnit: 'kg' })
  assert.equal(v.value, '4.4 kg to go')
  assert.equal(v.footer, '84.4 → 80 kg')
})

test('no start weight → the oldest logged weight is the start', () => {
  const v = describeGoal({ fitnessGoal: 'lose_weight', targetWeightKg: 180 * KG, latestWeight: 190, earliestWeight: 200, weightUnit: 'lbs' })
  assert.equal(v.pct, 50)
})

test('a target with no weigh-in states the target and asks for one', () => {
  const v = describeGoal({ fitnessGoal: 'lose_weight', targetWeightKg: 180 * KG, weightUnit: 'lbs' })
  assert.equal(v.value, '180 lbs')
  assert.equal(v.footer, 'Log a weigh-in to track it')
})

test('no target but a program → program completion, named as the program', () => {
  const v = describeGoal({
    fitnessGoal: 'general_health',
    weightUnit: 'lbs',
    latestWeight: 190,
    program: { name: 'Foundation', completedWorkouts: 5, totalWorkouts: 20, currentWeek: 1, totalWeeks: 4, programId: 'foundation' },
  })
  assert.equal(v.kind, 'program')
  assert.equal(v.value, '25%')
  assert.equal(v.footer, 'Foundation')
  assert.equal(v.href, '/dashboard/workout/foundation')
  assert.equal(v.label, 'Goal · General health')
})

test('nothing set → invitation to set one, linking to settings', () => {
  const v = describeGoal({ weightUnit: 'lbs' })
  assert.equal(v.kind, 'unset')
  assert.equal(v.value, 'Set a goal')
  assert.equal(v.href, '/dashboard/settings')
  assert.equal(v.label, 'Goal')
})

test('delta formatting keeps a decimal only when it matters', () => {
  assert.equal(formatWeightDelta(3.0, 'lbs'), '3 lbs')
  assert.equal(formatWeightDelta(2.6, 'lbs'), '2.6 lbs')
  assert.equal(formatWeightDelta(12.4, 'lbs'), '12 lbs')
  assert.equal(formatWeightDelta(-0.8, 'kg'), '0.8 kg')
})

test('with a pace read the footer says the ETA, or how far behind', () => {
  const base = { fitnessGoal: 'gain_muscle', targetWeightKg: 205 * KG, startWeightKg: 208 * KG, latestWeight: 208, weightUnit: 'lbs' as const }
  assert.equal(describeGoal({ ...base, pace: { status: 'on', eta: '~3 wks', behindByKg: 0 } }).footer, '→ 205 lbs · ~3 wks')
  assert.equal(describeGoal({ ...base, pace: { status: 'ahead', eta: '~2 wks', behindByKg: 0 } }).footer, '→ 205 lbs · ~2 wks · ahead')
  assert.equal(describeGoal({ ...base, pace: { status: 'behind', eta: '~4 wks', behindByKg: 1.5 * KG } }).footer, '→ 205 lbs · 1.5 lbs behind')
  assert.equal(describeGoal({ ...base, pace: null }).footer, '208 → 205 lbs')
})
