// Run with: npm run test:file tests/unit/nutrition/mealItemToRecipeIngredient.test.ts
//
// REGRESSION (Android full pass, build 24f4e34d): POST /api/meals/[id]/to-recipe
// turned "1 × 3oz" into "1 oz" and "1.5 × 100g" into "1.5 g" — the serving
// SIZE silently vanished, leaving only the scaling factor against the base
// unit. See `lib/nutrition/mealItemToRecipeIngredient.ts` for the fix.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mealItemToRecipeIngredientAmount } from '../../../lib/nutrition/mealItemToRecipeIngredient'

test('THE BUG, fixed: "1 × 3oz" (servings 1, servingSize 3, servingUnit oz) is "3 oz", not "1 oz"', () => {
  assert.deepEqual(
    mealItemToRecipeIngredientAmount({ servings: 1, servingSize: 3, servingUnit: 'oz' }),
    { amount: 3, unit: 'oz' },
  )
})

test('THE BUG, fixed: "1.5 × 100g" (servings 1.5, servingSize 100, servingUnit g) is "150 g", not "1.5 g"', () => {
  assert.deepEqual(
    mealItemToRecipeIngredientAmount({ servings: 1.5, servingSize: 100, servingUnit: 'g' }),
    { amount: 150, unit: 'g' },
  )
})

test('loggedQuantity/loggedUnit — what the member actually typed — wins when present', () => {
  // Provenance disagrees slightly with the raw multiply (rounding, a unit
  // the picker converted); the member's own entry is shown, not the derived one.
  assert.deepEqual(
    mealItemToRecipeIngredientAmount({
      servings: 1,
      servingSize: 3,
      servingUnit: 'oz',
      loggedQuantity: 3,
      loggedUnit: 'oz',
    }),
    { amount: 3, unit: 'oz' },
  )
})

test('loggedUnit absent falls back to servingUnit even with loggedQuantity present', () => {
  assert.deepEqual(
    mealItemToRecipeIngredientAmount({ servingUnit: 'cup', loggedQuantity: 2 }),
    { amount: 2, unit: 'cup' },
  )
})

test('a legacy row with no provenance and no servingSize still works (defaults to 1× the unit)', () => {
  assert.deepEqual(
    mealItemToRecipeIngredientAmount({ servings: 2, servingUnit: 'serving' }),
    { amount: 2, unit: 'serving' },
  )
})

test('a wholly empty item falls back to 1 serving, never throwing', () => {
  assert.deepEqual(mealItemToRecipeIngredientAmount({}), { amount: 1, unit: 'serving' })
})

test('a zero or negative loggedQuantity is ignored in favour of the servings × servingSize fallback', () => {
  assert.deepEqual(
    mealItemToRecipeIngredientAmount({
      servings: 1,
      servingSize: 3,
      servingUnit: 'oz',
      loggedQuantity: 0,
    }),
    { amount: 3, unit: 'oz' },
  )
  assert.deepEqual(
    mealItemToRecipeIngredientAmount({
      servings: 1,
      servingSize: 3,
      servingUnit: 'oz',
      loggedQuantity: -5,
    }),
    { amount: 3, unit: 'oz' },
  )
})

test('fractional totals round to one decimal place, like the rest of this route', () => {
  assert.deepEqual(
    mealItemToRecipeIngredientAmount({ servings: 1 / 3, servingSize: 1, servingUnit: 'cup' }),
    { amount: 0.3, unit: 'cup' },
  )
})
