// Run with: npm run test:file tests/unit/goalTrend.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trendWeightKg, needsWeightRecalc } from '../../lib/goals/trend'
import { nutritionGoalLine } from '../../lib/nutrition/goalLine'
import { goalLine } from '../../components/DailyCheckInModal'

const d = (s: string) => new Date(s + 'T12:00:00Z')

// ── trendWeightKg ────────────────────────────────────────────────────────────

test('trendWeightKg averages the trailing window, not the single latest reading', () => {
  const now = d('2026-08-19')
  const series = [
    { kg: 95, date: d('2026-08-10') },
    { kg: 94, date: d('2026-08-14') },
    { kg: 93, date: d('2026-08-18') }, // a single low reading — mostly water
  ]
  const trend = trendWeightKg(series, now)
  assert.ok(trend != null && Math.abs(trend - 94) < 0.01, 'mean of the three in-window points, not the last one alone')
})

test('trendWeightKg ignores points outside the window', () => {
  const now = d('2026-08-19')
  const series = [
    { kg: 100, date: d('2026-06-01') }, // outside the 14-day window
    { kg: 90, date: d('2026-08-15') },
    { kg: 90, date: d('2026-08-18') },
  ]
  const trend = trendWeightKg(series, now)
  assert.ok(trend != null && Math.abs(trend - 90) < 0.01)
})

test('trendWeightKg falls back to the latest single entry when the window is empty', () => {
  const now = d('2026-08-19')
  const series = [{ kg: 88, date: d('2026-01-01') }]
  assert.equal(trendWeightKg(series, now), 88)
})

test('trendWeightKg is null with no history at all', () => {
  assert.equal(trendWeightKg([], new Date()), null)
})

// ── needsWeightRecalc ────────────────────────────────────────────────────────

test('needsWeightRecalc triggers past the drift threshold, not on every wobble', () => {
  assert.equal(needsWeightRecalc(95, 94.9), false, 'well under a kg — noise')
  assert.equal(needsWeightRecalc(95, 93.8), true, 'over a kg of real movement')
  assert.equal(needsWeightRecalc(undefined, 95), true, 'never computed before')
  assert.equal(needsWeightRecalc(95, null), false, 'no logged history yet — nothing to react to')
})

// ── nutritionGoalLine ────────────────────────────────────────────────────────

test('nutritionGoalLine ties the calorie number to the goal', () => {
  assert.equal(
    nutritionGoalLine({ calories: 2910, targetWeight: 205, unit: 'lbs', direction: 'lose', paceStatus: 'on' }),
    '2,910 cal/day, on track for 205 lbs',
  )
  assert.equal(
    nutritionGoalLine({ calories: 2200, targetWeight: 180, unit: 'lbs', direction: 'lose', paceStatus: 'behind' }),
    '2,200 cal/day, behind pace for 180 lbs',
  )
  assert.equal(
    nutritionGoalLine({ calories: 2400, targetWeight: 180, unit: 'lbs', direction: 'maintain', paceStatus: 'na' }),
    '2,400 cal/day, holding at 180 lbs',
  )
})

test('nutritionGoalLine falls back to just the calories without a target', () => {
  assert.equal(nutritionGoalLine({ calories: 2000, targetWeight: null, unit: 'lbs', direction: null, paceStatus: null }), '2,000 cal/day')
})

test('nutritionGoalLine is null without a calorie number', () => {
  assert.equal(nutritionGoalLine({ calories: 0, targetWeight: 180, unit: 'lbs', direction: 'lose', paceStatus: 'on' }), null)
})

// ── check-in goal line ───────────────────────────────────────────────────────

test('the check-in goal line reacts live to what is typed, not just the last logged weight', () => {
  assert.equal(goalLine('', 205, 'lbs'), 'Goal: 205 lbs')
  assert.equal(goalLine('209', 205, 'lbs'), 'Goal: 205 lbs — 4 lbs to go')
  assert.equal(goalLine('200', 205, 'lbs'), 'Goal: 205 lbs — 5 lbs past it')
  assert.equal(goalLine('206', 205, 'lbs'), 'Goal: 205 lbs — right there', 'inside the hold band')
})

test('the check-in goal line is absent without a target', () => {
  assert.equal(goalLine('209', undefined, 'lbs'), null)
})
