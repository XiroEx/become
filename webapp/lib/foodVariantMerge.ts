// ---------------------------------------------------------------------------
// foodVariantMerge — source-aware decision for "can this incoming food be
// auto-merged as a variant of an existing parent Food?"
//
// Originally only USDA non-Branded entries auto-merged on `groupKey` match.
// This module generalises the rule so:
//   - USDA non-Branded: existing behavior (groupKey match → merge)
//   - USDA Branded:     groupKey + same brandOwner + nutrient profile within
//                       NUTRIENT_TOLERANCE_PCT for all four macros
//   - OpenFoodFacts:    groupKey + (shared brand OR both barcode-absent),
//                       never when both barcodes are present and differ
//
// The decision is PURE. All IO (looking up the candidate parent, the atomic
// findOneAndUpdate write) stays in the import pipeline.
// ---------------------------------------------------------------------------

export type FoodMergeSource = 'usda' | 'openfoodfacts' | 'manual'

/**
 * Hard cap on how many variants a single Food doc may carry. Beyond this we
 * spawn a sibling Food instead of merging. Mirrors `MAX_VARIANTS_PER_FOOD`
 * in lib/foodImport.ts (kept in sync; if you change one, change both).
 */
export const MAX_VARIANTS_PER_FOOD = 12

/**
 * Per-nutrient relative tolerance for the Branded merge check. Two USDA
 * Branded entries with the same brand owner and groupKey are considered
 * "the same product, different variant" when each macro (calories, protein,
 * carbs, fats) is within this fraction of the parent's value.
 *
 * 15% is loose enough to absorb USDA reporting noise + serving-size
 * rounding, tight enough that "Yorkshire Tea black 50ct" doesn't get
 * merged with "Yorkshire Tea decaf 80ct" (drastically different macros).
 */
export const NUTRIENT_TOLERANCE_PCT = 0.15

export interface NutritionProfile {
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fats?: number | null
}

export interface VariantMergeParent {
  source: FoodMergeSource
  externalDataType?: string | null
  groupKey?: string | null
  brand?: string | null
  barcode?: string | null
  isVerified?: boolean | null
  variantsCount: number
  nutritionProfile?: NutritionProfile | null
}

export interface VariantMergeCandidate {
  source: FoodMergeSource
  externalDataType?: string | null
  groupKey?: string | null
  /** Set on Branded USDA candidates from `brandOwner` or `brandName`. */
  brand?: string | null
  barcode?: string | null
  nutritionProfile?: NutritionProfile | null
}

export interface MergeDecision {
  ok: boolean
  reason: string
}

/** Lowercase + collapse whitespace; null/empty input → null. */
export function normalizeBrand(b: string | null | undefined): string | null {
  if (!b) return null
  const s = String(b).trim().toLowerCase().replace(/\s+/g, ' ')
  return s.length > 0 ? s : null
}

/**
 * True when every macro on `a` is within `pct` of the corresponding macro
 * on `b`. Returns false if either profile is null/undefined or any macro
 * is missing on one side.
 */
export function nutritionWithinTolerance(
  a: NutritionProfile | null | undefined,
  b: NutritionProfile | null | undefined,
  pct: number = NUTRIENT_TOLERANCE_PCT,
): boolean {
  if (!a || !b) return false
  const fields: Array<keyof NutritionProfile> = ['calories', 'protein', 'carbs', 'fats']
  for (const f of fields) {
    const av = a[f]
    const bv = b[f]
    if (typeof av !== 'number' || typeof bv !== 'number') return false
    const maxv = Math.max(Math.abs(av), Math.abs(bv))
    if (maxv === 0) continue
    const delta = Math.abs(av - bv) / maxv
    if (delta > pct) return false
  }
  return true
}

/**
 * Guard against merging grossly different PREPARATIONS that happen to share a
 * groupKey — the classic failure was 1 kcal brewed tea and 401 kcal instant tea
 * powder both collapsing into one "Tea" food (see FOOD_DATA_BUILD_AUDIT.md §3B).
 * Both profiles here are per-default-serving (≈per-100g for USDA non-Branded /
 * generic OFF), so calorie density is directly comparable.
 *
 * Returns true (block merge) only when the gap is unambiguous: a large absolute
 * difference AND either one side is ~0 while the other is substantial, or a
 * >2.5× density ratio. Small spreads (brewed 1 vs light 4 vs 27) still cluster.
 */
export function caloriesGrosslyDivergent(
  a: NutritionProfile | null | undefined,
  b: NutritionProfile | null | undefined,
): boolean {
  const av = a?.calories
  const bv = b?.calories
  if (typeof av !== 'number' || typeof bv !== 'number') return false
  const hi = Math.max(av, bv)
  const lo = Math.min(av, bv)
  if (hi - lo < 40) return false          // small absolute gap → same food
  if (lo <= 1) return hi >= 40            // ~0 vs substantial → different prep
  return hi / lo > 2.5                    // >2.5× density gap → different prep
}

