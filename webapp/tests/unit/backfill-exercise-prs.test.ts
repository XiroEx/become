// Run with: npx tsx --test tests/unit/backfill-exercise-prs.test.ts
//
// Tests the pure replay logic used by scripts/migrate-backfill-exercise-prs.ts.
// The DB-touching parts of the script are exercised manually with --dry-run in
// production; this suite locks in determinism + idempotency + correctness of
// the per-log replay through the same updatePRsForWorkout helper the live
// write path uses, so the backfill output matches what running the live path
// would have produced.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  computeExercisePRsFromLogs,
  updatePRsForWorkout,
  type IWorkoutLogForReplay,
  type IExercisePR,
} from '../../lib/exercisePRs'
import { fingerprintPR, diffUser, isBackfillNoop } from '../../lib/backfillDiff'

const seedLogs: IWorkoutLogForReplay[] = [
  // Day 1: open with 95×5 bench
  {
    date: new Date('2026-01-01T18:00:00Z'),
    programId: 'prog-1',
    completed: true,
    exercises: [
      {
        name: 'Bench Press',
        exerciseSlug: 'bench-press',
        sets: [{ weight: 95, reps: 5, completed: true }],
      },
    ],
  },
  // Day 5: bench 100×5 (new maxWeight + maxReps tied via tiebreaker + new e1rm)
  // Also add Pull Ups bodyweight 10
  {
    date: new Date('2026-01-05T18:00:00Z'),
    programId: 'prog-1',
    completed: true,
    exercises: [
      {
        name: 'Bench Press',
        exerciseSlug: 'bench-press',
        sets: [{ weight: 100, reps: 5, completed: true }],
      },
      {
        name: 'Pull Ups',
        exerciseSlug: 'pull-ups',
        sets: [{ weight: 0, reps: 10, completed: true }],
      },
    ],
  },
  // Day 10: incomplete workout — must be ignored entirely
  {
    date: new Date('2026-01-10T18:00:00Z'),
    programId: 'prog-1',
    completed: false,
    exercises: [
      {
        name: 'Bench Press',
        exerciseSlug: 'bench-press',
        sets: [{ weight: 500, reps: 20, completed: true }],
      },
    ],
  },
  // Day 15: 105×3 bench (new maxWeight; not maxReps; new e1rm? 105*(1+3/30)=115.5 vs prior 100*(1+5/30)=116.67 — does NOT beat e1rm)
  {
    date: new Date('2026-01-15T18:00:00Z'),
    programId: 'prog-2',
    completed: true,
    exercises: [
      {
        name: 'Bench Press',
        exerciseSlug: 'bench-press',
        sets: [{ weight: 105, reps: 3, completed: true }],
      },
    ],
  },
]

test('computeExercisePRsFromLogs replays logs in chronological order', () => {
  const prs = computeExercisePRsFromLogs(seedLogs)
  assert.equal(prs.length, 2) // bench-press + pull-ups
  const bench = prs.find((p) => p.exerciseSlug === 'bench-press')
  const pullUps = prs.find((p) => p.exerciseSlug === 'pull-ups')

  assert.ok(bench)
  assert.equal(bench!.maxWeight?.weight, 105)
  assert.equal(bench!.maxWeight?.reps, 3)
  assert.equal(bench!.maxWeight?.programId, 'prog-2')
  // maxReps stuck at 5 (100×5 beat 95×5 on weight tiebreaker)
  assert.equal(bench!.maxReps?.weight, 100)
  assert.equal(bench!.maxReps?.reps, 5)
  // maxE1RM: 100*(1+5/30) ≈ 116.67 > 105*(1+3/30) = 115.5 → 100×5 stays
  assert.equal(bench!.maxE1RM?.weight, 100)
  assert.equal(bench!.maxE1RM?.reps, 5)

  assert.ok(pullUps)
  assert.equal(pullUps!.maxReps?.reps, 10)
  assert.equal(pullUps!.maxWeight, null)
})

test('computeExercisePRsFromLogs ignores incomplete workouts', () => {
  // The 500×20 set on Day 10 is in a completed:false log — must be invisible.
  const prs = computeExercisePRsFromLogs(seedLogs)
  const bench = prs.find((p) => p.exerciseSlug === 'bench-press')
  assert.ok(bench!.maxWeight!.weight <= 105) // never sees 500
  assert.ok(bench!.maxReps!.reps <= 5)       // never sees 20
})

test('computeExercisePRsFromLogs sorts chronologically regardless of input order', () => {
  const shuffled = [seedLogs[3], seedLogs[1], seedLogs[0], seedLogs[2]]
  const a = computeExercisePRsFromLogs(seedLogs)
  const b = computeExercisePRsFromLogs(shuffled)
  // Same final state regardless of input order.
  assert.deepEqual(a, b)
})

test('computeExercisePRsFromLogs is deterministic — re-running gives same output', () => {
  const a = computeExercisePRsFromLogs(seedLogs)
  const b = computeExercisePRsFromLogs(seedLogs)
  assert.deepEqual(a, b)
})

