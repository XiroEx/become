// Run with: npm run test:file tests/unit/scanLogAgainDate.test.ts
//
// Bug report: "There's no way to log a historical estimate, and Log again
// never lets you pick a time or tag." Estimate history's "Log again" used to
// always POST `loggedAt: new Date().toISOString(), untimed: true` — no day,
// time or tag control at all. This pins the timestamp/untimed math behind
// the "Log to a day" sheet (day + time + tag) so a future edit can't
// silently collapse every re-log back onto "now, untimed, saved tag".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveLogAgainTimestamp } from '../../lib/nutrition/resolveLogAgainTimestamp'

const NOW = new Date(2026, 7, 31, 18, 8, 0) // 31 Aug 2026, 18:08 local
const ANCHOR = '08:00' // stand-in for a tag's anchor time, e.g. breakfast

function local(iso: string) {
  const d = new Date(iso)
  return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes() }
}

test('no date and no time picked ("none") logs untimed, today, at the tag anchor', () => {
  const got = resolveLogAgainTimestamp(null, 'none', null, ANCHOR, NOW)
  assert.equal(got.untimed, true)
  assert.deepEqual(local(got.loggedAt), { y: 2026, mo: 8, d: 31, h: 8, min: 0 })
})

test('a past date backdates the log onto that day, still untimed at the anchor', () => {
  const got = resolveLogAgainTimestamp('2026-08-28', 'none', null, ANCHOR, NOW)
  assert.equal(got.untimed, true)
  assert.deepEqual(local(got.loggedAt), { y: 2026, mo: 8, d: 28, h: 8, min: 0 })
})

test('regression: a historical estimate no longer collapses onto today', () => {
  const got = resolveLogAgainTimestamp('2026-08-01', 'none', null, ANCHOR, NOW)
  assert.notEqual(local(got.loggedAt).d, 31)
  assert.deepEqual(local(got.loggedAt), { y: 2026, mo: 8, d: 1, h: 8, min: 0 })
})

test('"now" time mode also goes out untimed, at the anchor rather than the live clock', () => {
  const got = resolveLogAgainTimestamp(null, 'now', null, ANCHOR, NOW)
  assert.equal(got.untimed, true)
  assert.deepEqual(local(got.loggedAt), { y: 2026, mo: 8, d: 31, h: 8, min: 0 })
})

test('a custom time is stamped exactly and marks the entry timed', () => {
  const got = resolveLogAgainTimestamp('2026-08-28', 'custom', '07:15', ANCHOR, NOW)
  assert.equal(got.untimed, false)
  assert.deepEqual(local(got.loggedAt), { y: 2026, mo: 8, d: 28, h: 7, min: 15 })
})
