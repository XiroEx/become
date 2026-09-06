// Run with: npm run test:file tests/unit/exercisePRs.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  updatePRsForSet,
  updatePRsForWorkout,
  epley1RM,
  computeExercisePRsFromLogs,
  formatPRsForLiveWorkout,
  formatPRsForProgressDetail,
  type IExercisePR,
  type IPRSetContext,
} from '../../lib/exercisePRs'

const baseCtx: IPRSetContext = {
  exerciseSlug: 'bench-press',
  exerciseName: 'Bench Press',
  date: new Date('2026-05-26T10:00:00Z'),
  programId: 'prog-1',
}

test('epley1RM returns 0 for non-positive inputs', () => {
  assert.equal(epley1RM(0, 5), 0)
  assert.equal(epley1RM(100, 0), 0)
  assert.equal(epley1RM(-10, 5), 0)
  assert.equal(epley1RM(NaN, 5), 0)
})

test('epley1RM computes weight × (1 + reps/30)', () => {
  // 225 × 5 reps → 225 × (1 + 5/30) = 225 × 1.1667 ≈ 262.5
  assert.equal(Math.round(epley1RM(225, 5) * 10) / 10, 262.5)
  // 100 × 10 reps → 100 × (1 + 10/30) ≈ 133.33
  assert.equal(Math.round(epley1RM(100, 10) * 100) / 100, 133.33)
})

test('first-ever completed set creates PR across all three dimensions', () => {
  const { pr, newPRsAchieved } = updatePRsForSet(null, { weight: 100, reps: 8, completed: true }, baseCtx)
  assert.deepEqual(newPRsAchieved.sort(), ['maxE1RM', 'maxReps', 'maxWeight'])
  assert.equal(pr.exerciseSlug, 'bench-press')
  assert.equal(pr.exerciseName, 'Bench Press')
  assert.equal(pr.maxWeight?.weight, 100)
  assert.equal(pr.maxWeight?.reps, 8)
  assert.equal(pr.maxWeight?.programId, 'prog-1')
  assert.equal(pr.maxReps?.reps, 8)
  assert.equal(pr.maxE1RM?.weight, 100)
  assert.ok((pr.maxE1RM?.e1rm ?? 0) > 0)
})

test('incomplete set never breaks PRs', () => {
  const { pr, newPRsAchieved } = updatePRsForSet(null, { weight: 500, reps: 20, completed: false }, baseCtx)
  assert.deepEqual(newPRsAchieved, [])
  assert.equal(pr.maxWeight, null)
  assert.equal(pr.maxReps, null)
  assert.equal(pr.maxE1RM, null)
})

test('zero-rep set ignored entirely', () => {
  const { pr, newPRsAchieved } = updatePRsForSet(null, { weight: 100, reps: 0, completed: true }, baseCtx)
  assert.deepEqual(newPRsAchieved, [])
  assert.equal(pr.maxWeight, null)
  assert.equal(pr.maxReps, null)
})

test('heavier weight beats existing maxWeight; same-or-lighter does not', () => {
  const existing: IExercisePR = {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: { weight: 100, reps: 8, date: new Date('2026-01-01'), programId: 'prog-1' },
    maxReps: { weight: 100, reps: 8, date: new Date('2026-01-01'), programId: 'prog-1' },
    maxE1RM: { weight: 100, reps: 8, e1rm: epley1RM(100, 8), date: new Date('2026-01-01'), programId: 'prog-1' },
  }
  const heavier = updatePRsForSet(existing, { weight: 110, reps: 5, completed: true }, baseCtx)
  assert.ok(heavier.newPRsAchieved.includes('maxWeight'))
  assert.equal(heavier.pr.maxWeight?.weight, 110)

  const lighter = updatePRsForSet(existing, { weight: 95, reps: 8, completed: true }, baseCtx)
  assert.equal(lighter.newPRsAchieved.includes('maxWeight'), false)
  assert.equal(lighter.pr.maxWeight?.weight, 100) // unchanged
})

test('equal weight + more reps beats existing maxWeight (tiebreaker)', () => {
  const existing: IExercisePR = {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: { weight: 100, reps: 5, date: new Date('2026-01-01') },
    maxReps: null,
    maxE1RM: null,
  }
  const { pr, newPRsAchieved } = updatePRsForSet(existing, { weight: 100, reps: 8, completed: true }, baseCtx)
  assert.ok(newPRsAchieved.includes('maxWeight'))
  assert.equal(pr.maxWeight?.weight, 100)
  assert.equal(pr.maxWeight?.reps, 8)
})

