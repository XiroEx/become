// Run with: npm run test:file tests/unit/videoFilmstrip.test.ts
//
// The filmstrip trimmer drags a start/end handle directly on top of frame
// thumbnails (side-to-side, like the reference iOS trim UI from the card).
// These are the pure pieces of that interaction — where to sample the source
// video, and how a dragged handle clamps — kept DOM-free so they're testable
// without a browser.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  clampTrimEnd,
  clampTrimStart,
  filmstripFrameTimes,
  timeToPercent,
} from '../../lib/videoFilmstrip'

test('filmstripFrameTimes samples evenly across the duration', () => {
  const times = filmstripFrameTimes(30, 6)
  assert.equal(times.length, 6)
  // Centered within each 5s slice: 2.5, 7.5, 12.5, ...
  assert.deepEqual(times, [2.5, 7.5, 12.5, 17.5, 22.5, 27.5])
})

test('filmstripFrameTimes never samples past end-of-file', () => {
  // With enough tiles, the last one's center approaches the real duration;
  // some decoders never fire `seeked` for a seek that close to EOF, so it
  // must be pulled back at least 0.05s from the end.
  const times = filmstripFrameTimes(1, 1000)
  const last = times[times.length - 1]
  assert.ok(last <= 0.95, `expected last sample <= 0.95, got ${last}`)
})

test('filmstripFrameTimes degrades to empty for bad inputs rather than throwing', () => {
  assert.deepEqual(filmstripFrameTimes(0, 10), [])
  assert.deepEqual(filmstripFrameTimes(-5, 10), [])
  assert.deepEqual(filmstripFrameTimes(30, 0), [])
  assert.deepEqual(filmstripFrameTimes(NaN, 10), [])
})

test('timeToPercent maps a time onto the 0-100 strip', () => {
  assert.equal(timeToPercent(0, 20), 0)
  assert.equal(timeToPercent(10, 20), 50)
  assert.equal(timeToPercent(20, 20), 100)
})

test('timeToPercent clamps out-of-range times instead of over/undershooting the strip', () => {
  assert.equal(timeToPercent(-5, 20), 0)
  assert.equal(timeToPercent(25, 20), 100)
})

test('timeToPercent with a zero/invalid duration reads as 0, not NaN or Infinity', () => {
  assert.equal(timeToPercent(5, 0), 0)
  assert.equal(timeToPercent(5, NaN), 0)
})

test('clampTrimStart stops short of the end handle by minDuration', () => {
  // Dragging start toward end=10 with a 0.5s floor should stop at 9.5, not
  // push end forward (that's the old push-the-other-slider behavior; side
  // handles clamp themselves instead).
  assert.equal(clampTrimStart(9.9, 10, 30, 0.5), 9.5)
})

test('clampTrimStart never goes negative', () => {
  assert.equal(clampTrimStart(-3, 10, 30, 0.5), 0)
})

test('clampTrimEnd stops short of the start handle by minDuration', () => {
  assert.equal(clampTrimEnd(0.1, 5, 30, 0.5), 5.5)
})

test('clampTrimEnd never exceeds the real duration', () => {
  assert.equal(clampTrimEnd(999, 5, 30, 0.5), 30)
})

test('dragging start and end to the same point still leaves at least minDuration between them', () => {
  const end = clampTrimEnd(15, 15, 30, 0.5)
  const start = clampTrimStart(15, end, 30, 0.5)
  assert.ok(end - start >= 0.5 - 1e-9)
})
