// Run with: npm run test:file tests/unit/exerciseSearchRanking.test.ts
//
// Card: "Add an exercise needs work" — searching "back" surfaced "Glute Cable
// Kickback" (the letters "back" sitting inside "Kickback", no word boundary)
// mixed in among real "back" matches, and "Ches" surfaced "Bicycle Crunch" /
// "Toe Touch" only because their aliases end in "...ches" ("Crunches" /
// "Touches"). These pin the two screenshots from the card down to fixed
// regression cases, plus the tiering itself: name beats alias beats a
// body-part-only ("part of the body that is being done") hit.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MATCH_TIER,
  matchExerciseTier,
  matchingMuscleGroups,
  nameBoundaryPattern,
  sortByMatchTier,
  type RankableExercise,
} from '../../lib/exerciseSearchRanking'

// ─── the reported bugs, pinned ────────────────────────────────────────────

test('back: a "back" hiding inside "Kickback" is not a match at all', () => {
  const kickback: RankableExercise = { name: 'Glute Cable Kickback', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'] }
  assert.equal(matchExerciseTier(kickback, 'back'), null)
})

test('back: real word-boundary matches still win, ranked above a body-part-only hit', () => {
  const squat: RankableExercise = { name: 'Barbell Back Squat', primaryMuscles: ['quads'] }
  const backpack: RankableExercise = { name: 'Backpack Row', primaryMuscles: ['lats'] }
  const latPulldown: RankableExercise = { name: 'Lat Pulldown', primaryMuscles: ['lats', 'upper_back'] }
  const kickback: RankableExercise = { name: 'Glute Cable Kickback', primaryMuscles: ['glutes'] }

  const ranked = sortByMatchTier([squat, kickback, latPulldown, backpack], 'back')

  assert.deepEqual(ranked.map(r => r.name), ['Backpack Row', 'Barbell Back Squat', 'Lat Pulldown'])
  assert.equal(matchExerciseTier(backpack, 'back'), MATCH_TIER.NAME_PREFIX) // "back" starts "Backpack"
  assert.equal(matchExerciseTier(squat, 'back'), MATCH_TIER.NAME_WORD) // "Back" is its own word
  assert.equal(matchExerciseTier(latPulldown, 'back'), MATCH_TIER.BODY_PART) // no "back" in the name at all
})

test('Ches: alias suffixes ("Crunches", "Touches") are not matches', () => {
  const crunch: RankableExercise = { name: 'Bicycle Crunch', aliases: ['Bicycle Crunches'] }
  const toeTouch: RankableExercise = { name: 'Toe Touch', aliases: ['Toe Touches'] }
  assert.equal(matchExerciseTier(crunch, 'ches'), null)
  assert.equal(matchExerciseTier(toeTouch, 'ches'), null)
})

test('Ches: still matches every real "chest" exercise, prefix-of-name ranked first', () => {
  const chestSupportedRow: RankableExercise = { name: 'Chest-Supported Row' } // "Chest" is the first word
  const cableChestFly: RankableExercise = { name: 'Cable Chest Fly' } // "Chest" mid-name
  const dumbbellChestFly: RankableExercise = { name: 'Dumbbell Chest Fly' }

  const ranked = sortByMatchTier([cableChestFly, dumbbellChestFly, chestSupportedRow], 'ches')

  assert.equal(ranked[0].name, 'Chest-Supported Row')
  assert.deepEqual(ranked.map(r => r.name).slice(1), ['Cable Chest Fly', 'Dumbbell Chest Fly'])
})

// ─── tiering rules, directly ──────────────────────────────────────────────

test('name always beats alias, alias always beats a body-part-only hit', () => {
  const nameMatch: RankableExercise = { name: 'Bench Press' }
  const aliasMatch: RankableExercise = { name: 'Barbell Chest Press', aliases: ['Bench Press Variation'] }
  const bodyPartOnly: RankableExercise = { name: 'Machine Fly', primaryMuscles: ['chest'] }

  assert.equal(matchExerciseTier(nameMatch, 'bench'), MATCH_TIER.NAME_PREFIX)
  assert.ok(matchExerciseTier(aliasMatch, 'bench')! >= MATCH_TIER.ALIAS_EXACT)
  assert.equal(matchExerciseTier(bodyPartOnly, 'chest'), MATCH_TIER.BODY_PART)

  const ranked = sortByMatchTier([bodyPartOnly, aliasMatch, nameMatch], 'bench')
  // bodyPartOnly doesn't match "bench" at all, so it's dropped entirely.
  assert.deepEqual(ranked.map(r => r.name), ['Bench Press', 'Barbell Chest Press'])
})

test('exact name match outranks a name that merely starts with the query', () => {
  const exact: RankableExercise = { name: 'Row' }
  const prefix: RankableExercise = { name: 'Row Machine' }
  assert.equal(matchExerciseTier(exact, 'row'), MATCH_TIER.NAME_EXACT)
  assert.equal(matchExerciseTier(prefix, 'row'), MATCH_TIER.NAME_PREFIX)
  assert.deepEqual(sortByMatchTier([prefix, exact], 'row').map(r => r.name), ['Row', 'Row Machine'])
})

test('a name match ties break alphabetically', () => {
  const b: RankableExercise = { name: 'Back Extension' }
  const a: RankableExercise = { name: 'Back Squat' } // same tier (NAME_PREFIX) as b
  assert.deepEqual(sortByMatchTier([a, b], 'back').map(r => r.name), ['Back Extension', 'Back Squat'])
})

test('no match anywhere (name, alias, or muscle) returns null and is dropped', () => {
  const unrelated: RankableExercise = { name: 'Plank', aliases: ['Front Plank'], primaryMuscles: ['abs'] }
  assert.equal(matchExerciseTier(unrelated, 'quad'), null)
  assert.deepEqual(sortByMatchTier([unrelated], 'quad'), [])
})

test('empty query matches nothing', () => {
  assert.equal(matchExerciseTier({ name: 'Squat' }, ''), null)
  assert.equal(matchExerciseTier({ name: 'Squat' }, '   '), null)
})

// ─── matchingMuscleGroups / nameBoundaryPattern ───────────────────────────

test('matchingMuscleGroups finds compound tokens by their word segment', () => {
  const groups = matchingMuscleGroups('back')
  assert.ok(groups.includes('upper_back'))
  assert.ok(groups.includes('mid_back'))
  assert.ok(groups.includes('lower_back'))
  assert.ok(!groups.includes('lats')) // "lats" doesn't contain the word "back"
})

test('matchingMuscleGroups is empty for a query with no muscle-group hit', () => {
  assert.deepEqual(matchingMuscleGroups('xyzzy'), [])
})

test('nameBoundaryPattern is anchored at start-of-string or a boundary character', () => {
  const re = new RegExp(nameBoundaryPattern('back'), 'i')
  assert.ok(re.test('Back Squat'))
  assert.ok(re.test('Barbell Back Squat'))
  assert.ok(re.test('Chest-Back Superset'))
  assert.ok(!re.test('Kickback'))
  assert.ok(!re.test('Feedback Session'))
})

test('nameBoundaryPattern escapes regex metacharacters in the query', () => {
  const re = new RegExp(nameBoundaryPattern('curl ('), 'i')
  assert.doesNotThrow(() => re.test('Curl (EZ Bar)'))
  assert.ok(re.test('Curl (EZ Bar)'))
})
