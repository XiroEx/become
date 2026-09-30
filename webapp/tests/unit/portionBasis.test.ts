// Run with: npm run test:file tests/unit/portionBasis.test.ts
//
// The bug this pins, with the real record that produced it:
//
//   FITCRUNCH "High Protein Baked Bar", barcode 0839138007007
//     stored basis: 100 g -> 413 cal, 34.8 P, 30.4 C, 17.4 F
//     gramsPerServing: 46
//
// The picker showed "1 bar (46 g) · 190 cal". The correction sheet showed 413
// under a heading reading "Per serving". A member correcting the bar was
// therefore editing a basis they were never shown, and what they typed got
// scaled by 0.46 on the way in -- which is how "457 calories, 34.8 protein"
// ended up stored against a 190-calorie bar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toDisplayBasis, toStorageBasis, safeFactor } from '../../lib/nutrition/portionBasis'

/** The real FitCrunch row, per 100 g. */
const FITCRUNCH = { calories: 413, protein: 34.8, carbs: 30.4, fats: 17.4 }
const BAR = 0.46 // 46 g of a 100 g basis

test('a 100g-basis bar displays as the 46g bar the picker shows', () => {
  const shown = toDisplayBasis(FITCRUNCH, BAR)
  assert.equal(shown.calories, 190, 'the number on the picker, not 413')
  assert.equal(shown.protein, 16)
  assert.equal(shown.carbs, 14)
  assert.equal(shown.fats, 8)
})

test('what the member types comes back on the storage basis', () => {
  // They read 200 cal / 17 P off the wrapper for one bar.
  const stored = toStorageBasis({ calories: 200, protein: 17, carbs: 15, fats: 9 }, BAR)
  assert.equal(Math.round(stored.calories), 435)
  // And it must render back as what they typed.
  const roundTripped = toDisplayBasis(stored, BAR)
  assert.deepEqual(roundTripped, { calories: 200, protein: 17, carbs: 15, fats: 9 })
})

test('the round trip survives the exact numbers from the reported bug', () => {
  const shown = toDisplayBasis(FITCRUNCH, BAR)
  const back = toStorageBasis(shown, BAR)
  assert.equal(Math.round(back.calories), 413)
  assert.equal(Math.round(back.protein * 10) / 10, 34.8)
})

test('storage values are NOT rounded, or the display drifts off what was typed', () => {
  // 190 / 0.46 = 413.043...  Storing a rounded 413 renders as 189.98, which the
  // member sees as their correction having been quietly altered.
  const stored = toStorageBasis({ calories: 190, protein: 16, carbs: 14, fats: 8 }, BAR)
  assert.ok(stored.calories > 413 && stored.calories < 414, `expected ~413.04, got ${stored.calories}`)
  assert.equal(toDisplayBasis(stored, BAR).calories, 190)
})

test('a factor of 1 is an identity, so foods already on the right basis are untouched', () => {
  assert.deepEqual(toDisplayBasis(FITCRUNCH, 1), FITCRUNCH)
  assert.deepEqual(toStorageBasis(FITCRUNCH, 1), FITCRUNCH)
})

test('a nonsense factor degrades to identity instead of producing Infinity or NaN', () => {
  for (const bad of [0, -1, NaN, Infinity, undefined, null]) {
    assert.equal(safeFactor(bad as number), 1, `factor ${String(bad)} should fall back to 1`)
    const out = toStorageBasis(FITCRUNCH, bad as number)
    assert.ok(Number.isFinite(out.calories), `factor ${String(bad)} produced ${out.calories}`)
  }
})

test('missing macros read as zero rather than NaN', () => {
  const partial = { calories: 100 } as { calories: number; protein: number; carbs: number; fats: number }
  const shown = toDisplayBasis(partial, 0.5)
  assert.equal(shown.calories, 50)
  assert.equal(shown.protein, 0)
  assert.equal(shown.fats, 0)
})

test('a portion LARGER than the basis scales up', () => {
  // 88 g of a 100 g basis: the full-size bar.
  const shown = toDisplayBasis(FITCRUNCH, 0.88)
  assert.equal(shown.calories, 363.4)
  assert.equal(Math.round(shown.protein), 31)
})

// Fiber support ("Expand Fix This Entry to include Fiber and serving
// size/label"). It has to scale the same way calories/protein/carbs/fats
// already do -- the reported example was 3 tortillas at 19g carbs, 19g fiber
// per serving -- but it has to stay OPTIONAL, or every object above that
// never carried a `fiber` key (FITCRUNCH included) gains one on the way
// through and the exact-shape `deepEqual` assertions at lines 37/56/57 break.

test('fiber scales the same way the other macros do', () => {
  const shown = toDisplayBasis({ ...FITCRUNCH, fiber: 10 }, BAR)
  assert.equal(shown.fiber, 4.6) // 10 * 0.46, one decimal
  const back = toStorageBasis(shown, BAR)
  assert.ok(back.fiber! > 9.9 && back.fiber! < 10.1, `expected ~10, got ${back.fiber}`)
})

test('the tortilla case: 19g carbs, 19g fiber for a 3-tortilla serving round-trips', () => {
  // Per-serving values as reported; the picker is already showing this
  // portion, so factor is 1 (display basis === storage basis).
  const shown = toDisplayBasis({ calories: 140, protein: 4, carbs: 19, fats: 3, fiber: 19 }, 1)
  assert.equal(shown.carbs, 19)
  assert.equal(shown.fiber, 19)
  const stored = toStorageBasis(shown, 1)
  assert.equal(stored.fiber, 19)
})

test('omitting fiber leaves it out of the result entirely, not as 0 or undefined-on-a-key', () => {
  const shown = toDisplayBasis(FITCRUNCH, BAR)
  assert.equal('fiber' in shown, false, 'a fiber-less input must not grow a fiber key')
  const stored = toStorageBasis(FITCRUNCH, BAR)
  assert.equal('fiber' in stored, false)
})

test('REGRESSION: fiber-less callers still round-trip to the exact original shape', () => {
  // These are the same assertions as the pre-fiber tests above -- pinned again
  // here so a future change to fiber support cannot quietly reintroduce a key.
  assert.deepEqual(toDisplayBasis(FITCRUNCH, 1), FITCRUNCH)
  assert.deepEqual(toStorageBasis(FITCRUNCH, 1), FITCRUNCH)
  const roundTripped = toDisplayBasis(toStorageBasis({ calories: 200, protein: 17, carbs: 15, fats: 9 }, BAR), BAR)
  assert.deepEqual(roundTripped, { calories: 200, protein: 17, carbs: 15, fats: 9 })
})

test('a fiber of exactly 0 is still a real value, not "missing"', () => {
  // 0 !== undefined: an explicit zero must still come back as a fiber key,
  // unlike an input that never had one at all.
  const shown = toDisplayBasis({ ...FITCRUNCH, fiber: 0 }, BAR)
  assert.equal('fiber' in shown, true)
  assert.equal(shown.fiber, 0)
})
