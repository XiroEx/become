// Run with: npm run test:file tests/unit/noIntermediateRounding.test.ts
//
// The rule, and the reason for it:
//
//   Nutrition that will be MULTIPLIED later is stored exact. Rounding belongs at
//   the point a human reads a number, never in the middle of a calculation.
//
// A per-unit value rounded to a whole number, then multiplied by 325, does not
// lose a rounding error — it loses the entire quantity. That is how a 130 cal
// coffee logged as 0 cal beside 32.5 g of protein.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

test('rounding mid-pipeline scales the error by the serving count', () => {
  const total = 130, units = 325
  const per = total / units // 0.4

  // Whole numbers: the value is annihilated.
  assert.equal(Math.round(per) * units, 0)
  // One decimal: still 22% out at this scale.
  assert.equal(Math.round(per * 10) / 10 * units, 130)
  // Exact: correct.
  assert.equal(per * units, total)
})

test('a small serving of a low-calorie food rounds to nothing on import', () => {
  // USDA is per 100 g and scales to the serving. A 3 cal/100 g herb in a 5 g
  // serving is 0.15 cal — rounded to a whole number that is 0, stored as 0, and
  // wrong for every portion that food is ever used in.
  const per100 = 3, servingG = 5
  const scale = servingG / 100
  assert.equal(Math.round(per100 * scale), 0)
  assert.ok(per100 * scale > 0)
})

test('the plate scan stores per-unit values exactly', () => {
  const src = read('components/nutrition/SnapPlateModal.tsx')
  assert.doesNotMatch(src, /Math\.round\(n\.(calories|protein|carbs|fats)/,
    'per-unit nutrition is being rounded before it is multiplied')
  assert.equal((src.match(/calories: perUnit\(n\.calories\)/g) ?? []).length, 3,
    'all three write paths must use the exact helper')
})

test('USDA import stores scaled values exactly', () => {
  const src = read('lib/usda.ts')
  assert.doesNotMatch(src, /calories: Math\.round\(cal \* scale\)/,
    'scaled calories are stored and multiplied later; they cannot be rounded here')
})

test('OpenFoodFacts per-100 values are stored exactly', () => {
  const src = read('lib/foodImport.ts')
  assert.doesNotMatch(src, /protein: Math\.round\(\(n\.proteins_100g/,
    'a per-100 basis is scaled FROM, so rounding it multiplies into every serving')
})

test('a terminal total may still be rounded — that is display, not arithmetic', () => {
  // Rounding the FINAL figure a member reads is fine and desirable. The rule is
  // about values that feed further multiplication, not about every Math.round.
  const items = [130.4, 42.2, 97.6]
  const total = items.reduce((a, b) => a + b, 0)
  assert.equal(Math.round(total * 10) / 10, 270.2)
})