test('equal weight + equal reps does NOT break PR (no second-time trigger)', () => {
  const existing: IExercisePR = {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: { weight: 100, reps: 8, date: new Date('2026-01-01') },
    maxReps: { weight: 100, reps: 8, date: new Date('2026-01-01') },
    maxE1RM: { weight: 100, reps: 8, e1rm: epley1RM(100, 8), date: new Date('2026-01-01') },
  }
  const { newPRsAchieved } = updatePRsForSet(existing, { weight: 100, reps: 8, completed: true }, baseCtx)
  assert.deepEqual(newPRsAchieved, [])
})

test('bodyweight set (weight=0) breaks maxReps but not maxWeight or maxE1RM', () => {
  const { pr, newPRsAchieved } = updatePRsForSet(null, { weight: 0, reps: 15, completed: true }, baseCtx)
  assert.deepEqual(newPRsAchieved, ['maxReps'])
  assert.equal(pr.maxWeight, null)
  assert.equal(pr.maxReps?.reps, 15)
  assert.equal(pr.maxReps?.weight, 0)
  assert.equal(pr.maxE1RM, null)
})

test('multi-dimension PRs tracked independently — heavy-low-rep vs light-high-rep', () => {
  // Start with a heavy single: 200 × 1
  const after1 = updatePRsForSet(null, { weight: 200, reps: 1, completed: true }, baseCtx)
  assert.equal(after1.pr.maxWeight?.weight, 200)
  assert.equal(after1.pr.maxReps?.reps, 1)
  const e1rm1 = after1.pr.maxE1RM?.e1rm ?? 0
  assert.ok(e1rm1 > 0)

  // Then a high-rep set: 100 × 20. Doesn't beat maxWeight (100 < 200) but
  // does beat maxReps (20 > 1) and maxE1RM (100*1.667 ≈ 166.7 < 200*1.033 ≈ 206.7? actually e1rm of 200×1 = 200*(1+1/30) = 206.67; e1rm of 100×20 = 100*(1+20/30) = 166.67 → does NOT beat).
  const after2 = updatePRsForSet(after1.pr, { weight: 100, reps: 20, completed: true }, baseCtx)
  assert.equal(after2.newPRsAchieved.includes('maxWeight'), false)
  assert.ok(after2.newPRsAchieved.includes('maxReps'))
  assert.equal(after2.newPRsAchieved.includes('maxE1RM'), false)
  assert.equal(after2.pr.maxWeight?.weight, 200) // still 200
  assert.equal(after2.pr.maxReps?.reps, 20)
  assert.equal(after2.pr.maxE1RM?.weight, 200) // unchanged

  // Now a moderate set that beats maxE1RM but neither extreme: 180 × 5 → e1rm = 180*(1+5/30) = 210
  const after3 = updatePRsForSet(after2.pr, { weight: 180, reps: 5, completed: true }, baseCtx)
  assert.equal(after3.newPRsAchieved.includes('maxWeight'), false)
  assert.equal(after3.newPRsAchieved.includes('maxReps'), false)
  assert.ok(after3.newPRsAchieved.includes('maxE1RM'))
  assert.equal(after3.pr.maxE1RM?.weight, 180)
  assert.equal(after3.pr.maxE1RM?.reps, 5)
})

test('updatePRsForWorkout processes multiple exercises and reports per-exercise PRs', () => {
  const workoutDate = new Date('2026-05-26T18:00:00Z')
  const { prs, newPRsAchieved } = updatePRsForWorkout(
    [],
    [
      {
        name: 'Bench Press',
        exerciseSlug: 'bench-press',
        sets: [
          { weight: 100, reps: 5, completed: true },
          { weight: 105, reps: 5, completed: true },
          { weight: 110, reps: 3, completed: true },
        ],
      },
      {
        name: 'Pull Ups',
        exerciseSlug: 'pull-ups',
        sets: [
          { weight: 0, reps: 10, completed: true },
          { weight: 0, reps: 8, completed: true },
        ],
      },
      {
        name: 'Squat',
        sets: [{ weight: 100, reps: 3, completed: false }], // never completed → ignored
      },
    ],
    workoutDate,
    'prog-1',
  )

  // Squat had only an incomplete set — no PR record should be persisted at all.
  assert.equal(prs.length, 2) // bench + pull-ups only
  const bench = prs.find((p) => p.exerciseSlug === 'bench-press')
  const pullUps = prs.find((p) => p.exerciseSlug === 'pull-ups')
  const squat = prs.find((p) => p.exerciseSlug === 'squat')

  assert.ok(bench)
  assert.equal(bench!.maxWeight?.weight, 110)
  assert.equal(bench!.maxWeight?.reps, 3)
  assert.equal(bench!.maxReps?.reps, 5) // ties at 5; 105×5 beats 100×5 on weight tiebreaker
  assert.equal(bench!.maxReps?.weight, 105)

  assert.ok(pullUps)
  assert.equal(pullUps!.maxReps?.reps, 10)
  assert.equal(pullUps!.maxWeight, null) // never had positive weight
  assert.equal(pullUps!.maxE1RM, null)

  assert.equal(squat, undefined)

  // newPRsAchieved should NOT include squat.
  const slugs = newPRsAchieved.map((p) => p.exerciseSlug).sort()
  assert.deepEqual(slugs, ['bench-press', 'pull-ups'])
})

