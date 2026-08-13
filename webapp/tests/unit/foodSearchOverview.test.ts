// Run with: npx tsx --test tests/unit/foodSearchOverview.test.ts
//
// The empty-box landing view. It used to dump the member's entire saved-foods
// list under a "FOODS" banner — byte for byte the Foods filter, minus the
// banner and with a trash icon instead of a bookmark. Two views, one result set,
// and three of the four chips unexplained until you tapped them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const api = read('app/api/nutrition/foods/overview/route.ts')
const ui = read('components/nutrition/FoodSearchModal.tsx')

test('each section is capped at five', () => {
  assert.match(api, /const PER_SECTION = 5/)
  assert.equal((api.match(/slice\(0, PER_SECTION\)/g) ?? []).length, 3,
    'foods, meals and frequent are all sliced; recent is capped as it is built')
  assert.match(api, /recentItems\.length < PER_SECTION/)
})

test('foods and meals are ordered by what was LOGGED, not by saved-order', () => {
  // Saved-order answers "what did I bookmark last", which is rarely what someone
  // opening a food search wants — the thing they ate this morning is.
  assert.match(api, /lastLoggedFood/)
  assert.match(api, /lastLoggedMeal/)
  // usageCount / savedAt survive only as tiebreakers.
  assert.match(api, /if \(la !== lb\) return lb - la/)
})

test('the default view no longer renders the saved-foods list', () => {
  assert.doesNotMatch(ui, /if \(activeTab === 'all'\) \{\s*fetchResults\('', 'mine', verifiedOnly\)/)
  assert.match(ui, /if \(activeTab === 'all'\) \{\s*fetchOverview\(\)/)
})

test('a food may appear in more than one section', () => {
  // A saved food eaten this morning is both a Food and Recent — showing it twice
  // is the point, so the row key has to carry the index or React collapses them.
  assert.match(ui, /key=\{showOverview \? `\$\{food\._id\}-\$\{idx\}` : food\._id\}/)
})

test('the search-time saved/other split is suppressed in the overview', () => {
  // That split is a SEARCH distinction; left on, it would double up on the
  // overview's own section headers.
  assert.match(ui, /const showMyFoodsHeader =\s*\n\s*!showOverview &&/)
})

test('meals reuse the existing Meals section rather than a fourth row renderer', () => {
  assert.match(ui, /setMealResults\(next\.meals\)/)
  assert.match(ui, /query\.trim\(\)\.length >= 2 \|\| showOverview/)
})
