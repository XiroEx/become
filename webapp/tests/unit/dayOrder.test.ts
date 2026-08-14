// Run with: npx tsx --test tests/unit/dayOrder.test.ts
//
// The product owner stated the requirement as: "If I eat breakfast, then a
// snack, then lunch, then another snack, there should be 2 snack items on the
// main view, not 1 snack item with both snacks on it out of order."
//
// And the bug that started it: "I just planned my protein shake for later
// tonight under the tag 'Bed'. It appears ABOVE the 'Before Work' tagged Bone
// Broth that I already logged."

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDayOccurrences, unusedTags } from '../../lib/nutrition/dayOrder'

const DAY = '2026-08-13'
/** A log at a local wall-clock time on the fixture day. */
const log = (id: string, hhmm: string, ...tags: string[]) => ({
  _id: id,
  loggedAt: new Date(`${DAY}T${hhmm}:00`),
  tags,
})
const plan = (id: string, tag: string, status = 'active') => ({ _id: id, tag, status })
const win = (tag: string, s: number, e: number) => ({ tag, startMinutes: s, endMinutes: e })
const at = (h: number, m = 0) => h * 60 + m

const shape = (occ: ReturnType<typeof buildDayOccurrences>) =>
  occ.map(o => `${o.tag}${o.planned ? '(planned)' : ''}:${o.logs.map(l => l._id).join('+') || o.plans.map(p => p._id).join('+')}`)

// ── The headline requirement ────────────────────────────────────────────────

test('breakfast, snack, lunch, snack renders as FOUR sections with two separate snacks', () => {
  const logs = [
    log('b', '08:00', 'breakfast'),
    log('s1', '10:00', 'snack'),
    log('l', '12:00', 'lunch'),
    log('s2', '15:00', 'snack'),
  ]
  const occ = buildDayOccurrences(logs, [])
  assert.deepEqual(shape(occ), ['breakfast:b', 'snack:s1', 'lunch:l', 'snack:s2'])
  assert.equal(occ.length, 4, 'the two snacks are separate sittings, not one pooled section')
})

test('the old behaviour is genuinely gone: the two snacks are not merged', () => {
  const logs = [log('s1', '10:00', 'snack'), log('l', '12:00', 'lunch'), log('s2', '15:00', 'snack')]
  const occ = buildDayOccurrences(logs, [])
  const snackSections = occ.filter(o => o.tag === 'snack')
  assert.equal(snackSections.length, 2)
  assert.deepEqual(snackSections.map(s => s.logs.length), [1, 1])
})

test('two foods in the same sitting stay in ONE section', () => {
  const logs = [log('a', '08:00', 'breakfast'), log('b', '08:05', 'breakfast')]
  const occ = buildDayOccurrences(logs, [])
  assert.equal(occ.length, 1)
  assert.deepEqual(occ[0].logs.map(l => l._id), ['a', 'b'])
})

test('same tag far apart with NOTHING between stays one occurrence', () => {
  // Deliberate: no gap threshold. Nothing happened between them, so there is no
  // ordering information to preserve and no arbitrary constant to explain.
  const logs = [log('s1', '10:00', 'snack'), log('s2', '15:00', 'snack')]
  const occ = buildDayOccurrences(logs, [])
  assert.equal(occ.length, 1)
  assert.deepEqual(occ[0].logs.map(l => l._id), ['s1', 's2'])
})

test('occurrences sort by real time even when logs arrive out of order', () => {
  const logs = [log('late', '20:00', 'dinner'), log('early', '07:00', 'breakfast')]
  const occ = buildDayOccurrences(logs, [])
  assert.deepEqual(shape(occ), ['breakfast:early', 'dinner:late'])
})

// ── The reported bug ────────────────────────────────────────────────────────

test('a planned Bed meal sorts BELOW a Before Work meal already logged at 8pm', () => {
  // Alphabetically "bed" < "before work", which is exactly how it used to sort.
  const logs = [log('broth', '20:00', 'before work')]
  const plans = [plan('shake', 'bed')]
  const windows = [win('bed', at(23), at(2))]
  const occ = buildDayOccurrences(logs, plans, windows)
  assert.deepEqual(shape(occ), ['before work:broth', 'bed(planned):shake'])
})