test('backfill output matches live-path output when sets are applied incrementally', () => {
  // Idempotency-by-equivalence: the backfill's computeExercisePRsFromLogs
  // must produce the same final state as applying updatePRsForWorkout
  // one log at a time in chronological order (which is what the live write
  // path does on every save).
  const sortedCompleted = seedLogs
    .filter((l) => l.completed)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let live: IExercisePR[] = []
  for (const log of sortedCompleted) {
    const { prs } = updatePRsForWorkout(
      live,
      log.exercises ?? [],
      new Date(log.date),
      log.programId,
    )
    live = prs
  }
  const backfilled = computeExercisePRsFromLogs(seedLogs)
  assert.deepEqual(backfilled, live)
})

test('backfill is idempotent — running again on already-backfilled data is a no-op', () => {
  // Simulates running the migration twice: first pass writes computed PRs,
  // second pass should produce the same array.
  const first = computeExercisePRsFromLogs(seedLogs)
  // Pretend user's doc now has first as exercisePRs and we run backfill again.
  // The script REPLACES exercisePRs with the recomputed value — so the
  // recomputed value must equal the prior value.
  const second = computeExercisePRsFromLogs(seedLogs)
  assert.deepEqual(first, second)
})

test('empty logs produce empty PR array', () => {
  assert.deepEqual(computeExercisePRsFromLogs([]), [])
})

test('all-incomplete logs produce empty PR array', () => {
  const logs: IWorkoutLogForReplay[] = [
    {
      date: new Date('2026-01-01'),
      completed: false,
      exercises: [{ name: 'Bench', exerciseSlug: 'bench', sets: [{ weight: 100, reps: 5, completed: true }] }],
    },
  ]
  assert.deepEqual(computeExercisePRsFromLogs(logs), [])
})

// ── fingerprintPR / diffUser / isBackfillNoop ───────────────────────────────

test('fingerprintPR returns "" for null/undefined; same record → same fingerprint', () => {
  assert.equal(fingerprintPR(null), '')
  assert.equal(fingerprintPR(undefined), '')
  const pr: IExercisePR = {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: { weight: 225, reps: 5, date: new Date('2026-04-01T12:00:00Z'), programId: 'p1' },
    maxReps: null,
    maxE1RM: null,
  }
  const a = fingerprintPR(pr)
  const b = fingerprintPR({ ...pr })
  assert.equal(a, b)
})

test('fingerprintPR ignores Date-instance vs ISO-string differences (lean docs)', () => {
  // Mongoose .lean() can hand back Date or ISO string depending on caller —
  // the fingerprint must treat both the same so no spurious diff fires.
  const dateMs = new Date('2026-04-01T12:00:00Z').getTime()
  const withDate: IExercisePR = {
    exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
    maxWeight: { weight: 200, reps: 5, date: new Date(dateMs) }, maxReps: null, maxE1RM: null,
  }
  const withString: IExercisePR = {
    exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
    maxWeight: { weight: 200, reps: 5, date: new Date('2026-04-01T12:00:00Z').toISOString() as unknown as Date },
    maxReps: null, maxE1RM: null,
  }
  assert.equal(fingerprintPR(withDate), fingerprintPR(withString))
})

test('fingerprintPR detects a weight delta as a different fingerprint', () => {
  const a: IExercisePR = {
    exerciseSlug: 'b', exerciseName: 'B',
    maxWeight: { weight: 100, reps: 5, date: new Date('2026-01-01') }, maxReps: null, maxE1RM: null,
  }
  const b: IExercisePR = { ...a, maxWeight: { weight: 105, reps: 5, date: new Date('2026-01-01') } }
  assert.notEqual(fingerprintPR(a), fingerprintPR(b))
})

test('diffUser classifies added / changed / unchanged correctly', () => {
  const before: IExercisePR[] = [
    {
      exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
      maxWeight: { weight: 100, reps: 5, date: new Date('2026-01-01') },
      maxReps: null, maxE1RM: null,
    },
    {
      exerciseSlug: 'squat', exerciseName: 'Squat',
      maxWeight: { weight: 200, reps: 5, date: new Date('2026-01-02') },
      maxReps: null, maxE1RM: null,
    },
  ]
  const after: IExercisePR[] = [
    // unchanged
    {
      exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
      maxWeight: { weight: 100, reps: 5, date: new Date('2026-01-01') },
      maxReps: null, maxE1RM: null,
    },
    // changed (weight bumped)
    {
      exerciseSlug: 'squat', exerciseName: 'Squat',
      maxWeight: { weight: 225, reps: 5, date: new Date('2026-01-02') },
      maxReps: null, maxE1RM: null,
    },
    // added (new exercise)
    {
      exerciseSlug: 'deadlift', exerciseName: 'Deadlift',
      maxWeight: { weight: 315, reps: 3, date: new Date('2026-01-03') },
      maxReps: null, maxE1RM: null,
    },
  ]
  const diff = diffUser(before, after)
  assert.deepEqual(diff.added, ['deadlift'])
  assert.deepEqual(diff.changed, ['squat'])
  assert.equal(diff.unchanged, 1)
})

