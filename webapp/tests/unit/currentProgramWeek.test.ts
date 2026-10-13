import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  alignProgramWeek,
  parsePhaseWeekSpan,
  resolveRawCurrentWeek,
} from '@/lib/dashboard/currentProgramWeek'

// Two phases of 4 weeks each — matches the shape NP-377 was filed against
// (Phase 1 spans weeks 1-4), 8 weeks total.
const TWO_PHASES = [
  { weeks: '1-4' },
  { weeks: '5-8' },
]

describe('currentProgramWeek: resolveRawCurrentWeek', () => {
  it('schedule-derived: prefers the reconciled schedule week over completedWorkouts', () => {
    assert.equal(
      resolveRawCurrentWeek({ scheduleCurrentWeek: 3, completedWorkouts: 100 }),
      3,
      'the schedule number wins even when completedWorkouts would imply something else'
    )
  })

  it('completion-derived: falls back to ceil(completedWorkouts / 4) with no schedule', () => {
    assert.equal(resolveRawCurrentWeek({ completedWorkouts: 9 }), 3) // ceil(9/4) = 3
    assert.equal(resolveRawCurrentWeek({ completedWorkouts: 8 }), 2) // ceil(8/4) = 2
  })

  it('defaults to week 1 with neither signal', () => {
    assert.equal(resolveRawCurrentWeek({}), 1)
  })

  it('never returns below 1 even for a zero/negative schedule week', () => {
    assert.equal(resolveRawCurrentWeek({ scheduleCurrentWeek: 0 }), 1)
  })
})

describe('currentProgramWeek: parsePhaseWeekSpan', () => {
  it('parses a range', () => {
    assert.equal(parsePhaseWeekSpan('1-4'), 4)
    assert.equal(parsePhaseWeekSpan('5-8'), 4)
  })

  it('treats a single week number, or nothing, as a 1-week span', () => {
    assert.equal(parsePhaseWeekSpan('1'), 1)
    assert.equal(parsePhaseWeekSpan(undefined), 1)
  })
})

describe('currentProgramWeek: alignProgramWeek', () => {
  it('mid-phase: week 2 of an 8-week, two-phase program stays in phase 1', () => {
    const result = alignProgramWeek({ rawWeek: 2, totalWeeks: 8, phases: TWO_PHASES, fallbackPhase: 1 })
    assert.deepEqual(result, { currentWeek: 2, currentPhase: 1, isPastEnd: false })
  })

  it('phase boundary: week 4 is still phase 1, week 5 rolls into phase 2', () => {
    const atBoundary = alignProgramWeek({ rawWeek: 4, totalWeeks: 8, phases: TWO_PHASES, fallbackPhase: 1 })
    assert.equal(atBoundary.currentPhase, 1)
    assert.equal(atBoundary.currentWeek, 4)

    const pastBoundary = alignProgramWeek({ rawWeek: 5, totalWeeks: 8, phases: TWO_PHASES, fallbackPhase: 1 })
    assert.equal(pastBoundary.currentPhase, 2)
    assert.equal(pastBoundary.currentWeek, 5)
  })

  it('last week: week 8 of 8 is phase 2, not past the end', () => {
    const result = alignProgramWeek({ rawWeek: 8, totalWeeks: 8, phases: TWO_PHASES, fallbackPhase: 1 })
    assert.deepEqual(result, { currentWeek: 8, currentPhase: 2, isPastEnd: false })
  })

  it('past the end: week 5 of a 4-week, single 1-4 phase program clamps to week 4, phase 1 — never "Week 5 of 4" (NP-377)', () => {
    const result = alignProgramWeek({
      rawWeek: 5,
      totalWeeks: 4,
      phases: [{ weeks: '1-4' }],
      fallbackPhase: 1,
    })
    assert.equal(result.currentWeek, 4, 'clamped to the program total')
    assert.equal(result.currentWeek <= 4, true, 'never exceeds totalWeeks')
    assert.equal(result.currentPhase, 1, 'phase agrees with the clamped week')
    assert.equal(result.isPastEnd, true, 'flags that the raw week ran past the program length')
  })

  it('past the end on a two-phase program: the clamped week lands in the LAST phase, agreeing with the week shown', () => {
    const result = alignProgramWeek({ rawWeek: 12, totalWeeks: 8, phases: TWO_PHASES, fallbackPhase: 1 })
    assert.equal(result.currentWeek, 8)
    assert.equal(result.currentPhase, 2, 'week 8 (clamped) is phase 2\'s last week, not phase 1')
    assert.equal(result.isPastEnd, true)
  })

  it('falls back to the stored phase when the program has no phases to derive one from', () => {
    const result = alignProgramWeek({ rawWeek: 3, totalWeeks: 6, phases: undefined, fallbackPhase: 2 })
    assert.equal(result.currentPhase, 2)
    assert.equal(result.currentWeek, 3)
  })

  it('does not clamp when totalWeeks is unknown (legacy data without a program record)', () => {
    const result = alignProgramWeek({ rawWeek: 9, totalWeeks: undefined, phases: undefined, fallbackPhase: 1 })
    assert.equal(result.currentWeek, 9)
    assert.equal(result.isPastEnd, false, 'nothing to compare against, so it is not flagged past the end')
  })
})
