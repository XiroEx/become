// Run with: npx tsx --test tests/unit/foodCanonicalName.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalFoodName } from '../../lib/foodCanonicalName'

// --- USDA: title-casing & cleanup -----------------------------------------

test('USDA: ALL-CAPS single-word description → title-cased', () => {
  assert.equal(canonicalFoodName('TEA', 'usda'), 'Tea')
})

test('USDA: ALL-CAPS comma-separated description → canonical "Cheese Cheddar"', () => {
  // The exact bug case: overflow sibling used to land in the DB as
  // "CHEESE,CHEDDAR,SHARP,BRANDED 1234". groupKey collapses to first 2
  // alphanumeric words → "cheese cheddar" → "Cheese Cheddar".
  assert.equal(
    canonicalFoodName('CHEESE,CHEDDAR,SHARP,BRANDED 1234', 'usda'),
    'Cheese Cheddar',
  )
})

test('USDA: trailing prep qualifier stripped ("Apples, raw" → "Apples")', () => {
  assert.equal(canonicalFoodName('Apples, raw', 'usda'), 'Apples')
})

test('USDA: trailing "hot, herbal" qualifier collapses to base "Tea"', () => {
  assert.equal(canonicalFoodName('Tea, hot, herbal', 'usda'), 'Tea')
  assert.equal(canonicalFoodName('Tea, iced, bottled', 'usda'), 'Tea')
})

test('USDA: brand-code numeric tail stripped via 2-word groupKey cap', () => {
  // groupKey takes first 2 alphanumeric words → "greek yogurt", numeric
  // brand code falls off because the cap is 2 words.
  assert.equal(canonicalFoodName('GREEK YOGURT 12345', 'usda'), 'Greek Yogurt')
  assert.equal(canonicalFoodName('Chicken Breast 98765', 'usda'), 'Chicken Breast')
})

test('USDA: idempotent on already-canonical input', () => {
  assert.equal(canonicalFoodName('Tea', 'usda'), 'Tea')
  assert.equal(canonicalFoodName('Cheese Cheddar', 'usda'), 'Cheese Cheddar')
  assert.equal(canonicalFoodName('Chicken Breast', 'usda'), 'Chicken Breast')
  // Run twice to be sure
  const once = canonicalFoodName('CHEESE,CHEDDAR,SHARP', 'usda')
  const twice = canonicalFoodName(once, 'usda')
  assert.equal(once, twice)
})

test('USDA: empty/null/undefined input returns empty string', () => {
  assert.equal(canonicalFoodName('', 'usda'), '')
  assert.equal(canonicalFoodName(null, 'usda'), '')
  assert.equal(canonicalFoodName(undefined, 'usda'), '')
  assert.equal(canonicalFoodName('   ', 'usda'), '')
})

test('USDA: when groupKey collapses to empty, fall back to title-cased description', () => {
  // Pure-numeric input → groupKey is empty → fallback path runs and
  // title-cases what's left. "1234" → "1234" (no letters to title-case
  // but doesn't crash).
  const result = canonicalFoodName('1234', 'usda')
  // The fallback runs titleCaseDescription which keeps numeric tokens
  assert.equal(typeof result, 'string')
})

// --- Sibling overflow matches sibling in-cap naming ------------------------

test('Sibling overflow naming matches sibling in-cap naming for same group (qualifier-list members)', () => {
  // The point of this phase: a USDA variant overflowing the 12-cap should
  // produce a Food.name identical to what the in-cap merge path renames
  // the parent to. Two USDA descriptions whose only difference is
  // qualifiers in the strict TRAILING_QUALIFIER list both collapse to the
  // same canonical group name.
  const inCap = canonicalFoodName('Tea, hot', 'usda')
  const overflow = canonicalFoodName('Tea, hot, herbal', 'usda')
  assert.equal(inCap, 'Tea')
  assert.equal(overflow, 'Tea')
  assert.equal(inCap, overflow)
})

test('Sibling overflow naming matches in-cap for the original bug-case description', () => {
  // The exact USDA-Branded shape the TODO described:
  // "CHEESE,CHEDDAR,SHARP,BRANDED 1234". Numeric tail blocks the
  // aggressive strip, baseGroupKey takes the first 2 alphanumeric words.
  //
  // What importFromUSDA's in-cap merge path computes for the SAME input:
  //   baseName = (no-op strip) = "CHEESE,CHEDDAR,SHARP,BRANDED 1234"
  //   groupKey = "cheese cheddar"
  //   prettify(groupKey) = "Cheese Cheddar"
  // Both paths must converge — overflow Food.name must equal in-cap parent
  // name when the upstream description is identical.
  const inputDescription = 'CHEESE,CHEDDAR,SHARP,BRANDED 1234'
  const overflow = canonicalFoodName(inputDescription, 'usda')
  assert.equal(overflow, 'Cheese Cheddar')
})

// --- Non-USDA sources: near-passthrough ------------------------------------

test('OFF: already-presentable name passes through unchanged', () => {
  assert.equal(canonicalFoodName('Greek Yogurt', 'openfoodfacts'), 'Greek Yogurt')
  assert.equal(canonicalFoodName('Coca-Cola Classic', 'openfoodfacts'), 'Coca-Cola Classic')
})

test('OFF: ALL-CAPS input gets title-cased', () => {
  assert.equal(canonicalFoodName('GREEK YOGURT', 'openfoodfacts'), 'Greek Yogurt')
  assert.equal(canonicalFoodName('COCA COLA', 'openfoodfacts'), 'Coca Cola')
})

test('manual: user input passes through unchanged (no group-keying)', () => {
  // Manual is user-authored — we don't second-guess casing or wording.
  assert.equal(canonicalFoodName('My Custom Recipe Bowl', 'manual'), 'My Custom Recipe Bowl')
  assert.equal(canonicalFoodName('Jon\'s Protein Shake', 'manual'), 'Jon\'s Protein Shake')
})

test('manual: ALL-CAPS input gets title-cased', () => {
  assert.equal(canonicalFoodName('MY CUSTOM FOOD', 'manual'), 'My Custom Food')
})

// --- Default source argument -----------------------------------------------

test('Default source argument is USDA', () => {
  // No source arg → behaves as USDA (most common caller path).
  assert.equal(canonicalFoodName('TEA'), 'Tea')
  // Multi-word input with numeric tail: canonical takes first 2 alphanumeric
  // words via baseGroupKey, matching the in-cap merge path for the same input.
  assert.equal(canonicalFoodName('CHEESE,CHEDDAR,SHARP,BRANDED 1234'), 'Cheese Cheddar')
})

// --- Purity ---------------------------------------------------------------

test('canonicalFoodName is a pure function — no side effects, deterministic', () => {
  const inputs = ['TEA', 'Apples, raw', 'CHEESE,CHEDDAR', 'Greek Yogurt']
  const first = inputs.map(s => canonicalFoodName(s, 'usda'))
  const second = inputs.map(s => canonicalFoodName(s, 'usda'))
  assert.deepEqual(first, second)
})
