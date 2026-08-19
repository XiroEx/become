// Run with: npx tsx --test tests/unit/servingLabelDrift.test.ts
//
// The reported bug, verbatim: logged 95 g of chicken breast, the food's own
// serving is "3 oz (85 g)" (a stored USDA-style displayLabel), and the item's
// friendly label was seeded from that default label at food-selection time
// and never re-checked against the amount the member actually typed. Saving
// wrote servingLabel: "3 oz (85 g)" alongside the correct loggedQuantity: 95,
// loggedUnit: 'g' — nutrition (computed from `selection`, not the label) came
// out right, but the label the member saw afterward described a different
// amount than what they logged.
//
// Fix: track the picker's first ("baseline") emission per variant — the
// default 1-serving amount the seeded label describes — and clear the draft
// the moment a later selection diverges from it, unless the member typed
// their own label by hand.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectionDivergedFromBaseline } from '../../components/nutrition/FoodSearchModal'

test('selectionDivergedFromBaseline: no baseline yet (first emission) never counts as diverged', () => {
  assert.equal(selectionDivergedFromBaseline(null, { quantity: 95, unit: 'g' }), false)
})

test('selectionDivergedFromBaseline: same amount as the seeded default is not diverged', () => {
  const baseline = { quantity: 85, unit: 'g' }
  assert.equal(selectionDivergedFromBaseline(baseline, { quantity: 85, unit: 'g' }), false)
})

test('selectionDivergedFromBaseline: floating-point noise within epsilon is not diverged', () => {
  const baseline = { quantity: 85, unit: 'g' }
  assert.equal(selectionDivergedFromBaseline(baseline, { quantity: 85.0001, unit: 'g' }), false)
})

test('selectionDivergedFromBaseline: the reported bug — 95 g typed against an 85 g default IS diverged', () => {
  // Chicken breast: displayLabel "3 oz (85 g)", i.e. baseline = 85 g. The
  // member typed 95 g — the seeded label no longer describes that amount.
  const baseline = { quantity: 85, unit: 'g' }
  assert.equal(selectionDivergedFromBaseline(baseline, { quantity: 95, unit: 'g' }), true)
})

test('selectionDivergedFromBaseline: a unit change alone counts as diverged even at the same number', () => {
  const baseline = { quantity: 3, unit: 'oz' }
  assert.equal(selectionDivergedFromBaseline(baseline, { quantity: 3, unit: 'g' }), true)
})
