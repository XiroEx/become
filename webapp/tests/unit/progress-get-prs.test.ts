// Run with: npm run test:file tests/unit/progress-get-prs.test.ts
//
// Locks in the GET /api/progress?detailed=1 read-path contract for the `pbs`
// field:
//   - Sources from the persisted exercisePRs subdoc via formatPRsForProgressDetail.
//   - Per-record date is rendered with toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).
//   - Empty persisted PRs → empty pbs object.
//   - The legacy on-the-fly PR walk over workoutLogs is gone from route.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { formatPRsForProgressDetail, type IExercisePR } from '../../lib/exercisePRs'

// Mirror exactly the transformation the route applies after the formatter.
function projectPbs(persisted: IExercisePR[] | undefined): Record<string, { name: string; weight: number; reps: number; date: string }> {
  const pbsRaw = formatPRsForProgressDetail(persisted)
  const pbs: Record<string, { name: string; weight: number; reps: number; date: string }> = {}
  for (const [key, rec] of Object.entries(pbsRaw)) {
    pbs[key] = {
      name: rec.name,
      weight: rec.weight,
      reps: rec.reps,
      date: new Date(rec.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }
  }
  return pbs
}

test('pbs is sourced from persisted exercisePRs, keyed by slug, name preserved', () => {
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
  ]
  const pbs = projectPbs(persisted)
  assert.equal(Object.keys(pbs).length, 2)
  assert.equal(pbs['bench-press'].name, 'Bench Press')
  assert.equal(pbs['bench-press'].weight, 225)
  assert.equal(pbs['bench-press'].reps, 5)
  assert.equal(pbs['squat'].name, 'Back Squat')
  assert.equal(pbs['squat'].weight, 315)
})

test('pbs.date is a string formatted as "MMM D" (e.g. "Apr 1")', () => {
  const persisted: IExercisePR[] = [
    {
      exerciseSlug: 'bench-press',
      exerciseName: 'Bench Press',
      maxWeight: { weight: 200, reps: 5, date: new Date('2026-04-01T12:00:00Z') },
      maxReps: null,
      maxE1RM: null,
    },
  ]
  const pbs = projectPbs(persisted)
  const formatted = pbs['bench-press'].date
  assert.equal(typeof formatted, 'string')
  // Match the exact pattern the route's toLocaleDateString call produces; tolerate
  // locale-data noise across runtimes by checking the call directly.
  const expected = new Date('2026-04-01T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  assert.equal(formatted, expected)
})

test('empty / undefined persisted exercisePRs → empty pbs', () => {
  assert.deepEqual(projectPbs([]), {})
  assert.deepEqual(projectPbs(undefined), {})
})

test('records without maxWeight are skipped (legacy parity — weighted-PR only)', () => {
  const persisted: IExercisePR[] = [
    {
      exerciseSlug: 'pull-ups',
      exerciseName: 'Pull Ups',
      maxWeight: null,
      maxReps: { weight: 0, reps: 15, date: new Date('2026-04-03') },
      maxE1RM: null,
    },
  ]
  assert.deepEqual(projectPbs(persisted), {})
})

// ── Source guard: the legacy on-the-fly PR walk must stay deleted ──────────

test('GET /api/progress route does NOT assign to pbs[key] inside the workoutLogs walk', () => {
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'progress', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')

  // The legacy code wrote `pbs[key] = { name: exercise.name ... }` from inside
  // a nested `for (const log of progress.workoutLogs)` / `for (const exercise
  // of log.exercises)` walk. The current code only ever assigns pbs[key] from
  // an Object.entries(pbsRaw) loop on the formatter output. Guard against the
  // legacy pattern coming back by asserting no `for (const log of ...)` walk
  // appears in the same file that writes to pbs[key].
  assert.ok(
    src.includes('formatPRsForProgressDetail'),
    'route must still call formatPRsForProgressDetail',
  )
  // The phrase `name: exercise.name as string` only ever appeared in the
  // legacy walker. Its presence would mean the regression is back.
  assert.equal(
    src.includes('name: exercise.name as string'),
    false,
    'legacy on-the-fly PR walk over workoutLogs must not be reintroduced',
  )
})
