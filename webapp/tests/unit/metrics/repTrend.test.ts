// Run with: npx tsx --test tests/unit/metrics/repTrend.test.ts
//
// Covers the rep-trend metric:
//   - collectQualifyingSets (filters bodyweight/incomplete/zero-rep; tags week)
//   - modalWorkingWeight (most-sets weight, heavier-wins tie-break)
//   - aggregateRepTrend (empty, single-week, weight-bucketing, trend)
//   - computeRepTrend (end-to-end with injected reader)
//   - pointsToDataPoints
//   - registry adapter

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collectQualifyingSets,
  modalWorkingWeight,
  aggregateRepTrend,
  computeRepTrend,
  pointsToDataPoints,
  REP_TREND_METRIC,
  ensureRepTrendRegistered,
  __resetRepTrendRegistrationForTest,
} from '../../../lib/metrics/workout/repTrend'
import { lastNWeekStarts, type RawWorkoutLog, type WorkoutLogReader } from '../../../lib/metrics/workout/weeklyVolumeByMuscle'
import { __resetRegistryForTest, resolveMetric } from '../../../lib/metrics/registry'

const D = (s: string) => new Date(s)
const MS_PER_DAY = 24 * 60 * 60 * 1000

function setOf(weight: number, reps: number, completed = true) {
  return { weight, reps, completed }
}

// ── collectQualifyingSets ──────────────────────────────────────────────────

test('collectQualifyingSets: only the named slug, completed weighted sets', () => {
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-25T00:00:00Z'),
      completed: true,
      exercises: [
        { exerciseSlug: 'bench-press', sets: [setOf(185, 8), setOf(0, 10), setOf(185, 0), setOf(200, 5, false)] },
        { exerciseSlug: 'squat', sets: [setOf(300, 5)] },
      ],
    },
  ]
  const sets = collectQualifyingSets(logs, 'bench-press')
  // Only 185×8 qualifies (bodyweight, zero-rep, incomplete, and the squat are dropped).
  assert.equal(sets.length, 1)
  assert.equal(sets[0].weight, 185)
  assert.equal(sets[0].reps, 8)
})

test('collectQualifyingSets: case-insensitive slug, tags ISO week', () => {
  const logs: RawWorkoutLog[] = [
    { date: D('2026-05-27T00:00:00Z'), completed: true, exercises: [{ exerciseSlug: 'Bench-Press', sets: [setOf(185, 8)] }] },
  ]
  const sets = collectQualifyingSets(logs, 'bench-press')
  assert.equal(sets.length, 1)
  // Week of Wed 5/27 = Mon 5/25.
  assert.equal(sets[0].weekStart, D('2026-05-25T00:00:00Z').getTime())
})

test('collectQualifyingSets: completed=false workout dropped', () => {
  const logs: RawWorkoutLog[] = [
    { date: D('2026-05-25T00:00:00Z'), completed: false, exercises: [{ exerciseSlug: 'bench-press', sets: [setOf(185, 8)] }] },
  ]
  assert.equal(collectQualifyingSets(logs, 'bench-press').length, 0)
})

// ── modalWorkingWeight ──────────────────────────────────────────────────────

test('modalWorkingWeight: empty → null', () => {
  assert.equal(modalWorkingWeight([]), null)
})

test('modalWorkingWeight: most-frequent weight wins', () => {
  const sets = [
    { weight: 135, reps: 5, weekStart: 0 },
    { weight: 185, reps: 8, weekStart: 0 },
    { weight: 185, reps: 8, weekStart: 0 },
    { weight: 185, reps: 7, weekStart: 0 },
  ]
  assert.equal(modalWorkingWeight(sets), 185)
})

test('modalWorkingWeight: tie → heavier weight wins (avoids warmup bias)', () => {
  const sets = [
    { weight: 135, reps: 5, weekStart: 0 },
    { weight: 135, reps: 5, weekStart: 0 },
    { weight: 185, reps: 8, weekStart: 0 },
    { weight: 185, reps: 8, weekStart: 0 },
  ]
  assert.equal(modalWorkingWeight(sets), 185)
})

// ── aggregateRepTrend ──────────────────────────────────────────────────────

test('aggregateRepTrend: empty sets → dense zero series', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 3)
  const out = aggregateRepTrend([], 185, weeks)
  assert.equal(out.length, 3)
  for (const p of out) {
    assert.equal(p.avgReps, 0)
    assert.equal(p.setCount, 0)
  }
})

test('aggregateRepTrend: single-week average over qualifying sets', () => {
  const wk = D('2026-05-25T00:00:00Z').getTime()
  const sets = [
    { weight: 185, reps: 8, weekStart: wk },
    { weight: 185, reps: 6, weekStart: wk },
  ]
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const out = aggregateRepTrend(sets, 185, weeks)
  assert.equal(out.length, 1)
  assert.equal(out[0].setCount, 2)
  assert.equal(out[0].avgReps, 7) // (8+6)/2
})

test('aggregateRepTrend: weight-bucketing — only modal-weight sets counted', () => {
  const wk = D('2026-05-25T00:00:00Z').getTime()
  const sets = [
    { weight: 135, reps: 12, weekStart: wk }, // warmup, excluded
    { weight: 185, reps: 8, weekStart: wk },  // working
    { weight: 185, reps: 6, weekStart: wk },  // working
    { weight: 225, reps: 2, weekStart: wk },  // top single, excluded
  ]
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const out = aggregateRepTrend(sets, 185, weeks)
  assert.equal(out[0].setCount, 2)
  assert.equal(out[0].avgReps, 7) // only the two 185 sets
})

