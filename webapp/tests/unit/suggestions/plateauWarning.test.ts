// Run with: npx tsx --test tests/unit/suggestions/plateauWarning.test.ts
//
// Covers the plateau-warning source:
//   - prAdvanceDate (latest of maxWeight/maxE1RM; tied-PR date used)
//   - evaluatePlateau (fresh PR, stale + few sessions, stale + ≥4 sessions)
//   - makePlateauWarningSource (eligible/render with injected loader)
//   - engine registration

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  prAdvanceDate,
  evaluatePlateau,
  plateauToSuggestion,
  makePlateauWarningSource,
  ensurePlateauWarningRegistered,
  __resetPlateauWarningRegistrationForTest,
  type PlateauInput,
  type LoadPlateauInputs,
} from '../../../lib/suggestions/workout/plateauWarning'
import { __resetSourceRegistryForTest, listSources } from '../../../lib/suggestions/registry'
import type { IExercisePR } from '../../../lib/exercisePRs'

const D = (s: string) => new Date(s)
const NOW = D('2026-05-29T00:00:00Z')

function pr(over: Partial<IExercisePR> = {}): IExercisePR {
  return {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    maxWeight: { weight: 225, reps: 1, e1rm: 232.5, date: D('2026-03-01T00:00:00Z') },
    maxReps: { weight: 135, reps: 12, e1rm: 189, date: D('2026-03-01T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, e1rm: 232.5, date: D('2026-03-01T00:00:00Z') },
    ...over,
  }
}

function input(over: Partial<PlateauInput> = {}): PlateauInput {
  return { pr: pr(), sessionsInWindow: 5, now: NOW, ...over }
}

// ── prAdvanceDate ───────────────────────────────────────────────────────────

test('prAdvanceDate: latest of maxWeight / maxE1RM', () => {
  const d = prAdvanceDate(pr({
    maxWeight: { weight: 225, reps: 1, date: D('2026-03-01T00:00:00Z') },
    maxE1RM: { weight: 230, reps: 1, date: D('2026-04-15T00:00:00Z') },
  }))
  assert.equal(d!.toISOString(), '2026-04-15T00:00:00.000Z')
})

test('prAdvanceDate: ignores maxReps date', () => {
  const d = prAdvanceDate(pr({
    maxWeight: { weight: 225, reps: 1, date: D('2026-03-01T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, date: D('2026-03-01T00:00:00Z') },
    maxReps: { weight: 135, reps: 20, date: D('2026-05-28T00:00:00Z') }, // recent but ignored
  }))
  assert.equal(d!.toISOString(), '2026-03-01T00:00:00.000Z')
})

test('prAdvanceDate: null when no weight/e1rm PR', () => {
  assert.equal(prAdvanceDate(pr({ maxWeight: null, maxE1RM: null })), null)
})

test('prAdvanceDate: tied PR re-hit on a later date advances the date', () => {
  // Same 225 value, but maxWeight.date is a later re-hit → that later date wins.
  const d = prAdvanceDate(pr({
    maxWeight: { weight: 225, reps: 1, date: D('2026-05-20T00:00:00Z') },
    maxE1RM: { weight: 225, reps: 1, date: D('2026-03-01T00:00:00Z') },
  }))
  assert.equal(d!.toISOString(), '2026-05-20T00:00:00.000Z')
})

// ── evaluatePlateau ─────────────────────────────────────────────────────────

test('evaluatePlateau: fresh PR (advanced < 28d ago) → no warning', () => {
  const r = evaluatePlateau(input({
    pr: pr({
      maxWeight: { weight: 225, reps: 1, date: D('2026-05-15T00:00:00Z') }, // 14d ago
      maxE1RM: { weight: 225, reps: 1, date: D('2026-05-15T00:00:00Z') },
    }),
    sessionsInWindow: 8,
  }))
  assert.equal(r, null)
})

test('evaluatePlateau: stale PR but < 4 sessions → no warning (untrained, not plateaued)', () => {
  const r = evaluatePlateau(input({ sessionsInWindow: 2 }))
  assert.equal(r, null)
})

test('evaluatePlateau: stale PR with exactly 4 sessions → warning', () => {
  const r = evaluatePlateau(input({ sessionsInWindow: 4 }))
  assert.ok(r)
  assert.equal(r!.exerciseSlug, 'bench-press')
  assert.ok(r!.daysStale >= 28)
  assert.equal(r!.sessionsInWindow, 4)
  assert.equal(r!.lastWeight, 225)
})

test('evaluatePlateau: stale PR with many sessions → warning', () => {
  const r = evaluatePlateau(input({ sessionsInWindow: 9 }))
  assert.ok(r)
  assert.equal(r!.sessionsInWindow, 9)
})

test('evaluatePlateau: exactly 28 days stale → warning (boundary inclusive)', () => {
  const r = evaluatePlateau(input({
    pr: pr({
      maxWeight: { weight: 225, reps: 1, date: D('2026-05-01T00:00:00Z') }, // exactly 28d before NOW
      maxE1RM: { weight: 225, reps: 1, date: D('2026-05-01T00:00:00Z') },
    }),
    sessionsInWindow: 5,
  }))
  assert.ok(r)
  assert.equal(r!.daysStale, 28)
})

test('evaluatePlateau: 27 days stale → no warning (just under threshold)', () => {
  const r = evaluatePlateau(input({
    pr: pr({
      maxWeight: { weight: 225, reps: 1, date: D('2026-05-02T00:00:00Z') }, // 27d
      maxE1RM: { weight: 225, reps: 1, date: D('2026-05-02T00:00:00Z') },
    }),
    sessionsInWindow: 5,
  }))
  assert.equal(r, null)
})

test('evaluatePlateau: tied-PR later date keeps it fresh → no warning', () => {
  // The max was re-tied 10 days ago, so the staleness clock reset.
  const r = evaluatePlateau(input({
    pr: pr({
      maxWeight: { weight: 225, reps: 1, date: D('2026-05-19T00:00:00Z') }, // 10d ago
      maxE1RM: { weight: 225, reps: 1, date: D('2026-03-01T00:00:00Z') },
    }),
    sessionsInWindow: 8,
  }))
  assert.equal(r, null)
})

test('evaluatePlateau: no PR dates → no warning', () => {
  const r = evaluatePlateau(input({ pr: pr({ maxWeight: null, maxE1RM: null }) }))
  assert.equal(r, null)
})

// ── plateauToSuggestion ─────────────────────────────────────────────────────

test('plateauToSuggestion: shape + copy', () => {
  const r = evaluatePlateau(input({ sessionsInWindow: 6 }))!
  const s = plateauToSuggestion(r)
  assert.equal(s.id, 'workout.plateau-warning.bench-press')
  assert.equal(s.severity, 'warning')
  assert.equal(s.source, 'workout')
  assert.match(s.body, /6 sessions/)
})

// ── makePlateauWarningSource (eligible / render) ────────────────────────────

test('Source: id + title', () => {
  const src = makePlateauWarningSource(async () => [])
  assert.equal(src.id, 'workout.plateau-warning')
  assert.equal(src.title, 'Plateau warning')
})

test('Source.eligible: true when any lift plateaued, false otherwise', async () => {
  const plateaued: LoadPlateauInputs = async () => [input({ sessionsInWindow: 5 })]
  const fresh: LoadPlateauInputs = async () => [input({ sessionsInWindow: 1 })]
  assert.equal(await makePlateauWarningSource(plateaued).eligible({ userId: 'u', now: NOW }), true)
  assert.equal(await makePlateauWarningSource(fresh).eligible({ userId: 'u', now: NOW }), false)
})

test('Source.render: returns the most-stale lift', async () => {
  const loader: LoadPlateauInputs = async () => [
    input({
      pr: pr({ exerciseSlug: 'bench-press', exerciseName: 'Bench Press',
        maxWeight: { weight: 225, reps: 1, date: D('2026-04-15T00:00:00Z') },
        maxE1RM: { weight: 225, reps: 1, date: D('2026-04-15T00:00:00Z') } }),
      sessionsInWindow: 5,
    }),
    input({
      pr: pr({ exerciseSlug: 'back-squat', exerciseName: 'Back Squat',
        maxWeight: { weight: 315, reps: 1, date: D('2026-02-01T00:00:00Z') }, // more stale
        maxE1RM: { weight: 315, reps: 1, date: D('2026-02-01T00:00:00Z') } }),
      sessionsInWindow: 6,
    }),
  ]
  const s = await makePlateauWarningSource(loader).render({ userId: 'u', now: NOW })
  assert.ok(s)
  assert.equal(s!.id, 'workout.plateau-warning.back-squat') // the more-stale one
})

test('Source.render: null when nothing plateaued', async () => {
  const loader: LoadPlateauInputs = async () => [input({ sessionsInWindow: 1 })]
  const s = await makePlateauWarningSource(loader).render({ userId: 'u', now: NOW })
  assert.equal(s, null)
})

// ── Engine registration ─────────────────────────────────────────────────────

test('ensurePlateauWarningRegistered: registers under workout.plateau-warning-dp, idempotent', () => {
  __resetSourceRegistryForTest()
  __resetPlateauWarningRegistrationForTest()
  ensurePlateauWarningRegistered()
  ensurePlateauWarningRegistered()
  assert.deepEqual(listSources().map(s => s.id), ['workout.plateau-warning-dp'])
})
