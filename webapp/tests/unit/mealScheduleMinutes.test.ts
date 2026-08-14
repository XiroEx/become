// Run with: npx tsx --test tests/unit/mealScheduleMinutes.test.ts
//
// `Number(null)` is 0, not NaN. That one fact silently broke every save on the
// Meal Schedule screen: an UNSCHEDULED tag (null start, null end) came through
// as midnight-to-midnight, tripped the zero-length-window guard, and the whole
// PUT was rejected — so reordering appeared to do nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanMinutes } from '../../lib/nutrition/mealSchedule'

test('an absent time stays absent instead of becoming midnight', () => {
  assert.equal(cleanMinutes(null), null, 'Number(null) === 0 is the trap')
  assert.equal(cleanMinutes(undefined), null)
  assert.equal(cleanMinutes(''), null)
})

test('midnight itself is still a legitimate time', () => {
  assert.equal(cleanMinutes(0), 0)
  assert.equal(cleanMinutes('0'), 0)
})

test('real values pass through, rounded to whole minutes', () => {
  assert.equal(cleanMinutes(780), 780)
  assert.equal(cleanMinutes('1439'), 1439)
  assert.equal(cleanMinutes(780.4), 780)
})

test('out-of-day and nonsense values are rejected', () => {
  assert.equal(cleanMinutes(1440), null, 'a day is 0-1439')
  assert.equal(cleanMinutes(-1), null)
  assert.equal(cleanMinutes('half past'), null)
  assert.equal(cleanMinutes(NaN), null)
  assert.equal(cleanMinutes(Infinity), null)
})
