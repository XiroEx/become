// Run with: npm run test:file tests/unit/servingQuantityRounding.test.tsx
//
// Follow-up ask on the fractional-serving card: round the AI plate-scan
// review row's Quantity box to the nearest 1000th instead of the nearest
// 100th. A repeating-decimal serving fraction ("1/3 cup" -> multiplier
// 0.333...) only had two decimals of precision to work with before this,
// which is coarse enough to visibly drift from the real amount once you
// step or scale it. Both the displayed number (ServingQuantityControls'
// `round`) and the underlying value the stepper writes back
// (SnapPlateModal's `setMultiplier`) need the extra digit.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import ServingQuantityControls from '../../components/nutrition/ServingQuantityControls'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const CUP_VARIANT = {
  servingSize: 1,
  servingUnit: 'cup' as const,
  displayLabel: '1/3 cup',
  gramsPerServing: 80,
  nutrition: { calories: 100, protein: 2, carbs: 20, fats: 1 },
}

test('the Quantity box rounds to the nearest 1000th, not the nearest 100th', () => {
  const html = renderToStaticMarkup(
    <ServingQuantityControls
      variant={CUP_VARIANT}
      servingLabel="1/3 cup"
      count={1 / 3}
      onSelectServing={() => {}}
      onStep={() => {}}
    />,
  )
  assert.match(html, />0\.333</, 'a repeating-decimal count must keep 3 decimals of precision')
  assert.doesNotMatch(html, />0\.33</, 'must not truncate to the old 2-decimal rounding')
})

test('a whole count still renders cleanly, with no trailing decimal noise', () => {
  const html = renderToStaticMarkup(
    <ServingQuantityControls
      variant={CUP_VARIANT}
      servingLabel="1/3 cup"
      count={2}
      onSelectServing={() => {}}
      onStep={() => {}}
    />,
  )
  assert.match(html, />2</)
})

test('SnapPlateModal steps the multiplier to 3 decimal places, not 2', () => {
  const src = read('components/nutrition/SnapPlateModal.tsx')
  assert.match(
    src,
    /parseFloat\(\(it\.multiplier \+ delta\)\.toFixed\(3\)\)/,
    'the stepper must keep the nearest-1000th precision the Quantity box now displays',
  )
})
