// Run with: npm run test:file tests/unit/exerciseVariationMatch.test.ts
//
// Regression coverage for the asymmetric-matching bug in
// /api/exercises/variations: the algorithmic query used `primaryMuscles:
// { $all: source.primaryMuscles } }`, which checks the CANDIDATE contains
// every one of the SOURCE's muscles — containment, not overlap, and
// containment is not symmetric.
//
// Confirmed live 2026-09-09: `GET /api/exercises/variations?slug=dumbbell-curl`
// (primaryMuscles: [biceps]) returned all 7 members of the curl family, but
// `?slug=hammer-curl` (primaryMuscles: [brachialis, biceps]) returned only
// itself + dumbbell-curl. Querying from hammer-curl required a candidate to
// contain BOTH brachialis and biceps, which preacher-curl/ez-bar-curl/
// barbell-curl/cable-curl (tagged [biceps] only) don't.
//
// lib/exerciseVariationMatch.ts fixes this by switching to `$in` (overlap:
// at least one shared muscle) — symmetric by construction.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAlgorithmicVariationQuery,
  hasSharedPrimaryMuscle,
} from '../../lib/exerciseVariationMatch'
import type { MuscleGroup } from '../../models/Exercise'

// ── hasSharedPrimaryMuscle: the symmetry property itself ────────────────────

test('hasSharedPrimaryMuscle: the hammer-curl/dumbbell-curl bug — symmetric even when one array is a superset of the other', () => {
  const dumbbellCurl: MuscleGroup[] = ['biceps']
  const hammerCurl: MuscleGroup[] = ['brachialis', 'biceps']
  assert.equal(hasSharedPrimaryMuscle(dumbbellCurl, hammerCurl), true)
  // This direction is what containment ($all) got wrong: dumbbellCurl does
  // not contain 'brachialis', so a containment check from hammerCurl's side
  // would fail here even though the pair obviously share biceps.
  assert.equal(hasSharedPrimaryMuscle(hammerCurl, dumbbellCurl), true)
})

test('hasSharedPrimaryMuscle: no shared muscle → false both ways', () => {
  assert.equal(hasSharedPrimaryMuscle(['chest'], ['quads']), false)
  assert.equal(hasSharedPrimaryMuscle(['quads'], ['chest']), false)
})

test('hasSharedPrimaryMuscle: identical single-muscle arrays → true', () => {
  assert.equal(hasSharedPrimaryMuscle(['calves'], ['calves']), true)
})

test('hasSharedPrimaryMuscle: multi-muscle overlap on one entry is enough', () => {
  // dumbbell-underhand-row [lats, biceps] vs barbell-row [lats, mid_back] —
  // share only 'lats', but that's sufficient for overlap.
  assert.equal(hasSharedPrimaryMuscle(['lats', 'biceps'], ['lats', 'mid_back']), true)
  assert.equal(hasSharedPrimaryMuscle(['lats', 'mid_back'], ['lats', 'biceps']), true)
})

// ── buildAlgorithmicVariationQuery: the Mongo filter shape ───────────────────

test('buildAlgorithmicVariationQuery: primaryMuscles uses $in (overlap), not $all (containment)', () => {
  const query = buildAlgorithmicVariationQuery('hammer-curl', {
    movementPatterns: ['elbow_flexion'],
    primaryMuscles: ['brachialis', 'biceps'],
    bodyRegion: 'upper_body',
  })
  assert.deepEqual(query.primaryMuscles, { $in: ['brachialis', 'biceps'] })
})

test('buildAlgorithmicVariationQuery: still requires an exact movement-pattern set and same body region', () => {
  const query = buildAlgorithmicVariationQuery('barbell-back-squat', {
    movementPatterns: ['squat'],
    primaryMuscles: ['quads', 'glutes'],
    bodyRegion: 'lower_body',
  })
  assert.deepEqual(query.movementPatterns, { $size: 1, $all: ['squat'] })
  assert.equal(query.bodyRegion, 'lower_body')
})

test('buildAlgorithmicVariationQuery: excludes the source exercise itself', () => {
  const query = buildAlgorithmicVariationQuery('dumbbell-curl', {
    movementPatterns: ['elbow_flexion'],
    primaryMuscles: ['biceps'],
    bodyRegion: 'upper_body',
  })
  assert.deepEqual(query.slug, { $ne: 'dumbbell-curl' })
})

test('buildAlgorithmicVariationQuery: only requires isActive, no other filtering', () => {
  const query = buildAlgorithmicVariationQuery('dumbbell-curl', {
    movementPatterns: ['elbow_flexion'],
    primaryMuscles: ['biceps'],
    bodyRegion: 'upper_body',
  })
  assert.equal(query.isActive, true)
})
