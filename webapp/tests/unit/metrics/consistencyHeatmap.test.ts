// Run with: npm run test:file tests/unit/metrics/consistencyHeatmap.test.ts
//
// Covers the consistency-heatmap metric:
//   - utcDayStart / countCompletedSets helpers
//   - aggregateConsistencyHeatmap (zero days, one-workout-day, multi-workout-day
//     aggregation, gap filling)
//   - computeConsistencyHeatmap (end-to-end with injected reader)
//   - cellsToDataPoints
//   - registry adapter

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateConsistencyHeatmap,
  computeConsistencyHeatmap,
  countCompletedSets,
  utcDayStart,
  cellsToDataPoints,
  CONSISTENCY_HEATMAP_METRIC,
  ensureConsistencyHeatmapRegistered,
  __resetConsistencyHeatmapRegistrationForTest,
} from '../../../lib/metrics/workout/consistencyHeatmap'
import { lastNWeekStarts, type RawWorkoutLog, type WorkoutLogReader } from '../../../lib/metrics/workout/weeklyVolumeByMuscle'
import { __resetRegistryForTest, resolveMetric } from '../../../lib/metrics/registry'

const D = (s: string) => new Date(s)
const MS_PER_DAY = 24 * 60 * 60 * 1000

function set(completed = true) {
  return { weight: 135, reps: 5, completed }
}

// ── utcDayStart ─────────────────────────────────────────────────────────────

test('utcDayStart: strips time-of-day to UTC midnight', () => {
  assert.equal(utcDayStart(D('2026-05-27T15:42:00Z')).toISOString(), '2026-05-27T00:00:00.000Z')
  assert.equal(utcDayStart(D('2026-05-27T00:00:00Z')).toISOString(), '2026-05-27T00:00:00.000Z')
})

// ── countCompletedSets ──────────────────────────────────────────────────────

test('countCompletedSets: counts completed sets across exercises', () => {
  const log: RawWorkoutLog = {
    date: D('2026-05-25'),
    completed: true,
    exercises: [
      { exerciseSlug: 'bench-press', sets: [set(), set()] },
      { exerciseSlug: 'lat-pulldown', sets: [set()] },
    ],
  }
  assert.equal(countCompletedSets(log), 3)
})

test('countCompletedSets: skips explicitly-incomplete sets, counts bodyweight', () => {
  const log: RawWorkoutLog = {
    date: D('2026-05-25'),
    completed: true,
    exercises: [
      { exerciseSlug: 'push-ups', sets: [
        { weight: 0, reps: 20, completed: true },   // bodyweight — counted
        { weight: 0, reps: 0, completed: false },   // incomplete — skipped
      ]},
    ],
  }
  assert.equal(countCompletedSets(log), 1)
})

test('countCompletedSets: no exercises → 0', () => {
  assert.equal(countCompletedSets({ date: D('2026-05-25'), completed: true, exercises: [] }), 0)
})

// ── aggregateConsistencyHeatmap ────────────────────────────────────────────

test('aggregateConsistencyHeatmap: zero days — no logs → dense all-zero grid', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 2)
  const cells = aggregateConsistencyHeatmap([], weeks)
  // 2 weeks × 7 days = 14 dense cells.
  assert.equal(cells.length, 14)
  for (const c of cells) {
    assert.equal(c.workoutCount, 0)
    assert.equal(c.totalSets, 0)
  }
})

test('aggregateConsistencyHeatmap: grid spans first weekStart through last weekStart + 6 days', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1) // [Mon 5/25]
  const cells = aggregateConsistencyHeatmap([], weeks)
  assert.equal(cells.length, 7)
  assert.equal(cells[0].date.toISOString(), '2026-05-25T00:00:00.000Z')
  assert.equal(cells[6].date.toISOString(), '2026-05-31T00:00:00.000Z')
})

test('aggregateConsistencyHeatmap: one-workout-day → that cell has count 1 + its sets', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-27T18:00:00Z'), // Wed
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [set(), set(), set()] }],
    },
  ]
  const cells = aggregateConsistencyHeatmap(logs, weeks)
  const wed = cells.find(c => c.date.toISOString() === '2026-05-27T00:00:00.000Z')!
  assert.equal(wed.workoutCount, 1)
  assert.equal(wed.totalSets, 3)
  // Every other cell stays zero.
  const others = cells.filter(c => c.date.toISOString() !== '2026-05-27T00:00:00.000Z')
  for (const c of others) {
    assert.equal(c.workoutCount, 0)
    assert.equal(c.totalSets, 0)
  }
})

test('aggregateConsistencyHeatmap: multi-workout-day → counts + sets aggregate', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-25T08:00:00Z'), // Mon AM
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [set(), set()] }],
    },
    {
      date: D('2026-05-25T18:00:00Z'), // Mon PM — same calendar day
      completed: true,
      exercises: [{ exerciseSlug: 'lat-pulldown', sets: [set(), set(), set()] }],
    },
  ]
  const cells = aggregateConsistencyHeatmap(logs, weeks)
  const mon = cells.find(c => c.date.toISOString() === '2026-05-25T00:00:00.000Z')!
  assert.equal(mon.workoutCount, 2)
  assert.equal(mon.totalSets, 5)
})

