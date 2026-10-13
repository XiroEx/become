// Run with: npm run test:file tests/unit/exerciseAbbreviations.test.ts
//
// Card: "Exercise do not exist in our data base." Jon: "Some exercises already
// exist but are for different names. There needs to be some type of fitness
// intelligence. For example if I type in RDL I should get that or it should
// know that I'm talking about Romanian deadlift."

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXERCISE_ABBREVIATIONS,
  expandAbbreviations,
  expandQueryVariants,
  hasAbbreviation,
} from '../../lib/exerciseAbbreviations'

test('RDL expands to the words the catalog spells it with', () => {
  assert.deepEqual(expandAbbreviations(['rdl']), ['romanian', 'deadlift'])
})

test('shorthand expands in place, leaving the rest of the name alone', () => {
  assert.deepEqual(expandAbbreviations(['db', 'hammer', 'curl']), ['dumbbell', 'hammer', 'curl'])
  assert.deepEqual(expandAbbreviations(['seated', 'kb', 'press']), ['seated', 'kettlebell', 'press'])
})

test('a token with no entry is returned untouched', () => {
  assert.deepEqual(expandAbbreviations(['barbell', 'back', 'squat']), ['barbell', 'back', 'squat'])
})

test('expandQueryVariants keeps the literal query first', () => {
  assert.deepEqual(expandQueryVariants('rdl'), ['rdl', 'romanian deadlift'])
  assert.deepEqual(expandQueryVariants('DB Curl'), ['db curl', 'dumbbell curl'])
})

test('a query with no shorthand yields exactly one variant — no wasted regex', () => {
  assert.deepEqual(expandQueryVariants('romanian deadlift'), ['romanian deadlift'])
  assert.deepEqual(expandQueryVariants('  Bench Press '), ['bench press'])
})

test('an empty query yields no variants at all', () => {
  assert.deepEqual(expandQueryVariants('   '), [])
})

test('punctuation does not hide an abbreviation', () => {
  assert.deepEqual(expandQueryVariants('single-leg rdl'), ['single-leg rdl', 'single leg romanian deadlift'])
})

test('hasAbbreviation reports what expandAbbreviations would change', () => {
  assert.equal(hasAbbreviation(['db', 'row']), true)
  assert.equal(hasAbbreviation(['dumbbell', 'row']), false)
})

// ─── the rule that keeps this table safe ──────────────────────────────────

test('no entry expands to itself, and none is ambiguous gym shorthand', () => {
  for (const [key, expansion] of Object.entries(EXERCISE_ABBREVIATIONS)) {
    assert.ok(expansion.length > 0, `${key} expands to nothing`)
    assert.notDeepEqual(expansion, [key], `${key} expands to itself`)
    assert.equal(key, key.toLowerCase(), `${key} is not lowercase`)
    assert.ok(!key.includes(' '), `${key} is not a single token`)
  }
  // "PU" is push-up AND pull-up; "GM" is good morning and not much else.
  // Either would resolve a program entry onto the wrong exercise silently,
  // which is worse than not resolving it — see the file header.
  assert.equal('pu' in EXERCISE_ABBREVIATIONS, false)
  assert.equal('gm' in EXERCISE_ABBREVIATIONS, false)
})

test('expansion is idempotent — running it twice changes nothing', () => {
  for (const key of Object.keys(EXERCISE_ABBREVIATIONS)) {
    const once = expandAbbreviations([key])
    assert.deepEqual(expandAbbreviations(once), once, `${key} expands to more shorthand`)
  }
})
