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
  const src = read('components/nutrition/FoodSearchModal.tsx')
  assert.match(src, /food\.nutrition\?\.calories/,
    'rowCalories must not dereference nutrition unguarded')
})

test('the empty state knows about the overview', () => {
  // `results` is empty while the overview renders from its own list. Gating the
  // empty state on `results` alone blanked the entire default view.
  const src = read('components/nutrition/FoodSearchModal.tsx')
  assert.match(src, /showOverview \? overviewRows\.rows\.length === 0 && mealResults\.length === 0 : results\.length === 0/)
})

test('loading and "nothing to search" are distinguished', () => {
  const src = read('components/nutrition/FoodSearchModal.tsx')
  assert.match(src, /const showOverviewPending = activeTab === 'all' && query\.trim\(\)\.length < 2/)
  assert.match(src, /showOverviewPending && overviewLoading/)
})
