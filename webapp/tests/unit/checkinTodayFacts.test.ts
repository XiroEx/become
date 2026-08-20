// Run with: npx tsx --test tests/unit/checkinTodayFacts.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkInFactsForToday } from '../../lib/checkin/todayFacts'

const TODAY = '2026-08-19'
const TZ_EST = 300 // minutes behind UTC

test('no history at all reads as nothing logged, not skipped', () => {
  const facts = checkInFactsForToday({}, TODAY, TZ_EST)
  assert.deepEqual(facts, { moodLoggedToday: false, weightLoggedToday: false, skippedToday: false })
})

test('a mood entry stored today (UTC midnight marker) counts for an EST member', () => {
  const facts = checkInFactsForToday(
    { moodHistory: [{ date: `${TODAY}T00:00:00.000Z` }] },
    TODAY,
    TZ_EST,
  )
  assert.equal(facts.moodLoggedToday, true)
})

test('an entry from yesterday does not count as logged today', () => {
  const facts = checkInFactsForToday(
    { weightHistory: [{ date: '2026-08-18T00:00:00.000Z' }] },
    TODAY,
    TZ_EST,
  )
  assert.equal(facts.weightLoggedToday, false)
})

test('both mood and weight logged today are reported independently', () => {
  const facts = checkInFactsForToday(
    {
      moodHistory: [{ date: `${TODAY}T00:00:00.000Z` }],
      weightHistory: [{ date: `${TODAY}T00:00:00.000Z` }],
    },
    TODAY,
    TZ_EST,
  )
  assert.equal(facts.moodLoggedToday, true)
  assert.equal(facts.weightLoggedToday, true)
})

test('"Skip for Today" pressed today is reflected in skippedToday', () => {
  const facts = checkInFactsForToday(
    { checkIn: { lastSkippedDate: `${TODAY}T00:00:00.000Z` } },
    TODAY,
    TZ_EST,
  )
  assert.equal(facts.skippedToday, true)
})

test('a skip from a previous day does not carry forward', () => {
  const facts = checkInFactsForToday(
    { checkIn: { lastSkippedDate: '2026-08-10T00:00:00.000Z' } },
    TODAY,
    TZ_EST,
  )
  assert.equal(facts.skippedToday, false)
})

test('a null checkIn block does not throw', () => {
  assert.doesNotThrow(() => checkInFactsForToday({ checkIn: null }, TODAY, TZ_EST))
})
