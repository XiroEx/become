// Run with: npm run test:file tests/unit/resolveProgramWeek.test.ts
//
// NP-377: the Home dashboard's Current Program line read "Phase 1 • Week 5
// of 4" — the schedule/completion-derived week had walked past the
// program's own length, and the stored currentPhase never agreed with it.
// `resolveProgramWeek` is the single place that reconciles week, phase and
// totalWeeks so they can never disagree again.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveProgramWeek } from '../../lib/data/userProgress'

const PHASES_4 = [
  { weeks: '1-4' },
]

const PHASES_12_3PHASE = [
  { weeks: '1-4' },
  { weeks: '5-8' },
  { weeks: '9-12' },
]

test('mid-phase: week 2 of a 4-week single-phase program stays in phase 1', () => {
  const r = resolveProgramWeek({ rawWeek: 2, totalWeeks: 4, phases: PHASES_4 })
  assert.equal(r.currentWeek, 2)
  assert.equal(r.currentPhase, 1)
  assert.equal(r.totalWeeks, 4)
  assert.equal(r.isComplete, false)
})

test('phase boundary: week 5 of a 3-phase 12-week program lands exactly on phase 2, not phase 1', () => {
  const r = resolveProgramWeek({ rawWeek: 5, totalWeeks: 12, phases: PHASES_12_3PHASE })
  assert.equal(r.currentWeek, 5)
  assert.equal(r.currentPhase, 2)
  assert.equal(r.isComplete, false)
})

test('last week: week 4 of a 4-week program is NOT past the end', () => {
  const r = resolveProgramWeek({ rawWeek: 4, totalWeeks: 4, phases: PHASES_4 })
  assert.equal(r.currentWeek, 4)
  assert.equal(r.currentPhase, 1)
  assert.equal(r.isComplete, false, 'the last week in range is still in-progress, not complete')
})

test('past the end, single phase: the NP-377 repro — raw week 5 of a 4-week/1-phase program clamps to "Week 4 of 4", never "5 of 4"', () => {
  const r = resolveProgramWeek({ rawWeek: 5, totalWeeks: 4, phases: PHASES_4, fallbackPhase: 1 })
  assert.equal(r.currentWeek, 4)
  assert.equal(r.totalWeeks, 4)
  assert.equal(r.currentPhase, 1, 'still Phase 1 — the only phase, and it agrees with the clamped week')
  assert.equal(r.isComplete, true, 'raw week overshot the program length')
})

test('past the end, multi-phase: the clamped week lands in the LAST phase, not a stale earlier one', () => {
  const r = resolveProgramWeek({ rawWeek: 15, totalWeeks: 12, phases: PHASES_12_3PHASE, fallbackPhase: 1 })
  assert.equal(r.currentWeek, 12, 'clamped to the program length')
  assert.equal(r.currentPhase, 3, 'phase 3 covers week 12 — the phase must agree with the clamped week')
  assert.equal(r.isComplete, true)
})

test('schedule-derived week (reconciled completions) is used as-is when provided', () => {
  // Mirrors the route: scheduleCurrentWeek ?? ceil(completedWorkouts / 4)
  const scheduleCurrentWeek = 3
  const r = resolveProgramWeek({ rawWeek: scheduleCurrentWeek, totalWeeks: 8, phases: [{ weeks: '1-4' }, { weeks: '5-8' }] })
  assert.equal(r.currentWeek, 3)
  assert.equal(r.currentPhase, 1)
})

test('completion-derived week (no schedule yet) also reconciles phase/week/total', () => {
  // ceil(completedWorkouts / daysPerWeek) when there is no schedule-derived week
  const completedWorkouts = 18
  const daysPerWeek = 4
  const rawWeek = Math.ceil(completedWorkouts / daysPerWeek) // 5
  const r = resolveProgramWeek({ rawWeek, totalWeeks: 4, phases: PHASES_4 })
  assert.equal(rawWeek, 5)
  assert.equal(r.currentWeek, 4, 'completion overran the program length too — same clamp applies')
  assert.equal(r.isComplete, true)
})

test('no phase data at all: falls back to fallbackPhase (or 1) without throwing', () => {
  const r = resolveProgramWeek({ rawWeek: 2, totalWeeks: 4, phases: null })
  assert.equal(r.currentWeek, 2)
  assert.equal(r.currentPhase, 1)

  const r2 = resolveProgramWeek({ rawWeek: 2, totalWeeks: 4, phases: undefined, fallbackPhase: 3 })
  assert.equal(r2.currentPhase, 3, 'honors an explicit fallbackPhase when there is nothing to re-derive from')
})

test('missing/non-positive totalWeeks defaults to 12 (the dashboard\'s long-standing default)', () => {
  const r = resolveProgramWeek({ rawWeek: 5, totalWeeks: undefined })
  assert.equal(r.totalWeeks, 12)
  assert.equal(r.currentWeek, 5)
  assert.equal(r.isComplete, false)

  const r2 = resolveProgramWeek({ rawWeek: 5, totalWeeks: 0 })
  assert.equal(r2.totalWeeks, 12, 'zero is treated as missing, not a 0-week program')
})
