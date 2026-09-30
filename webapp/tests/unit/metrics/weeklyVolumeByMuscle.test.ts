// Run with: npm run test:file tests/unit/metrics/weeklyVolumeByMuscle.test.ts
//
// Covers the weekly-volume-by-muscle metric:
//   - isoWeekStart (ISO-week boundary math, including Sunday edge case)
//   - lastNWeekStarts (rolling window builder)
//   - aggregateWeeklyVolumeByMuscle (primary-only, primary+secondary fractional,
//     multi-exercise aggregation, ISO-week boundary)
//   - collectExerciseSlugs
//   - computeWeeklyVolumeByMuscle (end-to-end with injected reader + resolver)
//   - bucketsToDataPoints (platform shape flatten)
//   - registry adapter (idempotent registration)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateWeeklyVolumeByMuscle,
  collectExerciseSlugs,
  computeWeeklyVolumeByMuscle,
  isoWeekStart,
  lastNWeekStarts,
  bucketsToDataPoints,
  WEEKLY_VOLUME_BY_MUSCLE_METRIC,
  ensureWeeklyVolumeByMuscleRegistered,
  __resetWeeklyVolumeRegistrationForTest,
  type RawWorkoutLog,
  type ExerciseMuscles,
  type WorkoutLogReader,
  type ExerciseMusclesResolver,
} from '../../../lib/metrics/workout/weeklyVolumeByMuscle'
import { __resetRegistryForTest, resolveMetric } from '../../../lib/metrics/registry'

const D = (s: string) => new Date(s)

// ── isoWeekStart ────────────────────────────────────────────────────────────

test('isoWeekStart: Monday → same day at 00:00 UTC', () => {
  // 2026-05-25 is a Monday.
  const monday = isoWeekStart(D('2026-05-25T15:30:00Z'))
  assert.equal(monday.toISOString(), '2026-05-25T00:00:00.000Z')
})

test('isoWeekStart: Sunday belongs to the previous Monday (ISO-week edge)', () => {
  // 2026-05-31 is a Sunday — must map to Mon 2026-05-25, not Mon 2026-06-01.
  const monday = isoWeekStart(D('2026-05-31T23:59:00Z'))
  assert.equal(monday.toISOString(), '2026-05-25T00:00:00.000Z')
})

test('isoWeekStart: Wednesday → preceding Monday', () => {
  // 2026-05-27 is a Wednesday.
  const monday = isoWeekStart(D('2026-05-27T12:00:00Z'))
  assert.equal(monday.toISOString(), '2026-05-25T00:00:00.000Z')
})

test('isoWeekStart: ignores UTC time-of-day', () => {
  const a = isoWeekStart(D('2026-05-25T00:00:00Z'))
  const b = isoWeekStart(D('2026-05-25T23:59:59Z'))
  assert.equal(a.getTime(), b.getTime())
})

// ── lastNWeekStarts ────────────────────────────────────────────────────────

test('lastNWeekStarts: returns N consecutive Mondays ending at the anchor week', () => {
  const out = lastNWeekStarts(D('2026-05-28T00:00:00Z'), 4) // Thu in week of Mon 5/25
  assert.equal(out.length, 4)
  assert.equal(out[3].toISOString(), '2026-05-25T00:00:00.000Z')
  assert.equal(out[2].toISOString(), '2026-05-18T00:00:00.000Z')
  assert.equal(out[1].toISOString(), '2026-05-11T00:00:00.000Z')
  assert.equal(out[0].toISOString(), '2026-05-04T00:00:00.000Z')
})

test('lastNWeekStarts: n=1 returns a single-week window', () => {
  const out = lastNWeekStarts(D('2026-05-28T00:00:00Z'), 1)
  assert.equal(out.length, 1)
  assert.equal(out[0].toISOString(), '2026-05-25T00:00:00.000Z')
})

// ── aggregateWeeklyVolumeByMuscle ──────────────────────────────────────────

const benchMuscles: ExerciseMuscles = {
  primary: ['chest'],
  secondary: ['triceps', 'front_delts'],
}

