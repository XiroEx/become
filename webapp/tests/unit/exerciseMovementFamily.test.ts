// Run with: npm run test:file tests/unit/exerciseMovementFamily.test.ts
//
// The fitness lexicon behind the variation matcher (lib/exerciseMovementFamily.ts).
//
// The card: "if I type in chest press, a list of ... machine chest press,
// dumbbell chest press, plate loaded chest press". Those are one movement in
// three setups, and the app had no way to know that unless an admin linked
// them by hand — the question the card ends on ("or do I have to do them in
// the admin portal"). These tests pin the knowledge that answers "no": the
// qualifiers a lifter ignores, the plurals members type, the synonyms that
// name one lift two ways, and — just as important — the pairs that must NOT
// collapse together.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { movementFamilyKey, sharesMovementFamily } from '../../lib/exerciseMovementFamily'

// ─── The card's own example, verbatim ───────────────────────────────────────

test('every chest-press setup Jon named reduces to one family key', () => {
  const names = [
    'Machine Chest Press',
    'Dumbbell Chest Press',
    'Plate-Loaded Chest Press',
    'Hammer Strength Chest Press',
    'Smith Machine Chest Press',
    'Barbell Bench Press',
    'Incline Dumbbell Bench Press',
    'Single Arm Machine Chest Press',
    '5,5,5 Machine Chest Press', // a real custom from the card's screenshot
  ]
  for (const name of names) {
    assert.equal(movementFamilyKey(name), 'chest press', `${name} should key as "chest press"`)
  }
})

test('every lat-pulldown grip Jon named reduces to one family key', () => {
  // "machine lat pulled down, cable lap pull down, close grip ..., wide grip
  // ..., underhanded grip ..." — including the "lateral pulldown" spelling
  // he used, which is the mishearing everyone makes.
  const names = [
    'Lat Pulldown',
    'Lat Pull Down',
    'Lateral Pulldown',
    'Machine Lat Pulldown',
    'Cable Lat Pulldown',
    'Close-Grip Lat Pulldown',
    'Wide Grip Lat Pulldown',
    'Underhand Lat Pulldown',
    'Neutral Grip Lat Pull Downs',
  ]
  for (const name of names) {
    assert.equal(movementFamilyKey(name), 'lat pulldown', `${name} should key as "lat pulldown"`)
  }
})

// ─── Qualifier stripping ────────────────────────────────────────────────────

test('equipment is a qualifier, not part of the movement', () => {
  assert.equal(movementFamilyKey('Barbell Curl'), 'curl')
  assert.equal(movementFamilyKey('Dumbbell Curl'), 'curl')
  assert.equal(movementFamilyKey('Cable Curl'), 'curl')
  assert.equal(movementFamilyKey('EZ-Bar Curl'), 'curl')
})

test('stance, angle and laterality are qualifiers', () => {
  assert.equal(movementFamilyKey('Seated Calf Raise'), 'calf raise')
  assert.equal(movementFamilyKey('Standing Calf Raise'), 'calf raise')
  assert.equal(movementFamilyKey('Single Leg Standing Calf Raise'), 'calf raise')
  assert.equal(movementFamilyKey('Lying Leg Curl'), 'leg curl')
  assert.equal(movementFamilyKey('Seated Leg Curl'), 'leg curl')
})

test('rep-scheme and tempo noise in a name is dropped', () => {
  // Members name customs like this constantly.
  assert.equal(movementFamilyKey('5,5,5 Machine Chest Press'), 'chest press')
  assert.equal(movementFamilyKey('21s Barbell Curl'), 'curl')
  assert.equal(movementFamilyKey('3x10 Dumbbell Row'), 'row')
})

test('a name made only of qualifiers still yields a key rather than nothing', () => {
  // "Machine Fly" is all-qualifier except the movement; stripping must not
  // leave an empty key, which would match everything or nothing at random.
  assert.equal(movementFamilyKey('Machine Fly'), 'fly')
  assert.notEqual(movementFamilyKey('Dumbbell'), '')
})

// ─── Plurals ────────────────────────────────────────────────────────────────

