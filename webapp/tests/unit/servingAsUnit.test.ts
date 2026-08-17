// Run with: npx tsx --test tests/unit/servingAsUnit.test.ts
//
// The product owner: "I'm having 4 servings of this broccoli. I like that when I
// click the serving, it prefills the input and select as proper grams. But I need
// a better solution for multiple servings than just doing math of 4*85."
//
// So the food's own serving is now a COUNTABLE UNIT rather than a gram shortcut.
// Pick "1 portion (85 g)", the box reads 1 serving, type 4. The maths route is
// deliberate: N servings is expressed as a weight and then falls through the
// ordinary gram/ml paths, so it can never disagree with what the picker previews
// for the same weight — a number and a label describing different amounts is
// exactly the class of bug the 457-calorie protein bar was.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scalingFactor, realServing, nutritionForQuantity } from '../../lib/foodMath'
import { buildServingChoiceGroups, variantForServingChoice } from '../../lib/nutrition/servingOptions'

/** Steam-in-Bag Broccoli Florets, as stored: per 100 g, 85 g portion. */
const BROCCOLI = {
  servingSize: 100,
  servingUnit: 'g' as const,
  displayLabel: '1 portion (85 g)',
  gramsPerServing: 85,
  nutrition: { calories: 35.3, protein: 3.5, carbs: 4.7, fats: 0 },
}

test('the reported case: 4 servings of an 85 g portion is 340 g, no arithmetic', () => {
  const f = scalingFactor(BROCCOLI, 4, 'serving')
  assert.equal(Math.round(f * 100), 340, 'factor is 3.4 of the 100 g basis')
  const n = nutritionForQuantity(BROCCOLI, 4, 'serving')
  assert.equal(Math.round(n.calories), 120, '4 × 30 cal')
})

test('one serving through the serving unit equals one serving through grams', () => {
  const viaServing = scalingFactor(BROCCOLI, 1, 'serving')
  const viaGrams = scalingFactor(BROCCOLI, 85, 'g')
  assert.equal(viaServing, viaGrams, 'the two paths must never disagree')
})

test('the picker offers the primary as {1, serving} with the weight as caption', () => {
  const groups = buildServingChoiceGroups(BROCCOLI)
  const primary = groups.servings.find(c => c.id === 'serving-primary')
  assert.ok(primary)
  assert.equal(primary.unit, 'serving')
  assert.equal(primary.quantity, 1)
  assert.deepEqual(primary.perServing, { quantity: 85, unit: 'g' })
})

test('the effective variant for the choice resolves 4 servings correctly', () => {
  const groups = buildServingChoiceGroups(BROCCOLI)
  const primary = groups.servings.find(c => c.id === 'serving-primary')!
  const eff = variantForServingChoice(BROCCOLI, primary)
  assert.equal(Math.round(scalingFactor(eff, 4, 'serving') * 100), 340)
})

// ── realServing ─────────────────────────────────────────────────────────────

test('realServing prefers the gram bridge', () => {
  assert.deepEqual(realServing(BROCCOLI), { grams: 85 })
})

test('realServing falls back to a mass-native serving size', () => {
  assert.deepEqual(realServing({ servingSize: 30, servingUnit: 'g' as const }), { grams: 30 })
  const oz = realServing({ servingSize: 1, servingUnit: 'oz' as const })
  assert.ok(oz?.grams != null && Math.abs(oz.grams - 28.35) < 0.01, `1 oz ≈ 28.35 g, got ${oz?.grams}`)
})

test('realServing uses the ml bridge for a drink', () => {
  assert.deepEqual(realServing({ servingSize: 100, servingUnit: 'ml' as const, mlPerServing: 330 }), { ml: 330 })
})

test('realServing is null for a discrete food with no bridge', () => {
  assert.equal(realServing({ servingSize: 1, servingUnit: 'each' as const }), null)
})

// ── discrete foods ──────────────────────────────────────────────────────────

test('a discrete food with no weight still counts in servings', () => {
  // "1 bar" with no bridge: one serving IS the variant's own unit.
  const bar = { servingSize: 1, servingUnit: 'each' as const, nutrition: { calories: 200, protein: 10, carbs: 20, fats: 8 } }
  assert.equal(scalingFactor(bar, 3, 'serving'), 3)
  assert.equal(nutritionForQuantity(bar, 3, 'serving').calories, 600)
})

