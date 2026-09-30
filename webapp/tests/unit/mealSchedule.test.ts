// Run with: npm run test:file tests/unit/mealSchedule.test.ts
//
// Windows are minutes from local midnight, and a window whose end is <= its
// start WRAPS past midnight. Every bug this file guards against is some form of
// forgetting that second half.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHHMM,
  formatHHMM,
  formatClockLabel,
  windowContains,
  windowLength,
  windowForTag,
  tagForMinutes,
  fallbackTagForMinutes,
  defaultTagAt,
  sortMinutesForTag,
  isOutsideWindow,
  suggestedWindowForTag,
} from '../../lib/nutrition/mealSchedule'

const at = (h: number, m = 0) => h * 60 + m
const win = (tag: string, s: number, e: number) => ({ tag, startMinutes: s, endMinutes: e })

// ── Parsing / formatting ────────────────────────────────────────────────────

test('parseHHMM accepts valid times and rejects nonsense', () => {
  assert.equal(parseHHMM('00:00'), 0)
  assert.equal(parseHHMM('8:30'), 510)
  assert.equal(parseHHMM('23:59'), 1439)
  assert.equal(parseHHMM(' 07:05 '), 425)
  assert.equal(parseHHMM('24:00'), null)
  assert.equal(parseHHMM('12:60'), null)
  assert.equal(parseHHMM('noon'), null)
  assert.equal(parseHHMM(''), null)
})

test('formatHHMM round-trips and wraps defensively', () => {
  assert.equal(formatHHMM(0), '00:00')
  assert.equal(formatHHMM(510), '08:30')
  assert.equal(formatHHMM(1439), '23:59')
  assert.equal(formatHHMM(1440), '00:00')
  assert.equal(formatHHMM(-60), '23:00')
})

test('formatClockLabel reads like a clock, including the noon/midnight edges', () => {
  assert.equal(formatClockLabel(0), '12:00 am')
  assert.equal(formatClockLabel(at(12)), '12:00 pm')
  assert.equal(formatClockLabel(at(23, 5)), '11:05 pm')
  assert.equal(formatClockLabel(at(8, 30)), '8:30 am')
})

// ── The wrap case ───────────────────────────────────────────────────────────

test('a normal window contains its own range, start-inclusive and end-exclusive', () => {
  const lunch = win('lunch', at(11), at(14))
  assert.equal(windowContains(lunch, at(11)), true)
  assert.equal(windowContains(lunch, at(13, 59)), true)
  assert.equal(windowContains(lunch, at(14)), false, 'end is exclusive')
  assert.equal(windowContains(lunch, at(10, 59)), false)
})

test('a window that wraps midnight contains BOTH halves', () => {
  // George's case: Bed 11pm - 2am.
  const bed = win('bed', at(23), at(2))
  assert.equal(windowContains(bed, at(23)), true)
  assert.equal(windowContains(bed, at(23, 30)), true)
  assert.equal(windowContains(bed, at(0, 30)), true, 'after midnight is still Bed')
  assert.equal(windowContains(bed, at(1, 59)), true)
  assert.equal(windowContains(bed, at(2)), false)
  assert.equal(windowContains(bed, at(12)), false)
})

test('windowLength is positive across midnight', () => {
  assert.equal(windowLength(win('lunch', at(11), at(14))), 180)
  assert.equal(windowLength(win('bed', at(23), at(2))), 180)
})

// ── Choosing a tag ──────────────────────────────────────────────────────────

test('tagForMinutes returns null when the member scheduled nothing covering it', () => {
  const windows = [win('breakfast', at(6), at(9))]
  assert.equal(tagForMinutes(windows, at(15)), null)
  assert.equal(tagForMinutes([], at(15)), null)
})

test('when windows overlap the NARROWEST wins, because it is the more deliberate one', () => {
  const windows = [
    win('lunch', at(11), at(14)),          // 180 min
    win('post-workout', at(12), at(12, 30)), // 30 min
  ]
  assert.equal(tagForMinutes(windows, at(12, 15)), 'post-workout')
  assert.equal(tagForMinutes(windows, at(13)), 'lunch', 'outside the narrow one, the wide one still applies')
})

test('a wrapping window is selectable after midnight', () => {
  const windows = [win('bed', at(23), at(2))]
  assert.equal(tagForMinutes(windows, at(0, 30)), 'bed')
})

test('fallbackTagForMinutes reproduces the old hardcoded table exactly', () => {
  // This is the behaviour a member who never opens the schedule screen keeps.
  assert.equal(fallbackTagForMinutes(at(7)), 'breakfast')
  assert.equal(fallbackTagForMinutes(at(12)), 'lunch')
  assert.equal(fallbackTagForMinutes(at(18)), 'dinner')
  assert.equal(fallbackTagForMinutes(at(15)), 'snack', 'the 14-17 gap fell to snack')
  assert.equal(fallbackTagForMinutes(at(23)), 'snack')
  assert.equal(fallbackTagForMinutes(at(3)), 'snack')
})

test('defaultTagAt prefers the member schedule and falls back to the old table', () => {
  const windows = [win('bed', at(23), at(2))]
  assert.equal(defaultTagAt(windows, at(23, 30)), 'bed', 'their schedule wins')
  assert.equal(defaultTagAt(windows, at(12)), 'lunch', 'uncovered time falls back')
  assert.equal(defaultTagAt([], at(12)), 'lunch')
})

// ── Ordering support ────────────────────────────────────────────────────────

test('sortMinutesForTag prefers the member window, then the app table, then midday', () => {
  const windows = [win('bed', at(23), at(2))]
  assert.equal(sortMinutesForTag(windows, 'bed'), at(23))
  assert.equal(sortMinutesForTag(windows, 'breakfast'), at(8), 'app-wide table')
  assert.equal(sortMinutesForTag(windows, 'before work'), at(12), 'unknown tag sorts at midday')
})

test('windowForTag is case-insensitive', () => {
  const windows = [win('bed', at(23), at(2))]
  assert.equal(windowForTag(windows, 'BED')?.startMinutes, at(23))
  assert.equal(windowForTag(windows, 'lunch'), null)
})

// ── The "outside its usual time" hint ───────────────────────────────────────

test('an UNSCHEDULED tag is never flagged as outside its window', () => {
  // The member deliberately left "Before Work" unscheduled because their shift
  // moves. Nagging them would defeat the point of allowing that.
  assert.equal(isOutsideWindow([], 'before work', at(20)), false)
  assert.equal(isOutsideWindow([win('bed', at(23), at(2))], 'before work', at(20)), false)
})

test('a scheduled tag logged outside its window IS flagged', () => {
  const windows = [win('bed', at(23), at(2))]
  assert.equal(isOutsideWindow(windows, 'bed', at(20)), true, 'bed at 8pm is unusual')
  assert.equal(isOutsideWindow(windows, 'bed', at(23, 30)), false)
  assert.equal(isOutsideWindow(windows, 'bed', at(1)), false, 'after midnight is inside')
})

test('suggestedWindowForTag offers a starting range only for tags the app knows', () => {
  const s = suggestedWindowForTag('breakfast')
  assert.equal(s?.startMinutes, at(8))
  assert.equal(s?.endMinutes, at(10))
  assert.equal(suggestedWindowForTag('before work'), null)
})

test('a suggested window near midnight wraps rather than overflowing', () => {
  const s = suggestedWindowForTag('late-night') // 22:00 + 2h
  assert.equal(s?.startMinutes, at(22))
  assert.equal(s?.endMinutes, at(0), 'midnight, not 1440')
})
