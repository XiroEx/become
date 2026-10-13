// Run with: npm run test:file tests/unit/foodSearchFilters.test.ts
//
// The filter row in the food search sheet. Four rules, all of them things the
// row got wrong:
//
//   - no "All" chip; nothing selected IS the default
//   - Foods leads, then Meals
//   - Verified only exists once there is a query to narrow
//   - tapping the active chip clears it

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(process.cwd(), 'components/nutrition/FoodSearchModal.tsx'), 'utf8')

test('there is no "All" chip', () => {
  // 'all' survives as the default STATE; what goes is the redundant chip.
  assert.doesNotMatch(src, /\{ id: 'all', label: 'All'/)
  assert.match(src, /useState<TabId>\('all'\)/, "'all' should remain the default state")
})

test('Foods comes before Meals', () => {
  const foods = src.indexOf("{ id: 'mine', label: 'Foods'")
  const meals = src.indexOf("{ id: 'meals', label: 'Meals'")
  assert.ok(foods > 0 && meals > 0, 'both chips must exist')
  assert.ok(foods < meals, 'Foods must be declared before Meals')
})

test('Verified is gated on there being a query', () => {
  assert.match(src, /\{query\.trim\(\)\.length > 0 && \(\s*<button\s+onClick=\{\(\) => setVerifiedOnly/)
})

test('clearing the query releases the verified filter', () => {
  // Hiding a control that is still ON would narrow results with nothing on
  // screen to explain why.
  assert.match(src, /if \(query\.trim\(\)\.length === 0 && verifiedOnly\) setVerifiedOnly\(false\)/)
})

test('tapping the active chip returns to the default', () => {
  // With no "All" chip, a filter you cannot switch off is a trap.
  assert.match(src, /setActiveTab\(prev => \(prev === tab\.id \? 'all' : tab\.id\)\)/)
})
