// Run with: npm run test:file tests/unit/weightSeries.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeightSeries, weightCaption, yTicksFor, dayOfWeekLabel, type WeighIn } from '../../lib/becoming/weightSeries'

// Week of Sun 2026-08-16; "today" is Tue 2026-08-18.
const week: WeighIn[] = [
  { day: '2026-08-16', value: 209 },
  { day: '2026-08-17', value: 208.4 },
  { day: '2026-08-18', value: 208 },
]
const history: WeighIn[] = [
  { day: '2026-01-18', value: 202 }, { day: '2026-04-05', value: 211 },
  { day: '2026-06-14', value: 210 }, ...week,
]

test('the week view lays out Sun→Sat, labels the days, and keeps empty days as gaps', () => {
  const s = buildWeightSeries(week, 'week', 205, '2026-08-18')
  assert.deepEqual(s.xTicks.map(t => t.label), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  assert.equal(s.points.length, 3)
  assert.deepEqual(s.points.map(p => p.label), ['Sun', 'Mon', 'Tue'])
  assert.equal(s.gaps.length, 4, 'Wed–Sat have no weigh-in yet')
  assert.equal(s.points[0].x, 0)
  assert.ok(Math.abs(s.points[2].x - 2 / 6) < 1e-9, 'Tuesday sits two sevenths along')
  assert.equal(s.points[2].longLabel, 'Tue, Aug 18')
})

test('the all-time view plots every weigh-in and labels months', () => {
  const s = buildWeightSeries(history, 'all', 205, '2026-08-18')
  assert.equal(s.points.length, 6)
  assert.deepEqual(s.xTicks.map(t => t.label), ['Jan', 'Apr', 'Jun', 'Aug'])
  assert.equal(s.first?.value, 202); assert.equal(s.last?.value, 208)
  assert.equal(s.delta, 6)
})

test('y ticks are round numbers inside the range, and the goal gets a line when it fits', () => {
  const s = buildWeightSeries(history, 'all', 205, '2026-08-18')
  assert.ok(s.yTicks.length >= 2)
  for (const t of s.yTicks) { const v = Number(t.label); assert.ok(v >= Math.floor(s.min) && v <= Math.ceil(s.max)) }
  assert.ok(s.targetY != null && s.targetY > 0 && s.targetY < 1)
  assert.deepEqual(yTicksFor(200, 212, 3), [200, 205, 210])
})

test('a week with no weigh-ins still draws the seven days', () => {
  const s = buildWeightSeries([], 'week', 205, '2026-08-18')
  assert.equal(s.points.length, 0)
  assert.equal(s.gaps.length, 7)
  assert.deepEqual(s.xTicks.map(t => t.label), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  assert.equal(weightCaption(s, 'lbs'), 'No weigh-ins this week')
})

test('captions read the direction and the span', () => {
  assert.equal(weightCaption(buildWeightSeries(week, 'week', 205, '2026-08-18'), 'lbs'), 'down 1.0 lbs this week')
  assert.equal(weightCaption(buildWeightSeries(history, 'all', 205, '2026-08-18'), 'lbs'), 'up 6.0 lbs since Jan 18')
  assert.match(weightCaption(buildWeightSeries([{ day: '2026-08-17', value: 208 }, { day: '2026-08-18', value: 208 }], 'week', null, '2026-08-18'), 'lbs'), /Steady at 208 lbs/)
})

test('day labels come from the day key, not the device clock', () => {
  assert.equal(dayOfWeekLabel('2026-08-16'), 'Sun')
  assert.equal(dayOfWeekLabel('2026-08-22'), 'Sat')
})
