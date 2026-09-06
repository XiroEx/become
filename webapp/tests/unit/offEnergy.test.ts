// Run with: npm run test:file tests/unit/offEnergy.test.ts
//
// The calorie handling described in lib/offEnergy.ts. The headline case is
// Swanson Sipping Bone Broth: OFF says 89.3 kcal/100 g, which scaled to a 305 g
// container reads 271 cal for what is 10 g of protein and nothing else.
//
// The point of these tests is the pair of bone broth vs pistachios: both are
// records where two fields agree and one dissents, and in one the majority is
// right while in the other it is wrong. That is why a contradiction is flagged
// for review rather than auto-corrected.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plausibleOffKcal, detectOffEnergyConflict, offKjPer100 } from '../../lib/offEnergy'

// Verbatim from the OFF API for barcode 051000269348.
const BONE_BROTH = {
  energy_kcal_100g: 89.2857142857143,
  energy_kj_100g: 73.0089874883924,
  proteins_100g: 3.28130280846707,
  carbohydrates_100g: 0.656260561693415,
  fat_100g: 0.164065140423354,
}

test('a self-contradicting record is flagged, not silently rewritten', () => {
  const conflict = detectOffEnergyConflict(BONE_BROTH)
  assert.ok(conflict)
  assert.equal(conflict.stated, 89)
  assert.equal(conflict.fromKj, 17)
  assert.match(conflict.reason, /kJ field says/)
  // The published number still ships — we know it disagrees with itself, not
  // which half is wrong. See the header on lib/offEnergy.ts.
  assert.equal(plausibleOffKcal(BONE_BROTH), 89)
})

test('pistachios show why the majority vote cannot be trusted', () => {
  // 571 kcal/100 g is CORRECT; the macros are the label's per-28 g figures in
  // the per-100 g fields, and the kJ was entered on that same wrong basis.
  const pistachios = {
    energy_kcal_100g: 571.428571428572,
    energy_kj_100g: 743,
    proteins_100g: 6,
    carbohydrates_100g: 8,
    fat_100g: 13,
    fiber_100g: 3,
  }
  // Flagged for review...
  assert.ok(detectOffEnergyConflict(pistachios))
  // ...but the correct source value is preserved. Deferring to the two
  // agreeing fields here would have written 178 over a right answer.
  assert.equal(plausibleOffKcal(pistachios), 571)
})

test('a plausible magnitude is never substituted, however odd it looks', () => {
  // Roasted edamame: the calories are right and the MACROS are the broken
  // field (they are per-serving). Atwater says 121, but kJ corroborates the
  // kcal, so the source stands.
  const edamame = {
    energy_kcal_100g: 403,
    energy_kj_100g: 1686,
    proteins_100g: 11,
    carbohydrates_100g: 8,
    fat_100g: 5,
  }
  assert.equal(plausibleOffKcal(edamame), 403)
})

test('a macro mismatch with no kJ present still leaves the source alone', () => {
  const noKj = {
    energy_kcal_100g: 89,
    proteins_100g: 3.3,
    carbohydrates_100g: 0.7,
    fat_100g: 0.2,
  }
  assert.equal(plausibleOffKcal(noKj), 89)
})

test('an absurd magnitude still falls back, preferring kJ then macros', () => {
  assert.equal(
    plausibleOffKcal({
      energy_kcal_100g: 18000,
      energy_kj_100g: 1180,
      proteins_100g: 9,
      carbohydrates_100g: 50,
      fat_100g: 3,
    }),
    282, // 1180 kJ / 4.184
  )
  assert.equal(
    plausibleOffKcal({
      energy_kcal_100g: 18000,
      proteins_100g: 9,
      carbohydrates_100g: 50,
      fat_100g: 3,
    }),
    263, // 4*9 + 4*50 + 9*3
  )
  assert.equal(plausibleOffKcal({ energy_kcal_100g: 18000 }), 0)
})

test('alcohol counts — spirits are not over-stated calories', () => {
  // Vodka: 231 kcal/100 g, all of it ethanol, which is in neither macro.
  const vodka = {
    energy_kcal_100g: 231,
    energy_kj_100g: 966,
    proteins_100g: 0,
    carbohydrates_100g: 0,
    fat_100g: 0,
    alcohol_100g: 33,
  }
  assert.equal(plausibleOffKcal(vodka), 231)
})

test('fibre-excluded (EU) carbohydrate figures are not treated as outliers', () => {
  // Psyllium husk: EU carbs exclude fibre, so a naive Atwater reads ~0.
  const psyllium = {
    energy_kcal_100g: 200,
    energy_kj_100g: 837,
    proteins_100g: 2,
    carbohydrates_100g: 2,
    fat_100g: 0.5,
    fiber_100g: 80,
  }
  assert.equal(plausibleOffKcal(psyllium), 200)
})

test('near-zero foods get absolute slack, not a percentage of nothing', () => {
  // Diet soda / black coffee: every witness is ~0, so nothing is an outlier.
  const diet = {
    energy_kcal_100g: 2,
    energy_kj_100g: 8,
    proteins_100g: 0,
    carbohydrates_100g: 0.2,
    fat_100g: 0,
  }
  assert.equal(plausibleOffKcal(diet), 2)
})

test('consistent records raise no conflict', () => {
  assert.equal(
    detectOffEnergyConflict({
      energy_kcal_100g: 250,
      energy_kj_100g: 1046,
      proteins_100g: 10,
      carbohydrates_100g: 30,
      fat_100g: 9,
    }),
    null,
  )
  // Spirits: all the energy is ethanol, which sits in no macro.
  assert.equal(
    detectOffEnergyConflict({
      energy_kcal_100g: 231,
      energy_kj_100g: 966,
      proteins_100g: 0,
      carbohydrates_100g: 0,
      fat_100g: 0,
      alcohol_100g: 33,
    }),
    null,
  )
})

test('missing / empty input yields 0 rather than garbage', () => {
  assert.equal(plausibleOffKcal(null), 0)
  assert.equal(plausibleOffKcal(undefined), 0)
  assert.equal(plausibleOffKcal({}), 0)
  assert.equal(detectOffEnergyConflict(null), null)
  assert.equal(detectOffEnergyConflict({}), null)
})

test('offKjPer100 reads hyphenated, underscored and unit-declared shapes', () => {
  assert.equal(offKjPer100({ 'energy-kj_100g': 73 }), 73)
  assert.equal(offKjPer100({ energy_kj_100g: 73 }), 73)
  assert.equal(offKjPer100({ energy_100g: 73, energy_unit: 'kJ' }), 73)
  // A kcal-denominated generic energy must NOT be read as kJ.
  assert.equal(offKjPer100({ energy_100g: 73, energy_unit: 'kcal' }), undefined)
  assert.equal(offKjPer100({}), undefined)
  assert.equal(offKjPer100(null), undefined)
})
