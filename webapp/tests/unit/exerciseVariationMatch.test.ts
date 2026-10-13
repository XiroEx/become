// Run with: npm run test:file tests/unit/exerciseVariationMatch.test.ts
//
// Two bugs live in this file, both in /api/exercises/variations.
//
// 1. ASYMMETRY (fixed earlier, still pinned). The algorithmic query used
//    `primaryMuscles: { $all: source.primaryMuscles }`, which checks the
//    CANDIDATE contains every one of the SOURCE's muscles — containment, not
//    overlap, and containment is not symmetric. Confirmed live 2026-09-09:
//    `?slug=dumbbell-curl` (primaryMuscles [biceps]) returned all 7 members of
//    the curl family, but `?slug=hammer-curl` ([brachialis, biceps]) returned
//    only itself + dumbbell-curl. `$in` (overlap) is symmetric by construction.
//
// 2. THE EXACT-PATTERN-SET RULE, which is what this card is about. Matching
//    demanded an identical movementPatterns array, and every custom exercise
//    carries the placeholder ['n/a'] because the create form never makes
//    anyone choose. That broke the picker in both directions: a member's own
//    "Dumbbell Chest Press" could not join the catalog's "Machine Chest
//    Press", while an untagged "Pendulum Squat Machine" WAS offered as a
//    variation of "Hip Abduction Machine" — they shared a muscle and the
//    'n/a' placeholder, and nothing else.
//
//    The fix weighs tags and names together: identical real patterns, OR the
//    same movement family by name (lib/exerciseMovementFamily.ts) as long as
//    the tags don't contradict it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildVariationCandidateQuery,
  hasSamePatternSet,
  hasSharedPrimaryMuscle,
  isVariationOf,
  patternsAllowNameMatch,
  realMovementPatterns,
  type VariationMatchSource,
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

// ── buildVariationCandidateQuery: the Mongo filter shape ────────────────────

test('buildVariationCandidateQuery: primaryMuscles uses $in (overlap), not $all (containment)', () => {
  const query = buildVariationCandidateQuery('hammer-curl', {
    primaryMuscles: ['brachialis', 'biceps'],
    bodyRegion: 'upper_body',
  })
  assert.deepEqual(query.primaryMuscles, { $in: ['brachialis', 'biceps'] })
})

test('buildVariationCandidateQuery: narrows on region and excludes the source itself', () => {
  const query = buildVariationCandidateQuery('barbell-back-squat', {
    primaryMuscles: ['quads', 'glutes'],
    bodyRegion: 'lower_body',
  })
  assert.equal(query.bodyRegion, 'lower_body')
  assert.deepEqual(query.slug, { $ne: 'barbell-back-squat' })
  assert.equal(query.isActive, true)
})

test('buildVariationCandidateQuery: says nothing about movement patterns', () => {
  // The pattern judgement moved into isVariationOf, which can tell a real tag
  // from the 'n/a' placeholder. A Mongo-side exact-set filter cannot.
  const query = buildVariationCandidateQuery('dumbbell-curl', {
    primaryMuscles: ['biceps'],
    bodyRegion: 'upper_body',
  })
  assert.equal('movementPatterns' in query, false)
})

test('buildVariationCandidateQuery: scopes to what the viewer may see', () => {
  // Without this the route hands one member another member's private custom
  // exercises — it had no visibility filter at all before.
  const mine = buildVariationCandidateQuery('lat-pulldown', {
    primaryMuscles: ['lats'],
    bodyRegion: 'upper_body',
  }, 'user-123')
  assert.deepEqual(mine.$or, [
    { isCustom: { $ne: true } },
    { isCustom: true, createdBy: 'user-123' },
    { isCustom: true, isUniversal: true },
  ])

  const anonymous = buildVariationCandidateQuery('lat-pulldown', {
    primaryMuscles: ['lats'],
    bodyRegion: 'upper_body',
  })
  assert.deepEqual(anonymous.$or, [
    { isCustom: { $ne: true } },
    { isCustom: true, isUniversal: true },
  ], 'with no viewer, no private custom may be reachable')
})

// ── 'n/a' is absence of information, not a pattern ──────────────────────────

test("realMovementPatterns: 'n/a' is stripped, real patterns survive", () => {
  assert.deepEqual(realMovementPatterns(['n/a']), [])
  assert.deepEqual(realMovementPatterns(['horizontal_push']), ['horizontal_push'])
  assert.deepEqual(realMovementPatterns(undefined), [])
  assert.deepEqual(realMovementPatterns([]), [])
})

test('hasSamePatternSet: two untagged exercises do not have "the same" patterns', () => {
  // The Pendulum Squat Machine / Hip Abduction Machine collision.
  assert.equal(hasSamePatternSet(['n/a'], ['n/a']), false)
  assert.equal(hasSamePatternSet([], []), false)
  assert.equal(hasSamePatternSet(['squat'], ['squat']), true)
  assert.equal(hasSamePatternSet(['hinge', 'squat'], ['squat', 'hinge']), true, 'order must not matter')
  assert.equal(hasSamePatternSet(['hinge'], ['hinge', 'squat']), false, 'a superset is not the same set')
})

