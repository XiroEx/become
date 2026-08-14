// Run with: npx tsx --test tests/unit/anchorOrdering.test.ts
//
// Ordering entries logged WITHOUT a time, stated by the product owner as:
//
//   "if I have lunch -> snack -> dinner as the order set, and lunch is 1-4pm and
//    dinner is 6pm-10pm, and I log dinner one day at 3pm, then log a snack with
//    no time, it should appear after that dinner. The 4pm and 6pm act as the true
//    anchors in that case. If the dinner I logged was 5pm, and I also log a snack
//    with no time later, it should appear before that dinner."
//
// Both readings come out of one rule: an unscheduled tag anchors to the END of
// the nearest scheduled tag above it in the member's order.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anchorMinutesForTag, orderIndexForTag, windowForTag } from '../../lib/nutrition/mealSchedule'
import { buildDayOccurrences } from '../../lib/nutrition/dayOrder'

const at = (h: number, m = 0) => h * 60 + m
const sched = (tag: string, s: number, e: number) => ({ tag, startMinutes: s, endMinutes: e })
const unsched = (tag: string) => ({ tag, startMinutes: null, endMinutes: null })

/** The member's exact configuration. */
const ORDER = [
  sched('lunch', at(13), at(16)),
  unsched('snack'),
  sched('dinner', at(18), at(22)),
]

const DAY = '2026-08-14'
const log = (id: string, hhmm: string | null, tag: string) => ({
  _id: id,
  loggedAt: hhmm ? new Date(`${DAY}T${hhmm}:00`) : new Date(`${DAY}T12:00:00`),
  tags: [tag],
  untimed: hhmm === null,
})
const shape = (occ: ReturnType<typeof buildDayOccurrences>) => occ.map(o => o.tag)

// ── The anchor itself ───────────────────────────────────────────────────────

test('an unscheduled tag anchors to the END of the scheduled tag above it', () => {
  assert.equal(anchorMinutesForTag(ORDER, 'snack'), at(16), 'the 4pm the member named')
})

test('a scheduled tag anchors to its own window start', () => {
  assert.equal(anchorMinutesForTag(ORDER, 'lunch'), at(13))
  assert.equal(anchorMinutesForTag(ORDER, 'dinner'), at(18))
})

test('with nothing scheduled above it, an unscheduled tag anchors to the one below', () => {
  const order = [unsched('before work'), sched('lunch', at(13), at(16))]
  assert.equal(anchorMinutesForTag(order, 'before work'), at(13))
})

test('a tag absent from the order falls back to the app-wide table', () => {
  assert.equal(anchorMinutesForTag(ORDER, 'breakfast'), at(8))
  assert.equal(anchorMinutesForTag(ORDER, 'invented tag'), at(12))
})

test('an order with no scheduled tags at all still resolves', () => {
  const order = [unsched('a'), unsched('snack'), unsched('b')]
  assert.equal(anchorMinutesForTag(order, 'snack'), at(15), 'app-wide snack time')
})

// ── The two cases the member described ──────────────────────────────────────

test('dinner eaten EARLY at 3pm: an untimed snack lands AFTER it', () => {
  const occ = buildDayOccurrences(
    [log('d', '15:00', 'dinner'), log('s', null, 'snack')],
    [], ORDER,
  )
  assert.deepEqual(shape(occ), ['dinner', 'snack'])
})

test('dinner eaten at 5pm: an untimed snack lands BEFORE it', () => {
  const occ = buildDayOccurrences(
    [log('d', '17:00', 'dinner'), log('s', null, 'snack')],
    [], ORDER,
  )
  assert.deepEqual(shape(occ), ['snack', 'dinner'])
})

test('the order the entries were CREATED in does not matter, only the anchors', () => {
  // Snack logged first, dinner second — same result as the reverse.
  const occ = buildDayOccurrences(
    [log('s', null, 'snack'), log('d', '15:00', 'dinner')],
    [], ORDER,
  )
  assert.deepEqual(shape(occ), ['dinner', 'snack'])
})

// ── Untimed entries among each other ────────────────────────────────────────

test('several untimed entries follow the member ORDER, not their tag names', () => {
  // Alphabetically this is dinner, lunch, snack. By the member's order it is
  // lunch, snack, dinner — which is the whole point of the ordering screen.
  const occ = buildDayOccurrences(
    [log('d', null, 'dinner'), log('s', null, 'snack'), log('l', null, 'lunch')],
    [], ORDER,
  )
  assert.deepEqual(shape(occ), ['lunch', 'snack', 'dinner'])
})

test('two unscheduled tags sharing an anchor keep the member order', () => {
  const order = [
    sched('lunch', at(13), at(16)),
    unsched('snack'),
    unsched('second snack'),
    sched('dinner', at(18), at(22)),
  ]
  assert.equal(anchorMinutesForTag(order, 'snack'), at(16))
  assert.equal(anchorMinutesForTag(order, 'second snack'), at(16), 'same anchor')
  const occ = buildDayOccurrences(
    [log('b', null, 'second snack'), log('a', null, 'snack')],
    [], order,
  )
  assert.deepEqual(shape(occ), ['snack', 'second snack'], 'index breaks the tie')
})

// ── Mixed with timed entries ────────────────────────────────────────────────

test('a full day mixes timed and untimed into one honest sequence', () => {
  const occ = buildDayOccurrences(
    [
      log('l', '13:30', 'lunch'),      // timed, 1:30pm
      log('s', null, 'snack'),          // untimed -> anchors 4pm
      log('d', '19:00', 'dinner'),      // timed, 7pm
    ],
    [], ORDER,
  )
  assert.deepEqual(shape(occ), ['lunch', 'snack', 'dinner'])
})

test('the late-night case: an untimed Bed entry still sorts last', () => {
  // The member is up past midnight and logs for the day just ended. With no time
  // the entry anchors to Bed's own window start rather than the current clock.
  const order = [
    sched('dinner', at(18), at(22)),
    sched('bed', at(23), at(2)),
  ]
  const occ = buildDayOccurrences(
    [log('bd', null, 'bed'), log('d', '19:00', 'dinner')],
    [], order,
  )
  assert.deepEqual(shape(occ), ['dinner', 'bed'])
})

test('logging at 1am WITH the clock is what used to sort wrong', () => {
  // Same two entries, but the Bed row timed at 01:00 instead of untimed: it
  // sorts to the top of the day. This is the behaviour untimed logging avoids,
  // pinned here so the contrast is deliberate rather than accidental.
  const order = [sched('dinner', at(18), at(22)), sched('bed', at(23), at(2))]
  const occ = buildDayOccurrences(
    [log('bd', '01:00', 'bed'), log('d', '19:00', 'dinner')],
    [], order,
  )
  assert.deepEqual(shape(occ), ['bed', 'dinner'])
})

// ── Support helpers ─────────────────────────────────────────────────────────

test('windowForTag ignores order-only rows', () => {
  assert.equal(windowForTag(ORDER, 'snack'), null, 'ordered but not scheduled')
  assert.equal(windowForTag(ORDER, 'lunch')?.startMinutes, at(13))
})

test('orderIndexForTag reports the member sequence', () => {
  assert.equal(orderIndexForTag(ORDER, 'lunch'), 0)
  assert.equal(orderIndexForTag(ORDER, 'snack'), 1)
  assert.equal(orderIndexForTag(ORDER, 'dinner'), 2)
  assert.equal(orderIndexForTag(ORDER, 'nope'), -1)
})