test('updatePRsForWorkout is idempotent — re-running same workout breaks no new PRs', () => {
  const workoutDate = new Date('2026-05-26T18:00:00Z')
  const exercises = [
    {
      name: 'Deadlift',
      exerciseSlug: 'deadlift',
      sets: [{ weight: 315, reps: 5, completed: true }],
    },
  ]
  const first = updatePRsForWorkout([], exercises, workoutDate, 'prog-1')
  assert.equal(first.newPRsAchieved.length, 1)
  assert.equal(first.newPRsAchieved[0].dimensions.length, 3)

  const second = updatePRsForWorkout(first.prs, exercises, workoutDate, 'prog-1')
  assert.deepEqual(second.newPRsAchieved, [])
  assert.deepEqual(second.prs, first.prs)
})

test('updatePRsForWorkout uses provided slug; falls back to slugified name', () => {
  const date = new Date('2026-05-26')
  const { prs } = updatePRsForWorkout(
    [],
    [{ name: 'Romanian Deadlift', sets: [{ weight: 135, reps: 8, completed: true }] }],
    date,
  )
  assert.equal(prs.length, 1)
  assert.equal(prs[0].exerciseSlug, 'romanian-deadlift')
})

test('updatePRsForWorkout preserves existing PRs for exercises not in this workout', () => {
  const existing: IExercisePR[] = [
    {
      exerciseSlug: 'overhead-press',
      exerciseName: 'Overhead Press',
      maxWeight: { weight: 135, reps: 5, date: new Date('2026-01-01') },
      maxReps: { weight: 135, reps: 5, date: new Date('2026-01-01') },
      maxE1RM: { weight: 135, reps: 5, e1rm: epley1RM(135, 5), date: new Date('2026-01-01') },
    },
  ]
  const { prs } = updatePRsForWorkout(
    existing,
    [
      {
        name: 'Bench Press',
        exerciseSlug: 'bench-press',
        sets: [{ weight: 200, reps: 1, completed: true }],
      },
    ],
    new Date('2026-05-26'),
  )
  const ohp = prs.find((p) => p.exerciseSlug === 'overhead-press')
  assert.ok(ohp)
  assert.equal(ohp!.maxWeight?.weight, 135)
  assert.equal(prs.length, 2)
})

// ── Response-shape formatters (used by GET /api/workouts and /api/progress) ─

test('formatPRsForLiveWorkout produces legacy {name → {weight, reps}} shape', () => {
  const persisted: IExercisePR[] = [
    {
      exerciseSlug: 'bench-press',
      exerciseName: 'Bench Press',
      maxWeight: { weight: 225, reps: 5, date: new Date('2026-04-01'), programId: 'p1' },
      maxReps: { weight: 135, reps: 12, date: new Date('2026-04-02') },
      maxE1RM: { weight: 225, reps: 5, e1rm: 262.5, date: new Date('2026-04-01') },
    },
    {
      exerciseSlug: 'pull-ups',
      exerciseName: 'Pull Ups',
      maxWeight: null, // bodyweight only — should be skipped
      maxReps: { weight: 0, reps: 15, date: new Date('2026-04-03') },
      maxE1RM: null,
    },
  ]
  const result = formatPRsForLiveWorkout(persisted)
  // Pull Ups absent because maxWeight is null (legacy shape only ever emitted weighted PRs).
  assert.deepEqual(result, {
    'Bench Press': { weight: 225, reps: 5 },
  })
})

