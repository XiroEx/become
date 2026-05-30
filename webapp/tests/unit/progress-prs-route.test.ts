// Run with: npx tsx --test tests/unit/progress-prs-route.test.ts
//
// Covers GET /api/progress/prs:
//   - unauthenticated request → 401 (real route invocation; verifyAuth's
//     no-token path returns before any DB access)
//   - the 200 response shape + e1RM-desc ordering via the pure formatter the
//     route delegates to (formatPRsForPrsPage)
//   - a source guard that the route stays auth-gated and formatter-wired

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  formatPRsForPrsPage,
  type IExercisePR,
  type PrsPageRow,
} from '../../lib/exercisePRs'
import { GET } from '../../app/api/progress/prs/route'
import type { NextRequest } from 'next/server'

const D = (s: string) => new Date(s)

const samplePRs: IExercisePR[] = [
  {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: { weight: 225, reps: 1, date: D('2026-04-01T00:00:00Z') },
    maxReps: { weight: 135, reps: 12, date: D('2026-04-02T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, e1rm: 232.5, date: D('2026-04-01T00:00:00Z') },
  },
  {
    exerciseSlug: 'back-squat',
    exerciseName: 'Back Squat',
    maxWeight: { weight: 315, reps: 1, date: D('2026-04-05T00:00:00Z') },
    maxReps: { weight: 225, reps: 8, date: D('2026-04-06T00:00:00Z') },
    maxE1RM: { weight: 315, reps: 1, e1rm: 325.5, date: D('2026-04-05T00:00:00Z') },
  },
]

// ── unauthenticated → 401 (real route call) ─────────────────────────────────

function noAuthRequest(): NextRequest {
  return {
    headers: { get: () => null },
  } as unknown as NextRequest
}

test('GET /api/progress/prs: unauthenticated → 401', async () => {
  const res = await GET(noAuthRequest())
  assert.equal(res.status, 401)
  const body = await res.json()
  assert.equal(body.error, 'Unauthorized')
})

// ── 200 shape via the formatter the route delegates to ──────────────────────

test('formatPRsForPrsPage: flat row shape with all acceptance fields', () => {
  const rows = formatPRsForPrsPage(samplePRs)
  assert.equal(rows.length, 2)
  const keys = Object.keys(rows[0]).sort()
  assert.deepEqual(keys, [
    'e1RM', 'e1RMDate',
    'exerciseName', 'exerciseSlug',
    'maxReps', 'maxRepsDate',
    'maxWeight', 'maxWeightDate',
  ])
})

test('formatPRsForPrsPage: sorted by e1RM descending', () => {
  const rows = formatPRsForPrsPage(samplePRs)
  // back-squat e1RM 325.5 > bench-press 232.5
  assert.equal(rows[0].exerciseSlug, 'back-squat')
  assert.equal(rows[1].exerciseSlug, 'bench-press')
  assert.ok((rows[0].e1RM ?? 0) >= (rows[1].e1RM ?? 0))
})

test('formatPRsForPrsPage: dates are ISO strings, values flattened from dimensions', () => {
  const rows = formatPRsForPrsPage(samplePRs)
  const bench = rows.find(r => r.exerciseSlug === 'bench-press')!
  assert.equal(bench.maxWeight, 225)
  assert.equal(bench.maxWeightDate, '2026-04-01T00:00:00.000Z')
  assert.equal(bench.maxReps, 12)
  assert.equal(bench.maxRepsDate, '2026-04-02T00:00:00.000Z')
  assert.equal(bench.e1RM, 232.5)
  assert.equal(bench.e1RMDate, '2026-04-01T00:00:00.000Z')
})

test('formatPRsForPrsPage: empty / undefined → empty array', () => {
  assert.deepEqual(formatPRsForPrsPage([]), [])
  assert.deepEqual(formatPRsForPrsPage(undefined), [])
  assert.deepEqual(formatPRsForPrsPage(null), [])
})

test('formatPRsForPrsPage: missing dimensions → null fields, e1RM-less rows sink to bottom', () => {
  const partial: IExercisePR[] = [
    {
      exerciseSlug: 'pull-ups',
      exerciseName: 'Pull Ups',
      maxWeight: null,
      maxReps: { weight: 0, reps: 15, date: D('2026-04-03T00:00:00Z') },
      maxE1RM: null,
    },
    ...samplePRs,
  ]
  const rows = formatPRsForPrsPage(partial)
  // pull-ups has no e1RM → sorts to the bottom.
  assert.equal(rows[rows.length - 1].exerciseSlug, 'pull-ups')
  const pull = rows[rows.length - 1]
  assert.equal(pull.maxWeight, null)
  assert.equal(pull.maxWeightDate, null)
  assert.equal(pull.maxReps, 15)
  assert.equal(pull.e1RM, null)
  assert.equal(pull.e1RMDate, null)
})

test('formatPRsForPrsPage: e1RM falls back to Epley when e1rm field absent', () => {
  const rows = formatPRsForPrsPage([
    {
      exerciseSlug: 'deadlift',
      exerciseName: 'Deadlift',
      maxWeight: { weight: 405, reps: 1, date: D('2026-04-10T00:00:00Z') },
      maxReps: null,
      maxE1RM: { weight: 315, reps: 5, date: D('2026-04-10T00:00:00Z') }, // no e1rm → Epley
    },
  ])
  // 315 × (1 + 5/30) = 367.5
  assert.equal(rows[0].e1RM, 367.5)
})

test('formatPRsForPrsPage: rows with no slug are skipped', () => {
  const rows = formatPRsForPrsPage([
    { exerciseSlug: '', exerciseName: 'Nameless', maxWeight: null, maxReps: null, maxE1RM: null } as IExercisePR,
    ...samplePRs,
  ])
  assert.equal(rows.length, 2)
})

test('formatPRsForPrsPage: tie on e1RM → stable slug-ascending order', () => {
  const tied: IExercisePR[] = [
    { exerciseSlug: 'zoo', exerciseName: 'Zoo', maxWeight: null, maxReps: null,
      maxE1RM: { weight: 100, reps: 1, e1rm: 100, date: D('2026-04-01T00:00:00Z') } },
    { exerciseSlug: 'ant', exerciseName: 'Ant', maxWeight: null, maxReps: null,
      maxE1RM: { weight: 100, reps: 1, e1rm: 100, date: D('2026-04-01T00:00:00Z') } },
  ]
  const rows = formatPRsForPrsPage(tied)
  assert.deepEqual(rows.map(r => r.exerciseSlug), ['ant', 'zoo'])
})

// ── source guard ────────────────────────────────────────────────────────────

test('route stays auth-gated and formatter-wired', () => {
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'progress', 'prs', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')
  assert.ok(src.includes('verifyAuth'), 'route must call verifyAuth')
  assert.ok(src.includes('401'), 'route must 401 unauthenticated requests')
  assert.ok(src.includes('formatPRsForPrsPage'), 'route must delegate to the formatter')
  assert.ok(src.includes('exercisePRs'), 'route must read the persisted exercisePRs subdoc')
})

// Type-level: ensure PrsPageRow is the exported row contract used here.
const _typecheck: PrsPageRow[] = formatPRsForPrsPage(samplePRs)
void _typecheck
