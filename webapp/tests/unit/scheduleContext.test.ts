// Run with: npm run test:file tests/unit/scheduleContext.test.ts
//
// Pinned to the real 2026-08-12 session: the Mind coach closed with "as you
// tackle your Chest and Back workout today" while the member's calendar said
// Day 3 · Legs. The coach is grounded by assembleUserContext, which classified
// the schedule by comparing a day MARKER to an instant.
//
// These reimplement the two comparisons so the rule itself is under test — the
// assembler needs a live DB, the arithmetic does not.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const DAY = 24 * 60 * 60 * 1000

const slotDayKey = (v: string) => v.slice(0, 10)
const userDayKey = (atMs: number, off: number | undefined) =>
  new Date(atMs - (Number.isFinite(off as number) ? (off as number) : 0) * 60000).toISOString().slice(0, 10)
const daysBetweenKeys = (from: string, to: string) =>
  Math.max(0, Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY))

/** The old rule, kept so the regression stays legible. */
function classifyOld(slots: { date: string; status: string; title: string }[], nowMs: number) {
  let overdue = 0
  let next: { title: string; inDays: number } | undefined
  for (const w of slots) {
    if (w.status !== 'scheduled') continue
    const t = Date.parse(w.date)
    if (t < nowMs) overdue++
    else {
      const inDays = Math.max(0, Math.round((t - nowMs) / DAY))
      if (!next || inDays < next.inDays) next = { title: w.title, inDays }
    }
  }
  return { overdue, next }
}

function classifyNew(slots: { date: string; status: string; title: string }[], nowMs: number, off?: number) {
  const todayKey = userDayKey(nowMs, off)
  let overdue = 0
  let next: { title: string; inDays: number } | undefined
  for (const w of slots) {
    if (w.status !== 'scheduled') continue
    const key = slotDayKey(w.date)
    if (key < todayKey) overdue++
    else {
      const inDays = daysBetweenKeys(todayKey, key)
      if (!next || inDays < next.inDays) next = { title: w.title, inDays }
    }
  }
  return { overdue, next }
}

// The member's real schedule.
const SLOTS = [
  { date: '2026-08-11T00:00:00.000Z', status: 'scheduled', title: 'Rear Delts, Back, Triceps' },
  { date: '2026-08-12T00:00:00.000Z', status: 'scheduled', title: 'Legs' },
  { date: '2026-08-13T00:00:00.000Z', status: 'scheduled', title: 'Chest, Back' },
]

// 4:24pm EDT on Aug 12 — the timestamp on the screenshot.
const SESSION_AT = Date.parse('2026-08-12T20:24:00.000Z')
const EDT = 240

test('the coach is told today is Legs, not tomorrow\'s Chest, Back', () => {
  const out = classifyNew(SLOTS, SESSION_AT, EDT)
  assert.equal(out.next?.title, 'Legs')
  assert.equal(out.next?.inDays, 0, 'Legs is today')
})

test('the old rule produced the exact wrong line the member saw', () => {
  const out = classifyOld(SLOTS, SESSION_AT)
  assert.equal(out.next?.title, 'Chest, Back')
  assert.equal(out.next?.inDays, 0, 'and it called it TODAY')
  // Today's real workout was swallowed into the overdue count.
  assert.equal(out.overdue, 2)
})

test('today is never counted as overdue', () => {
  // The old rule marked today overdue from 00:00Z onward, i.e. all day.
  assert.equal(classifyNew(SLOTS, SESSION_AT, EDT).overdue, 1) // only Aug 11
  assert.equal(classifyOld(SLOTS, SESSION_AT).overdue, 2)      // Aug 11 AND Aug 12
})

test('this one was never confined to timezones behind UTC', () => {
  // Unlike the push-notification variant, the rounding flips for EVERYONE once
  // it is past midday UTC — tomorrow is then under 12h away and rounds to 0.
  const utcAfternoon = Date.parse('2026-08-12T13:00:00.000Z')
  assert.equal(classifyOld(SLOTS, utcAfternoon).next?.title, 'Chest, Back')
  assert.equal(classifyNew(SLOTS, utcAfternoon, 0).next?.title, 'Legs')

  // Tokyo, well ahead of UTC, same story.
  const JST = -540
  assert.equal(classifyNew(SLOTS, Date.parse('2026-08-12T04:00:00.000Z'), JST).next?.title, 'Legs')
})

test('a genuine tomorrow still reads as tomorrow', () => {
  const restDay = [{ date: '2026-08-13T00:00:00.000Z', status: 'scheduled', title: 'Chest, Back' }]
  assert.equal(classifyNew(restDay, SESSION_AT, EDT).next?.inDays, 1)
})

test('day arithmetic does not drift across a DST boundary', () => {
  // Keys are plain dates, so the 23h/25h days never round a 1 into a 0 or 2.
  assert.equal(daysBetweenKeys('2026-11-01', '2026-11-02'), 1)
  assert.equal(daysBetweenKeys('2026-03-08', '2026-03-09'), 1)
})