test('formatPRsForLiveWorkout handles null/empty input safely', () => {
  assert.deepEqual(formatPRsForLiveWorkout(null), {})
  assert.deepEqual(formatPRsForLiveWorkout(undefined), {})
  assert.deepEqual(formatPRsForLiveWorkout([]), {})
})

test('formatPRsForProgressDetail produces {slug → {name, weight, reps, date}} shape', () => {
  const persisted: IExercisePR[] = [
    {
      exerciseSlug: 'bench-press',
      exerciseName: 'Bench Press',
      maxWeight: { weight: 225, reps: 5, date: new Date('2026-04-01T12:00:00Z') },
      maxReps: null,
      maxE1RM: null,
    },
    {
      exerciseSlug: 'squat',
      exerciseName: 'Back Squat',
      maxWeight: { weight: 315, reps: 3, date: new Date('2026-04-15T12:00:00Z') },
      maxReps: null,
      maxE1RM: null,
    },
    {
      exerciseSlug: 'pull-ups',
      exerciseName: 'Pull Ups',
      maxWeight: null, // bodyweight only — should be skipped
      maxReps: { weight: 0, reps: 12, date: new Date('2026-04-02') },
      maxE1RM: null,
    },
  ]
  const result = formatPRsForProgressDetail(persisted)
  assert.equal(Object.keys(result).length, 2)
  assert.deepEqual(result['bench-press'], {
    name: 'Bench Press',
    weight: 225,
    reps: 5,
    date: new Date('2026-04-01T12:00:00Z'),
  })
  assert.equal(result['squat'].name, 'Back Squat')
  assert.equal(result['squat'].weight, 315)
})

test('formatPRsForProgressDetail handles null/empty input safely', () => {
  assert.deepEqual(formatPRsForProgressDetail(null), {})
  assert.deepEqual(formatPRsForProgressDetail(undefined), {})
  assert.deepEqual(formatPRsForProgressDetail([]), {})
})

test('formatters skip malformed records (each by the field it keys on)', () => {
  const persisted = [
    {
      // missing exerciseSlug — live-workout formatter (keyed by name) keeps this;
      // progress formatter (keyed by slug) drops it.
      exerciseName: 'Bench Press',
      maxWeight: { weight: 100, reps: 5, date: new Date() },
      maxReps: null,
      maxE1RM: null,
    },
    {
      exerciseSlug: 'squat',
      // missing exerciseName — both formatters drop this (live needs name as key,
      // progress needs name in the payload).
      maxWeight: { weight: 200, reps: 5, date: new Date() },
      maxReps: null,
      maxE1RM: null,
    },
  ] as unknown as IExercisePR[]
  // Live-workout formatter retains the named-but-slugless record.
  assert.deepEqual(formatPRsForLiveWorkout(persisted), {
    'Bench Press': { weight: 100, reps: 5 },
  })
  // Progress formatter requires both slug and name.
  assert.deepEqual(formatPRsForProgressDetail(persisted), {})
})

// Round-trip: build PRs via updatePRsForWorkout, then format — same shape as
// what the old on-the-fly code would have produced for those same sets.
test('round trip: persisted PRs → formatted response matches legacy shape', () => {
  const date = new Date('2026-05-26T18:00:00Z')
  const { prs } = updatePRsForWorkout(
    [],
    [
      {
        name: 'Bench Press',
        exerciseSlug: 'bench-press',
        sets: [
          { weight: 100, reps: 8, completed: true },
          { weight: 110, reps: 5, completed: true },
        ],
      },
    ],
    date,
    'prog-1',
  )
  const live = formatPRsForLiveWorkout(prs)
  assert.deepEqual(live, { 'Bench Press': { weight: 110, reps: 5 } })
  const progress = formatPRsForProgressDetail(prs)
  assert.deepEqual(progress, {
    'bench-press': { name: 'Bench Press', weight: 110, reps: 5, date },
  })
})

test('display name on PR is refreshed to latest workout name on update', () => {
  const existing: IExercisePR = {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: { weight: 100, reps: 5, date: new Date('2026-01-01') },
    maxReps: null,
    maxE1RM: null,
  }
  const { pr } = updatePRsForSet(
    existing,
    { weight: 105, reps: 5, completed: true },
    { ...baseCtx, exerciseName: 'Barbell Bench Press' },
  )
  assert.equal(pr.exerciseName, 'Barbell Bench Press')
})