test('aggregateConsistencyHeatmap: gap filling — empty days between workouts are present as zero cells', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    { date: D('2026-05-25T08:00:00Z'), completed: true, exercises: [{ exerciseSlug: 'x', sets: [set()] }] }, // Mon
    { date: D('2026-05-29T08:00:00Z'), completed: true, exercises: [{ exerciseSlug: 'x', sets: [set()] }] }, // Fri
  ]
  const cells = aggregateConsistencyHeatmap(logs, weeks)
  // The 3 days between (Tue/Wed/Thu) must exist as zero cells.
  const tue = cells.find(c => c.date.toISOString() === '2026-05-26T00:00:00.000Z')!
  const wed = cells.find(c => c.date.toISOString() === '2026-05-27T00:00:00.000Z')!
  const thu = cells.find(c => c.date.toISOString() === '2026-05-28T00:00:00.000Z')!
  for (const c of [tue, wed, thu]) {
    assert.equal(c.workoutCount, 0)
    assert.equal(c.totalSets, 0)
  }
  // The grid is contiguous (no missing days).
  for (let i = 1; i < cells.length; i++) {
    assert.equal(cells[i].date.getTime() - cells[i - 1].date.getTime(), MS_PER_DAY)
  }
})

test('aggregateConsistencyHeatmap: completed=false workout ignored', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    { date: D('2026-05-25T08:00:00Z'), completed: false, exercises: [{ exerciseSlug: 'x', sets: [set()] }] },
  ]
  const cells = aggregateConsistencyHeatmap(logs, weeks)
  const mon = cells.find(c => c.date.toISOString() === '2026-05-25T00:00:00.000Z')!
  assert.equal(mon.workoutCount, 0)
})

test('aggregateConsistencyHeatmap: workout outside the window is dropped', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    { date: D('2026-01-01T08:00:00Z'), completed: true, exercises: [{ exerciseSlug: 'x', sets: [set()] }] },
  ]
  const cells = aggregateConsistencyHeatmap(logs, weeks)
  for (const c of cells) assert.equal(c.workoutCount, 0)
})

test('aggregateConsistencyHeatmap: empty weekStarts → empty grid', () => {
  assert.deepEqual(aggregateConsistencyHeatmap([], []), [])
})

// ── computeConsistencyHeatmap (end-to-end with injection) ──────────────────

test('computeConsistencyHeatmap: zero workouts → dense zero grid for the window', async () => {
  const reader: WorkoutLogReader = async () => []
  const cells = await computeConsistencyHeatmap({
    userId: 'u', weeks: 2, now: D('2026-05-28T00:00:00Z'), readWorkoutLogs: reader,
  })
  assert.equal(cells.length, 14)
  for (const c of cells) assert.equal(c.workoutCount, 0)
})

test('computeConsistencyHeatmap: single workout maps to its day', async () => {
  const reader: WorkoutLogReader = async () => [
    { date: D('2026-05-27T10:00:00Z'), completed: true, exercises: [{ exerciseSlug: 'bench-press', sets: [set(), set()] }] },
  ]
  const cells = await computeConsistencyHeatmap({
    userId: 'u', weeks: 1, now: D('2026-05-28T00:00:00Z'), readWorkoutLogs: reader,
  })
  const wed = cells.find(c => c.date.toISOString() === '2026-05-27T00:00:00.000Z')!
  assert.equal(wed.workoutCount, 1)
  assert.equal(wed.totalSets, 2)
})

test('computeConsistencyHeatmap: passes a window covering the requested weeks to the reader', async () => {
  const calls: Array<{ from: Date; to: Date }> = []
  const reader: WorkoutLogReader = async (_u, from, to) => { calls.push({ from, to }); return [] }
  await computeConsistencyHeatmap({
    userId: 'u', weeks: 4, now: D('2026-05-28T00:00:00Z'), readWorkoutLogs: reader,
  })
  assert.equal(calls.length, 1)
  // from = Mon of 4 weeks ago = 2026-05-04
  assert.equal(calls[0].from.toISOString(), '2026-05-04T00:00:00.000Z')
})

// ── cellsToDataPoints ──────────────────────────────────────────────────────

test('cellsToDataPoints: one point per cell, value=workoutCount, label=totalSets', () => {
  const points = cellsToDataPoints([
    { date: D('2026-05-25T00:00:00Z'), workoutCount: 2, totalSets: 11 },
    { date: D('2026-05-26T00:00:00Z'), workoutCount: 0, totalSets: 0 },
  ])
  assert.equal(points.length, 2)
  assert.equal(points[0].value, 2)
  assert.equal(points[0].label, '11')
  assert.equal(points[1].value, 0)
  assert.equal(points[1].label, '0')
})

// ── Registry adapter ──────────────────────────────────────────────────────

test('CONSISTENCY_HEATMAP_METRIC: shape matches platform Metric contract', () => {
  assert.equal(CONSISTENCY_HEATMAP_METRIC.id, 'workout.consistency-heatmap')
  assert.equal(CONSISTENCY_HEATMAP_METRIC.domain, 'workout')
  assert.equal(typeof CONSISTENCY_HEATMAP_METRIC.compute, 'function')
})

test('ensureConsistencyHeatmapRegistered: idempotent, registers under id', () => {
  __resetRegistryForTest()
  __resetConsistencyHeatmapRegistrationForTest()
  ensureConsistencyHeatmapRegistered()
  ensureConsistencyHeatmapRegistered() // second call: must not throw
  const m = resolveMetric('workout.consistency-heatmap')
  assert.ok(m)
  assert.equal(m!.id, 'workout.consistency-heatmap')
})

test('CONSISTENCY_HEATMAP_METRIC.compute: empty userId → empty array', async () => {
  const data = await CONSISTENCY_HEATMAP_METRIC.compute('', {
    start: D('2026-05-01T00:00:00Z'),
    end: D('2026-05-28T00:00:00Z'),
  })
  assert.deepEqual(data, [])
})
