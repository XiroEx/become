// Run with: npx tsx --test tests/unit/dayStatus.test.ts
//
// Card: "Make is so that if any workout is completed for the day make the
// calendar reflect that. Rather than prioritizing just programs."
//
// The Workout page's "This Week" strip picked one status per day by looking
// at the program-scheduled workout first, a quick (one-off) session only if
// there was no program slot. So a day with a still-"scheduled" program
// workout AND a completed quick session showed as not-done — the completed
// quick session was invisible whenever a program slot existed that day.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeWeekStripDayStatus } from '../../lib/workout/dayStatus'

test('REGRESSION: a completed quick session wins even when the program slot for the day is still scheduled', () => {
  const status = computeWeekStripDayStatus(
    [{ status: 'scheduled' }],
    [{ completed: true }],
  )
  assert.equal(status, 'completed')
})

test('a completed quick session wins over a missed program slot', () => {
  const status = computeWeekStripDayStatus(
    [{ status: 'missed' }],
    [{ completed: true }],
  )
  assert.equal(status, 'completed')
})

test('a completed program workout still reads as completed with no quick sessions', () => {
  const status = computeWeekStripDayStatus([{ status: 'completed' }], undefined)
  assert.equal(status, 'completed')
})

test('multiple program slots: any one completed is enough, even if the first slot is not', () => {
  const status = computeWeekStripDayStatus(
    [{ status: 'scheduled' }, { status: 'completed' }],
    undefined,
  )
  assert.equal(status, 'completed')
})

test('an uncompleted quick session with no program slot reads as a pending quick session', () => {
  const status = computeWeekStripDayStatus(undefined, [{ completed: false }])
  assert.equal(status, 'quick')
})

test('a scheduled program slot with no quick sessions falls back to the program status', () => {
  const status = computeWeekStripDayStatus([{ status: 'scheduled' }], undefined)
  assert.equal(status, 'scheduled')
})

test('a scheduled program slot with an incomplete quick session still falls back to the program status', () => {
  const status = computeWeekStripDayStatus(
    [{ status: 'scheduled' }],
    [{ completed: false }],
  )
  assert.equal(status, 'scheduled')
})

test('nothing scheduled and no quick sessions reads as rest', () => {
  const status = computeWeekStripDayStatus(undefined, undefined)
  assert.equal(status, 'rest')
})

test('an empty workouts array with no quick sessions still reads as rest', () => {
  const status = computeWeekStripDayStatus([], [])
  assert.equal(status, 'rest')
})
