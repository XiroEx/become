// Run with: npm run test:file tests/unit/entitlements/windowBucket.test.ts
//
// Day and week allowance buckets are LOCAL-KEY STRINGS, never Dates. Bucketing
// a "1 per day" allowance on a raw Date is the day-marker trap documented in
// lib/dayWindow.ts: a member west of UTC gets their reset at their local 7pm,
// so an evening scan silently spends tomorrow's allowance.
//
// The counter store (stage 4) and GET /api/me/entitlements both derive their
// bucket from this one function on purpose — two definitions of "this week"
// would let a member see 3/3 remaining while the gate thinks 0/3.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windowBucket } from '../../../lib/allowances'

// Eastern Daylight Time: 240 minutes WEST of UTC (browser convention).
const EDT = 240
// Tuesday 2026-09-01, 02:00 UTC — which is Monday the 31st, 10pm, in EDT.
const LATE_MONDAY_EDT = new Date('2026-09-01T02:00:00.000Z')

test('lifetime allowances have no bucket and never reset', () => {
  const { key, resetsAt } = windowBucket('lifetime', EDT, LATE_MONDAY_EDT)
  assert.equal(key, null)
  assert.equal(resetsAt, null)
})

test("a day bucket is the caller's local day, not the UTC one", () => {
  // 02:00 UTC is already Tuesday at UTC but still Monday evening in EDT.
  assert.equal(windowBucket('day', 0, LATE_MONDAY_EDT).key, '2026-09-01')
  assert.equal(windowBucket('day', EDT, LATE_MONDAY_EDT).key, '2026-08-31')
})

test('a day bucket resets at the local midnight that follows it', () => {
  const { resetsAt } = windowBucket('day', EDT, LATE_MONDAY_EDT)
  // Local midnight ending Monday 2026-08-31 in EDT is 04:00Z on 09-01.
  assert.equal(resetsAt, '2026-09-01T04:00:00.000Z')
  assert.ok(new Date(resetsAt!).getTime() > LATE_MONDAY_EDT.getTime())
})

test('a week bucket is anchored to the local Monday and rolls to the next one', () => {
  const monday = windowBucket('week', EDT, LATE_MONDAY_EDT)
  assert.equal(monday.key, 'W2026-08-31')
  assert.equal(monday.resetsAt, '2026-09-07T04:00:00.000Z')

  // Every day of that local week shares the key; the next Monday starts a new one.
  const sameWeek = windowBucket('week', EDT, new Date('2026-09-06T12:00:00.000Z')) // Sunday
  assert.equal(sameWeek.key, monday.key)
  const nextWeek = windowBucket('week', EDT, new Date('2026-09-07T12:00:00.000Z')) // Monday
  assert.equal(nextWeek.key, 'W2026-09-07')
  assert.notEqual(nextWeek.key, monday.key)
})

test('a week bucket resets after the current instant, in every timezone', () => {
  for (const tz of [-720, -330, 0, 240, 480, 840]) {
    for (const iso of [
      '2026-09-01T02:00:00.000Z',
      '2026-09-06T23:30:00.000Z',
      '2026-12-31T13:00:00.000Z',
    ]) {
      const now = new Date(iso)
      for (const w of ['day', 'week'] as const) {
        const { key, resetsAt } = windowBucket(w, tz, now)
        assert.ok(key, `${w}/${tz} produced no key`)
        assert.ok(
          new Date(resetsAt!).getTime() > now.getTime(),
          `${w} bucket at tz=${tz} on ${iso} resets in the past (${resetsAt})`,
        )
      }
    }
  }
})
