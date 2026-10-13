// Run with: npm run test:file tests/unit/exerciseNameMatch.test.ts
//
// Card: "Exercise do not exist in our data base. Some program exercises don't
// exist in our data base or are not in our admin portal which means we can't
// upload videos or edit them."
//
// The fixture below is a slice of the LIVE catalog (names and aliases as they
// are in production), and the cases are the real program references that were
// pointing at nothing when the card was filed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExerciseNameIndex,
  matchExerciseName,
  normalizedNameKey,
  resolveExerciseSlug,
  strippedNameKey,
  type IndexableExercise,
} from '../../lib/exerciseNameMatch'

const CATALOG: IndexableExercise[] = [
  { slug: 'barbell-bench-press', name: 'Barbell Bench Press', aliases: ['Bench Press', 'Bench Press (DB/bar)'] },
  { slug: 'dumbbell-bench-press', name: 'Dumbbell Bench Press', aliases: ['DB Bench Press'] },
  { slug: 'hammer-curl', name: 'Hammer Curl', aliases: ['Hammer Curls', 'DB Hammer Curls'] },
  { slug: 'incline-dumbbell-press', name: 'Incline Dumbbell Press', aliases: ['Incline DB Press'] },
  { slug: 'preacher-curl', name: 'Preacher Curl', aliases: ['Preacher Curl Machine'] },
  { slug: 'romanian-deadlift', name: 'Romanian Deadlift', aliases: ['RDL', 'Dumbbell RDL'] },
  { slug: 'v-up', name: 'V-Up', aliases: ['V-Ups', 'V-Ups × 12'] },
  { slug: 'hip-thrust', name: 'Hip Thrust', aliases: ['Barbell Hip Thrust', 'DB Hip Thrust'] },
  { slug: 'cable-lateral-raise', name: 'Cable Lateral Raise', aliases: ['Cable Side Raise'] },
  { slug: 'dumbbell-lateral-raise', name: 'Dumbbell Lateral Raise', aliases: ['DB Lateral Raises'] },
  { slug: 'lateral-raise-machine', name: 'Lateral Raise Machine' },
  // A member's own custom exercise: layer 1 only, never a fuzzy target.
  { slug: 'custom-8750b9-squat-press-1787658099343', name: 'Squat Press', isCustom: true },
]

const index = buildExerciseNameIndex(CATALOG)

// ─── layer 1: exactly what used to work, still works ──────────────────────

test('an exact name or alias still resolves, case-insensitively', () => {
  assert.deepEqual(matchExerciseName('Barbell Bench Press', index), { slug: 'barbell-bench-press', via: 'exact' })
  assert.deepEqual(matchExerciseName('bench press', index), { slug: 'barbell-bench-press', via: 'exact' })
  assert.deepEqual(matchExerciseName('  RDL  ', index), { slug: 'romanian-deadlift', via: 'exact' })
})

// ─── layer 2: the references that were pointing at nothing ────────────────

test('"DB Hammer Curl" is the catalog\'s Hammer Curl, plural and all', () => {
  assert.deepEqual(matchExerciseName('DB Hammer Curl', index), { slug: 'hammer-curl', via: 'normalized' })
})

test('rep-scheme noise and degree signs do not stop a match', () => {
  assert.equal(resolveExerciseSlug('Incline DB Press (15-30°)', index), 'incline-dumbbell-press')
  assert.equal(resolveExerciseSlug('V-Ups × 12', index), 'v-up')
})

test('shorthand and longhand are the same exercise, typed either way', () => {
  assert.equal(resolveExerciseSlug('dumbbell hammer curls', index), 'hammer-curl')
  assert.equal(resolveExerciseSlug('Romanian Deadlift', index), 'romanian-deadlift')
  assert.equal(resolveExerciseSlug('rdl', index), 'romanian-deadlift')
})

// ─── layer 3: lossy, so only where it is unambiguous ──────────────────────

