// Run with: npm run test:file tests/unit/trackColumns.test.ts
//
// The card: "The boxes for cardio exercises are taking too much room. The
// boxes are supposed to be on one line but they are on two lines for no
// reason. Fix by making the 'time' box smaller. If that is the only metric
// being tracked, of course leave it as is."
//
// The Track view's set grid is `grid-cols-12`. A time+distance exercise asked
// for set(2) + time(6) + distance(2) + speed(2) + done(2) = 16 columns, and
// CSS grid does not clamp an overflow — it wraps it onto a second implicit
// row, so one set of a treadmill took two lines on a phone.
//
// So the rule the layout has to obey is arithmetic, and that is what this
// pins: every tracking type's boxes sum to exactly 12.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { TRACKING_TYPES, type TrackingType } from '@/lib/workout/tracking'
import { trackColumnSpans, colSpan, TRACK_GRID_COLUMNS } from '@/lib/workout/trackColumns'

const sum = (t: TrackingType | string) => {
  const c = trackColumnSpans(t)
  return c.set + c.weight + c.main + c.distance + c.speed + c.done
}

test('every tracking type fits on ONE row of the 12-column grid', () => {
  for (const t of TRACKING_TYPES) {
    assert.equal(
      sum(t),
      TRACK_GRID_COLUMNS,
      `${t} asks for ${sum(t)} of ${TRACK_GRID_COLUMNS} columns — anything over wraps onto a second line`,
    )
  }
})

test('cardio is the case that used to overflow, and no longer does', () => {
  // 2 + 6 + 2 + 2 + 2 = 16 was the bug.
  const c = trackColumnSpans('time_distance')
  assert.deepEqual(c, { set: 2, weight: 0, main: 4, distance: 2, speed: 2, done: 2 })
  assert.equal(sum('time_distance'), 12)
})

test('the time box is the one that gives ground — it is smaller only when it has to share', () => {
  const alone = trackColumnSpans('time')
  const withDistanceAndSpeed = trackColumnSpans('time_distance')

  // "If that is the only metric being tracked, of course leave it as is."
  assert.equal(alone.main, 6)
  assert.equal(alone.distance, 0)
  assert.equal(alone.speed, 0)

  assert.ok(
    withDistanceAndSpeed.main < alone.main,
    'the time box must shrink when distance and speed also need room',
  )
})

test('an unknown/legacy tracking type still fits (it normalizes to reps_weight)', () => {
  assert.equal(sum('reps'), TRACK_GRID_COLUMNS)
  assert.equal(sum('nonsense'), TRACK_GRID_COLUMNS)
  assert.equal(sum(''), TRACK_GRID_COLUMNS)
  assert.deepEqual(trackColumnSpans('cardio'), trackColumnSpans('time'))
})

test('the types that already fitted are untouched by the fix', () => {
  assert.deepEqual(trackColumnSpans('reps_weight'), { set: 2, weight: 3, main: 3, distance: 0, speed: 0, done: 4 })
  assert.deepEqual(trackColumnSpans('reps_only'), { set: 2, weight: 0, main: 6, distance: 0, speed: 0, done: 4 })
  assert.deepEqual(trackColumnSpans('reps_bodyweight'), { set: 2, weight: 0, main: 6, distance: 0, speed: 0, done: 4 })
  assert.deepEqual(trackColumnSpans('time'), { set: 2, weight: 0, main: 6, distance: 0, speed: 0, done: 4 })
  assert.deepEqual(trackColumnSpans('intervals'), { set: 2, weight: 0, main: 6, distance: 0, speed: 2, done: 2 })
})

test('nothing to type means nothing to type — only the set number and the tick', () => {
  const c = trackColumnSpans('none')
  assert.equal(c.main, 0)
  assert.equal(c.weight, 0)
  assert.equal(c.distance, 0)
  assert.equal(c.speed, 0)
  assert.equal(c.set + c.done, TRACK_GRID_COLUMNS)
})

test('colSpan emits whole literal Tailwind classes — Tailwind cannot see an interpolated one', () => {
  for (let n = 1; n <= TRACK_GRID_COLUMNS; n++) {
    assert.equal(colSpan(n), `col-span-${n}`)
  }
  const source = fs.readFileSync(path.join(__dirname, '../../lib/workout/trackColumns.ts'), 'utf8')
  for (const t of TRACKING_TYPES) {
    const c = trackColumnSpans(t)
    for (const span of [c.set, c.weight, c.main, c.distance, c.speed, c.done]) {
      if (span === 0) continue
      assert.ok(
        source.includes(`'col-span-${span}'`),
        `col-span-${span} must appear literally in trackColumns.ts or Tailwind will not generate it`,
      )
    }
  }
})

// ── The two logging surfaces ────────────────────────────────────────────────
// This repo has no jsdom/testing-library, so — matching the precedent in
// exerciseLibraryAddButtonPosition.test.ts — the JSX is asserted against the
// source text.

const trackSrc = fs.readFileSync(
  path.join(__dirname, '../../app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx'),
  'utf8',
)
const liveSrc = fs.readFileSync(
  path.join(__dirname, '../../app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx'),
  'utf8',
)

test('the Track view takes its widths from trackColumnSpans, not from hand-written spans', () => {
  assert.ok(
    trackSrc.includes('from "@/lib/workout/trackColumns"'),
    'WorkoutFormClient must import the shared column widths',
  )
  // The header row and the set rows each compute them once.
  const uses = trackSrc.match(/trackColumnSpans\(tracking\)/g) ?? []
  assert.equal(uses.length, 2, 'both the column headers and the set rows need the same widths')

  for (const key of ['set', 'weight', 'main', 'distance', 'speed', 'done']) {
    assert.ok(
      trackSrc.includes(`colSpan(cols.${key})`),
      `the ${key} box should be sized by colSpan(cols.${key})`,
    )
  }
})

test('the old hard-coded 16-column cardio row is gone', () => {
  // The exact expression that produced set(2)+time(6)+distance(2)+speed(2)+done(2).
  assert.ok(
    !trackSrc.includes('showWeight ? "col-span-3" : "col-span-6"'),
    'the time box must not be a flat 6 columns regardless of what else is tracked',
  )
  assert.ok(
    !trackSrc.includes('tracking === "time_distance" ? "col-span-2" : showSpeed ? "col-span-2" : "col-span-4"'),
    'the Done cell must not carry its own copy of the width rules',
  )
})

test('the live view keeps every input box on one line: fixed-height label rows', () => {
  const start = liveSrc.indexOf('data-tour="live-inputs"')
  const end = liveSrc.indexOf('Quick weight buttons')
  assert.ok(start !== -1 && end > start, 'could not find the live input row')
  const inputs = liveSrc.slice(start, end)

  // Five label rows: weight, reps, time, distance, speed. Every one of them
  // is pinned to the same height, so a label that wraps can no longer shove
  // its box below the boxes beside it.
  const pinned = inputs.match(/mb-1 (?:block h-5|flex h-5)/g) ?? []
  assert.equal(pinned.length, 5, 'every label row in the live input group must be a fixed h-5')

  // The label that caused it: "Duration (sec)" plus a "Use min" toggle did not
  // fit a third of a phone's width.
  assert.ok(inputs.includes('`Time (${durationUnit})`'), 'the time label should be the short form')
  assert.ok(!inputs.includes('Duration ('), 'the long "Duration (...)" label is what wrapped')
  assert.ok(!inputs.includes('Use min'), 'the unit toggle should read "min"/"sec", like the Track view')
})
