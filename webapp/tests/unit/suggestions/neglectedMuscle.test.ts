// Run with: npx tsx --test tests/unit/suggestions/neglectedMuscle.test.ts
//
// Covers the neglected-muscle source:
//   - expectedInterval (program frequency → interval; unknown → 7d baseline)
//   - evaluateNeglectedMuscle (trained today, trained 8d ago on 3×/wk, default
//     baseline, multiple muscles batched)
//   - makeNeglectedMuscleSource (eligible/render with injected loader)
//   - engine registration

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  expectedInterval,
  evaluateNeglectedMuscle,
  neglectedToSuggestion,
  makeNeglectedMuscleSource,
  ensureNeglectedMuscleRegistered,
  __resetNeglectedMuscleRegistrationForTest,
  type NeglectedMuscleInput,
  type LoadNeglectedMuscleInput,
} from '../../../lib/suggestions/workout/neglectedMuscle'
import { __resetSourceRegistryForTest, listSources } from '../../../lib/suggestions/registry'

const D = (s: string) => new Date(s)
const NOW = D('2026-05-29T00:00:00Z')

// ── expectedInterval ────────────────────────────────────────────────────────

test('expectedInterval: 3×/week → ~2.33 days', () => {
  assert.equal(Math.round(expectedInterval(3) * 100) / 100, 2.33)
})

test('expectedInterval: 7×/week → 1 day', () => {
  assert.equal(expectedInterval(7), 1)
})

test('expectedInterval: unknown/zero/negative → 7-day baseline', () => {
  assert.equal(expectedInterval(undefined), 7)
  assert.equal(expectedInterval(null), 7)
  assert.equal(expectedInterval(0), 7)
  assert.equal(expectedInterval(-3), 7)
})

// ── evaluateNeglectedMuscle ─────────────────────────────────────────────────

test('evaluateNeglectedMuscle: muscle trained today → no surface', () => {
  const input: NeglectedMuscleInput = {
    lastTrainedByMuscle: { chest: NOW },
    trainingDaysPerWeek: 3,
    now: NOW,
  }
  assert.equal(evaluateNeglectedMuscle(input), null)
})

test('evaluateNeglectedMuscle: muscle trained 8 days ago on a 3×/week program → surface', () => {
  // 3×/wk → expectedInterval 2.33d, threshold 3.5d. 8 days > 3.5 → overdue.
  const input: NeglectedMuscleInput = {
    lastTrainedByMuscle: { chest: D('2026-05-21T00:00:00Z') }, // 8d ago
    trainingDaysPerWeek: 3,
    now: NOW,
  }
  const r = evaluateNeglectedMuscle(input)
  assert.ok(r)
  assert.equal(r!.overdue.length, 1)
  assert.equal(r!.overdue[0].muscle, 'chest')
  assert.equal(r!.overdue[0].daysSince, 8)
})

test('evaluateNeglectedMuscle: just inside threshold → no surface', () => {
  // 3×/wk threshold = 3.5d. Trained 3 days ago → 3 ≤ 3.5 → not overdue.
  const input: NeglectedMuscleInput = {
    lastTrainedByMuscle: { chest: D('2026-05-26T00:00:00Z') }, // 3d ago
    trainingDaysPerWeek: 3,
    now: NOW,
  }
  assert.equal(evaluateNeglectedMuscle(input), null)
})

test('evaluateNeglectedMuscle: unknown frequency uses 7-day baseline (threshold 10.5d)', () => {
  // No program freq → baseline interval 7d, threshold 10.5d.
  const within: NeglectedMuscleInput = {
    lastTrainedByMuscle: { chest: D('2026-05-20T00:00:00Z') }, // 9d ago < 10.5
    now: NOW,
  }
  assert.equal(evaluateNeglectedMuscle(within), null)

  const overdue: NeglectedMuscleInput = {
    lastTrainedByMuscle: { chest: D('2026-05-17T00:00:00Z') }, // 12d ago > 10.5
    now: NOW,
  }
  const r = evaluateNeglectedMuscle(overdue)
  assert.ok(r)
  assert.equal(r!.expectedIntervalDays, 7)
  assert.equal(r!.thresholdDays, 10.5)
})

