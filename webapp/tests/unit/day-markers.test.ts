// Run with: npx tsx --test tests/unit/day-markers.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  utcMidnightDateKey,
  localDayWindowForKey,
  dateKey,
  entryDayKeys,
  isEntryOnDay,
  daysSinceEntry,
} from '../../lib/dayWindow'

// Browser-style offsets: positive is WEST of UTC.
const EASTERN = 300
const PACIFIC = 480
const BERLIN = -60
const UTC = 0

test('the bug: a day marker falls OUTSIDE its own local-instant window west of UTC', () => {
  // This is the defect every fix below exists for. Mood/weight rows are written
  // at UTC midnight of the member's local day, then were matched against the
  // local-instant window for that same day — which starts five hours later.
  const key = '2026-08-05'
  const marker = utcMidnightDateKey(key)
  const { start } = localDayWindowForKey(key, EASTERN)

  assert.ok(marker.getTime() < start.getTime(), 'precondition: the marker precedes the window')
  assert.equal(dateKey(marker, EASTERN), '2026-08-04', 'and reads back as YESTERDAY')

  // The helper reads it as the day it means.
  assert.equal(isEntryOnDay(marker, key, EASTERN), true)
  assert.equal(daysSinceEntry(marker, key, EASTERN), 0)
})

test('a row logged today reads as today in every timezone', () => {
  const key = '2026-08-05'
  const marker = utcMidnightDateKey(key)
  for (const tz of [UTC, EASTERN, PACIFIC, BERLIN]) {
    assert.equal(isEntryOnDay(marker, key, tz), true, `tz=${tz}`)
    assert.equal(daysSinceEntry(marker, key, tz), 0, `tz=${tz}`)
  }
})

test('yesterday is still yesterday — the fix does not swallow real gaps', () => {
  const yesterday = utcMidnightDateKey('2026-08-04')
  for (const tz of [UTC, EASTERN, PACIFIC, BERLIN]) {
    assert.equal(isEntryOnDay(yesterday, '2026-08-05', tz), false, `tz=${tz}`)
    assert.equal(daysSinceEntry(yesterday, '2026-08-05', tz), 1, `tz=${tz}`)
  }
  assert.equal(daysSinceEntry(utcMidnightDateKey('2026-07-29'), '2026-08-05', EASTERN), 7)
})

test('legacy rows holding a real timestamp still resolve to their local day', () => {
  // Rows written before the UTC-midnight convention hold the actual moment of
  // logging. 2026-08-05T23:30Z is still Aug 5 in Berlin but Aug 5 evening in
  // New York too — both readings are accepted, nearest wins.
  const evening = new Date('2026-08-05T23:30:00Z')
  assert.equal(isEntryOnDay(evening, '2026-08-05', EASTERN), true)
  assert.equal(daysSinceEntry(evening, '2026-08-05', EASTERN), 0)

  // A Pacific member logging at 2026-08-06T02:00Z is still on their Aug 5.
  const lateNight = new Date('2026-08-06T02:00:00Z')
  assert.equal(isEntryOnDay(lateNight, '2026-08-05', PACIFIC), true)
})

test('entryDayKeys collapses to one key when both readings agree', () => {
  assert.deepEqual(entryDayKeys(utcMidnightDateKey('2026-08-05'), UTC), ['2026-08-05'])
  assert.equal(entryDayKeys(utcMidnightDateKey('2026-08-05'), EASTERN).length, 2)
})

test('daysSinceEntry never goes negative', () => {
  // A row dated in the future (device clock skew) must not read as "-1 days",
  // which would sort ahead of everything and look like a fresh log.
  assert.equal(daysSinceEntry(utcMidnightDateKey('2026-08-09'), '2026-08-05', EASTERN), 0)
})

test('unparseable dates are reported as unknown, not as zero', () => {
  // Returning 0 here would silently claim "logged today" for corrupt data.
  assert.equal(daysSinceEntry('not a date', '2026-08-05', EASTERN), null)
  assert.deepEqual(entryDayKeys('not a date', EASTERN), [])
  assert.equal(isEntryOnDay('not a date', '2026-08-05', EASTERN), false)
})

test('month and year boundaries hold', () => {
  assert.equal(daysSinceEntry(utcMidnightDateKey('2026-07-31'), '2026-08-01', PACIFIC), 1)
  assert.equal(daysSinceEntry(utcMidnightDateKey('2025-12-31'), '2026-01-01', PACIFIC), 1)
  assert.equal(isEntryOnDay(utcMidnightDateKey('2026-01-01'), '2026-01-01', PACIFIC), true)
})
