import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTracking, tracksWeight, tracksTime, inferTracking, DEFAULT_TRACKING } from '@/lib/workout/tracking'

test('the vocabulary passes through untouched', () => {
  for (const t of ['reps_weight', 'reps_bodyweight', 'reps_only', 'time', 'time_distance', 'intervals', 'none'] as const) {
    assert.equal(normalizeTracking(t), t)
  }
})

test("'reps' — what the rebuild paths invented — is a weighted set, not a dead end", () => {
  // This is the bug: a resumed session came back typed 'reps', which matched
  // no branch, so the Track view dropped the weight column and the Live view
  // showed no inputs at all.
  assert.equal(normalizeTracking('reps'), 'reps_weight')
  assert.equal(tracksWeight('reps'), true)
  assert.equal(normalizeTracking('REPS '), 'reps_weight')
})

test('unknown and missing types fall back to the fullest form', () => {
  assert.equal(normalizeTracking(undefined), DEFAULT_TRACKING)
  assert.equal(normalizeTracking(null), DEFAULT_TRACKING)
  assert.equal(normalizeTracking(''), DEFAULT_TRACKING)
  assert.equal(normalizeTracking('nonsense'), 'reps_weight')
  // A weight box on a bodyweight movement is a shrug; a missing one loses data.
  assert.equal(tracksWeight('nonsense'), true)
})

test('aliases map to the real thing', () => {
  assert.equal(normalizeTracking('bodyweight'), 'reps_bodyweight')
  assert.equal(normalizeTracking('duration'), 'time')
  assert.equal(normalizeTracking('interval'), 'intervals')
  assert.equal(tracksTime('duration'), true)
  assert.equal(tracksTime('reps'), false)
})

test('a legacy log is read from what it recorded, then the catalog', () => {
  // Duration with no reps = timed work.
  assert.equal(inferTracking([{ duration: 45, reps: 0 }]), 'time')
  // A load was recorded, so it is loaded work whatever the catalog says.
  assert.equal(inferTracking([{ reps: 10, weight: 135 }], 'reps_bodyweight'), 'reps_weight')
  // Nothing recorded: trust the catalog.
  assert.equal(inferTracking([{ reps: 0, weight: 0 }], 'reps_bodyweight'), 'reps_bodyweight')
  assert.equal(inferTracking(undefined, 'time'), 'time')
  assert.equal(inferTracking(undefined, undefined), DEFAULT_TRACKING)
  // A plank logged with both a duration and reps is not silently timed.
  assert.equal(inferTracking([{ duration: 45, reps: 12, weight: 20 }]), 'reps_weight')
})