const squatMuscles: ExerciseMuscles = {
  primary: ['quads', 'glutes'],
  secondary: ['hamstrings', 'adductors'],
}

function muscleMap(...entries: Array<[string, ExerciseMuscles]>): Map<string, ExerciseMuscles> {
  return new Map(entries)
}

test('aggregateWeeklyVolumeByMuscle: empty logs → buckets exist but muscles is empty', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 2)
  const out = aggregateWeeklyVolumeByMuscle([], muscleMap(), weeks)
  assert.equal(out.length, 2)
  for (const b of out) assert.deepEqual(b.muscles, {})
})

test('aggregateWeeklyVolumeByMuscle: primary-only attribution — full tonnage to primary', () => {
  // Bench 100×10 = 1000 tonnage. Resolver maps bench → primary [chest] only.
  const benchPrimaryOnly: ExerciseMuscles = { primary: ['chest'], secondary: [] }
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-27T00:00:00Z'), // Wed of that week
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [
        { weight: 100, reps: 10, completed: true },
      ]}],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', benchPrimaryOnly]),
    weeks,
  )
  assert.equal(out[0].muscles.chest, 1000)
  // No other muscle keys.
  assert.deepEqual(Object.keys(out[0].muscles), ['chest'])
})

test('aggregateWeeklyVolumeByMuscle: primary+secondary fractional (0.5×) attribution', () => {
  // Bench 100×10 = 1000 tonnage. With primary [chest] + secondary [triceps,
  // front_delts]: chest=1000, triceps=500, front_delts=500.
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-27T00:00:00Z'),
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [
        { weight: 100, reps: 10, completed: true },
      ]}],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', benchMuscles]),
    weeks,
  )
  assert.equal(out[0].muscles.chest, 1000)
  assert.equal(out[0].muscles.triceps, 500)
  assert.equal(out[0].muscles.front_delts, 500)
})

test('aggregateWeeklyVolumeByMuscle: multiple sets sum per exercise before attribution', () => {
  // 100×10 (1000) + 135×5 (675) = 1675 tonnage. Bench primary-only → chest=1675.
  const benchPrimaryOnly: ExerciseMuscles = { primary: ['chest'], secondary: [] }
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-27T00:00:00Z'),
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [
        { weight: 100, reps: 10, completed: true },
        { weight: 135, reps: 5, completed: true },
      ]}],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', benchPrimaryOnly]),
    weeks,
  )
  assert.equal(out[0].muscles.chest, 1675)
})

test('aggregateWeeklyVolumeByMuscle: multi-exercise aggregation within a week — overlapping muscles sum', () => {
  // Push day + leg day in the same week.
  // Bench 100×10 = 1000 → chest=1000, triceps=500, front_delts=500.
  // Squat 200×5 = 1000 → quads=1000, glutes=1000, hamstrings=500, adductors=500.
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-25T00:00:00Z'),
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [{ weight: 100, reps: 10, completed: true }]}],
    },
    {
      date: D('2026-05-27T00:00:00Z'),
      completed: true,
      exercises: [{ exerciseSlug: 'back-squat', sets: [{ weight: 200, reps: 5, completed: true }]}],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', benchMuscles], ['back-squat', squatMuscles]),
    weeks,
  )
  assert.equal(out[0].muscles.chest, 1000)
  assert.equal(out[0].muscles.triceps, 500)
  assert.equal(out[0].muscles.front_delts, 500)
  assert.equal(out[0].muscles.quads, 1000)
  assert.equal(out[0].muscles.glutes, 1000)
  assert.equal(out[0].muscles.hamstrings, 500)
  assert.equal(out[0].muscles.adductors, 500)
})

test('aggregateWeeklyVolumeByMuscle: same muscle from two exercises in one week sums', () => {
  // Bench primary [chest], db-bench primary [chest] — both should add up.
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-25T00:00:00Z'),
      completed: true,
      exercises: [
        { exerciseSlug: 'bench-press', sets: [{ weight: 100, reps: 10, completed: true }]},     // 1000
        { exerciseSlug: 'db-bench-press', sets: [{ weight: 50, reps: 12, completed: true }]},   // 600
      ],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(
      ['bench-press',    { primary: ['chest'], secondary: [] }],
      ['db-bench-press', { primary: ['chest'], secondary: [] }],
    ),
    weeks,
  )
  assert.equal(out[0].muscles.chest, 1600)
})