test('patternsAllowNameMatch: tags veto a name match only when both sides are tagged and disagree', () => {
  // Untagged side → nothing to contradict, the name governs.
  assert.equal(patternsAllowNameMatch(['n/a'], ['horizontal_push']), true)
  assert.equal(patternsAllowNameMatch(['horizontal_push'], []), true)
  // Overlapping tags → the name is corroborated.
  assert.equal(patternsAllowNameMatch(['horizontal_pull'], ['horizontal_pull', 'anti_rotation']), true)
  // Both tagged, nothing shared → the tags are the better evidence.
  assert.equal(patternsAllowNameMatch(['squat'], ['lunge']), false)
})

// ── isVariationOf: the whole rule ───────────────────────────────────────────

const ex = (
  name: string,
  primaryMuscles: MuscleGroup[],
  movementPatterns: VariationMatchSource['movementPatterns'],
  bodyRegion: VariationMatchSource['bodyRegion'] = 'upper_body',
): VariationMatchSource => ({ name, primaryMuscles, movementPatterns, bodyRegion })

test("the card's screenshot: an untagged custom chest press joins the catalog family", () => {
  const custom = ex('5,5,5 Machine Chest Press', ['chest'], ['n/a'])
  const catalog = ex('Machine Chest Press', ['chest'], ['horizontal_push'])
  assert.equal(isVariationOf(custom, catalog), true)
  assert.equal(isVariationOf(catalog, custom), true, 'and symmetrically')
})

test("the card's ask: dumbbell / plate-loaded / machine chest press are one family", () => {
  const machine = ex('Machine Chest Press', ['chest'], ['horizontal_push'])
  for (const name of ['Dumbbell Chest Press', 'Plate-Loaded Chest Press', 'Barbell Bench Press']) {
    assert.equal(isVariationOf(machine, ex(name, ['chest'], ['n/a'])), true, name)
  }
})

test('lat pulldown grips are one family', () => {
  const base = ex('Lat Pulldown', ['lats', 'upper_back'], ['vertical_pull'])
  for (const name of ['Close-Grip Lat Pulldown', 'Wide Grip Lat Pulldown', 'Underhand Lat Pulldown', 'Cable Lat Pull Down']) {
    assert.equal(isVariationOf(base, ex(name, ['lats'], ['n/a'])), true, name)
  }
})

test('the untagged-collision bug: two untagged exercises are no longer variations of each other', () => {
  // Both custom, both ['n/a'], both lower_body, both quads — matched before,
  // and a pendulum squat is not a variation of a hip abduction machine.
  const squat = ex('Pendulum Squat Machine', ['quads'], ['n/a'], 'lower_body')
  const abduction = ex('Hip Abduction Machine', ['quads'], ['n/a'], 'lower_body')
  assert.equal(isVariationOf(squat, abduction), false)
  assert.equal(isVariationOf(abduction, squat), false)
})

test('a variant with one extra pattern still lands in its family', () => {
  // Renegade Row is [horizontal_pull, anti_rotation]; the exact-set rule
  // dropped it from the row family. It is still a row.
  const cableRow = ex('Cable Row', ['lats', 'mid_back'], ['horizontal_pull'])
  const renegade = ex('Renegade Row', ['lats', 'mid_back'], ['horizontal_pull', 'anti_rotation'])
  assert.equal(isVariationOf(cableRow, renegade), true)
  assert.equal(isVariationOf(renegade, cableRow), true)
})

test('tags overrule the name: a split squat is a lunge, not a back squat', () => {
  const back = ex('Barbell Back Squat', ['quads'], ['squat'], 'lower_body')
  const split = ex('Bulgarian Split Squat', ['quads', 'glutes'], ['lunge'], 'lower_body')
  assert.equal(isVariationOf(back, split), false)
  assert.equal(isVariationOf(split, back), false)
})

test('the muscle guard is what keeps coarse head nouns safe', () => {
  // "leg curl" and "hammer curl" share the head noun "curl"; only the muscles
  // keep a hamstring curl out of the biceps family.
  const bicepCurl = ex('Hammer Curl', ['biceps', 'brachialis'], ['elbow_flexion'])
  const legCurl = ex('Lying Leg Curl', ['hamstrings'], ['n/a'], 'lower_body')
  assert.equal(isVariationOf(bicepCurl, legCurl), false)

  // Same region, different muscle: a chest press and a shoulder press both
  // reduce to the head noun "press".
  const chestPress = ex('Machine Chest Press', ['chest'], ['n/a'])
  const shoulderPress = ex('Machine Shoulder Press', ['front_delts'], ['n/a'])
  assert.equal(isVariationOf(chestPress, shoulderPress), false)
})

test('body region is required even when muscles and name agree', () => {
  const a = ex('Cable Row', ['lats'], ['horizontal_pull'], 'upper_body')
  const b = ex('Cable Row', ['lats'], ['horizontal_pull'], 'full_body')
  assert.equal(isVariationOf(a, b), false)
})

test('an exercise with no primary muscles matches nothing algorithmically', () => {
  const untagged = ex('Mystery Press', [], ['n/a'])
  const chestPress = ex('Machine Chest Press', ['chest'], ['horizontal_push'])
  assert.equal(isVariationOf(untagged, chestPress), false)
  assert.equal(isVariationOf(chestPress, untagged), false)
})
