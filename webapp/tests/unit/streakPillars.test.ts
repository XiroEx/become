// Run with: npx tsx --test tests/unit/streakPillars.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dayStreak, weekStreak, weekKeyOf, shiftDay, workoutOrRestDays, dayRange,
  intersectDays, streakDisplay, STREAK_VISIBLE_MIN, lostWeeks, withoutLostWeeks, onTrackDays,
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

// ── Super streak needs the workout week to be on track ──────────────────────

test('a past week that missed the target is lost; a week that hit it is not', () => {
  const trained = ['2026-08-03', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', // wk Aug 2 → 5 ✓
                   '2026-08-12', '2026-08-15']                                          // wk Aug 9 → 2 ✗
  const lost = lostWeeks(trained, 5, '2026-08-17', [1, 2, 3, 4, 6])
  assert.equal(lost.has('2026-08-02'), false)
  assert.equal(lost.has('2026-08-09'), true)
})

test('the current week is not lost while the remaining training days can still make it', () => {
  // Jon: Mon–Thu + Sat. Monday Aug 17 trained; Tue Wed Thu Sat left → 1 + 4 = 5 ≥ 5.
  const lost = lostWeeks(['2026-08-17'], 5, '2026-08-17', [1, 2, 3, 4, 6])
  assert.equal(lost.has('2026-08-16'), false)
})

test('the current week IS lost once the days left cannot cover the gap', () => {
  // Thursday Aug 20, nothing trained yet: Thu + Sat left = 2 < 5.
  const lost = lostWeeks([], 5, '2026-08-20', [1, 2, 3, 4, 6])
  assert.equal(lost.has('2026-08-16'), true)
})

test('today still counts as a chance if not yet trained; without a schedule every day is a chance', () => {
  assert.equal(lostWeeks([], 3, '2026-08-20', null).has('2026-08-16'), false, 'Thu Fri Sat = 3 chances')
  assert.equal(lostWeeks([], 4, '2026-08-20', null).has('2026-08-16'), true)
})

test('withoutLostWeeks strips every day of a lost week from the super candidates', () => {
  const lost = new Set(['2026-08-09'])
  const kept = withoutLostWeeks(['2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17'], lost)
  assert.deepEqual([...kept].sort(), ['2026-08-16', '2026-08-17'])
})

test('Jon last week: rest days do not rescue a super streak when the workout week was blown', () => {
  // Trained Wed 12 + Sat 15 (2/5). Rest Sun 16. Trained Mon 17. Nutrition + mindset every day.
  const trained = ['2026-08-12', '2026-08-15', '2026-08-17']
  const all = dayRange('2026-08-09', '2026-08-17')
  const lost = lostWeeks(trained, 5, '2026-08-17', [1, 2, 3, 4, 6])
  const workoutHalf = withoutLostWeeks(workoutOrRestDays(trained, all, [1, 2, 3, 4, 6]), lost)
  const s = dayStreak(intersectDays(new Set(all), new Set(all), workoutHalf), '2026-08-17')
  assert.equal(s.current, 2, 'only Sun 16 + Mon 17 (this week, still on track) count')
})

// ── Workout streak counts DAYS your week stayed on track ────────────────────
//
// "I'd need to train daily to keep it alive?" — no. That was the whole reason
// this stopped being a week counter.

test('rest days keep the workout streak alive while the week is on track', () => {
  // Target 4, no schedule. Trained Mon+Tue of this week (Sun Aug 16 start),
  // today is Tue Aug 18 — 2 done, Wed–Sat left, so the week is fine.
  const trained = ['2026-08-17', '2026-08-18']
  const lost = lostWeeks(trained, 4, '2026-08-18', null)
  const s = dayStreak(onTrackDays(dayRange('2026-08-16', '2026-08-18'), lost), '2026-08-18')
  assert.equal(s.current, 3, 'Sun (rest) + Mon + Tue all count')
})

test("George's week: a week that hit the target carries every one of its days", () => {
  // Week of Aug 9: 7 credited/trained days (≥ 4) ✓. Week of Aug 16: 2 so far,
  // still reachable. Week of Aug 2: nothing → lost, and that is where it stops.
  const trained = ['2026-08-09','2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16','2026-08-17']
  const lost = lostWeeks(trained, 4, '2026-08-18', null)
  const s = dayStreak(onTrackDays(dayRange('2026-07-01', '2026-08-18'), lost), '2026-08-18')
  assert.equal(s.current, 10, 'Aug 9 → Aug 18')
  assert.equal(lost.has('2026-08-02'), true)
})

test('missing the weekly target is what breaks it, and only once the week is unreachable', () => {
  // Target 4, no schedule, nothing trained. Sat Aug 22: 1 day left → lost.
  const lost = lostWeeks([], 4, '2026-08-22', null)
  const s = dayStreak(onTrackDays(dayRange('2026-08-16', '2026-08-22'), lost), '2026-08-22')
  assert.equal(s.current, 0)
})

test('a fresh week always starts on track — you have not failed yet', () => {
  const lost = lostWeeks([], 5, '2026-08-16', [1, 2, 3, 4, 6])
  assert.equal(lost.has('2026-08-16'), false)
  assert.equal(onTrackDays(['2026-08-16'], lost).has('2026-08-16'), true)
})