test('plurals fold to the singular — members type "Leg Raises", not "Leg Raise"', () => {
  assert.equal(movementFamilyKey('Weighted Leg Raises'), 'leg raise')
  assert.equal(movementFamilyKey('Crunches'), 'crunch')
  assert.equal(movementFamilyKey('Dumbbell Flies'), 'fly')
  assert.equal(movementFamilyKey('Chest Presses'), 'chest press')
  assert.equal(movementFamilyKey('Barbell Rows'), 'row')
  assert.equal(movementFamilyKey('Weighted Dips'), 'dip')
})

test('a word that merely ends in "s" is not mangled', () => {
  // The bug this pins: a naive "-es" rule turned "raises" into "rais", which
  // silently orphaned every plural leg-raise custom.
  assert.equal(movementFamilyKey('Leg Raises'), 'leg raise')
  assert.equal(movementFamilyKey('Leg Press'), 'leg press')
  assert.equal(movementFamilyKey('Machine Press'), 'press')
})

// ─── Synonyms ───────────────────────────────────────────────────────────────

test('one lift with two common names keys the same', () => {
  assert.equal(movementFamilyKey('Barbell Bench Press'), movementFamilyKey('Machine Chest Press'))
  assert.equal(movementFamilyKey('Overhead Press'), movementFamilyKey('Machine Shoulder Press'))
  assert.equal(movementFamilyKey('Single-Leg RDL'), movementFamilyKey('Romanian Deadlift'))
  assert.equal(movementFamilyKey('Hamstring Curl'), movementFamilyKey('Lying Leg Curl'))
  assert.equal(movementFamilyKey('Chin-Up'), movementFamilyKey('Pull-Up'))
})

// ─── The head-noun rule ─────────────────────────────────────────────────────

test('a more specific name joins the movement it ends in', () => {
  assert.equal(sharesMovementFamily('Cable Row', 'Renegade Row'), true)
  assert.equal(sharesMovementFamily('Front Squat', 'Goblet Squat'), true)
  assert.equal(sharesMovementFamily('Deadlift', 'Trap Bar Deadlift'), true)
  assert.equal(sharesMovementFamily('Lat Pulldown', 'Diagonal Cable Pulldown'), true)
  assert.equal(sharesMovementFamily('Crunch', 'Bicycle Crunch'), true)
})

test('the relation is symmetric — which exercise you search from cannot matter', () => {
  const pairs: [string, string][] = [
    ['Machine Chest Press', 'Dumbbell Chest Press'],
    ['Cable Row', 'Renegade Row'],
    ['Hammer Curl', 'Barbell Curl'],
    ['Leg Raise', 'Hanging Knee Raise'],
  ]
  for (const [a, b] of pairs) {
    assert.equal(sharesMovementFamily(a, b), sharesMovementFamily(b, a), `${a} / ${b}`)
  }
})

test('an unrecognized head noun never collapses a name', () => {
  // "Skull Crusher" must not become "crusher" and start collecting things.
  assert.equal(sharesMovementFamily('Skull Crusher', 'Barbell Curl'), false)
  assert.equal(sharesMovementFamily('Wall Sit', 'Bodyweight Squat'), false)
})

// ─── What must NOT match ────────────────────────────────────────────────────
//
// These are the pairs the coarse head-noun rule WOULD merge on name alone.
// sharesMovementFamily is documented as never sufficient by itself, so the
// ones that share a head noun are expected to return true here and are
// rejected downstream by the muscle/region guard — isVariationOf covers that
// in tests/unit/exerciseVariationMatch.test.ts. What matters here is that
// genuinely different MOVEMENTS don't collide.

test('different movements do not share a family, however similar the words', () => {
  assert.equal(sharesMovementFamily('Barbell Back Squat', 'Squat Jump'), false)
  assert.equal(sharesMovementFamily('Cable Chest Fly', 'Cable Row'), false)
  assert.equal(sharesMovementFamily('Glute Bridge', 'Hip Thrust'), false)
  assert.equal(sharesMovementFamily('Hip Abduction Machine', 'Hip Adduction Machine'), false)
  assert.equal(sharesMovementFamily('Plank', 'Side Plank'), false, 'no head noun, and the keys differ')
  assert.equal(sharesMovementFamily('Face Pull', 'Lat Pulldown'), false)
})

test('an empty or punctuation-only name never matches anything', () => {
  assert.equal(sharesMovementFamily('', 'Barbell Curl'), false)
  assert.equal(sharesMovementFamily('---', 'Barbell Curl'), false)
  assert.equal(movementFamilyKey(''), '')
})
