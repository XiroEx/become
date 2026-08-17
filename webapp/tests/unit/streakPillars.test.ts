// Run with: npx tsx --test tests/unit/streakPillars.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dayStreak, weekStreak, weekKeyOf, shiftDay, workoutOrRestDays, dayRange,
  intersectDays, streakDisplay, STREAK_VISIBLE_MIN,
} from '../../lib/streaks/pillars'

test('day streak counts back from today when today is active', () => {
  const s = dayStreak(['2026-08-15', '2026-08-16', '2026-08-17'], '2026-08-17')
  assert.deepEqual(s, { current: 3, best: 3, activeToday: true })
})

test('a streak is still alive if only yesterday is done', () => {
  const s = dayStreak(['2026-08-14', '2026-08-15', '2026-08-16'], '2026-08-17')
  assert.equal(s.current, 3)
  assert.equal(s.activeToday, false)
})

test('a missed day breaks it, and best remembers the old run', () => {
  const s = dayStreak(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-16'], '2026-08-17')
  assert.equal(s.current, 1, 'yesterday only')
  assert.equal(s.best, 4)
})

test('two days off means no current streak', () => {
  const s = dayStreak(['2026-08-14'], '2026-08-17')
  assert.equal(s.current, 0)
})

test('duplicate day keys and junk are harmless', () => {
  const s = dayStreak(['2026-08-17', '2026-08-17', 'nope', '2026-08-16'], '2026-08-17')
  assert.equal(s.current, 2)
})

test('week key is that week\'s Sunday', () => {
  assert.equal(weekKeyOf('2026-08-17'), '2026-08-16') // Mon → Sun
  assert.equal(weekKeyOf('2026-08-16'), '2026-08-16')
  assert.equal(weekKeyOf('2026-08-22'), '2026-08-16') // Sat
  assert.equal(shiftDay('2026-08-16', -7), '2026-08-09')
})

test('week streak: weeks hitting the target, this week only counts once met', () => {
  // Target 3. Two full weeks met, this week 1 so far (still in play).
  const days = [
    '2026-08-03', '2026-08-05', '2026-08-07',   // week of Aug 2  → 3 ✓
    '2026-08-10', '2026-08-12', '2026-08-14',   // week of Aug 9  → 3 ✓
    '2026-08-17',                               // week of Aug 16 → 1 (in play)
  ]
  const s = weekStreak(days, 3, '2026-08-17')
  assert.equal(s.current, 2)
  assert.equal(s.metThisWeek, false)
  assert.equal(s.thisWeekCount, 1)
  assert.equal(s.target, 3)
})

test('week streak: this week counts as soon as it is met', () => {
  const days = ['2026-08-10', '2026-08-12', '2026-08-14', '2026-08-16', '2026-08-17', '2026-08-18']
  const s = weekStreak(days, 3, '2026-08-18')
  assert.equal(s.current, 2)
  assert.equal(s.metThisWeek, true)
})

test('week streak: an unmet week in the past breaks the run; best is kept', () => {
  const days = [
    '2026-07-20', '2026-07-22', '2026-07-24', // wk Jul 19 ✓
    '2026-07-27', '2026-07-29', '2026-07-31', // wk Jul 26 ✓
    '2026-08-05',                             // wk Aug 2 ✗
    '2026-08-10', '2026-08-12', '2026-08-14', // wk Aug 9 ✓
  ]
  const s = weekStreak(days, 3, '2026-08-17')
  assert.equal(s.current, 1)
  assert.equal(s.best, 2)
})

test('Jon this week: 1 of 5 → current 0, nothing hidden or invented', () => {
  const s = weekStreak(['2026-08-12', '2026-08-17'], 5, '2026-08-17')
  assert.equal(s.current, 0)
  assert.equal(s.thisWeekCount, 1)
})

test('rest days on the schedule count for the workout half of super', () => {
  // Training Mon/Tue/Fri (1,2,5). Aug 15 Sat + Aug 16 Sun rest, Aug 17 Mon
  // trained, Aug 18 Tue is a training day nobody trained on.
  const all = dayRange('2026-08-15', '2026-08-18')
  const ok = workoutOrRestDays(['2026-08-17'], all, [1, 2, 5])
  assert.deepEqual([...ok].sort(), ['2026-08-15', '2026-08-16', '2026-08-17'], 'Sat+Sun rest, Mon trained, Tue (training day) not done')
})

test('no schedule → only trained days count', () => {
  const ok = workoutOrRestDays(['2026-08-17'], dayRange('2026-08-15', '2026-08-18'), null)
  assert.deepEqual([...ok], ['2026-08-17'])
})

test('super streak = intersection of pillars', () => {
  const nutrition = new Set(['2026-08-15', '2026-08-16', '2026-08-17'])
  const mind = new Set(['2026-08-16', '2026-08-17'])
  const move = new Set(['2026-08-15', '2026-08-16', '2026-08-17'])
  const s = dayStreak(intersectDays(nutrition, mind, move), '2026-08-17')
  assert.equal(s.current, 2)
})

test(`nothing shows until ${STREAK_VISIBLE_MIN} days`, () => {
  assert.deepEqual(streakDisplay(0), { visible: false, remaining: 3 })
  assert.deepEqual(streakDisplay(2), { visible: false, remaining: 1 })
  assert.deepEqual(streakDisplay(3), { visible: true, remaining: 0 })
  assert.deepEqual(streakDisplay(18), { visible: true, remaining: 0 })
})