test('evaluateNeglectedMuscle: multiple overdue muscles batched, most-overdue first', () => {
  const input: NeglectedMuscleInput = {
    lastTrainedByMuscle: {
      chest: D('2026-05-21T00:00:00Z'),     // 8d
      hamstrings: D('2026-05-15T00:00:00Z'), // 14d (most overdue)
      lats: D('2026-05-19T00:00:00Z'),       // 10d
      quads: NOW,                            // today — not overdue
    },
    trainingDaysPerWeek: 4,
    now: NOW,
  }
  const r = evaluateNeglectedMuscle(input)
  assert.ok(r)
  assert.equal(r!.overdue.length, 3) // quads excluded
  assert.deepEqual(r!.overdue.map(o => o.muscle), ['hamstrings', 'lats', 'chest'])
})

// ── neglectedToSuggestion (batched text) ────────────────────────────────────

test('neglectedToSuggestion: single muscle text', () => {
  const r = evaluateNeglectedMuscle({
    lastTrainedByMuscle: { chest: D('2026-05-15T00:00:00Z') },
    trainingDaysPerWeek: 3,
    now: NOW,
  })!
  const s = neglectedToSuggestion(r)
  assert.equal(s.id, 'workout.neglected-muscle')
  assert.match(s.title, /Chest is overdue/)
  assert.match(s.body, /Chest/)
})

test('neglectedToSuggestion: multiple muscles batched into one suggestion text', () => {
  const r = evaluateNeglectedMuscle({
    lastTrainedByMuscle: {
      chest: D('2026-05-15T00:00:00Z'),
      hamstrings: D('2026-05-14T00:00:00Z'),
      lats: D('2026-05-16T00:00:00Z'),
    },
    trainingDaysPerWeek: 4,
    now: NOW,
  })!
  const s = neglectedToSuggestion(r)
  assert.match(s.title, /3 muscles are overdue/)
  // Oxford-comma list of all three, most-overdue first.
  assert.match(s.body, /Hamstrings, Chest, and Lats/)
  assert.deepEqual((s.sourceData!.muscles as string[]), ['hamstrings', 'chest', 'lats'])
})

// ── makeNeglectedMuscleSource (eligible / render) ───────────────────────────

test('Source: id + title', () => {
  const src = makeNeglectedMuscleSource(async () => null)
  assert.equal(src.id, 'workout.neglected-muscle')
  assert.equal(src.title, 'Neglected muscle')
})

test('Source.eligible: true when overdue, false when fresh, false when no input', async () => {
  const overdue: LoadNeglectedMuscleInput = async () => ({
    lastTrainedByMuscle: { chest: D('2026-05-15T00:00:00Z') },
    trainingDaysPerWeek: 3,
    now: NOW,
  })
  const fresh: LoadNeglectedMuscleInput = async () => ({
    lastTrainedByMuscle: { chest: NOW },
    trainingDaysPerWeek: 3,
    now: NOW,
  })
  const none: LoadNeglectedMuscleInput = async () => null

  assert.equal(await makeNeglectedMuscleSource(overdue).eligible({ userId: 'u', now: NOW }), true)
  assert.equal(await makeNeglectedMuscleSource(fresh).eligible({ userId: 'u', now: NOW }), false)
  assert.equal(await makeNeglectedMuscleSource(none).eligible({ userId: 'u', now: NOW }), false)
})

test('Source.render: returns batched suggestion when overdue, null otherwise', async () => {
  const overdue: LoadNeglectedMuscleInput = async () => ({
    lastTrainedByMuscle: { chest: D('2026-05-15T00:00:00Z'), lats: D('2026-05-14T00:00:00Z') },
    trainingDaysPerWeek: 4,
    now: NOW,
  })
  const s = await makeNeglectedMuscleSource(overdue).render({ userId: 'u', now: NOW })
  assert.ok(s)
  assert.equal(s!.id, 'workout.neglected-muscle')

  const fresh: LoadNeglectedMuscleInput = async () => ({
    lastTrainedByMuscle: { chest: NOW },
    trainingDaysPerWeek: 4,
    now: NOW,
  })
  assert.equal(await makeNeglectedMuscleSource(fresh).render({ userId: 'u', now: NOW }), null)
})

// ── Engine registration ─────────────────────────────────────────────────────

test('ensureNeglectedMuscleRegistered: registers under workout.neglected-muscle-dp, idempotent', () => {
  __resetSourceRegistryForTest()
  __resetNeglectedMuscleRegistrationForTest()
  ensureNeglectedMuscleRegistered()
  ensureNeglectedMuscleRegistered()
  assert.deepEqual(listSources().map(s => s.id), ['workout.neglected-muscle-dp'])
})
