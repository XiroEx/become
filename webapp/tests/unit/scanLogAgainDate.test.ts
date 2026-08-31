// Run with: npx tsx --test tests/unit/scanLogAgainDate.test.ts
//
// Bug report: "There's no way to log a historical estimate." The Estimate
// history page's "Log again" button always POSTed `loggedAt: new
// Date().toISOString()` — the estimate could only ever be re-logged onto
// *today*, no matter how old the estimate was or what day it was actually
// eaten. This pins the timestamp math behind the new "Log to a day" picker
// so a future edit can't silently collapse every date back onto "now".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveLogAgainTimestamp } from '../../lib/nutrition/resolveLogAgainTimestamp'

const NOW = new Date(2026, 7, 31, 18, 8, 0) // 31 Aug 2026, 18:08 local

function local(iso: string) {
  const d = new Date(iso)
  return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes() }
}

test('no date picked means right now, today (the original one-tap behavior)', () => {
  assert.deepEqual(local(resolveLogAgainTimestamp(null, NOW)), { y: 2026, mo: 8, d: 31, h: 18, min: 8 })
})

test('a past date backdates the log onto that day, keeping the current wall-clock time', () => {
  assert.deepEqual(local(resolveLogAgainTimestamp('2026-08-28', NOW)), { y: 2026, mo: 8, d: 28, h: 18, min: 8 })
})

test('regression: a historical estimate no longer collapses onto today', () => {
  const got = local(resolveLogAgainTimestamp('2026-08-01', NOW))
  assert.notEqual(got.d, 31)
  assert.deepEqual(got, { y: 2026, mo: 8, d: 1, h: 18, min: 8 })
})
