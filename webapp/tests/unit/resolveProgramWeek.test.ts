// Run with: npm run test:file tests/unit/resolveProgramWeek.test.ts
//
// NP-377: the Home current-program line read "Phase 1 • Week 5 of 4" on both
// web and native for a demo account whose schedule-derived week had run past
// its 4-week program while the stored phase stayed at 1. `resolveProgramWeek`
// (webapp/app/api/progress/route.ts's single source for this) clamps the week
// into the program's length and re-derives the phase from it, so the two can
// never disagree and a finished program never overshoots its own length.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveProgramWeek } from '../../lib/data/userProgress'

const PHASES = [
  { weeks: '1-4' },
  { weeks: '5-8' },
  { weeks: '9-12' },
]

test('mid-phase: week 3 of a 12-week program sits in phase 1', () => {
  const r = resolveProgramWeek({ rawWeek: 3, totalWeeks: 12, phases: PHASES, fallbackPhase: 1 })
  assert.deepEqual(r, { currentWeek: 3, totalWeeks: 12, currentPhase: 1, isComplete: false })
})

test('phase boundary: week 5 (first week of phase 2) reports phase 2, not phase 1', () => {
  const r = resolveProgramWeek({ rawWeek: 5, totalWeeks: 12, phases: PHASES, fallbackPhase: 1 })
  assert.equal(r.currentWeek, 5)
  assert.equal(r.currentPhase, 2, 'the phase must agree with the week, even though the stored phase was still 1')
  assert.equal(r.isComplete, false)
})

test('last week: week 12 of 12 is the final week of the final phase, not past the end', () => {
  const r = resolveProgramWeek({ rawWeek: 12, totalWeeks: 12, phases: PHASES, fallbackPhase: 3 })
  assert.deepEqual(r, { currentWeek: 12, totalWeeks: 12, currentPhase: 3, isComplete: false })
})

test('past the end: this is the bug — week 5 of a 4-week, 1-phase program never reads "Week 5 of 4"', () => {
  // The exact repro: a 4-week, single-phase program whose reconciled
  // completions pushed the week past the program's own length.
  const r = resolveProgramWeek({ rawWeek: 5, totalWeeks: 4, phases: [{ weeks: '1-4' }], fallbackPhase: 1 })
  assert.equal(r.currentWeek, 4, 'clamps to the last week instead of "5 of 4"')
  assert.equal(r.totalWeeks, 4)
  assert.equal(r.currentPhase, 1, 'still the (only) phase the last week belongs to')
  assert.equal(r.isComplete, true, 'the program has run its course — callers can label it finished/repeating')
})

test('past the end, multi-phase: clamps into the FINAL phase, not back to phase 1', () => {
  const r = resolveProgramWeek({ rawWeek: 15, totalWeeks: 12, phases: PHASES, fallbackPhase: 1 })
  assert.equal(r.currentWeek, 12)
  assert.equal(r.currentPhase, 3, 'the last phase, agreeing with the clamped final week')
  assert.equal(r.isComplete, true)
})

test('schedule-derived week (reconciled sessions / daysPerWeek) resolves the same way as completion-derived', () => {
  // scheduleCurrentWeek path: reconciled sessions / daysPerWeek
  const scheduleDerived = resolveProgramWeek({ rawWeek: Math.ceil(18 / 4), totalWeeks: 12, phases: PHASES, fallbackPhase: 1 })
  // completedWorkouts fallback path: Math.ceil(completedWorkouts / 4)
  const completionDerived = resolveProgramWeek({ rawWeek: Math.ceil(18 / 4), totalWeeks: 12, phases: PHASES, fallbackPhase: 1 })
  assert.deepEqual(scheduleDerived, completionDerived)
  assert.equal(scheduleDerived.currentWeek, 5)
  assert.equal(scheduleDerived.currentPhase, 2)
})

test('no phase data at all falls back to the stored phase, but the week still clamps', () => {
  const r = resolveProgramWeek({ rawWeek: 7, totalWeeks: 4, phases: null, fallbackPhase: 2 })
  assert.equal(r.currentWeek, 4)
  assert.equal(r.currentPhase, 2, 'nothing to re-derive from, so the stored phase is kept')
  assert.equal(r.isComplete, true)
})

test('missing totalWeeks defaults to 12, matching formatProgressData\'s own default', () => {
  const r = resolveProgramWeek({ rawWeek: 3, totalWeeks: null, phases: null, fallbackPhase: 1 })
  assert.equal(r.totalWeeks, 12)
  assert.equal(r.currentWeek, 3)
  assert.equal(r.isComplete, false)
})

test('week 0 or negative never reports below week 1', () => {
  assert.equal(resolveProgramWeek({ rawWeek: 0, totalWeeks: 12 }).currentWeek, 1)
  assert.equal(resolveProgramWeek({ rawWeek: -3, totalWeeks: 12 }).currentWeek, 1)
})
