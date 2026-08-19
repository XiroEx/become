// Run with: npx tsx --test tests/unit/weekChart.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weeklyChartBarHeightPct } from '../../lib/nutrition/weekChart'

test('a mid-week day scales proportionally to the week max', () => {
  assert.equal(weeklyChartBarHeightPct(1000, 2000), 50)
})

test('the max day fills the bar (not clamped below 100)', () => {
  assert.equal(weeklyChartBarHeightPct(2000, 2000), 100)
})

test('REGRESSION: a raw total that rounds above the (already-rounded) max clamps to 100, not >100', () => {
  // summary.max is Math.round()'d before this runs, so the same day's raw
  // total (2091.4) can exceed it (2091) and overshoot 100% without a clamp.
  assert.equal(weeklyChartBarHeightPct(2091.4, 2091), 100)
})

test('a genuinely empty day (no logs) renders no bar at all', () => {
  assert.equal(weeklyChartBarHeightPct(0, 2000), 0)
})

test('a tiny but non-zero day still gets a visible sliver, not a rounding-invisible bar', () => {
  assert.equal(weeklyChartBarHeightPct(10, 2000), 4)
})

test('a week with zero logged calories anywhere renders every bar at 0, not NaN/Infinity', () => {
  assert.equal(weeklyChartBarHeightPct(0, 0), 0)
})