test('diffUser handles undefined "before" (first-time migration)', () => {
  const after: IExercisePR[] = [
    {
      exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
      maxWeight: { weight: 100, reps: 5, date: new Date('2026-01-01') },
      maxReps: null, maxE1RM: null,
    },
  ]
  const diff = diffUser(undefined, after)
  assert.deepEqual(diff.added, ['bench-press'])
  assert.equal(diff.changed.length, 0)
  assert.equal(diff.unchanged, 0)
})

test('isBackfillNoop=true when recomputed PRs are identical to persisted', () => {
  const prs = computeExercisePRsFromLogs(seedLogs)
  assert.equal(isBackfillNoop(prs, prs), true)
  // Length match + every record matches → no-op.
  const clone = JSON.parse(JSON.stringify(prs)) as IExercisePR[]
  assert.equal(isBackfillNoop(prs, clone), true)
})

test('isBackfillNoop=false when length differs (orphan PR removed)', () => {
  const a: IExercisePR[] = [
    {
      exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
      maxWeight: { weight: 100, reps: 5, date: new Date('2026-01-01') },
      maxReps: null, maxE1RM: null,
    },
  ]
  assert.equal(isBackfillNoop(a, []), false)
})

test('isBackfillNoop=false when one PR differs', () => {
  const before: IExercisePR[] = [
    {
      exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
      maxWeight: { weight: 100, reps: 5, date: new Date('2026-01-01') },
      maxReps: null, maxE1RM: null,
    },
  ]
  const after: IExercisePR[] = [
    {
      exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
      maxWeight: { weight: 105, reps: 5, date: new Date('2026-01-01') },
      maxReps: null, maxE1RM: null,
    },
  ]
  assert.equal(isBackfillNoop(before, after), false)
})

// ── Cursor-filter guard: empty-workoutLogs users must be skipped ────────────

test('migration cursor filter excludes users with empty/missing workoutLogs', () => {
  // The script issues UserProgress.find with a filter that must skip docs
  // whose workoutLogs is missing, non-array, or empty — otherwise we'd waste
  // an updateOne writing exercisePRs=[] to brand-new users. Guard the literal
  // filter shape so a regression here fails the suite.
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'migrate-backfill-exercise-prs.ts')
  const src = fs.readFileSync(scriptPath, 'utf8')
  assert.ok(
    src.includes("workoutLogs: { $exists: true, $type: 'array', $ne: [] }"),
    'cursor filter must skip users with missing/non-array/empty workoutLogs',
  )
})

test('migration uses isBackfillNoop to skip already-backfilled users', () => {
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'migrate-backfill-exercise-prs.ts')
  const src = fs.readFileSync(scriptPath, 'utf8')
  assert.ok(src.includes('isBackfillNoop('), 'no-op skip path must use the extracted helper')
  // The legacy inline check must be gone.
  assert.equal(
    src.includes('diff.added.length === 0 &&'),
    false,
    'legacy inline no-op check must be removed in favor of isBackfillNoop',
  )
})

test('migration gates updateOne behind !isDryRun (dry-run never writes)', () => {
  // Acceptance for the phase explicitly calls out --dry-run; lock the gate so
  // a future refactor can't accidentally drop the guard and have a dry-run
  // start writing.
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'migrate-backfill-exercise-prs.ts')
  const src = fs.readFileSync(scriptPath, 'utf8')
  // isDryRun must come from argv...
  assert.ok(
    src.includes("process.argv.includes('--dry-run')"),
    'isDryRun must be parsed from --dry-run argv',
  )
  // ...and the only updateOne call site must be inside an `if (!isDryRun)` block.
  const updateOneIdx = src.indexOf('UserProgress.updateOne(')
  assert.ok(updateOneIdx > 0, 'script must contain a UserProgress.updateOne call')
  // Look back in the source for the nearest enclosing `if (...)` and assert
  // it gates on !isDryRun. (Cheap heuristic — the script is small and the
  // only updateOne is the one we care about.)
  const preceding = src.slice(0, updateOneIdx)
  const nearestIf = preceding.lastIndexOf('if (')
  assert.ok(nearestIf > 0, 'updateOne must be inside an if-block')
  const guard = src.slice(nearestIf, updateOneIdx)
  assert.ok(
    guard.includes('!isDryRun'),
    `updateOne must be gated by !isDryRun; got: ${guard.replace(/\s+/g, ' ').slice(0, 120)}…`,
  )
})

test('dry-run summary line distinguishes "would have written" from actual writes', () => {
  // The per-run summary at end-of-main must show the dry-run hypothetical
  // (summaries.length - skipped) rather than the actual writes counter,
  // otherwise dry-run output is indistinguishable from a no-op real run.
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'migrate-backfill-exercise-prs.ts')
  const src = fs.readFileSync(scriptPath, 'utf8')
  assert.ok(
    src.includes('dry-run, would have written'),
    'summary must label dry-run hypothetical writes distinctly',
  )
})
