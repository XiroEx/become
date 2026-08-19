// Run with: npx tsx --test tests/unit/measurableServingLabel.test.tsx
//
// The reported bug, verbatim: a food whose own serving is "3/4 cup" shows
// "1 cup" in the serving picker — the countable-serving collapse (see
// servingAsUnit.test.ts) reduces the choice to quantity 1 and, downstream,
// the UI showed just the label's bare noun ("cup") next to that "1". Fix:
// when a countable 'serving' choice's own label has no real descriptive noun
// (servingOptions.ts: `measurableAsServing`), show the generic word
// "serving" instead — in both the dropdown list AND the closed/selected
// state — rather than a bare unit word that reads as a literal amount.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import QuantityPicker from '../../components/nutrition/QuantityPicker'
import ServingQuantityControls from '../../components/nutrition/ServingQuantityControls'

const FRACTIONAL_CUP_VARIANT = {
  servingSize: 0.75,
  servingUnit: 'cup' as const,
  displayLabel: '3/4 cup',
  gramsPerServing: 180,
  nutrition: { calories: 150, protein: 5, carbs: 20, fats: 5 },
}

const PORTION_VARIANT = {
  servingSize: 100,
  servingUnit: 'g' as const,
  displayLabel: '1 portion (85 g)',
  gramsPerServing: 85,
  nutrition: { calories: 35, protein: 3.5, carbs: 4.7, fats: 0 },
}

test('QuantityPicker (inline layout): a fractional-cup serving shows "serving", never the bare "cup" noun', () => {
  const html = renderToStaticMarkup(
    <QuantityPicker variant={FRACTIONAL_CUP_VARIANT} onChange={() => {}} layout="inline" />,
  )
  // The closed unit button must read the generic word, not the stripped noun
  // that used to read "1 cup" for a food whose real serving is 3/4 cup.
  assert.match(html, />serving</)
  assert.doesNotMatch(html, />cup</, 'must not show the bare unit word as if it were the whole serving name')
})

test('QuantityPicker (inline layout): a discrete portion serving keeps its own noun', () => {
  const html = renderToStaticMarkup(
    <QuantityPicker variant={PORTION_VARIANT} onChange={() => {}} layout="inline" />,
  )
  assert.match(html, />portion</, '"portion" is a real noun and must still be shown')
})

test('ServingQuantityControls: the Servings optgroup shows "serving" for a fractional-cup choice, not "3/4 cup"', () => {
  const html = renderToStaticMarkup(
    <ServingQuantityControls
      variant={FRACTIONAL_CUP_VARIANT}
      servingLabel="3/4 cup"
      count={1}
      onSelectServing={() => {}}
      onStep={() => {}}
    />,
  )
  assert.doesNotMatch(html, /3\/4 cup/, 'the misleading fractional-cup text must not appear in the dropdown')
  assert.match(html, /<option[^>]*>serving<\/option>/)
})

test('ServingQuantityControls: a discrete named serving ("1 portion (85 g)") is untouched', () => {
  const html = renderToStaticMarkup(
    <ServingQuantityControls
      variant={PORTION_VARIANT}
      servingLabel="1 portion (85 g)"
      count={1}
      onSelectServing={() => {}}
      onStep={() => {}}
    />,
  )
  assert.match(html, /<option[^>]*>1 portion \(85 g\)<\/option>/)
})
