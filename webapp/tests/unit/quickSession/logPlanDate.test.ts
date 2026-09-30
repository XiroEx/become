// Run with: npm run test:file tests/unit/quickSession/logPlanDate.test.ts
//
// Locks the calendar rule behind "log workouts for previous days, schedule
// for future days, and both for today": a past date can only be logged, a
// future date can only be planned, and today allows either.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logPlanAvailability, localDateStr } from '../../../lib/quickSession/logPlanDate'

test('a past date can only be logged', () => {
  const { canLog, canPlan } = logPlanAvailability('2026-08-10', '2026-08-27')
  assert.equal(canLog, true)
  assert.equal(canPlan, false)
})

test('a future date can only be planned', () => {
  const { canLog, canPlan } = logPlanAvailability('2026-09-05', '2026-08-27')
  assert.equal(canLog, false)
  assert.equal(canPlan, true)
})

test('today allows both logging and planning', () => {
  const { canLog, canPlan } = logPlanAvailability('2026-08-27', '2026-08-27')
  assert.equal(canLog, true)
  assert.equal(canPlan, true)
})

test('localDateStr renders local calendar components, not UTC', () => {
  // Fixed local time — Date's getFullYear/getMonth/getDate read local fields,
  // so this doesn't depend on the test runner's timezone.
  const d = new Date(2026, 7, 5) // August 5, 2026 (JS months are 0-based)
  assert.equal(localDateStr(d), '2026-08-05')
})
