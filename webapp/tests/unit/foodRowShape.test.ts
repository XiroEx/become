// Run with: npx tsx --test tests/unit/foodRowShape.test.ts
//
// Every endpoint that feeds the search sheet must return the FLATTENED row shape.
//
// A raw Food doc keeps nutrition on its default variant; the row renderer reads
// it from the top level. Returning a raw doc made `food.nutrition.calories`
// throw, which unmounted the sheet and showed "This page couldn't load".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { displayServingCalories } from '../../lib/nutrition/rowServing'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

test('the overview flattens every food row it returns', () => {
  const src = read('app/api/nutrition/foods/overview/route.ts')
  assert.match(src, /import \{ flattenFoodForResponse \}/)
  // Exactly three sections return Food docs — foods, recent and frequent. Meals
  // are a different model and the recent fallback row is built by hand.
  assert.equal((src.match(/flattenFoodForResponse\(/g) ?? []).length, 3,
    'foods, recent and frequent must each flatten their Food docs')
})

test('a row without nutrition costs one row, not the page', () => {
  // Asserted as BEHAVIOUR rather than as a source string. The guard used to be a
  // literal `food.nutrition?.calories` inside rowCalories; it now lives in the
  // shared row-serving helper, and a test pinned to the old spelling failed on a
  // refactor that kept the guarantee perfectly intact.
  assert.equal(displayServingCalories({}), 0)
  assert.equal(displayServingCalories({ nutrition: null }), 0)
  assert.equal(displayServingCalories({ nutrition: { calories: undefined } }), 0)
  // And the row must actually go through it.
  const src = read('components/nutrition/FoodSearchModal.tsx')
  assert.match(src, /displayServingCalories\(food\)/,
    'rowCalories must delegate to the shared helper')
})

test('the row number describes the row label for an Open Food Facts import', () => {
  // The reported row read "1 portion (46 g)  ·  457 cal". OFF stores per 100 g
  // and never sets gramsPerServing, carrying the real serving in
  // alternateServings[0].multiplier instead — the one signal the old scaler did
  // not read.
  assert.equal(Math.round(displayServingCalories({
    servingSize: 100,
    servingUnit: 'g',
    displayLabel: '1 portion (46 g)',
    alternateServings: [{ label: '1 portion (46 g)', multiplier: 0.46 }],
    nutrition: { calories: 457 },
  })), 210)
})

test('the empty state knows about the overview', () => {
  // `results` is empty while the overview renders from its own list. Gating the
  // empty state on `results` alone blanked the entire default view.
  const src = read('components/nutrition/FoodSearchModal.tsx')
  assert.match(src, /showOverview \? overviewRows\.rows\.length === 0 && mealResults\.length === 0 : results\.length === 0/)
})

test('loading and "nothing to search" are distinguished', () => {
  // Behaviour, not spelling: the gate itself moved into a shared helper and a
  // test pinned to its old inline expression failed on a refactor that kept the
  // guarantee exactly. What matters is that the component still separates
  // "overview should be on screen" from "overview data has arrived".
  const src = read('components/nutrition/FoodSearchModal.tsx')
  assert.match(src, /shouldShowOverview\(/, 'gate must come from the shared helper')
  assert.match(src, /showOverviewPending && overviewLoading/)
  assert.match(src, /const showOverview = showOverviewPending && !!overview/)
})
