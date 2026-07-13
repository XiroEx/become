// Run with: npx tsx --test tests/unit/tz-capture.test.ts
//
// Regression coverage for the "workout reminder fires at ~3am local" bug.
// Root cause: a workout-save request with no `tz` in its body had its offset
// read via readTzOffsetFromBody (which defaults to 0 = UTC) and that fabricated
// 0 was persisted as the user's timezone. The cron then treated a US/Eastern
// user (real offset 300) as UTC and sent the 7am-11am *UTC* reminder window at
// ~3am their real local time. The fix: only persist a genuinely-reported
// offset, read via readOptionalTzOffsetFromBody (null when `tz` is absent).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readTzOffsetFromBody,
  readOptionalTzOffsetFromBody,
} from '../../lib/dayWindow'
import { localHourForUser, WORKOUT_REMINDER_START_HOUR, WORKOUT_REMINDER_END_HOUR } from '../../lib/notifications/cronNotify'

test('readOptionalTzOffsetFromBody returns null when tz is ABSENT (never persist a fake UTC)', () => {
  assert.equal(readOptionalTzOffsetFromBody({}), null)
  assert.equal(readOptionalTzOffsetFromBody({ programId: 'x', day: 'Day 1' }), null)
  assert.equal(readOptionalTzOffsetFromBody(null), null)
  assert.equal(readOptionalTzOffsetFromBody(undefined), null)
  assert.equal(readOptionalTzOffsetFromBody('not-an-object'), null)
})

test('readOptionalTzOffsetFromBody returns null for a non-finite / non-number tz', () => {
  assert.equal(readOptionalTzOffsetFromBody({ tz: NaN }), null)
  assert.equal(readOptionalTzOffsetFromBody({ tz: '300' }), null)
  assert.equal(readOptionalTzOffsetFromBody({ tz: null }), null)
})

test('readOptionalTzOffsetFromBody preserves a GENUINELY reported offset — including a real UTC 0', () => {
  assert.equal(readOptionalTzOffsetFromBody({ tz: 0 }), 0) // real UTC user, must be kept
  assert.equal(readOptionalTzOffsetFromBody({ tz: 300 }), 300) // US/Eastern (EST)
  assert.equal(readOptionalTzOffsetFromBody({ tz: -60 }), -60) // CET
})

test('readOptionalTzOffsetFromBody clamps junk to ±14h', () => {
  assert.equal(readOptionalTzOffsetFromBody({ tz: 5000 }), 840)
  assert.equal(readOptionalTzOffsetFromBody({ tz: -5000 }), -840)
})

test('readTzOffsetFromBody still defaults to 0 for day-window math (unchanged)', () => {
  // The 0-default is fine for interpreting a SINGLE request's local day, but is
  // exactly why it must not be the value we persist.
  assert.equal(readTzOffsetFromBody({}), 0)
  assert.equal(readTzOffsetFromBody({ tz: 300 }), 300)
})

test('the poison scenario: a stored offset of 0 makes an Eastern user fire at ~3am', () => {
  // 08:00 UTC is when the fixed morning window opens for a UTC user.
  const at8amUtc = new Date('2026-05-30T08:00:00Z')

  // Correctly stored Eastern offset (300) → 3am local → OUTSIDE the window,
  // so NO reminder is sent at 08:00 UTC. This is the desired behavior.
  const easternLocalHour = localHourForUser(at8amUtc, 300)
  assert.equal(easternLocalHour, 3)
  assert.ok(
    easternLocalHour! < WORKOUT_REMINDER_START_HOUR || easternLocalHour! > WORKOUT_REMINDER_END_HOUR,
    'a correctly-stored Eastern user must NOT be in the morning window at 08:00 UTC',
  )

  // A poisoned offset of 0 would put that same Eastern user squarely IN the
  // window (local hour 8) — i.e. a push at 3am their time. The fix prevents
  // this by never persisting a fabricated 0 (see the readOptional tests above).
  const poisonedLocalHour = localHourForUser(at8amUtc, 0)
  assert.equal(poisonedLocalHour, 8)
  assert.ok(
    poisonedLocalHour! >= WORKOUT_REMINDER_START_HOUR && poisonedLocalHour! <= WORKOUT_REMINDER_END_HOUR,
    'demonstrates the bug: offset 0 lands the Eastern user in the window at 3am local',
  )

  // Guard the fix at the boundary: a body without `tz` yields null, so this
  // fabricated-0 is never written.
  assert.equal(readOptionalTzOffsetFromBody({ programId: 'p', day: 'Day 1', completed: true }), null)
})