test('aggregateWeeklyVolumeByMuscle: ISO-week boundary — Sunday workout buckets into the PREVIOUS week', () => {
  // 2026-05-31 is Sunday. Its ISO week is the Mon 5/25 week, NOT Mon 6/1.
  const weeks = [
    isoWeekStart(D('2026-05-25T00:00:00Z')), // Mon 5/25
    isoWeekStart(D('2026-06-01T00:00:00Z')), // Mon 6/1
  ]
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-31T23:00:00Z'), // Sunday late evening UTC
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [{ weight: 100, reps: 10, completed: true }]}],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', { primary: ['chest'], secondary: [] }]),
    weeks,
  )
  assert.equal(out[0].muscles.chest, 1000) // Mon 5/25 bucket
  assert.equal(out[1].muscles.chest, undefined) // Mon 6/1 bucket empty
})

test('aggregateWeeklyVolumeByMuscle: ISO-week boundary — Monday workout buckets into THAT week', () => {
  const weeks = [
    isoWeekStart(D('2026-05-25T00:00:00Z')),
    isoWeekStart(D('2026-06-01T00:00:00Z')),
  ]
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-06-01T08:00:00Z'), // Monday
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [{ weight: 100, reps: 10, completed: true }]}],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', { primary: ['chest'], secondary: [] }]),
    weeks,
  )
  assert.equal(out[0].muscles.chest, undefined)
  assert.equal(out[1].muscles.chest, 1000)
})

test('aggregateWeeklyVolumeByMuscle: completed=false workout contributes nothing', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-25T00:00:00Z'),
      completed: false,
      exercises: [{ exerciseSlug: 'bench-press', sets: [{ weight: 100, reps: 10, completed: true }]}],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', benchMuscles]),
    weeks,
  )
  assert.deepEqual(out[0].muscles, {})
})

test('aggregateWeeklyVolumeByMuscle: incomplete or zero-weight/rep sets contribute nothing', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-25T00:00:00Z'),
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [
        { weight: 0, reps: 10, completed: true },     // bodyweight — dropped
        { weight: 100, reps: 0, completed: true },    // zero reps — dropped
        { weight: 200, reps: 1, completed: false },   // incomplete — dropped
        { weight: 135, reps: 5, completed: true },    // 675 counted
      ]}],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', { primary: ['chest'], secondary: [] }]),
    weeks,
  )
  assert.equal(out[0].muscles.chest, 675)
})

test('aggregateWeeklyVolumeByMuscle: exercise missing from resolver is silently skipped', () => {
  // Unresolved slugs shouldn't crash; their tonnage is lost (intentional — we
  // can't attribute volume without knowing the muscles).
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-05-25T00:00:00Z'),
      completed: true,
      exercises: [
        { exerciseSlug: 'bench-press', sets: [{ weight: 100, reps: 10, completed: true }]},
        { exerciseSlug: 'mystery-lift', sets: [{ weight: 500, reps: 1, completed: true }]},
      ],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', { primary: ['chest'], secondary: [] }]),
    weeks,
  )
  assert.equal(out[0].muscles.chest, 1000)
  assert.equal(Object.keys(out[0].muscles).length, 1)
})

test('aggregateWeeklyVolumeByMuscle: workout outside the rolling window is ignored', () => {
  const weeks = lastNWeekStarts(D('2026-05-25T00:00:00Z'), 1)
  const logs: RawWorkoutLog[] = [
    {
      date: D('2026-01-01T00:00:00Z'), // way before the window
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [{ weight: 100, reps: 10, completed: true }]}],
    },
  ]
  const out = aggregateWeeklyVolumeByMuscle(
    logs,
    muscleMap(['bench-press', benchMuscles]),
    weeks,
  )
  assert.deepEqual(out[0].muscles, {})
})

// ── collectExerciseSlugs ───────────────────────────────────────────────────

