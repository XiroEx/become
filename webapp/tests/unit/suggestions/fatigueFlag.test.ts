// Run with: npx tsx --test tests/unit/suggestions/fatigueFlag.test.ts
//
// Covers the fatigue-flag source:
//   - evaluateFatigueFlag (no recent workout, same muscle, different muscle,
//     >24h gap)
//   - makeFatigueFlagSource (eligible/render with injected loader)
//   - engine registration

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateFatigueFlag,
  fatigueToSuggestion,
  makeFatigueFlagSource,
  ensureFatigueFlagRegistered,
  __resetFatigueFlagRegistrationForTest,
  type FatigueFlagInput,
  type LoadFatigueFlagInput,
} from '../../../lib/suggestions/workout/fatigueFlag'
import { __resetSourceRegistryForTest, listSources } from '../../../lib/suggestions/registry'

const D = (s: string) => new Date(s)
const NOW = D('2026-05-29T18:00:00Z')

function input(over: Partial<FatigueFlagInput> = {}): FatigueFlagInput {
  return {
    upcomingMuscles: ['chest', 'triceps'],
    recentSessions: [
      { date: D('2026-05-29T06:00:00Z'), muscles: ['chest', 'front_delts'] }, // 12h ago, overlaps chest
    ],
    now: NOW,
    ...over,
  }
}

// ── evaluateFatigueFlag ─────────────────────────────────────────────────────

test('evaluateFatigueFlag: no recent workout → no flag', () => {
  assert.equal(evaluateFatigueFlag(input({ recentSessions: [] })), null)
})

test('evaluateFatigueFlag: recent workout same muscle (within 24h) → flag', () => {
  const r = evaluateFatigueFlag(input())
  assert.ok(r)
  assert.deepEqual(r!.overlap, ['chest'])
  assert.equal(r!.hoursSince, 12)
})

test('evaluateFatigueFlag: recent workout different muscle → no flag', () => {
  const r = evaluateFatigueFlag(input({
    upcomingMuscles: ['quads', 'hamstrings'],
    recentSessions: [{ date: D('2026-05-29T06:00:00Z'), muscles: ['chest', 'triceps'] }],
  }))
  assert.equal(r, null)
})

test('evaluateFatigueFlag: >24h gap → no flag (recovered)', () => {
  const r = evaluateFatigueFlag(input({
    recentSessions: [{ date: D('2026-05-28T06:00:00Z'), muscles: ['chest'] }], // 36h ago
  }))
  assert.equal(r, null)
})

test('evaluateFatigueFlag: exactly at the 24h edge (within window) → flag', () => {
  const r = evaluateFatigueFlag(input({
    upcomingMuscles: ['chest'],
    recentSessions: [{ date: D('2026-05-28T18:00:00Z'), muscles: ['chest'] }], // exactly 24h
  }))
  assert.ok(r)
  assert.equal(r!.hoursSince, 24)
})

test('evaluateFatigueFlag: no upcoming muscles → no flag', () => {
  assert.equal(evaluateFatigueFlag(input({ upcomingMuscles: [] })), null)
})

test('evaluateFatigueFlag: multiple overlapping muscles collected', () => {
  const r = evaluateFatigueFlag(input({
    upcomingMuscles: ['chest', 'triceps', 'front_delts'],
    recentSessions: [{ date: D('2026-05-29T06:00:00Z'), muscles: ['chest', 'triceps', 'lats'] }],
  }))
  assert.ok(r)
  assert.deepEqual(r!.overlap.sort(), ['chest', 'triceps'])
})

test('evaluateFatigueFlag: most-recent overlapping session drives hoursSince', () => {
  const r = evaluateFatigueFlag(input({
    upcomingMuscles: ['chest'],
    recentSessions: [
      { date: D('2026-05-29T00:00:00Z'), muscles: ['chest'] }, // 18h ago
      { date: D('2026-05-29T12:00:00Z'), muscles: ['chest'] }, // 6h ago — most recent
    ],
  }))
  assert.ok(r)
  assert.equal(r!.hoursSince, 6)
})

test('evaluateFatigueFlag: recent session outside window ignored even if it overlaps', () => {
  const r = evaluateFatigueFlag(input({
    upcomingMuscles: ['chest'],
    recentSessions: [
      { date: D('2026-05-27T00:00:00Z'), muscles: ['chest'] }, // way outside
      { date: D('2026-05-29T06:00:00Z'), muscles: ['quads'] }, // in window, no overlap
    ],
  }))
  assert.equal(r, null)
})

// ── fatigueToSuggestion ─────────────────────────────────────────────────────

test('fatigueToSuggestion: shape + copy', () => {
  const r = evaluateFatigueFlag(input())!
  const s = fatigueToSuggestion(r)
  assert.equal(s.id, 'workout.fatigue-flag')
  assert.equal(s.severity, 'warning')
  assert.equal(s.source, 'workout')
  assert.match(s.body, /12 hours ago/)
})

test('fatigueToSuggestion: multi-muscle Oxford-comma list', () => {
  const r = evaluateFatigueFlag(input({
    upcomingMuscles: ['chest', 'triceps', 'front_delts'],
    recentSessions: [{ date: D('2026-05-29T06:00:00Z'), muscles: ['chest', 'triceps', 'front_delts'] }],
  }))!
  const s = fatigueToSuggestion(r)
  assert.match(s.body, /Chest, Triceps, and Front Delts/)
})

// ── makeFatigueFlagSource (eligible / render) ───────────────────────────────

test('Source: id + title', () => {
  const src = makeFatigueFlagSource(async () => null)
  assert.equal(src.id, 'workout.fatigue-flag')
  assert.equal(src.title, 'Fatigue flag')
})

test('Source.eligible: true when overlap, false when not, false when no input', async () => {
  const flagged: LoadFatigueFlagInput = async () => input()
  const clear: LoadFatigueFlagInput = async () => input({ recentSessions: [] })
  const none: LoadFatigueFlagInput = async () => null
  assert.equal(await makeFatigueFlagSource(flagged).eligible({ userId: 'u', now: NOW }), true)
  assert.equal(await makeFatigueFlagSource(clear).eligible({ userId: 'u', now: NOW }), false)
  assert.equal(await makeFatigueFlagSource(none).eligible({ userId: 'u', now: NOW }), false)
})

test('Source.render: returns suggestion when overlap, null otherwise', async () => {
  const flagged: LoadFatigueFlagInput = async () => input()
  const s = await makeFatigueFlagSource(flagged).render({ userId: 'u', now: NOW })
  assert.ok(s)
  assert.equal(s!.id, 'workout.fatigue-flag')

  const clear: LoadFatigueFlagInput = async () => input({ recentSessions: [] })
  assert.equal(await makeFatigueFlagSource(clear).render({ userId: 'u', now: NOW }), null)
})

// ── Engine registration ─────────────────────────────────────────────────────

test('ensureFatigueFlagRegistered: registers under workout.fatigue-flag-dp, idempotent', () => {
  __resetSourceRegistryForTest()
  __resetFatigueFlagRegistrationForTest()
  ensureFatigueFlagRegistered()
  ensureFatigueFlagRegistered()
  assert.deepEqual(listSources().map(s => s.id), ['workout.fatigue-flag-dp'])
})
