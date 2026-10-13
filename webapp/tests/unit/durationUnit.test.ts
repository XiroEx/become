// Run with: npm run test:file tests/unit/durationUnit.test.ts
//
// "You should be able to switch between minutes or seconds. Think about it 5
// minutes on a treadmill in seconds is crazyyyyyy." — the duration a member
// types always ends up stored as seconds (saveWorkout, history, PRs all
// assume it), so the sec/min toggle on the Live and Track views is purely a
// display-time conversion. These are the conversion + defaulting rules that
// backs it, tested in isolation from either surface's React state.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  defaultDurationUnit,
  secondsToUnitDisplay,
  unitDisplayToSeconds,
  isFloorsExercise,
} from '@/lib/workout/durationUnit'

describe('defaultDurationUnit', () => {
  it('opens time + distance cardio (treadmill, stairmaster) in minutes', () => {
    assert.equal(defaultDurationUnit('time_distance'), 'min')
  })

  it('opens plain holds and intervals in seconds', () => {
    assert.equal(defaultDurationUnit('time'), 'sec')
    assert.equal(defaultDurationUnit('intervals'), 'sec')
  })

  it('falls back to seconds for anything else, including unset', () => {
    assert.equal(defaultDurationUnit('reps_weight'), 'sec')
    assert.equal(defaultDurationUnit(undefined), 'sec')
    assert.equal(defaultDurationUnit(null), 'sec')
  })
})

describe('secondsToUnitDisplay', () => {
  it('passes seconds through unchanged', () => {
    assert.equal(secondsToUnitDisplay('900', 'sec'), '900')
    assert.equal(secondsToUnitDisplay(45, 'sec'), '45')
  })

  it('converts stored seconds to minutes for display — 900s reads as 15, not 900', () => {
    assert.equal(secondsToUnitDisplay('900', 'min'), '15')
    assert.equal(secondsToUnitDisplay('90', 'min'), '1.5')
  })

  it('treats empty/missing as an empty field, not 0', () => {
    assert.equal(secondsToUnitDisplay('', 'min'), '')
    assert.equal(secondsToUnitDisplay(null, 'min'), '')
    assert.equal(secondsToUnitDisplay(undefined, 'sec'), '')
  })

  it('is blank rather than NaN for garbage input', () => {
    assert.equal(secondsToUnitDisplay('not-a-number', 'min'), '')
  })
})

describe('unitDisplayToSeconds', () => {
  it('stores a seconds-mode value unchanged', () => {
    assert.equal(unitDisplayToSeconds('45', 'sec'), '45')
  })

  it('converts a minutes-mode value to seconds before it is ever stored', () => {
    assert.equal(unitDisplayToSeconds('15', 'min'), '900')
    assert.equal(unitDisplayToSeconds('1.5', 'min'), '90')
  })

  it('round-trips through both converters without drift', () => {
    const stored = '900'
    const displayed = secondsToUnitDisplay(stored, 'min')
    assert.equal(unitDisplayToSeconds(displayed, 'min'), stored)
  })

  it('is blank rather than NaN for empty/garbage input', () => {
    assert.equal(unitDisplayToSeconds('', 'min'), '')
    assert.equal(unitDisplayToSeconds('nope', 'sec'), '')
  })
})

describe('isFloorsExercise', () => {
  it('matches the member-created "Stairmaster" exercise the card is about', () => {
    assert.equal(isFloorsExercise('Stairmaster'), true)
  })

  it('matches other stair-climber naming, case-insensitively', () => {
    assert.equal(isFloorsExercise('Stair Climber'), true)
    assert.equal(isFloorsExercise('stair stepper'), true)
    assert.equal(isFloorsExercise('STAIRS'), true)
  })

  it('does not match unrelated cardio', () => {
    assert.equal(isFloorsExercise('Incline Treadmill Walk'), false)
    assert.equal(isFloorsExercise('Rowing Machine'), false)
  })

  it('handles missing names', () => {
    assert.equal(isFloorsExercise(undefined), false)
    assert.equal(isFloorsExercise(null), false)
    assert.equal(isFloorsExercise(''), false)
  })
})