test('a qualifier the catalog does not carry is dropped', () => {
  assert.deepEqual(matchExerciseName('Preacher Curl (Plate-Loaded)', index), { slug: 'preacher-curl', via: 'stripped' })
  assert.deepEqual(matchExerciseName('Hip Thrust (Plate-Loaded)', index), { slug: 'hip-thrust', via: 'stripped' })
})

test('an ambiguous stripped key resolves to nothing rather than guessing', () => {
  // "Dumbbell Bench Press" and "Barbell Bench Press" both reduce to
  // "bench press"; three lateral raises all reduce to "lateral raise".
  assert.equal(strippedNameKey('Incline Bench Press'), 'bench press')
  assert.equal(index.stripped.get('bench press'), null)
  assert.equal(index.stripped.get('lateral raise'), null)
  assert.equal(resolveExerciseSlug('Incline Bench Press', index), null)
  assert.equal(resolveExerciseSlug('Cable Lateral Raise (1 Arm)', index), null)
})

test('a genuinely new exercise resolves to nothing — that is what mints a row', () => {
  assert.equal(resolveExerciseSlug('Sled Push', index), null)
  assert.equal(resolveExerciseSlug('Up-downs', index), null)
})

// ─── the layers are ordered, strongest first ──────────────────────────────

test('an exact hit is never overruled by a fuzzier one', () => {
  // "DB Bench Press" is an exact alias of dumbbell-bench-press, while its
  // stripped key ("bench press") is ambiguous. The exact answer wins.
  assert.deepEqual(matchExerciseName('DB Bench Press', index), { slug: 'dumbbell-bench-press', via: 'exact' })
})

test('an empty or noise-only name never matches', () => {
  assert.equal(resolveExerciseSlug('', index), null)
  assert.equal(resolveExerciseSlug('   ', index), null)
  assert.equal(normalizedNameKey('3x10'), '')
  assert.equal(resolveExerciseSlug('3x10', index), null)
})

// ─── owner-private customs take part in layer 1 only ──────────────────────

test("a member's private custom is reachable by its exact name, never fuzzily", () => {
  assert.deepEqual(
    matchExerciseName('Squat Press', index),
    { slug: 'custom-8750b9-squat-press-1787658099343', via: 'exact' },
  )
  // "DB Squat Press" must NOT land on somebody's private exercise.
  assert.equal(resolveExerciseSlug('DB Squat Press', index), null)
})

test('a custom an admin published IS a fuzzy target', () => {
  const published = buildExerciseNameIndex([
    { slug: 'custom-abc-squat-press', name: 'Squat Press', isCustom: true, isUniversal: true },
  ])
  assert.equal(resolveExerciseSlug('DB Squat Press', published), 'custom-abc-squat-press')
})

// ─── index construction ───────────────────────────────────────────────────

test('two exercises claiming one exact name resolve to the first, every time', () => {
  const entries: IndexableExercise[] = [
    { slug: 'a-leg-extension', name: 'Leg Extension' },
    { slug: 'z-leg-extension', name: 'Leg Extension' },
  ]
  assert.equal(resolveExerciseSlug('Leg Extension', buildExerciseNameIndex(entries)), 'a-leg-extension')
  assert.equal(resolveExerciseSlug('Leg Extension', buildExerciseNameIndex(entries)), 'a-leg-extension')
})

test('one exercise claiming a key twice is not a collision', () => {
  // "Preacher Curl" and its alias "Preacher Curl Machine" both strip to
  // "preacher curl" — same slug, so the key stays usable.
  assert.equal(index.stripped.get('preacher curl'), 'preacher-curl')
})

test('a malformed row is skipped rather than poisoning the index', () => {
  const built = buildExerciseNameIndex([
    { slug: '', name: 'No Slug' },
    { slug: 'no-name', name: '' },
    { slug: 'ok', name: 'Fine', aliases: ['', '  '] },
  ])
  assert.equal(resolveExerciseSlug('No Slug', built), null)
  assert.equal(resolveExerciseSlug('Fine', built), 'ok')
})
