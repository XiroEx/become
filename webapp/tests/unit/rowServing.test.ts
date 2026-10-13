// Run with: npm run test:file tests/unit/rowServing.test.ts
//
// The reported row, verbatim:
//
//   Fit Crunch Mint Chocolate Chip Bar            457 cal
//   Fit Crunch · 1 portion (46 g)
//
// 46 g and 457 cal on the same line. Expanding it showed 210 cal, which is the
// truth. The label came from one signal and the calories from another.
//
// Root cause: the Open Food Facts mapper stores nutrition per 100 g and puts the
// real serving in alternateServings[0].multiplier — it NEVER sets
// gramsPerServing. The row scaler only understood the gram/ml bridge, so every
// OFF result printed per-100 g calories beside a much smaller portion.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayServingScale, displayServingCalories } from '../../lib/nutrition/rowServing'

/** Exactly what app/api/nutrition/foods/route.ts emits for this product. */
const OFF_FITCRUNCH = {
  servingSize: 100,
  servingUnit: 'g',
  displayLabel: '1 portion (46 g)',
  alternateServings: [{ label: '1 portion (46 g)', multiplier: 0.46 }],
  nutrition: { calories: 457, protein: 34.8 },
  // gramsPerServing deliberately absent — the OFF mapper never sets it.
}

test('the reported row: an OFF import scales to its stated portion', () => {
  assert.equal(displayServingScale(OFF_FITCRUNCH), 0.46)
  assert.equal(Math.round(displayServingCalories(OFF_FITCRUNCH)), 210,
    'the expanded picker says 210; the row must agree')
})

test('a gram bridge still wins, so catalogue foods are unchanged', () => {
  const ours = {
    servingSize: 100, servingUnit: 'g', gramsPerServing: 46,
    nutrition: { calories: 413 },
  }
  assert.equal(displayServingScale(ours), 0.46)
  assert.equal(Math.round(displayServingCalories(ours)), 190)
})

test('a bridge outranks an alternate serving when both are present', () => {
  const both = {
    servingSize: 100, servingUnit: 'g', gramsPerServing: 30,
    alternateServings: [{ label: '1 bar', multiplier: 0.9 }],
    nutrition: { calories: 400 },
  }
  assert.equal(displayServingScale(both), 0.3, 'explicit grams beat a multiplier')
})

test('an ml bridge works the same way', () => {
  const drink = {
    servingSize: 100, servingUnit: 'ml', mlPerServing: 330,
    nutrition: { calories: 42 },
  }
  assert.equal(Math.round(displayServingCalories(drink)), 139)
})

test('a food already stored per serving is left alone', () => {
  const perServing = { servingSize: 1, servingUnit: 'bar', nutrition: { calories: 190 } }
  assert.equal(displayServingScale(perServing), 1)
  assert.equal(displayServingCalories(perServing), 190)
})

test('an alternate serving equal to the whole basis does not rescale', () => {
  const noop = {
    servingSize: 100, servingUnit: 'g',
    alternateServings: [{ label: '100 g', multiplier: 1 }],
    nutrition: { calories: 250 },
  }
  assert.equal(displayServingScale(noop), 1)
})

test('the 2 L bottle case still scales UP, keeping the bulk penalty honest', () => {
  // This is what the search-ranking penalty exists to demote; it must still see
  // the real 2 L figure rather than the per-100 ml one.
  const bottle = {
    servingSize: 100, servingUnit: 'ml',
    alternateServings: [{ label: '2 L', multiplier: 20 }],
    nutrition: { calories: 42 },
  }
  assert.equal(displayServingScale(bottle), 20)
  assert.equal(displayServingCalories(bottle), 840)
})

test('garbage rows degrade to a sane number instead of NaN', () => {
  assert.equal(displayServingCalories({}), 0)
  assert.equal(displayServingCalories({ nutrition: {} }), 0)
  assert.equal(displayServingScale({ servingSize: 0, servingUnit: 'g' }), 1)
  assert.equal(displayServingScale({
    servingSize: 100, servingUnit: 'g',
    alternateServings: [{ label: 'x', multiplier: NaN }],
  }), 1)
  assert.equal(displayServingScale({
    servingSize: 100, servingUnit: 'g', alternateServings: [null],
  }), 1)
})

test('a negative or zero multiplier is ignored rather than zeroing the row', () => {
  for (const bad of [0, -1]) {
    assert.equal(displayServingScale({
      servingSize: 100, servingUnit: 'g',
      alternateServings: [{ label: 'x', multiplier: bad }],
      nutrition: { calories: 100 },
    }), 1, `multiplier ${bad} should be ignored`)
  }
})
