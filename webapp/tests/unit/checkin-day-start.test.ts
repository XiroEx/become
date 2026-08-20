// Run with: npx tsx --test tests/unit/checkin-day-start.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHECK_IN_DAY_START_HOUR, checkInTzOffset } from '../../lib/checkin/todayFacts'
import { localDateKey, dateKey } from '../../lib/dayWindow'

test('the check-in day starts at 4am local', () => {
  assert.equal(CHECK_IN_DAY_START_HOUR, 4)
})

test('a moment just before 4am local still keys as the PREVIOUS check-in day', () => {
  const TZ_EST = 300 // minutes behind UTC (EST, UTC-5)
  const checkInTz = checkInTzOffset(TZ_EST)
  // 2026-08-19T08:59:00Z is 03:59 local in EST (UTC-5) — one minute shy of 4am.
  const justBefore4am = new Date('2026-08-19T08:59:00Z')
  assert.equal(localDateKey(null, checkInTz, justBefore4am), '2026-08-18')
})

test('4am local on the nose rolls the check-in day forward', () => {
  const TZ_EST = 300
  const checkInTz = checkInTzOffset(TZ_EST)
  // 2026-08-19T09:00:00Z is 04:00 local in EST.
  const exactly4am = new Date('2026-08-19T09:00:00Z')
  assert.equal(localDateKey(null, checkInTz, exactly4am), '2026-08-19')
})

test('midday is unaffected — same calendar day either way', () => {
  const TZ_EST = 300
  const checkInTz = checkInTzOffset(TZ_EST)
  const noon = new Date('2026-08-19T17:00:00Z') // 12:00 local EST
  assert.equal(localDateKey(null, TZ_EST, noon), '2026-08-19')
  assert.equal(localDateKey(null, checkInTz, noon), '2026-08-19')
})

test('holds for zones EAST of UTC too', () => {
  const TZ_CET = -60 // minutes behind UTC is negative for zones ahead of UTC
  const checkInTz = checkInTzOffset(TZ_CET)
  // 2026-08-19T02:59:00Z is 03:59 local CET (UTC+1).
  const justBefore4am = new Date('2026-08-19T02:59:00Z')
  assert.equal(localDateKey(null, checkInTz, justBefore4am), '2026-08-18')
  // 2026-08-19T03:00:00Z is 04:00 local CET.
  const exactly4am = new Date('2026-08-19T03:00:00Z')
  assert.equal(localDateKey(null, checkInTz, exactly4am), '2026-08-19')
})

test("George's report: shown near midnight, opened again a few hours later — new check-in day", () => {
  const TZ_EST = 300
  const checkInTz = checkInTzOffset(TZ_EST)

  // Modal marked "shown" (partial, never completed) at 2026-08-18 23:00 local EST.
  const shownAt = new Date('2026-08-19T04:00:00Z') // 23:00 local EST on Aug 18
  const shownDayKey = localDateKey(null, checkInTz, shownAt)
  assert.equal(shownDayKey, '2026-08-18')

  // Member opens the app again at 2026-08-19 07:00 local EST — 8 hours later,
  // and past the check-in day's 4am rollover.
  const openedAt = new Date('2026-08-19T12:00:00Z') // 07:00 local EST on Aug 19
  const todayKey = localDateKey(null, checkInTz, openedAt)
  assert.equal(todayKey, '2026-08-19')

  // The stamp from yesterday must NOT read as "already shown today". This uses
  // dateKey (a pure instant->local-day mapping), matching the API route — NOT
  // isEntryOnDay, whose marker-or-instant fallback would let the raw UTC
  // calendar day ('2026-08-19' for this very instant) false-positive as a match.
  const shownToday = dateKey(shownAt, checkInTz) === todayKey
  assert.equal(shownToday, false)
})