test('aggregateRepTrend: trend — reps declining across weeks at fixed weight', () => {
  const w1 = D('2026-05-11T00:00:00Z').getTime() // Mon
  const w2 = D('2026-05-18T00:00:00Z').getTime()
  const w3 = D('2026-05-25T00:00:00Z').getTime()
  const sets = [
    { weight: 185, reps: 8, weekStart: w1 },
    { weight: 185, reps: 8, weekStart: w1 },
    { weight: 185, reps: 7, weekStart: w2 },
    { weight: 185, reps: 7, weekStart: w2 },
    { weight: 185, reps: 5, weekStart: w3 },
    { weight: 185, reps: 5, weekStart: w3 },
  ]
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 3)
  const out = aggregateRepTrend(sets, 185, weeks)
  assert.equal(out.length, 3)
  assert.equal(out[0].avgReps, 8)
  assert.equal(out[1].avgReps, 7)
  assert.equal(out[2].avgReps, 5)
  // Declining trend — the metric's whole purpose.
  assert.ok(out[0].avgReps > out[1].avgReps && out[1].avgReps > out[2].avgReps)
})

test('aggregateRepTrend: avgReps rounded to 2 decimals', () => {
  const wk = D('2026-05-25T00:00:00Z').getTime()
  const sets = [
    { weight: 185, reps: 8, weekStart: wk },
    { weight: 185, reps: 8, weekStart: wk },
    { weight: 185, reps: 7, weekStart: wk },
  ]
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const out = aggregateRepTrend(sets, 185, weeks)
  // (8+8+7)/3 = 7.666… → 7.67
  assert.equal(out[0].avgReps, 7.67)
})

test('aggregateRepTrend: gap week with no qualifying sets → zero cell', () => {
  const w1 = D('2026-05-11T00:00:00Z').getTime()
  const w3 = D('2026-05-25T00:00:00Z').getTime()
  const sets = [
    { weight: 185, reps: 8, weekStart: w1 },
    { weight: 185, reps: 5, weekStart: w3 },
  ]
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 3)
  const out = aggregateRepTrend(sets, 185, weeks)
  // Middle week (5/18) has no sets.
  assert.equal(out[1].setCount, 0)
  assert.equal(out[1].avgReps, 0)
})

// ── computeRepTrend (end-to-end with injection) ────────────────────────────

test('computeRepTrend: empty history → dense zero series', async () => {
  const reader: WorkoutLogReader = async () => []
  const out = await computeRepTrend({
    userId: 'u', exerciseSlug: 'bench-press', weeks: 2, now: D('2026-05-28T00:00:00Z'), readWorkoutLogs: reader,
  })
  assert.equal(out.length, 2)
  for (const p of out) assert.equal(p.setCount, 0)
})

test('computeRepTrend: infers modal weight when not pinned', async () => {
  const reader: WorkoutLogReader = async () => [
    {
      date: D('2026-05-27T00:00:00Z'),
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [
        setOf(135, 12), setOf(185, 8), setOf(185, 7),
      ]}],
    },
  ]
  const out = await computeRepTrend({
    userId: 'u', exerciseSlug: 'bench-press', weeks: 1, now: D('2026-05-28T00:00:00Z'), readWorkoutLogs: reader,
  })
  // Modal weight is 185 (2 sets vs 1). avg of 8,7 = 7.5.
  assert.equal(out[0].setCount, 2)
  assert.equal(out[0].avgReps, 7.5)
})

test('computeRepTrend: honors pinned workingWeight', async () => {
  const reader: WorkoutLogReader = async () => [
    {
      date: D('2026-05-27T00:00:00Z'),
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [
        setOf(135, 12), setOf(135, 11), setOf(185, 8),
      ]}],
    },
  ]
  // Modal would be 135 (2 sets); pin to 185 to override.
  const out = await computeRepTrend({
    userId: 'u', exerciseSlug: 'bench-press', weeks: 1, now: D('2026-05-28T00:00:00Z'),
    workingWeight: 185, readWorkoutLogs: reader,
  })
  assert.equal(out[0].setCount, 1)
  assert.equal(out[0].avgReps, 8)
})

// ── pointsToDataPoints ─────────────────────────────────────────────────────

test('pointsToDataPoints: value=avgReps, label=setCount', () => {
  const points = pointsToDataPoints([
    { weekStart: D('2026-05-25T00:00:00Z'), avgReps: 7.5, setCount: 2 },
    { weekStart: D('2026-06-01T00:00:00Z'), avgReps: 0, setCount: 0 },
  ])
  assert.equal(points.length, 2)
  assert.equal(points[0].value, 7.5)
  assert.equal(points[0].label, '2')
  assert.equal(points[1].value, 0)
  assert.equal(points[1].label, '0')
})

// ── Registry adapter ──────────────────────────────────────────────────────

test('REP_TREND_METRIC: shape matches platform Metric contract', () => {
  assert.equal(REP_TREND_METRIC.id, 'workout.rep-trend')
  assert.equal(REP_TREND_METRIC.domain, 'workout')
  assert.equal(REP_TREND_METRIC.unit, 'reps')
  assert.equal(typeof REP_TREND_METRIC.compute, 'function')
})

test('ensureRepTrendRegistered: idempotent, registers under id', () => {
  __resetRegistryForTest()
  __resetRepTrendRegistrationForTest()
  ensureRepTrendRegistered()
  ensureRepTrendRegistered() // second call: must not throw
  const m = resolveMetric('workout.rep-trend')
  assert.ok(m)
  assert.equal(m!.id, 'workout.rep-trend')
})

test('REP_TREND_METRIC.compute: empty userId → empty array', async () => {
  const data = await REP_TREND_METRIC.compute('', {
    start: D('2026-05-01T00:00:00Z'),
    end: D('2026-05-28T00:00:00Z'),
  })
  assert.deepEqual(data, [])
})
