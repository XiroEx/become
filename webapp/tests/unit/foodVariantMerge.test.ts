// Run with: npm run test:file tests/unit/foodVariantMerge.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canAutoMergeAsVariant,
  normalizeBrand,
  nutritionWithinTolerance,
  MAX_VARIANTS_PER_FOOD,
  NUTRIENT_TOLERANCE_PCT,
  type VariantMergeParent,
  type VariantMergeCandidate,
} from '../../lib/foodVariantMerge'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const usdaNonBrandedParent: VariantMergeParent = {
  source: 'usda',
  externalDataType: 'Foundation',
  groupKey: 'tea',
  isVerified: false,
  variantsCount: 3,
  nutritionProfile: { calories: 1, protein: 0, carbs: 0.2, fats: 0 },
}

const usdaNonBrandedCandidate: VariantMergeCandidate = {
  source: 'usda',
  externalDataType: 'SR Legacy',
  groupKey: 'tea',
  nutritionProfile: { calories: 1, protein: 0, carbs: 0.3, fats: 0 },
}

const usdaBrandedParent: VariantMergeParent = {
  source: 'usda',
  externalDataType: 'Branded',
  groupKey: 'yorkshire tea',
  brand: 'Bettys & Taylors',
  isVerified: false,
  variantsCount: 1,
  nutritionProfile: { calories: 0, protein: 0, carbs: 0, fats: 0 },
}

const usdaBrandedSameBrandCandidate: VariantMergeCandidate = {
  source: 'usda',
  externalDataType: 'Branded',
  groupKey: 'yorkshire tea',
  brand: 'Bettys & Taylors',
  nutritionProfile: { calories: 0, protein: 0, carbs: 0, fats: 0 },
}

const offParent: VariantMergeParent = {
  source: 'openfoodfacts',
  groupKey: 'greek yogurt',
  brand: 'Fage',
  barcode: '0123456789012',
  isVerified: false,
  variantsCount: 2,
}

const offSameBrandCandidate: VariantMergeCandidate = {
  source: 'openfoodfacts',
  groupKey: 'greek yogurt',
  brand: 'Fage',
  barcode: '0123456789012',
}

// ---------------------------------------------------------------------------
// 1. USDA non-Branded regression
// ---------------------------------------------------------------------------

test('USDA non-Branded: groupKey match → MERGE (regression of current behavior)', () => {
  const d = canAutoMergeAsVariant(usdaNonBrandedParent, usdaNonBrandedCandidate)
  assert.equal(d.ok, true)
  assert.equal(d.reason, 'usda-non-branded-groupkey-match')
})

test('USDA non-Branded: brewed tea (1 cal) vs tea powder (401 cal) → BLOCK divergent', () => {
  const powder: VariantMergeCandidate = {
    ...usdaNonBrandedCandidate,
    nutritionProfile: { calories: 401, protein: 8, carbs: 80, fats: 1 },
  }
  const d = canAutoMergeAsVariant(usdaNonBrandedParent, powder)
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'usda-non-branded-calorie-divergent')
})

test('USDA non-Branded: brewed 1 vs light 4 cal → still MERGE (small spread)', () => {
  const light: VariantMergeCandidate = {
    ...usdaNonBrandedCandidate,
    nutritionProfile: { calories: 4, protein: 0, carbs: 0.9, fats: 0 },
  }
  const d = canAutoMergeAsVariant(usdaNonBrandedParent, light)
  assert.equal(d.ok, true)
})

test('Identity: "Chicken, meatless" must NOT merge into plain "Chicken"', () => {
  const chicken: VariantMergeParent = {
    source: 'usda', externalDataType: 'SR Legacy', groupKey: 'chicken',
    isVerified: false, variantsCount: 1, name: 'Chicken, canned, meat only',
    nutritionProfile: { calories: 133, protein: 25, carbs: 0, fats: 3 },
  }
  const meatless: VariantMergeCandidate = {
    source: 'usda', externalDataType: 'SR Legacy', groupKey: 'chicken',
    name: 'Chicken, meatless',
    nutritionProfile: { calories: 90, protein: 20, carbs: 4, fats: 1 },
  }
  const d = canAutoMergeAsVariant(chicken, meatless)
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'substitute-identity-mismatch')
})

test('Identity: both meatless → still MERGE (same product family)', () => {
  const p: VariantMergeParent = {
    source: 'usda', externalDataType: 'SR Legacy', groupKey: 'chicken',
    isVerified: false, variantsCount: 1, name: 'Chicken, meatless, breaded',
    nutritionProfile: { calories: 200, protein: 18, carbs: 12, fats: 9 },
  }
  const cand: VariantMergeCandidate = {
    source: 'usda', externalDataType: 'SR Legacy', groupKey: 'chicken',
    name: 'Chicken, meatless, fried',
    nutritionProfile: { calories: 220, protein: 17, carbs: 13, fats: 11 },
  }
  const d = canAutoMergeAsVariant(p, cand)
  assert.equal(d.ok, true)
})

// ---------------------------------------------------------------------------
// 2. USDA Branded
// ---------------------------------------------------------------------------

