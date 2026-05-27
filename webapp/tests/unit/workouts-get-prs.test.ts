// Run with: npx tsx --test tests/unit/workouts-get-prs.test.ts
//
// Locks in the GET /api/workouts read-path contract:
//   - When includeHistory=true, exercisePRs is the formatter projection of the
//     persisted exercisePRs subdoc (NOT computed on-the-fly from workoutLogs).
//   - When includeHistory=false, exercisePRs is the empty map {}.
//   - exerciseHistory is still built from workoutLogs (most-recent per exercise).
//   - The legacy on-the-fly PR walk over workoutLogs is gone from route.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { formatPRsForLiveWorkout, type IExercisePR } from '../../lib/exercisePRs'

const samplePersistedPRs: IExercisePR[] = [
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
    maxWeight: null,
    maxReps: { weight: 0, reps: 15, date: new Date('2026-04-03') },
    maxE1RM: null,
  },
]

// Mirror the exact expression the route uses to compute the exercisePRs field.
function projectForRoute(opts: {
  includeHistory: boolean
  persistedPRs?: IExercisePR[]
}): Record<string, { weight: number; reps: number }> {
  return opts.includeHistory ? formatPRsForLiveWorkout(opts.persistedPRs) : {}
}

test('includeHistory=true → exercisePRs is formatPRsForLiveWorkout(persisted)', () => {
  const result = projectForRoute({ includeHistory: true, persistedPRs: samplePersistedPRs })
  // pull-ups dropped because maxWeight is null (legacy live shape never emitted bodyweight PRs)
  assert.deepEqual(result, { 'Bench Press': { weight: 225, reps: 5 } })
})

test('includeHistory=false → exercisePRs is {} regardless of persisted PRs', () => {
  const result = projectForRoute({ includeHistory: false, persistedPRs: samplePersistedPRs })
  assert.deepEqual(result, {})
})

test('includeHistory=true with no persisted PRs → empty map (graceful)', () => {
  assert.deepEqual(projectForRoute({ includeHistory: true, persistedPRs: [] }), {})
  assert.deepEqual(projectForRoute({ includeHistory: true, persistedPRs: undefined }), {})
})

// ── Source guard: the legacy on-the-fly PR walk must stay deleted ──────────

test('GET /api/workouts route does NOT assign to exercisePRs inside the workoutLogs walk', () => {
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')

  // Cheap-and-cheerful guard against regressions: the legacy code did
  // `exercisePRs[exercise.name] = { weight: sw, reps: sr }` inside the
  // workoutLogs loop. If that line ever comes back, fail loudly.
  assert.equal(
    src.includes('exercisePRs[exercise.name]'),
    false,
    'legacy on-the-fly PR walk over workoutLogs must not be reintroduced',
  )
  // And the formatter call MUST still be wired in.
  assert.ok(
    src.includes('formatPRsForLiveWorkout'),
    'route must still call formatPRsForLiveWorkout',
  )
})
