// Run with: npm run test:file tests/unit/videoTrim.test.ts
//
// `resolveTrim` is the one place that decides which slice of a demo clip
// plays. It runs in three contexts with different amounts of information —
// the player before metadata loads (no duration), the player after (duration
// known), and the API route validating a save — so the interesting cases are
// all about degrading safely when the stored values disagree with reality.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MIN_TRIM_DURATION, formatTimecode, resolveTrim } from '../../lib/videoTrim'

test('no trim stored → full length', () => {
  const r = resolveTrim({ videoTrim: null }, 30)
  assert.equal(r.start, 0)
  assert.equal(r.end, null)
  assert.equal(r.isFullLength, true)
})

test('missing input object is treated as full length, not a crash', () => {
  assert.equal(resolveTrim(undefined, 30).isFullLength, true)
  assert.equal(resolveTrim(null, 30).isFullLength, true)
})

test('a normal window is preserved', () => {
  const r = resolveTrim({ videoTrim: { start: 2, end: 8 } }, 30)
  assert.equal(r.start, 2)
  assert.equal(r.end, 8)
  assert.equal(r.isFullLength, false)
})

test('window survives before duration is known', () => {
  // First render, metadata not loaded yet. We must not clamp the end to 0.
  const r = resolveTrim({ videoTrim: { start: 2, end: 8 } }, null)
  assert.equal(r.start, 2)
  assert.equal(r.end, 8)
})

test('a start past the end of the file falls back to 0 rather than stalling', () => {
  // The realistic path here: an admin trimmed a 60s clip to start at 45s, then
  // replaced the file with a 10s one. Seeking to 45s on the new file leaves the
  // player parked past the end on a black frame.
  const r = resolveTrim({ videoTrim: { start: 45, end: 50 } }, 10)
  assert.equal(r.start, 0)
})

test('an end past the real duration is clamped to the duration', () => {
  const r = resolveTrim({ videoTrim: { start: 1, end: 90 } }, 10)
  assert.equal(r.start, 1)
  assert.equal(r.end, 10)
})

test('a window shorter than the floor drops the end bound', () => {
  const r = resolveTrim({ videoTrim: { start: 5, end: 5.1 } }, 30)
  assert.equal(r.start, 5)
  assert.equal(r.end, null, 'a 0.1s loop reads as a broken player, not a trim')
})

test('an inverted window degrades to playable rather than throwing', () => {
  const r = resolveTrim({ videoTrim: { start: 8, end: 2 } }, 30)
  assert.equal(r.start, 8)
  assert.equal(r.end, null)
})

test('exactly the minimum duration is allowed', () => {
  const r = resolveTrim({ videoTrim: { start: 1, end: 1 + MIN_TRIM_DURATION } }, 30)
  assert.equal(r.end, 1 + MIN_TRIM_DURATION)
})

test('an end at the real duration with no start is reported as full length', () => {
  // Otherwise the admin UI would show an "trimmed" badge for a video that is
  // not actually trimmed.
  const r = resolveTrim({ videoTrim: { start: 0, end: 30 } }, 30)
  assert.equal(r.isFullLength, true)
  assert.equal(r.end, null)
})

test('a trimmed start is never reported as full length', () => {
  const r = resolveTrim({ videoTrim: { start: 3 } }, 30)
  assert.equal(r.start, 3)
  assert.equal(r.isFullLength, false)
})

test('non-numeric junk in the stored doc is ignored', () => {
  const r = resolveTrim(
    { videoTrim: { start: NaN, end: Infinity } as unknown as { start: number; end: number } },
    30
  )
  assert.equal(r.start, 0)
  assert.equal(r.end, null)
  assert.equal(r.isFullLength, true)
})

test('negative bounds are floored at zero', () => {
  const r = resolveTrim({ videoTrim: { start: -5, end: 6 } }, 30)
  assert.equal(r.start, 0)
  assert.equal(r.end, 6)
})

test('formatTimecode renders minutes and tenths', () => {
  assert.equal(formatTimecode(0), '0:00.0')
  assert.equal(formatTimecode(9.25), '0:09.3')
  assert.equal(formatTimecode(72.4), '1:12.4')
  assert.equal(formatTimecode(-1), '0:00.0')
})
