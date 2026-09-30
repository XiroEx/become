import { test, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  KG_PER_LB,
  HOLD_BAND_KG,
  HOLD_WINDOW_DAYS,
  REOPEN_MARGIN_KG,
  PACE_OPTIONS_LB,
  PACE_OPTIONS_KG,
  directionFromWeights,
  clampPaceKg,
  defaultPaceKg,
  kgToUnit,
  unitToKg,
  fmtUnit,
  etaWeeks,
  formatEta,
  isAchieved,
  holdConfirmed,
  hasDriftedOut,
  driftedSinceAchieved,
  paceRead,
  utcDayIndex,
} from '../src/goals/pace'
import { readReached } from '../src/goals/status'

const LB = KG_PER_LB
const d = (s: string) => new Date(s + 'T12:00:00Z')

describe('goals/pace', () => {
  it('calculates ETA weeks correctly', () => {
    const w = etaWeeks(208 * LB, 205 * LB, 1 * LB)
    assert.ok(w && Math.abs(w - 3) < 0.01)
    assert.equal(formatEta(w), '~3 wks')
    assert.equal(formatEta(0.4), '~3 days')
    assert.equal(formatEta(0.2), 'this week')
    assert.equal(formatEta(0), 'there')
  })

  it('evaluates paceRead status (on, behind, ahead, done)', () => {
    const base = {
      baselineKg: 200 * LB,
      baselineDate: d('2026-08-01'),
      targetKg: 180 * LB,
      paceKg: 1 * LB,
      direction: 'lose' as const,
      now: d('2026-08-29'),
    }
    assert.equal(paceRead({ ...base, latestKg: 196 * LB }).status, 'on')
    assert.equal(paceRead({ ...base, latestKg: 195.5 * LB }).status, 'on', 'inside tolerance')
    const behind = paceRead({ ...base, latestKg: 198 * LB })
    assert.equal(behind.status, 'behind')
    assert.ok(Math.abs(behind.behindByKg - 2 * LB) < 0.01)
    assert.equal(paceRead({ ...base, latestKg: 194 * LB }).status, 'ahead')

    // At finish line
    const done = paceRead({ ...base, latestKg: 180.5 * LB })
    assert.equal(done.status, 'done')
    assert.equal(done.remainingKg, 0)
  })

  it('handles units and defaults', () => {
    assert.equal(directionFromWeights(200, 180), 'lose')
    assert.equal(directionFromWeights(150, 160), 'gain')
    assert.equal(directionFromWeights(170, 170), 'maintain')

    assert.equal(defaultPaceKg('lose'), 1 * LB)
    assert.equal(defaultPaceKg('gain'), 0.5 * LB)
    assert.equal(defaultPaceKg('maintain'), 0)

    assert.equal(Math.round(kgToUnit(100, 'lbs')), 220)
    assert.equal(kgToUnit(100, 'kg'), 100)
    assert.equal(Math.round(unitToKg(220, 'lbs')), 100)

    assert.equal(fmtUnit(100, 'lbs'), '220 lbs')
    assert.equal(fmtUnit(100, 'kg'), '100 kg')
  })

  it('evaluates hold and drift hysteresis correctly', () => {
    const TARGET = 205 * LB
    assert.equal(hasDriftedOut(205 * LB, TARGET), false, 'on target')
    assert.equal(hasDriftedOut(206 * LB, TARGET), false, 'inside hold band')
    assert.equal(hasDriftedOut(207 * LB, TARGET), false, 'edge of hold band')
    assert.equal(hasDriftedOut(207.5 * LB, TARGET), false, 'within reopen margin')
    assert.equal(hasDriftedOut(208 * LB, TARGET), true, 'drifted out past band + margin')
  })
})

describe('goals/status', () => {
  it('differentiates confirmed reached from at-goal', () => {
    assert.equal(readReached('achieved', 'behind'), 'reached')
    assert.equal(readReached('achieved', null), 'reached')
    assert.equal(readReached('active', 'done'), 'at-goal')
    assert.equal(readReached('active', 'behind'), null)
    assert.equal(readReached('active', 'on'), null)
    assert.equal(readReached('none', null), null)
    assert.equal(readReached(undefined, undefined), null)
  })
})
