// Run with: npm run test:file tests/unit/buildLoggedAt.test.ts
//
// Time grafting is where day-marker bugs breed, so this pins the behaviour that
// the ordered day view now depends on.
//
// The old rule was: pick a past DAY, and the entry silently receives the CURRENT
// wall-clock time. Harmless while the day view sorted by tag. The moment it
// sorts by clock, three foods backdated to yesterday all land on the same minute
// and stack in entry order rather than eating order.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLoggedAt } from '../../lib/mealPlanDates'

const NOW = new Date(2026, 7, 13, 14, 37, 12, 500) // 13 Aug 2026, 14:37:12.500 local

/** Local wall-clock readback, since buildLoggedAt returns a UTC ISO string. */
function local(iso: string) {
  const d = new Date(iso)
  return {
    y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(),
    h: d.getHours(), min: d.getMinutes(),
  }
}

test('no date and no time means "right now"', () => {
  const got = local(buildLoggedAt(null, null, undefined, NOW))
  assert.deepEqual(got, { y: 2026, mo: 8, d: 13, h: 14, min: 37 })
})

test('a date with no time keeps the old graft-the-current-clock behaviour', () => {
  const got = local(buildLoggedAt('2026-08-11', null, undefined, NOW))
  assert.deepEqual(got, { y: 2026, mo: 8, d: 11, h: 14, min: 37 })
})

test('an explicit time is honoured on the chosen day', () => {
  const got = local(buildLoggedAt('2026-08-11', '07:15', undefined, NOW))
  assert.deepEqual(got, { y: 2026, mo: 8, d: 11, h: 7, min: 15 })
})

test('an explicit time with no date applies to today', () => {
  const got = local(buildLoggedAt(null, '07:15', undefined, NOW))
  assert.deepEqual(got, { y: 2026, mo: 8, d: 13, h: 7, min: 15 })
})

test('the fallback date is used when no date key is given', () => {
  const viewed = new Date(2026, 7, 10, 0, 0, 0)
  const got = local(buildLoggedAt(null, '20:00', viewed, NOW))
  assert.deepEqual(got, { y: 2026, mo: 8, d: 10, h: 20, min: 0 })
})

test('an explicit time zeroes seconds, so two entries at the same minute do not jitter', () => {
  const d = new Date(buildLoggedAt('2026-08-11', '07:15', undefined, NOW))
  assert.equal(d.getSeconds(), 0)
  assert.equal(d.getMilliseconds(), 0)
})

test('times near midnight land on the chosen day, not the next one', () => {
  assert.deepEqual(local(buildLoggedAt('2026-08-11', '00:00', undefined, NOW)),
    { y: 2026, mo: 8, d: 11, h: 0, min: 0 })
  assert.deepEqual(local(buildLoggedAt('2026-08-11', '23:59', undefined, NOW)),
    { y: 2026, mo: 8, d: 11, h: 23, min: 59 })
})

test('a malformed time degrades to the current clock rather than throwing', () => {
  // The <input type="time"> can hand back '' mid-edit on some browsers.
  const got = local(buildLoggedAt('2026-08-11', 'half past', undefined, NOW))
  assert.deepEqual(got, { y: 2026, mo: 8, d: 11, h: 14, min: 37 })
})

test('a malformed DATE still throws — that one is a caller bug, not user input', () => {
  assert.throws(() => buildLoggedAt('11-08-2026', '07:15', undefined, NOW), /Invalid date key/)
})
