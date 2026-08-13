// Run with: npx tsx --test tests/unit/plateScanRounding.test.ts
//
// Pinned to the real 2026-08-13 report: a Joyburst Protein Coffee scanned from a
// photo logged as 0 cal next to 32.5 g of protein — a row that contradicts
// itself, since 32.5 g of protein IS 130 calories.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The fix, mirrored: per-unit values are stored EXACTLY.
 *
 * The first version of this fix kept four decimals, which was less wrong but
 * wrong in kind — an intermediate value that gets multiplied has no business
 * being rounded at all.
 */
const perUnit = (v: number | undefined) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** What it used to do: calories to a whole number, macros to one decimal. */
const oldCalories = (v: number) => Math.round(v)
const oldMacro = (v: number) => Math.round(v * 10) / 10

// The drink as the scanner saw it: 325 ml, 130 cal, 32.5 g protein.
const TOTAL_CAL = 130
const TOTAL_PROTEIN = 32.5
const UNITS = 325
const perUnitCal = TOTAL_CAL / UNITS       // 0.4
const perUnitProtein = TOTAL_PROTEIN / UNITS // 0.1

test('the old rounding annihilated the calories', () => {
  assert.equal(oldCalories(perUnitCal), 0)
  assert.equal(oldCalories(perUnitCal) * UNITS, 0, 'this is the 0 cal the member saw')
})

test('and left the protein intact, so the row contradicted itself', () => {
  // 0 calories beside 32.5 g of protein is impossible, and that mismatch is the
  // clearest signal that the loss was in rounding rather than in the estimate.
  assert.equal(oldMacro(perUnitProtein) * UNITS, 32.5)
})

test('the calories now survive the round trip', () => {
  assert.equal(perUnit(perUnitCal) * UNITS, TOTAL_CAL)
  assert.equal(perUnit(perUnitProtein) * UNITS, TOTAL_PROTEIN)
})

test('it holds for anything measured in many small units', () => {
  // Not a coffee problem — a grams/millilitres problem. Any photo-scanned item
  // whose unit is small relative to the portion hit this.
  for (const [total, units] of [[150, 250], [45, 1000], [8, 500], [600, 340]] as const) {
    const per = total / units
    assert.equal(Math.round(perUnit(per) * units * 100) / 100, total, `${total} over ${units} units`)
  }
})

test('a whole-unit food was never affected, which is why this hid', () => {
  // "2 waffles at 140 cal each" rounds to itself, so the bug only ever showed
  // on liquids and weights.
  assert.equal(oldCalories(140) * 2, 280)
  assert.equal(perUnit(140) * 2, 280)
})

test('every plate-scan write path stores the exact value', () => {
  // There were THREE copies of the same mapping: the history save, the on-log
  // update, and the log payload. Fixing one would have left the bug alive.
  const src = readFileSync(join(process.cwd(), 'components/nutrition/SnapPlateModal.tsx'), 'utf8')
  assert.doesNotMatch(src, /Math\.round\(n\.calories/, 'a per-unit calorie is still being rounded')
  assert.equal((src.match(/calories: perUnit\(n\.calories\)/g) ?? []).length, 3)
})