function canMergeUSDA(
  parent: VariantMergeParent,
  candidate: VariantMergeCandidate,
): MergeDecision {
  const parentIsBranded = parent.externalDataType === 'Branded'
  const candidateIsBranded = candidate.externalDataType === 'Branded'

  // Don't mix Branded with non-Branded — they represent different things
  // (specific SKU vs generic food type with prep variants).
  if (parentIsBranded !== candidateIsBranded) {
    return { ok: false, reason: 'usda-branded-vs-non-branded-mismatch' }
  }

  if (!parentIsBranded) {
    // Non-Branded: groupKey match (checked by caller) is sufficient — but block
    // grossly divergent preparations (brewed tea vs tea powder) from merging.
    if (caloriesGrosslyDivergent(parent.nutritionProfile, candidate.nutritionProfile)) {
      return { ok: false, reason: 'usda-non-branded-calorie-divergent' }
    }
    return { ok: true, reason: 'usda-non-branded-groupkey-match' }
  }

  // Branded path: require brand match AND nutrient profile within tolerance.
  const pBrand = normalizeBrand(parent.brand)
  const cBrand = normalizeBrand(candidate.brand)
  if (!pBrand || !cBrand) return { ok: false, reason: 'usda-branded-missing-brand' }
  if (pBrand !== cBrand) return { ok: false, reason: 'usda-branded-different-brand' }

  if (!nutritionWithinTolerance(parent.nutritionProfile, candidate.nutritionProfile)) {
    return { ok: false, reason: 'usda-branded-nutrient-out-of-tolerance' }
  }
  return { ok: true, reason: 'usda-branded-same-brand-nutrient-match' }
}

function canMergeOFF(
  parent: VariantMergeParent,
  candidate: VariantMergeCandidate,
): MergeDecision {
  // Conflicting barcodes → never merge. Two different physical products
  // with the same groupKey are still two products.
  if (parent.barcode && candidate.barcode && parent.barcode !== candidate.barcode) {
    return { ok: false, reason: 'off-conflicting-barcode' }
  }

  const pBrand = normalizeBrand(parent.brand)
  const cBrand = normalizeBrand(candidate.brand)

  // Conflicting brands → never merge, even with absent/matching barcodes.
  // "Fage Greek Yogurt" and "Chobani Greek Yogurt" are different products.
  if (pBrand && cBrand && pBrand !== cBrand) {
    return { ok: false, reason: 'off-different-brand' }
  }

  // Shared brand: same product family, different variants → merge, UNLESS the
  // calorie density is grossly different (regular vs zero/diet are distinct
  // products, not variants of one food).
  if (pBrand && cBrand && pBrand === cBrand) {
    if (caloriesGrosslyDivergent(parent.nutritionProfile, candidate.nutritionProfile)) {
      return { ok: false, reason: 'off-shared-brand-calorie-divergent' }
    }
    return { ok: true, reason: 'off-shared-brand' }
  }

  // Both barcode-absent AND both brand-absent: generic OFF entries with no
  // distinguishing features → accept on groupKey match.
  if (!parent.barcode && !candidate.barcode && !pBrand && !cBrand) {
    if (caloriesGrosslyDivergent(parent.nutritionProfile, candidate.nutritionProfile)) {
      return { ok: false, reason: 'off-calorie-divergent' }
    }
    return { ok: true, reason: 'off-no-barcodes-no-brand' }
  }

  return { ok: false, reason: 'off-brand-or-barcode-required' }
}

/**
 * Decide whether `candidate` can be auto-merged onto `parent` as a new
 * variant. Pure; no IO. Caller is responsible for the candidate-parent
 * lookup and the atomic write.
 *
 * Universal gates (applied before source-specific logic):
 *   - parent not admin-verified (locked)
 *   - parent has fewer than MAX_VARIANTS_PER_FOOD variants
 *   - same source on both sides (no cross-source merging — by design)
 *   - both sides have a non-empty groupKey (length ≥ 2)
 *   - groupKey strings match
 *
 * Then source-specific rules apply (see canMergeUSDA / canMergeOFF).
 *
 * Returns { ok, reason } so callers and tests can introspect *why* a
 * decision went the way it did.
 */
export function canAutoMergeAsVariant(
  parent: VariantMergeParent | null | undefined,
  candidate: VariantMergeCandidate | null | undefined,
): MergeDecision {
  if (!parent || !candidate) return { ok: false, reason: 'null-input' }

  if (parent.isVerified === true) return { ok: false, reason: 'parent-verified-locked' }
  if (parent.variantsCount >= MAX_VARIANTS_PER_FOOD) return { ok: false, reason: 'cap-reached' }
  if (parent.source !== candidate.source) return { ok: false, reason: 'cross-source-not-allowed' }

  const pGroup = parent.groupKey ?? ''
  const cGroup = candidate.groupKey ?? ''
  if (pGroup.length < 2) return { ok: false, reason: 'parent-empty-groupkey' }
  if (cGroup.length < 2) return { ok: false, reason: 'candidate-empty-groupkey' }
  if (pGroup !== cGroup) return { ok: false, reason: 'groupkey-mismatch' }

  switch (parent.source) {
    case 'usda':
      return canMergeUSDA(parent, candidate)
    case 'openfoodfacts':
      return canMergeOFF(parent, candidate)
    case 'manual':
      return { ok: false, reason: 'manual-never-auto-merges' }
    default:
      return { ok: false, reason: 'unsupported-source' }
  }
}
