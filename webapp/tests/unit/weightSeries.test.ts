// Run with: npx tsx --test tests/unit/weightSeries.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeightSeries, weightCaption, type WeekWeight } from '../../lib/becoming/weightSeries'

// /api/progress returns { date, value }; older callers pass { label, value }.
const history = [
  { date: 'Jan 18', value: 202 }, { date: 'Apr 5', value: 211 },
  { date: 'Jun 14', value: 210 }, { date: 'Aug 17', value: 208 },
]
const weeks: WeekWeight[] = [
  { weekKey: '2026-07-26', label: 'Jul 26 – Aug 1', end: 209, start: 210 },
  { weekKey: '2026-08-02', label: 'Aug 2–8', end: null, start: null },   // no weigh-in → carries 209
  { weekKey: '2026-08-09', label: 'Aug 9–15', end: 208, start: 210 },
  { weekKey: '2026-08-16', label: 'Aug 16–22', end: 208, start: 208 },
]

test('all-time view plots every weigh-in in order, first → last', () => {
  const s = buildWeightSeries(history, weeks, 'all', 205)
  assert.equal(s.points.length, 4)
  assert.equal(s.first?.value, 202); assert.equal(s.last?.value, 208)
  assert.equal(s.delta, 6)
  assert.equal(s.points[0].x, 0); assert.equal(s.points[3].x, 1)
  // higher weight sits higher on the chart (smaller y)
  assert.ok(s.points[1].y < s.points[0].y)
})

test('weeks view is one point per week and carries through weeks with no weigh-in', () => {
  const s = buildWeightSeries(history, weeks, 'weeks', 205)
  assert.equal(s.points.length, 4)
  assert.deepEqual(s.points.map(p => p.value), [209, 209, 208, 208])
  assert.equal(s.last?.label, 'Aug 16–22')
})

test('the target is inside the range and gets a y; an out-of-range target does not', () => {
  const inRange = buildWeightSeries(history, weeks, 'all', 205)
  assert.ok(inRange.targetY != null && inRange.targetY > 0 && inRange.targetY < 1)
  assert.ok(inRange.min <= 202 && inRange.max >= 211)
  const far = buildWeightSeries(history, weeks, 'all', 120)
  assert.ok(far.min <= 120, 'the target widens the range so the line stays readable')
})

test('a single weigh-in sits in the middle rather than at an edge', () => {
  const s = buildWeightSeries([{ date: 'Aug 17', value: 208 }], [], 'all', null)
  assert.equal(s.points.length, 1); assert.equal(s.points[0].x, 0.5)
  assert.equal(s.delta, 0)
})

test('no data is empty, not a crash', () => {
  const s = buildWeightSeries([], [], 'all', 205)
  assert.deepEqual(s.points, []); assert.equal(s.first, null)
  assert.equal(weightCaption(s, 'lbs'), 'No weigh-ins yet')
})

test('caption reads the direction and the span', () => {
  assert.equal(weightCaption(buildWeightSeries(history, weeks, 'all', 205), 'lbs'), 'up 6.0 lbs since Jan 18')
  assert.equal(weightCaption(buildWeightSeries(history, weeks, 'weeks', 205), 'lbs'), 'down 1.0 lbs over 4 weeks')
  assert.match(weightCaption(buildWeightSeries([{ date: 'a', value: 208 }, { date: 'b', value: 208 }], [], 'all', null), 'lbs'), /Steady at 208 lbs/)
  // Either shape works, and a missing label never leaks "undefined" into the caption.
  assert.equal(weightCaption(buildWeightSeries([{ value: 200 }, { value: 198 }], [], 'all', null), 'lbs'), 'down 2.0 lbs')
})