// ── Defensive-coding branches: nullish set fields, empty name fallback ──────

test('empty context.exerciseName falls back to existing PR exerciseName', () => {
  const existing: IExercisePR = {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: null,
    maxReps: null,
    maxE1RM: null,
  }
  const { pr } = updatePRsForSet(
    existing,
    { weight: 100, reps: 5, completed: true },
    { ...baseCtx, exerciseName: '' },
  )
  assert.equal(pr.exerciseName, 'Bench Press')
})

test('undefined/null set fields coerce to 0 and behave as bodyweight/no-rep', () => {
  // weight=undefined → maxReps only (treated as bodyweight)
  const a = updatePRsForSet(null, { weight: undefined, reps: 10, completed: true }, baseCtx)
  assert.deepEqual(a.newPRsAchieved, ['maxReps'])
  assert.equal(a.pr.maxWeight, null)
  assert.equal(a.pr.maxReps?.weight, 0)
  // reps=undefined → ignored entirely
  const b = updatePRsForSet(null, { weight: 100, reps: undefined, completed: true }, baseCtx)
  assert.deepEqual(b.newPRsAchieved, [])
  // weight=null → maxReps only
  const c = updatePRsForSet(null, { weight: null, reps: 12, completed: true }, baseCtx)
  assert.deepEqual(c.newPRsAchieved, ['maxReps'])
  // weight non-numeric → Number(...) NaN → || 0 fallback → treated as bodyweight
  const d = updatePRsForSet(null, { weight: NaN, reps: 8, completed: true }, baseCtx)
  assert.deepEqual(d.newPRsAchieved, ['maxReps'])
  assert.equal(d.pr.maxReps?.weight, 0)
})

test('updatePRsForSet without programId in context omits programId on the PR', () => {
  const { pr } = updatePRsForSet(
    null,
    { weight: 100, reps: 5, completed: true },
    { exerciseSlug: 'bench-press', exerciseName: 'Bench Press', date: new Date('2026-05-26') },
  )
  // No programId in context → no programId on the saved PR
  assert.equal('programId' in (pr.maxWeight ?? {}), false)
  assert.equal('programId' in (pr.maxReps ?? {}), false)
  assert.equal('programId' in (pr.maxE1RM ?? {}), false)
})

test('computeExercisePRsFromLogs tolerates null/undefined log entries', () => {
  const logs = [
    null,
    undefined,
    {
      date: new Date('2026-05-26'),
      programId: 'p1',
      completed: true,
      exercises: [
        { name: 'Bench Press', exerciseSlug: 'bench-press', sets: [{ weight: 100, reps: 5, completed: true }] },
      ],
    },
  ] as unknown as Parameters<typeof computeExercisePRsFromLogs>[0]
  const prs = computeExercisePRsFromLogs(logs)
  assert.equal(prs.length, 1)
  assert.equal(prs[0].exerciseSlug, 'bench-press')
})

test('updatePRsForWorkout skips exercises whose name slugifies to empty', () => {
  const { prs } = updatePRsForWorkout(
    [],
    [{ name: '!!!', sets: [{ weight: 100, reps: 5, completed: true }] }],
    new Date('2026-05-26'),
  )
  assert.equal(prs.length, 0)
})

test('updatePRsForWorkout tolerates null sets and empty exerciseSlug', () => {
  const { prs } = updatePRsForWorkout(
    [],
    [
      // null sets → ?? [] fallback → no iteration → no PR record persisted
      { name: 'Phantom', exerciseSlug: 'phantom', sets: null },
      // empty/whitespace exerciseSlug → ?.trim() returns '' → || slugify(name)
      { name: 'Real Lift', exerciseSlug: '   ', sets: [{ weight: 100, reps: 5, completed: true }] },
    ],
    new Date('2026-05-26'),
  )
  assert.equal(prs.length, 1)
  assert.equal(prs[0].exerciseSlug, 'real-lift')
})

test('computeExercisePRsFromLogs tolerates logs with null exercises field', () => {
  const prs = computeExercisePRsFromLogs([
    { date: new Date('2026-05-26'), completed: true, exercises: null },
    {
      date: new Date('2026-05-27'),
      completed: true,
      exercises: [{ name: 'Squat', exerciseSlug: 'squat', sets: [{ weight: 225, reps: 5, completed: true }] }],
    },
  ])
  assert.equal(prs.length, 1)
  assert.equal(prs[0].exerciseSlug, 'squat')
})
