// Run with: npm run test:file tests/unit/suggestions/prCelebration.test.ts
//
// Covers the pr-celebration source:
//   - prSetAtDate (latest dimension date)
//   - evaluatePrCelebration (no PRs, PR 3d ago, PR 10d ago, multiple batched)
//   - makePrCelebrationSource (eligible/render with injected reader)
//   - engine registration

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  prSetAtDate,
  evaluatePrCelebration,
  celebrationToSuggestion,
  makePrCelebrationSource,
  ensurePrCelebrationRegistered,
  __resetPrCelebrationRegistrationForTest,
  type ExercisePRsReader,
} from '../../../lib/suggestions/workout/prCelebration'
import { __resetSourceRegistryForTest, listSources } from '../../../lib/suggestions/registry'
import type { IExercisePR } from '../../../lib/exercisePRs'

const D = (s: string) => new Date(s)
const NOW = D('2026-05-29T00:00:00Z')

function pr(over: Partial<IExercisePR> = {}): IExercisePR {
  return {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: { weight: 225, reps: 1, e1rm: 232.5, date: D('2026-05-26T00:00:00Z') }, // 3d ago
    maxReps: { weight: 135, reps: 12, e1rm: 189, date: D('2026-05-26T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, e1rm: 232.5, date: D('2026-05-26T00:00:00Z') },
    ...over,
  }
}

// ── prSetAtDate ─────────────────────────────────────────────────────────────

test('prSetAtDate: latest of the dimension dates', () => {
  const d = prSetAtDate(pr({
    maxWeight: { weight: 225, reps: 1, date: D('2026-05-20T00:00:00Z') },
    maxReps: { weight: 135, reps: 12, date: D('2026-05-27T00:00:00Z') }, // latest
    maxE1RM: { weight: 225, reps: 1, date: D('2026-05-20T00:00:00Z') },
  }))
  assert.equal(d!.toISOString(), '2026-05-27T00:00:00.000Z')
})

test('prSetAtDate: null when no dimensions', () => {
  assert.equal(prSetAtDate(pr({ maxWeight: null, maxReps: null, maxE1RM: null })), null)
})

// ── evaluatePrCelebration ───────────────────────────────────────────────────

test('evaluatePrCelebration: no PRs → null', () => {
  assert.equal(evaluatePrCelebration([], NOW), null)
})

test('evaluatePrCelebration: PR set 3 days ago → surface', () => {
  const r = evaluatePrCelebration([pr()], NOW)
  assert.ok(r)
  assert.equal(r!.fresh.length, 1)
  assert.equal(r!.fresh[0].exerciseSlug, 'bench-press')
  assert.equal(r!.fresh[0].daysAgo, 3)
})

test('evaluatePrCelebration: PR set 10 days ago → no surface', () => {
  const old = pr({
    maxWeight: { weight: 225, reps: 1, date: D('2026-05-19T00:00:00Z') }, // 10d ago
    maxReps: { weight: 135, reps: 12, date: D('2026-05-19T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, date: D('2026-05-19T00:00:00Z') },
  })
  assert.equal(evaluatePrCelebration([old], NOW), null)
})

test('evaluatePrCelebration: PR set exactly 7 days ago → surface (boundary inclusive)', () => {
  const edge = pr({
    maxWeight: { weight: 225, reps: 1, date: D('2026-05-22T00:00:00Z') }, // 7d
    maxReps: { weight: 135, reps: 12, date: D('2026-05-22T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, date: D('2026-05-22T00:00:00Z') },
  })
  const r = evaluatePrCelebration([edge], NOW)
  assert.ok(r)
  assert.equal(r!.fresh[0].daysAgo, 7)
})

test('evaluatePrCelebration: PR set 8 days ago → no surface (just outside)', () => {
  const edge = pr({
    maxWeight: { weight: 225, reps: 1, date: D('2026-05-21T00:00:00Z') }, // 8d
    maxReps: { weight: 135, reps: 12, date: D('2026-05-21T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, date: D('2026-05-21T00:00:00Z') },
  })
  assert.equal(evaluatePrCelebration([edge], NOW), null)
})

test('evaluatePrCelebration: mix of fresh and stale → only fresh surface', () => {
  const fresh = pr({ exerciseSlug: 'bench-press', exerciseName: 'Bench Press' }) // 3d ago
  const stale = pr({
    exerciseSlug: 'back-squat', exerciseName: 'Back Squat',
    maxWeight: { weight: 315, reps: 1, date: D('2026-05-10T00:00:00Z') },
    maxReps: { weight: 225, reps: 8, date: D('2026-05-10T00:00:00Z') },
    maxE1RM: { weight: 315, reps: 1, date: D('2026-05-10T00:00:00Z') },
  })
  const r = evaluatePrCelebration([fresh, stale], NOW)
  assert.ok(r)
  assert.equal(r!.fresh.length, 1)
  assert.equal(r!.fresh[0].exerciseSlug, 'bench-press')
})

test('evaluatePrCelebration: multiple fresh PRs → batched, most-recent first', () => {
  const a = pr({
    exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
    maxWeight: { weight: 225, reps: 1, date: D('2026-05-24T00:00:00Z') }, // 5d
    maxReps: { weight: 135, reps: 12, date: D('2026-05-24T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, date: D('2026-05-24T00:00:00Z') },
  })
  const b = pr({
    exerciseSlug: 'back-squat', exerciseName: 'Back Squat',
    maxWeight: { weight: 315, reps: 1, date: D('2026-05-28T00:00:00Z') }, // 1d (most recent)
    maxReps: { weight: 225, reps: 8, date: D('2026-05-28T00:00:00Z') },
    maxE1RM: { weight: 315, reps: 1, date: D('2026-05-28T00:00:00Z') },
  })
  const r = evaluatePrCelebration([a, b], NOW)
  assert.ok(r)
  assert.equal(r!.fresh.length, 2)
  assert.deepEqual(r!.fresh.map(f => f.exerciseSlug), ['back-squat', 'bench-press'])
})

// ── celebrationToSuggestion (batched text) ──────────────────────────────────

test('celebrationToSuggestion: single PR copy', () => {
  const r = evaluatePrCelebration([pr()], NOW)!
  const s = celebrationToSuggestion(r)
  assert.equal(s.id, 'workout.pr-celebration')
  assert.equal(s.severity, 'celebration')
  assert.match(s.title, /New Bench Press PR/)
  assert.equal((s.sourceData!.count as number), 1)
})

test('celebrationToSuggestion: multiple PRs batched into one suggestion text', () => {
  const a = pr({ exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
    maxWeight: { weight: 225, reps: 1, date: D('2026-05-24T00:00:00Z') },
    maxReps: { weight: 135, reps: 12, date: D('2026-05-24T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, date: D('2026-05-24T00:00:00Z') } })
  const b = pr({ exerciseSlug: 'back-squat', exerciseName: 'Back Squat',
    maxWeight: { weight: 315, reps: 1, date: D('2026-05-28T00:00:00Z') },
    maxReps: { weight: 225, reps: 8, date: D('2026-05-28T00:00:00Z') },
    maxE1RM: { weight: 315, reps: 1, date: D('2026-05-28T00:00:00Z') } })
  const r = evaluatePrCelebration([a, b], NOW)!
  const s = celebrationToSuggestion(r)
  assert.match(s.title, /2 new PRs this week/)
  assert.match(s.body, /Back Squat and Bench Press/)
  assert.deepEqual((s.sourceData!.exercises as string[]), ['back-squat', 'bench-press'])
})

// ── makePrCelebrationSource (eligible / render) ─────────────────────────────

test('Source: id + title', () => {
  const src = makePrCelebrationSource(async () => [])
  assert.equal(src.id, 'workout.pr-celebration')
  assert.equal(src.title, 'PR celebration')
})

test('Source.eligible: true when fresh PR, false otherwise', async () => {
  const fresh: ExercisePRsReader = async () => [pr()]
  const none: ExercisePRsReader = async () => []
  assert.equal(await makePrCelebrationSource(fresh).eligible({ userId: 'u', now: NOW }), true)
  assert.equal(await makePrCelebrationSource(none).eligible({ userId: 'u', now: NOW }), false)
})

test('Source.render: returns suggestion when fresh, null otherwise', async () => {
  const fresh: ExercisePRsReader = async () => [pr()]
  const s = await makePrCelebrationSource(fresh).render({ userId: 'u', now: NOW })
  assert.ok(s)
  assert.equal(s!.id, 'workout.pr-celebration')

  const none: ExercisePRsReader = async () => []
  assert.equal(await makePrCelebrationSource(none).render({ userId: 'u', now: NOW }), null)
})

// ── Engine registration ─────────────────────────────────────────────────────

test('ensurePrCelebrationRegistered: registers under workout.pr-celebration-dp, idempotent', () => {
  __resetSourceRegistryForTest()
  __resetPrCelebrationRegistrationForTest()
  ensurePrCelebrationRegistered()
  ensurePrCelebrationRegistered()
  assert.deepEqual(listSources().map(s => s.id), ['workout.pr-celebration-dp'])
})
