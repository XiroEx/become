// Run with: npm run test:file tests/unit/slotDateKey.test.ts
//
// Pinned to the real 2026-08-12 miss: the dashboard said "Today: Day 3 · Legs"
// and the 7:17am push said "Day 4 · Chest, Back". Same schedule, two different
// readings of the same stored date.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotDateKey, localDateKeyForUser } from '../../lib/notifications/cronNotify'

/** How the dashboard reads a slot (components/NextWorkoutCard.tsx). */
const dashboardKey = (d: Date | string) =>
  typeof d === 'string' ? d.split('T')[0] : new Date(d).toISOString().split('T')[0]

// The member's real schedule that morning. Slot dates are day MARKERS stored at
// UTC midnight.
const SLOTS = [
  { date: '2026-08-10T00:00:00.000Z', day: 'Day 1', title: 'Chest, Shoulders, Biceps' },
  { date: '2026-08-11T00:00:00.000Z', day: 'Day 2', title: 'Rear Delts, Back, Triceps' },
  { date: '2026-08-12T00:00:00.000Z', day: 'Day 3', title: 'Legs' },
  { date: '2026-08-13T00:00:00.000Z', day: 'Day 4', title: 'Chest, Back' },
]

const EDT = 240 // getTimezoneOffset() for UTC-4

test('the notification and the dashboard now agree on which day a slot is', () => {
  for (const s of SLOTS) {
    assert.equal(slotDateKey(new Date(s.date)), dashboardKey(s.date), `slot ${s.day}`)
  }
})

test('the old reading shifted every slot a day earlier west of UTC', () => {
  // This is the bug, kept as a test so nobody "simplifies" slotDateKey back into
  // localDateKeyForUser. Aug 13 00:00Z minus 4h is Aug 12 20:00 local.
  assert.equal(localDateKeyForUser(new Date('2026-08-13T00:00:00.000Z'), EDT), '2026-08-12')
  assert.equal(slotDateKey(new Date('2026-08-13T00:00:00.000Z')), '2026-08-13')
})

test('today resolves to Legs, not to tomorrow\'s Chest, Back', () => {
  const today = '2026-08-12'
  const todays = SLOTS.filter(s => slotDateKey(s.date) === today)
  assert.equal(todays.length, 1)
  assert.equal(todays[0].title, 'Legs')

  // Under the old reading it picked the wrong one — the exact push that went out.
  const oldTodays = SLOTS.filter(s => localDateKeyForUser(new Date(s.date), EDT) === today)
  assert.equal(oldTodays[0].title, 'Chest, Back')
})

test('a rest day stays quiet', () => {
  // Aug 14 has no slot. The old reading borrowed Aug 15's marker and fired
  // anyway, which is why reminders showed up on days off.
  const restDay = '2026-08-14'
  const slots = [...SLOTS, { date: '2026-08-15T00:00:00.000Z', day: 'Day 5', title: 'Shoulders' }]
  assert.equal(slots.filter(s => slotDateKey(s.date) === restDay).length, 0)
  assert.equal(slots.filter(s => localDateKeyForUser(new Date(s.date), EDT) === restDay).length, 1)
})

test('east of UTC was never affected, which is why this hid for so long', () => {
  const CET = -60 // UTC+1
  assert.equal(localDateKeyForUser(new Date('2026-08-13T00:00:00.000Z'), CET), '2026-08-13')
  assert.equal(slotDateKey(new Date('2026-08-13T00:00:00.000Z')), '2026-08-13')
})

test('real timestamps still go through the offset, unchanged', () => {
  // localDateKeyForUser is correct for instants — a push sent 2026-08-12 01:30Z
  // belongs to Aug 11 for a member in EDT. Only day MARKERS were wrong.
  assert.equal(localDateKeyForUser(new Date('2026-08-12T01:30:00.000Z'), EDT), '2026-08-11')
})

test('string and Date markers read identically', () => {
  // Slots arrive as Date from Mongoose and as string from JSON.
  assert.equal(slotDateKey('2026-08-13T00:00:00.000Z'), '2026-08-13')
  assert.equal(slotDateKey(new Date('2026-08-13T00:00:00.000Z')), '2026-08-13')
})