test('a discrete food WITH a bridge counts in servings and converts to grams', () => {
  const bar = { servingSize: 1, servingUnit: 'each' as const, gramsPerServing: 46, nutrition: { calories: 190, protein: 16, carbs: 16, fats: 8 } }
  assert.equal(scalingFactor(bar, 2, 'serving'), 2)
  assert.equal(nutritionForQuantity(bar, 2, 'serving').calories, 380)
})

// ── the ml path ─────────────────────────────────────────────────────────────

test('a volume food counts servings via its ml bridge', () => {
  const drink = { servingSize: 100, servingUnit: 'ml' as const, mlPerServing: 330, nutrition: { calories: 42, protein: 0, carbs: 10.6, fats: 0 } }
  assert.equal(Math.round(scalingFactor(drink, 2, 'serving') * 100), 660)
  assert.equal(Math.round(nutritionForQuantity(drink, 2, 'serving').calories), 277)
})

// ── the sardines rule survives ──────────────────────────────────────────────

test('a stored bridge still beats a rounded label weight', () => {
  // "1 can (3.75 oz)" = 106 g on the label, but nutrition is recorded against
  // the 92 g drained weight the variant stores. Counting one serving must use 92.
  const can = { servingSize: 100, servingUnit: 'g' as const, displayLabel: '1 can (3.75 oz)', gramsPerServing: 92, nutrition: { calories: 191, protein: 22, carbs: 0, fats: 11 } }
  const groups = buildServingChoiceGroups(can)
  const primary = groups.servings.find(c => c.id === 'serving-primary')!
  assert.equal(primary.gramsPerServing, 92)
  assert.equal(Math.round(scalingFactor(variantForServingChoice(can, primary), 1, 'serving') * 100), 92)
})

// ── The shape the food ACTUALLY has ─────────────────────────────────────────

test('the real OFF import shape: portion in alternateServings, displayLabel empty', () => {
  // This is Steam-in-Bag Broccoli Florets exactly as stored. The primary label
  // falls back to a bare "85 g" (suppressed as a duplicate of the g unit), so
  // the alternate is the ONLY servings entry. Gating "countable" on the primary
  // slot alone missed this — the reported food. Ownership is decided by weight:
  // 0.85 × 100 g equals gramsPerServing, so this IS the portion.
  const asStored = {
    servingSize: 100,
    servingUnit: 'g' as const,
    displayLabel: undefined,
    gramsPerServing: 85,
    alternateServings: [{ label: '1 portion (85 g)', multiplier: 0.85 }],
    nutrition: { calories: 35.3, protein: 3.5, carbs: 4.7, fats: 0 },
  }
  const groups = buildServingChoiceGroups(asStored)
  assert.equal(groups.servings.length, 1)
  const portion = groups.servings[0]
  assert.equal(portion.label, '1 portion (85 g)')
  assert.equal(portion.unit, 'serving')
  assert.equal(portion.quantity, 1)
  assert.deepEqual(portion.perServing, { quantity: 85, unit: 'g' })
  const eff = variantForServingChoice(asStored, portion)
  assert.equal(Math.round(nutritionForQuantity(eff, 4, 'serving').calories), 120)
})

test('an alternate that is NOT the own portion stays a measurable shortcut', () => {
  // "2 bars (90 g)" is a different amount from the 45 g bar the food is
  // recorded against. Counting it in 'serving' units would silently mean the
  // wrong thing, so it keeps filling the box with 90 g.
  const bar = {
    servingSize: 100,
    servingUnit: 'g' as const,
    displayLabel: '1 bar (45 g)',
    gramsPerServing: 45,
    alternateServings: [{ label: '2 bars (90 g)', multiplier: 0.9 }],
    nutrition: { calories: 200, protein: 1, carbs: 1, fats: 1 },
  }
  const groups = buildServingChoiceGroups(bar)
  const two = groups.servings.find(c => c.label === '2 bars (90 g)')
  assert.ok(two)
  assert.equal(two.unit, 'g')
  assert.equal(two.quantity, 90)
})
