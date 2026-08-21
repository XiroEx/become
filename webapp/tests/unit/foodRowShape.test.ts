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
import { rowCalories, preferredServingLabel, defaultServingChoice } from '../../components/nutrition/FoodSearchModal'
import { servingChoiceDisplayLabel } from '../../lib/nutrition/servingOptions'

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
  // The guard used to be a literal `food.nutrition?.calories` inside
  // rowCalories; it now goes through the same builder + math the expanded
  // picker uses (buildServingChoiceGroups / nutritionForQuantity), which
  // throws on a malformed variant — rowCalories must swallow that, not the
  // sheet.
  assert.equal(rowCalories({} as any), 0)
  assert.equal(rowCalories({ nutrition: null } as any), 0)
  assert.equal(rowCalories({ nutrition: { calories: undefined } } as any), 0)
})

test('the row number describes the row label for an Open Food Facts import', () => {
  // The reported row read "1 portion (46 g)  ·  457 cal". OFF stores per 100 g
  // and never sets gramsPerServing, carrying the real serving in
  // alternateServings[0].multiplier instead.
  const food = {
    servingSize: 100,
    servingUnit: 'g',
    displayLabel: '1 portion (46 g)',
    alternateServings: [{ label: '1 portion (46 g)', multiplier: 0.46 }],
    nutrition: { calories: 457, protein: 34.8, carbs: 0, fats: 0 },
  } as any
  assert.equal(preferredServingLabel(food), '1 portion (46 g)')
  assert.equal(rowCalories(food), 210)
})

test('never the arbitrary 100 g when a real serving exists', () => {
  // Reported bug: a food whose displayLabel is just a bare echo of the
  // per-100g storage basis ("100 g") used to win outright over a real
  // alternate serving ("1 package") the food also carries — the row showed
  // "100 g" next to calories that actually reflected the package. Now the
  // row must skip the placeholder exactly like the picker's own default does.
  const food = {
    servingSize: 100,
    servingUnit: 'g',
    displayLabel: '100 g',
    alternateServings: [{ label: '1 package', multiplier: 2.5 }],
    nutrition: { calories: 193, protein: 4, carbs: 40, fats: 1 },
  } as any
  assert.equal(preferredServingLabel(food), '1 package')
  assert.equal(rowCalories(food), 483) // 193 * 2.5, rounded
})

test('the row default and the picker default are the exact same choice', () => {
  // "Whatever the default shown on the unexpanded card should be the default
  // selected on the expanded card." The picker's own inline default is
  // `buildServingChoiceGroups(variant).servings[0]` (see QuantityPicker.tsx);
  // the row must resolve to that identical choice, not a parallel guess.
  const food = {
    servingSize: 100,
    servingUnit: 'g',
    alternateServings: [
      { label: '1 serving', multiplier: 0.5 },
      { label: '1 package', multiplier: 2.5 },
    ],
    nutrition: { calories: 200, protein: 10, carbs: 20, fats: 5 },
  } as any
  const pickerDefault = defaultServingChoice(food)
  assert.equal(preferredServingLabel(food), servingChoiceDisplayLabel(pickerDefault))
  assert.equal(pickerDefault.label, '1 serving')
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
