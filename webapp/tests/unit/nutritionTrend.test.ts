// Run with: npm run test:file tests/unit/nutritionTrend.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeNutritionTrend } from '../../lib/dashboard/nutritionTrend'

const day = (date: string, calories: number, protein: number, hasData = true) => ({ date, calories, protein, hasData, mealCount: hasData ? 2 : 0 })

test('a normal week reads days logged, protein hits and average vs goal', () => {
  const t = describeNutritionTrend([
    day('08-11', 2200, 160), day('08-12', 2400, 140), day('08-13', 0, 0, false),
    day('08-14', 2100, 155), day('08-15', 2600, 120), day('08-16', 0, 0, false), day('08-17', 2300, 150),
  ], { calories: 2300, protein: 150 })
  assert.equal(t.loggedDays, 5)
  assert.equal(t.totalDays, 7)
  assert.equal(t.proteinHitDays, 3)
  assert.equal(t.avgCalories, 2320)
  assert.equal(t.calorieRead, 'near')
  assert.equal(t.line, 'Logged 5 of 7 days · protein hit 3 · avg 2,320 cal (on target)')
})

test('nothing logged says so plainly', () => {
  const t = describeNutritionTrend([day('08-17', 0, 0, false)], { calories: 2300, protein: 150 })
  assert.equal(t.loggedDays, 0)
  assert.equal(t.avgCalories, null)
  assert.equal(t.line, 'Nothing logged in the last 7 days')
})

test('a day with data but zero calories (water only) is not a logged day', () => {
  const t = describeNutritionTrend([{ date: '08-17', calories: 0, protein: 0, hasData: true, mealCount: 0 }], { calories: 2300, protein: 150 })
  assert.equal(t.loggedDays, 0)
})

test('under / over reads', () => {
  assert.equal(describeNutritionTrend([day('a', 1500, 100)], { calories: 2300, protein: 150 }).calorieRead, 'under')
  assert.equal(describeNutritionTrend([day('a', 3000, 100)], { calories: 2300, protein: 150 }).calorieRead, 'over')
})

test('no protein goal → no protein clause', () => {
  const t = describeNutritionTrend([day('a', 2300, 100)], { calories: 2300, protein: 0 })
  assert.equal(t.proteinHitDays, null)
  assert.equal(t.line, 'Logged 1 of 1 days · avg 2,300 cal (on target)')
})
