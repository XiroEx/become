import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTracking, tracksWeight, tracksTime, tracksSpeed, inferTracking, isSetFilled, categoryForTracking, blankSet, findPhantomPrefilledSets, DEFAULT_TRACKING } from '@/lib/workout/tracking'

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

test('a set ticks itself off when it has what its exercise asks for', () => {
  // Weighted work wants both numbers.
  assert.equal(isSetFilled('reps_weight', { reps: '10', weight: '110' }), true)
  assert.equal(isSetFilled('reps_weight', { reps: '10' }), false)
  assert.equal(isSetFilled('reps_weight', { weight: '110' }), false)

  // Bodyweight work wants reps only.
  assert.equal(isSetFilled('reps_bodyweight', { reps: '12' }), true)
  assert.equal(isSetFilled('reps_only', { reps: '0' }), false)

  // Cardio: this is the one that was silently impossible. A stair climber shown
  // reps and weight boxes could never satisfy a rule that wants time.
  assert.equal(isSetFilled('time', { duration: '45' }), true)
  assert.equal(isSetFilled('time', { reps: '45', weight: '20' }), false)
  assert.equal(isSetFilled('time_distance', { duration: '600' }), true)
  assert.equal(isSetFilled('time_distance', { distance: '1600' }), true)
  assert.equal(isSetFilled('time_distance', { speed: '3.5' }), true, 'a speed alone still happened')
  assert.equal(isSetFilled('intervals', { speed: '8' }), true)
  assert.equal(isSetFilled('intervals', {}), false)

  // No tracking: only the member can say it is done.
  assert.equal(isSetFilled('none', { reps: '10', weight: '10' }), false)

  // An unknown or missing type reads as weighted work, not as "never filled".
  assert.equal(isSetFilled('reps', { reps: '10', weight: '95' }), true)
  assert.equal(isSetFilled(undefined, { reps: '10', weight: '95' }), true)
})

test('a custom cardio machine gets a cardio category, not strength', () => {
  // The stairmaster bug's other half: the create-exercise sheets only ask for
  // a tracking type, so whatever picked "Time + Distance" has to land in the
  // catalog as cardio or it never shows up in a Quick Session's cardio filter.
  assert.equal(categoryForTracking('time_distance'), 'cardio')
  assert.equal(categoryForTracking('intervals'), 'conditioning')
  assert.equal(categoryForTracking('reps_weight'), 'strength')
  assert.equal(categoryForTracking('reps_bodyweight'), 'strength')
  assert.equal(categoryForTracking('time'), 'strength')
  assert.equal(categoryForTracking(undefined), 'strength')
})

test('REGRESSION: a fresh set never carries last time\'s weight or reps', () => {
  // The live workout used to seed every set of an exercise from the member's
  // last-completed performance, so a set they never touched still had real
  // numbers in it and could be marked done without them ever typing anything.
  // blankSet() is what a fresh set must always be, regardless of history.
  assert.deepEqual(blankSet(), { reps: '', weight: '', speed: '', completed: false })
  // Calling it twice must not hand back the same object — each set gets its
  // own, or editing one set's weight would edit every set's.
  assert.notEqual(blankSet(), blankSet())
})

test('REGRESSION: a Track resume flags sets stamped with the same stale numbers', () => {
  // The exact shape from the bug report: set 1 really done at 225x10, sets 2
  // and 3 left over from the old "seed every set" bug at 150x10, never
  // completed. Both stale sets share one signature and must be flagged.
  const sets = [
    { reps: '10', weight: '225', completed: true },
    { reps: '10', weight: '150', completed: false },
    { reps: '10', weight: '150', completed: false },
  ]
  assert.deepEqual(findPhantomPrefilledSets('reps_weight', sets), [1, 2])
})

test('a lone filled-but-incomplete set is left alone', () => {
  // Unchecking DONE on a set you want to redo is a legitimate, single-set way
  // to end up with real numbers sitting in an incomplete set — it must not be
  // treated as stale prefill just because it is filled in.
  const sets = [
    { reps: '10', weight: '225', completed: false },
    { reps: '', weight: '', completed: false },
  ]
  assert.deepEqual(findPhantomPrefilledSets('reps_weight', sets), [])
})

test('completed sets and differently-valued sets are never flagged', () => {
  assert.deepEqual(
    findPhantomPrefilledSets('reps_weight', [
      { reps: '10', weight: '150', completed: true },
      { reps: '10', weight: '150', completed: true },
    ]),
    [],
    'both done — not a resume bug, just two matching real sets',
  )
  assert.deepEqual(
    findPhantomPrefilledSets('reps_weight', [
      { reps: '10', weight: '150', completed: false },
      { reps: '8', weight: '135', completed: false },
    ]),
    [],
    'different numbers — normal independent typing, not a stamped duplicate',
  )
  assert.deepEqual(
    findPhantomPrefilledSets('reps_weight', [
      { reps: '', weight: '150', completed: false },
      { reps: '', weight: '150', completed: false },
    ]),
    [],
    'weight alone never satisfies isSetFilled for reps_weight, so neither counts',
  )
})