test('the fix does not depend on Before Work having a window of its own', () => {
  // The member said they work different hours, so that tag is unscheduled. A
  // logged occurrence uses its real time and ignores the schedule entirely.
  const occ = buildDayOccurrences([log('broth', '20:00', 'before work')], [plan('shake', 'bed')], [win('bed', at(23), at(2))])
  assert.equal(occ[0].tag, 'before work')
  assert.equal(occ[0].sortMinutes, at(20))
})

test('with no window configured, a planned tag falls back to the app-wide table', () => {
  const occ = buildDayOccurrences([], [plan('p1', 'breakfast'), plan('p2', 'dinner')], [])
  assert.deepEqual(occ.map(o => o.tag), ['breakfast', 'dinner'])
  assert.equal(occ[0].sortMinutes, at(8))
  assert.equal(occ[1].sortMinutes, at(18, 30))
})

// ── Plans ───────────────────────────────────────────────────────────────────

test('non-active plans are dropped', () => {
  const occ = buildDayOccurrences([], [plan('done', 'dinner', 'promoted'), plan('live', 'lunch')], [])
  assert.deepEqual(shape(occ), ['lunch(planned):live'])
})

test('each active plan is its own section', () => {
  const occ = buildDayOccurrences([], [plan('p1', 'snack'), plan('p2', 'snack')], [])
  assert.equal(occ.length, 2)
})

test('a logged occurrence outranks a plan at the same minute', () => {
  const logs = [log('eaten', '08:00', 'breakfast')]
  const plans = [plan('pencilled', 'breakfast')]
  const occ = buildDayOccurrences(logs, plans, [win('breakfast', at(8), at(9))])
  assert.equal(occ[0].planned, false, 'what actually happened comes first')
  assert.equal(occ[1].planned, true)
})

test('plans can be excluded entirely (past days render logs only)', () => {
  const occ = buildDayOccurrences([log('a', '08:00', 'breakfast')], [plan('p', 'dinner')], [], { includePlans: false })
  assert.deepEqual(shape(occ), ['breakfast:a'])
})

// ── Edge cases ──────────────────────────────────────────────────────────────

test('an untagged log still appears, as a snack', () => {
  const occ = buildDayOccurrences([{ _id: 'x', loggedAt: new Date(`${DAY}T09:00:00`), tags: [] }], [])
  assert.deepEqual(shape(occ), ['snack:x'])
})

test('a multi-tag log appears under each of its tags', () => {
  const occ = buildDayOccurrences([log('m', '12:00', 'lunch', 'post-workout')], [])
  assert.equal(occ.length, 2)
  assert.deepEqual(occ.map(o => o.tag).sort(), ['lunch', 'post-workout'])
  for (const o of occ) assert.deepEqual(o.logs.map(l => l._id), ['m'], 'the same log, listed under both')
})

test('tags are matched case-insensitively so "Snack" and "snack" are one sitting', () => {
  const occ = buildDayOccurrences([log('a', '10:00', 'Snack'), log('b', '10:05', 'snack')], [])
  assert.equal(occ.length, 1)
})

test('occurrence keys are unique, so two snack sections do not collide as React keys', () => {
  const logs = [log('s1', '10:00', 'snack'), log('l', '12:00', 'lunch'), log('s2', '15:00', 'snack')]
  const keys = buildDayOccurrences(logs, []).map(o => o.key)
  assert.equal(new Set(keys).size, keys.length)
})

test('an empty day produces nothing', () => {
  assert.deepEqual(buildDayOccurrences([], []), [])
})

test('unusedTags offers the default tags not yet used today', () => {
  const occ = buildDayOccurrences([log('b', '08:00', 'breakfast')], [])
  assert.deepEqual(unusedTags(occ, ['breakfast', 'lunch', 'dinner', 'snack']), ['lunch', 'dinner', 'snack'])
})