test('USDA Branded: same brandOwner + nutrient match → MERGE', () => {
  const d = canAutoMergeAsVariant(usdaBrandedParent, usdaBrandedSameBrandCandidate)
  assert.equal(d.ok, true)
  assert.equal(d.reason, 'usda-branded-same-brand-nutrient-match')
})

test('USDA Branded: different brand → REJECT', () => {
  const d = canAutoMergeAsVariant(usdaBrandedParent, {
    ...usdaBrandedSameBrandCandidate,
    brand: 'Tetley',
  })
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'usda-branded-different-brand')
})

test('USDA Branded: same brand but nutrient out of 15% tolerance → REJECT', () => {
  const d = canAutoMergeAsVariant(
    {
      ...usdaBrandedParent,
      nutritionProfile: { calories: 100, protein: 10, carbs: 10, fats: 5 },
    },
    {
      ...usdaBrandedSameBrandCandidate,
      // 100 → 200 is 100% over: well outside 15% tolerance
      nutritionProfile: { calories: 200, protein: 10, carbs: 10, fats: 5 },
    },
  )
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'usda-branded-nutrient-out-of-tolerance')
})

test('USDA Branded: same brand WITHIN nutrient tolerance edge → MERGE', () => {
  // 100 vs 114 = 14% — just inside the 15% bound
  const d = canAutoMergeAsVariant(
    {
      ...usdaBrandedParent,
      nutritionProfile: { calories: 100, protein: 10, carbs: 10, fats: 5 },
    },
    {
      ...usdaBrandedSameBrandCandidate,
      nutritionProfile: { calories: 114, protein: 10, carbs: 10, fats: 5 },
    },
  )
  assert.equal(d.ok, true)
})

test('USDA Branded: missing brand on either side → REJECT', () => {
  const noBrand = { ...usdaBrandedSameBrandCandidate, brand: null }
  const d = canAutoMergeAsVariant(usdaBrandedParent, noBrand)
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'usda-branded-missing-brand')
})

test('USDA: Branded vs non-Branded mix → REJECT (Foundation ≠ specific SKU)', () => {
  const d = canAutoMergeAsVariant(usdaNonBrandedParent, {
    ...usdaNonBrandedCandidate,
    externalDataType: 'Branded',
  })
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'usda-branded-vs-non-branded-mismatch')
})

// ---------------------------------------------------------------------------
// 3. OpenFoodFacts
// ---------------------------------------------------------------------------

test('OFF: shared brand + matching barcode → MERGE', () => {
  const d = canAutoMergeAsVariant(offParent, offSameBrandCandidate)
  assert.equal(d.ok, true)
  assert.equal(d.reason, 'off-shared-brand')
})

test('OFF: shared brand + candidate has no barcode → MERGE (same family)', () => {
  const d = canAutoMergeAsVariant(offParent, {
    ...offSameBrandCandidate,
    barcode: null,
  })
  assert.equal(d.ok, true)
  assert.equal(d.reason, 'off-shared-brand')
})

test('OFF: conflicting barcode → REJECT regardless of brand', () => {
  const d = canAutoMergeAsVariant(offParent, {
    ...offSameBrandCandidate,
    barcode: '9999999999999',
  })
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'off-conflicting-barcode')
})

test('OFF: both barcode-absent + both brand-absent + same groupKey → MERGE', () => {
  const d = canAutoMergeAsVariant(
    { ...offParent, barcode: null, brand: null },
    { ...offSameBrandCandidate, barcode: null, brand: null },
  )
  assert.equal(d.ok, true)
  assert.equal(d.reason, 'off-no-barcodes-no-brand')
})

test('OFF: different brand even with no barcodes → REJECT (different products)', () => {
  const d = canAutoMergeAsVariant(
    { ...offParent, barcode: null },
    { ...offSameBrandCandidate, brand: 'Chobani', barcode: null },
  )
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'off-different-brand')
})

// ---------------------------------------------------------------------------
// 4. Universal gates
// ---------------------------------------------------------------------------

test('Universal: parent isVerified=true → REJECT (locked by admin)', () => {
  const d = canAutoMergeAsVariant(
    { ...usdaNonBrandedParent, isVerified: true },
    usdaNonBrandedCandidate,
  )
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'parent-verified-locked')
})

test('Universal: parent at MAX_VARIANTS_PER_FOOD cap → REJECT', () => {
  const d = canAutoMergeAsVariant(
    { ...usdaNonBrandedParent, variantsCount: MAX_VARIANTS_PER_FOOD },
    usdaNonBrandedCandidate,
  )
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'cap-reached')
})

test('Universal: cross-source (USDA parent + OFF candidate) → REJECT', () => {
  const d = canAutoMergeAsVariant(
    usdaNonBrandedParent,
    { ...usdaNonBrandedCandidate, source: 'openfoodfacts' },
  )
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'cross-source-not-allowed')
})

test('Universal: base-name / groupKey mismatch → REJECT', () => {
  const d = canAutoMergeAsVariant(
    usdaNonBrandedParent,
    { ...usdaNonBrandedCandidate, groupKey: 'coffee' },
  )
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'groupkey-mismatch')
})