test('collectExerciseSlugs: dedupes and lowercases', () => {
  const logs: RawWorkoutLog[] = [
    { date: new Date(), exercises: [
      { exerciseSlug: 'Bench-Press', sets: [] },
      { exerciseSlug: 'bench-press', sets: [] },
      { exerciseSlug: 'back-squat',  sets: [] },
    ]},
  ]
  const slugs = collectExerciseSlugs(logs).sort()
  assert.deepEqual(slugs, ['back-squat', 'bench-press'])
})

test('collectExerciseSlugs: empty logs → empty array', () => {
  assert.deepEqual(collectExerciseSlugs([]), [])
})

// ── computeWeeklyVolumeByMuscle (end-to-end with injection) ────────────────

test('computeWeeklyVolumeByMuscle: end-to-end with injected reader + resolver', async () => {
  const now = D('2026-05-28T00:00:00Z') // Thu of week-of-Mon-5/25
  const reader: WorkoutLogReader = async () => [
    {
      date: D('2026-05-25T00:00:00Z'),
      completed: true,
      exercises: [{ exerciseSlug: 'bench-press', sets: [{ weight: 100, reps: 10, completed: true }]}],
    },
  ]
  const resolver: ExerciseMusclesResolver = async (slugs) => {
    const out = new Map<string, ExerciseMuscles>()
    for (const s of slugs) {
      if (s === 'bench-press') out.set(s, benchMuscles)
    }
    return out
  }
  const buckets = await computeWeeklyVolumeByMuscle({
    userId: 'u',
    weeks: 2,
    now,
    readWorkoutLogs: reader,
    resolveExerciseMuscles: resolver,
  })
  assert.equal(buckets.length, 2)
  // First bucket = previous week (5/18) — empty.
  assert.deepEqual(buckets[0].muscles, {})
  // Second bucket = current week (5/25) — bench attribution.
  assert.equal(buckets[1].muscles.chest, 1000)
  assert.equal(buckets[1].muscles.triceps, 500)
})

// ── bucketsToDataPoints ────────────────────────────────────────────────────

test('bucketsToDataPoints: one DataPoint per (week, muscle) pair', () => {
  const points = bucketsToDataPoints([
    { weekStart: D('2026-05-25T00:00:00Z'), muscles: { chest: 1000, triceps: 500 } },
    { weekStart: D('2026-06-01T00:00:00Z'), muscles: {} },
  ])
  assert.equal(points.length, 2)
  assert.deepEqual(points.map(p => p.label).sort(), ['chest', 'triceps'])
  for (const p of points) {
    assert.equal(p.t.toISOString(), '2026-05-25T00:00:00.000Z')
  }
})

test('bucketsToDataPoints: skips zero values', () => {
  const points = bucketsToDataPoints([
    { weekStart: D('2026-05-25T00:00:00Z'), muscles: { chest: 1000, triceps: 0 } },
  ])
  assert.equal(points.length, 1)
  assert.equal(points[0].label, 'chest')
})

// ── Registry adapter ───────────────────────────────────────────────────────

test('WEEKLY_VOLUME_BY_MUSCLE_METRIC: shape matches platform Metric contract', () => {
  assert.equal(WEEKLY_VOLUME_BY_MUSCLE_METRIC.id, 'workout.weekly-volume-by-muscle')
  assert.equal(WEEKLY_VOLUME_BY_MUSCLE_METRIC.domain, 'workout')
  assert.equal(WEEKLY_VOLUME_BY_MUSCLE_METRIC.unit, 'lb')
  assert.equal(typeof WEEKLY_VOLUME_BY_MUSCLE_METRIC.compute, 'function')
})

test('ensureWeeklyVolumeByMuscleRegistered: registers under id, idempotent', () => {
  __resetRegistryForTest()
  __resetWeeklyVolumeRegistrationForTest()
  ensureWeeklyVolumeByMuscleRegistered()
  ensureWeeklyVolumeByMuscleRegistered() // second call: must not throw
  const m = resolveMetric('workout.weekly-volume-by-muscle')
  assert.ok(m)
  assert.equal(m!.id, 'workout.weekly-volume-by-muscle')
})
