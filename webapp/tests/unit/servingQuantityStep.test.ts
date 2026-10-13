import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { servingQuantityStep } from '../../lib/nutrition/servingQuantityStep'

test('estimate quantities use precise metric steps', () => {
  assert.equal(servingQuantityStep('g'), 1)
  assert.equal(servingQuantityStep('ml'), 1)
  assert.equal(servingQuantityStep('mg'), 1)
  assert.equal(servingQuantityStep('kg'), 0.01)
  assert.equal(servingQuantityStep('liter'), 0.01)
})

test('estimate quantities use quarter-unit kitchen and imperial steps', () => {
  for (const unit of ['cup', 'tbsp', 'tsp', 'fl_oz', 'oz', 'lb', 'pint', 'quart']) {
    assert.equal(servingQuantityStep(unit), 0.25, unit)
  }
})

test('countable and unknown AI units keep half-unit steps', () => {
  for (const unit of ['each', 'slice', 'scoop', 'serving', 'avocado', 'bite']) {
    assert.equal(servingQuantityStep(unit), 0.5, unit)
  }
})

test('unit lookup ignores surrounding whitespace and casing', () => {
  assert.equal(servingQuantityStep(' Cup '), 0.25)
  assert.equal(servingQuantityStep('G'), 1)
})

test('the estimate review uses the selected unit policy for stepping and its floor', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/nutrition/SnapPlateModal.tsx'),
    'utf8',
  )

  assert.match(source, /stepDelta=\{servingQuantityStep\(item\.unitLabel\)\}/)
  assert.match(source, /stepFloor=\{servingQuantityStep\(item\.unitLabel\)\}/)
  assert.match(
    source,
    /Math\.max\(servingQuantityStep\(it\.unitLabel\), parseFloat\(\(it\.multiplier \+ delta\)\.toFixed\(3\)\)\)/,
  )
})