test('Universal: empty groupKey on either side → REJECT', () => {
  assert.equal(
    canAutoMergeAsVariant({ ...usdaNonBrandedParent, groupKey: '' }, usdaNonBrandedCandidate).reason,
    'parent-empty-groupkey',
  )
  assert.equal(
    canAutoMergeAsVariant(usdaNonBrandedParent, { ...usdaNonBrandedCandidate, groupKey: 'x' }).reason,
    'candidate-empty-groupkey',
  )
})

test('Manual source never auto-merges (placeholder for future user-driven flow)', () => {
  const d = canAutoMergeAsVariant(
    { ...usdaNonBrandedParent, source: 'manual' },
    { ...usdaNonBrandedCandidate, source: 'manual' },
  )
  assert.equal(d.ok, false)
  assert.equal(d.reason, 'manual-never-auto-merges')
})

test('null / undefined inputs → graceful REJECT', () => {
  assert.deepEqual(canAutoMergeAsVariant(null, null), { ok: false, reason: 'null-input' })
  assert.deepEqual(canAutoMergeAsVariant(null, usdaNonBrandedCandidate), {
    ok: false,
    reason: 'null-input',
  })
  assert.deepEqual(canAutoMergeAsVariant(usdaNonBrandedParent, null), {
    ok: false,
    reason: 'null-input',
  })
  assert.deepEqual(canAutoMergeAsVariant(undefined, undefined), {
    ok: false,
    reason: 'null-input',
  })
})

// ---------------------------------------------------------------------------
// 5. Symmetry / idempotency
// ---------------------------------------------------------------------------

test('Idempotency: same decision when called twice with identical inputs', () => {
  const a = canAutoMergeAsVariant(usdaBrandedParent, usdaBrandedSameBrandCandidate)
  const b = canAutoMergeAsVariant(usdaBrandedParent, usdaBrandedSameBrandCandidate)
  assert.deepEqual(a, b)
})

test('Symmetry: USDA Branded — swapping parent/candidate yields the same merge decision', () => {
  // For the SAME-brand-same-nutrient case, swapping which side is "parent"
  // shouldn't change the outcome (both should still merge).
  const parentAsCandidate: VariantMergeCandidate = {
    source: usdaBrandedParent.source,
    externalDataType: usdaBrandedParent.externalDataType,
    groupKey: usdaBrandedParent.groupKey,
    brand: usdaBrandedParent.brand,
    barcode: usdaBrandedParent.barcode,
    nutritionProfile: usdaBrandedParent.nutritionProfile,
  }
  const candidateAsParent: VariantMergeParent = {
    source: usdaBrandedSameBrandCandidate.source,
    externalDataType: usdaBrandedSameBrandCandidate.externalDataType,
    groupKey: usdaBrandedSameBrandCandidate.groupKey,
    brand: usdaBrandedSameBrandCandidate.brand,
    barcode: usdaBrandedSameBrandCandidate.barcode,
    isVerified: false,
    variantsCount: 1,
    nutritionProfile: usdaBrandedSameBrandCandidate.nutritionProfile,
  }
  const forward = canAutoMergeAsVariant(usdaBrandedParent, usdaBrandedSameBrandCandidate)
  const reverse = canAutoMergeAsVariant(candidateAsParent, parentAsCandidate)
  assert.equal(forward.ok, reverse.ok)
})

// ---------------------------------------------------------------------------
// 6. Helper functions
// ---------------------------------------------------------------------------

test('normalizeBrand: lowercases + collapses whitespace, returns null on empty', () => {
  assert.equal(normalizeBrand('Coca-Cola'), 'coca-cola')
  assert.equal(normalizeBrand('  Fage  Greek  '), 'fage greek')
  assert.equal(normalizeBrand(''), null)
  assert.equal(normalizeBrand(null), null)
  assert.equal(normalizeBrand(undefined), null)
})

test('nutritionWithinTolerance: ±15% on each macro', () => {
  assert.equal(
    nutritionWithinTolerance(
      { calories: 100, protein: 10, carbs: 10, fats: 5 },
      { calories: 110, protein: 10, carbs: 10, fats: 5 },
    ),
    true,
  )
  assert.equal(
    nutritionWithinTolerance(
      { calories: 100, protein: 10, carbs: 10, fats: 5 },
      { calories: 120, protein: 10, carbs: 10, fats: 5 },
    ),
    false,
  )
  // Missing macro on one side → false
  assert.equal(
    nutritionWithinTolerance(
      { calories: 100, protein: 10, carbs: 10, fats: 5 },
      { calories: 100, protein: 10, carbs: 10 },
    ),
    false,
  )
  // Null/empty
  assert.equal(nutritionWithinTolerance(null, null), false)
  assert.equal(nutritionWithinTolerance({ calories: 0, protein: 0, carbs: 0, fats: 0 }, {
    calories: 0, protein: 0, carbs: 0, fats: 0,
  }), true)
})

test('exported tolerance constant is 15%', () => {
  assert.equal(NUTRIENT_TOLERANCE_PCT, 0.15)
})
