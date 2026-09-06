// Run with: npm run test:file tests/unit/weekTraining.test.ts
//
// The "this week" half of the Training screen. The rules that matter are the
// ones that decide whether a number is honest: only completed sets count, only
// sessions inside the window count, and load moved is weight × reps rather than
// a sum of weights (which would say a set of 10 and a set of 1 were equal work).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  computeWeekTraining,
  emptyWeekTraining,
  formatVolume,
  formatWorkTime,
  type WeekWorkoutLog,
} from '../../lib/becoming/weekTraining'

/** Logs are dated UTC noon and keyed by UTC date, so the window is unambiguous. */
const keyOf = (d: Date) => d.toISOString().slice(0, 10)
const on = (day: string) => `${day}T12:00:00Z`

function log(day: string, exercises: WeekWorkoutLog['exercises'], completed = true): WeekWorkoutLog {
  return { date: on(day), completed, exercises }
}
const set = (weight: number | null, reps: number | null, completed = true) => ({ weight, reps, completed })

const WEEK_FROM = '2026-08-16'
const WEEK_TO = '2026-08-22'

test('an empty week is all zeros, not nulls', () => {
  const r = computeWeekTraining([], WEEK_FROM, WEEK_TO, keyOf)
  assert.deepEqual(r, emptyWeekTraining())
  assert.equal(r.sessions, 0)
  assert.equal(r.hasWeightedWork, false)
})

test('load moved is weight × reps, summed across completed sets', () => {
  const r = computeWeekTraining(
    [log('2026-08-17', [{ name: 'Barbell Curl', exerciseSlug: 'barbell-curl', sets: [set(80, 10), set(80, 10), set(100, 10)] }])],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.volume, 80 * 10 + 80 * 10 + 100 * 10)
  assert.equal(r.sets, 3)
  assert.equal(r.reps, 30)
  assert.equal(r.sessions, 1)
  assert.equal(r.exercises, 1)
  assert.equal(r.hasWeightedWork, true)
})

test('the best set of the week is the highest estimated max, not the heaviest', () => {
  // 100 × 10 (e1RM 133) beats 120 × 1 (e1RM 124) even though 120 is heavier.
  const r = computeWeekTraining(
    [log('2026-08-17', [
      { name: 'Barbell Curl', exerciseSlug: 'barbell-curl', sets: [set(100, 10)] },
      { name: 'Heavy Single', exerciseSlug: 'heavy-single', sets: [set(120, 1)] },
    ])],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.topSet?.name, 'Barbell Curl')
  assert.equal(r.topSet?.e1RM, 133)
})

test('incomplete sets are not work', () => {
  const r = computeWeekTraining(
    [log('2026-08-17', [{ name: 'Bench', exerciseSlug: 'bench', sets: [set(100, 5), set(100, 5, false)] }])],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.sets, 1)
  assert.equal(r.volume, 500)
})

test('an incomplete session contributes nothing, not even its finished sets', () => {
  const r = computeWeekTraining(
    [log('2026-08-17', [{ name: 'Bench', exerciseSlug: 'bench', sets: [set(100, 5)] }], false)],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.sessions, 0)
  assert.equal(r.volume, 0)
})

test('sessions outside the window are excluded on both edges', () => {
  const r = computeWeekTraining(
    [
      log('2026-08-15', [{ name: 'Bench', exerciseSlug: 'bench', sets: [set(100, 5)] }]), // day before
      log('2026-08-16', [{ name: 'Bench', exerciseSlug: 'bench', sets: [set(100, 5)] }]), // first day, in
      log('2026-08-22', [{ name: 'Bench', exerciseSlug: 'bench', sets: [set(100, 5)] }]), // last day, in
      log('2026-08-23', [{ name: 'Bench', exerciseSlug: 'bench', sets: [set(100, 5)] }]), // day after
    ],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.sessions, 2, 'window is inclusive of both ends and nothing beyond')
})

test('bodyweight work counts as sets and reps without inflating load moved', () => {
  const r = computeWeekTraining(
    [log('2026-08-17', [{ name: 'Push-up', exerciseSlug: 'push-up', sets: [set(null, 20), set(null, 20)] }])],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.sets, 2)
  assert.equal(r.reps, 40)
  assert.equal(r.volume, 0)
  assert.equal(r.hasWeightedWork, false, 'so the UI shows time or reps instead of a meaningless 0 lbs')
  assert.equal(r.topSet, null)
})

test('time-only work is captured in seconds rather than being dropped', () => {
  const r = computeWeekTraining(
    [log('2026-08-17', [{ name: 'Plank', exerciseSlug: 'plank', sets: [{ duration: 60, completed: true }, { duration: 45, completed: true }] }])],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.sets, 2)
  assert.equal(r.workSeconds, 105)
  assert.equal(r.reps, 0)
})

test('a completed set with nothing recorded on it is ignored', () => {
  const r = computeWeekTraining(
    [log('2026-08-17', [{ name: 'Ghost', exerciseSlug: 'ghost', sets: [{ completed: true }] }])],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.sets, 0)
  assert.equal(r.exercises, 0)
})

test('the same exercise across two sessions counts once in the exercise tally', () => {
  const r = computeWeekTraining(
    [
      log('2026-08-17', [{ name: 'Bench', exerciseSlug: 'bench', sets: [set(100, 5)] }]),
      log('2026-08-19', [{ name: 'Bench', exerciseSlug: 'bench', sets: [set(105, 5)] }]),
    ],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.sessions, 2)
  assert.equal(r.exercises, 1)
})

test('an unparseable date does not throw or count', () => {
  const r = computeWeekTraining(
    [{ date: 'not-a-date', completed: true, exercises: [{ name: 'X', sets: [set(100, 5)] }] }],
    WEEK_FROM, WEEK_TO, keyOf,
  )
  assert.equal(r.sessions, 0)
})

// ── formatting ──────────────────────────────────────────────────────────────

test('volume compacts once it hits four figures', () => {
  assert.equal(formatVolume(0, 'lbs'), '0 lbs')
  assert.equal(formatVolume(940, 'lbs'), '940 lbs')
  assert.equal(formatVolume(2600, 'lbs'), '2.6k lbs')
  assert.equal(formatVolume(28480, 'lbs'), '28.5k lbs')
  assert.equal(formatVolume(140000, 'kg'), '140k kg')
})

test('work time reads as a duration, not a second count', () => {
  assert.equal(formatWorkTime(0), '0m')
  assert.equal(formatWorkTime(105), '2m')
  assert.equal(formatWorkTime(3600), '1h')
  assert.equal(formatWorkTime(4500), '1h 15m')
})
