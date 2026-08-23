import { convert, familyOf, type Unit } from './units'

// ---------------------------------------------------------------------------
// foodReview — auto-flag rules for the Food collection.
//
// Used in two places:
//   1. Import time (lib/foodImport.ts): if `computeReviewIssues` returns any
//      issues, the new Food doc is created with `needsReview: true`.
//   2. Admin detail page (/dashboard/admin/foods/[id]): re-runs at render
//      time so the admin sees a live list of WHY a food was flagged. We
//      don't store the reasons separately because the underlying data may
//      have changed between flag-time and review-time.
//
// Tolerances are deliberately permissive — we only want to flag genuinely
// suspect entries, not borderline ones. Better to under-flag than over-flag.
// ---------------------------------------------------------------------------

export type ReviewIssueCode =
  | 'slug_collision'
  | 'calories_out_of_range'
  | 'negative_nutrition'
  | 'macros_inconsistent'
  | 'no_nutrition'
  | 'bridge_conflict'

export interface ReviewIssue {
  code: ReviewIssueCode
  message: string
}

export interface FoodForReview {
  slug?: string
  variants: Array<{
    isDefault?: boolean
    servingSize?: number
    servingUnit?: string
    gramsPerServing?: number
    mlPerServing?: number
    nutrition?: {
      calories?: number
      protein?: number
      carbs?: number
      fats?: number
      fiber?: number
      sugar?: number
      sodium?: number
      saturatedFat?: number
    }
  }>
}

/**
 * Tolerances for the various sanity checks. Centralized so they're easy to
 * tune from one place.
 */
const CALORIE_UPPER = 1000 // per 100g; oils ~900, butter ~717 — anything above 1000 is suspect
const MACRO_TOLERANCE = 0.30 // |4P + 4C + 9F - cal| / cal must be <= 30%

type CalorieDensityBasis = {
  amount: number
  unit: 'g' | 'ml'
}

/**
 * Resolve the mass/volume amount that the stored nutrition describes.
 *
 * Native mass and volume units use servingSize converted to g/ml. A discrete
 * serving (each/slice/scoop/serving) has no density unless its bridge declares
 * the weight or volume of that serving. gramsPerServing/mlPerServing are NOT
 * used for a native mass/volume food because there they may describe a handy
 * household portion rather than the storage basis (the normal per-100 import
 * shape).
 */
function calorieDensityBasis(
  variant: FoodForReview['variants'][number],
): CalorieDensityBasis | null {
  const servingSize = variant.servingSize
  const servingUnit = (variant.servingUnit ?? '').toLowerCase() as Unit

  if (servingSize != null && Number.isFinite(servingSize) && servingSize > 0) {
    const family = familyOf(servingUnit)
    try {
      if (family === 'mass') {
        return { amount: convert(servingSize, servingUnit, 'g'), unit: 'g' }
      }
      if (family === 'volume') {
        return { amount: convert(servingSize, servingUnit, 'ml'), unit: 'ml' }
      }
    } catch {
      // Invalid/legacy unit: fall through to an explicit bridge if one exists.
    }
  }

  if (
    variant.gramsPerServing != null
    && Number.isFinite(variant.gramsPerServing)
    && variant.gramsPerServing > 0
  ) {
    return { amount: variant.gramsPerServing, unit: 'g' }
  }
  if (
    variant.mlPerServing != null
    && Number.isFinite(variant.mlPerServing)
    && variant.mlPerServing > 0
  ) {
    return { amount: variant.mlPerServing, unit: 'ml' }
  }

  return null
}

/**
 * Return all auto-flag issues for a Food. Empty array means the food is
 * clean — caller may leave `needsReview = false`.
 *
 * Only checks the DEFAULT variant (or first if none flagged default) — that's
 * the variant the picker shows by default and is the one most likely to be
 * surfaced to a user. Multi-variant foods may have a clean default and a
 * suspect alternate; we don't flag for that case.
 */
export function computeReviewIssues(food: FoodForReview): ReviewIssue[] {
  const issues: ReviewIssue[] = []

  // 1. Slug collision suffix beyond -2 (i.e. -3 or higher) implies that we've
  // already auto-deduped twice and the user/import pipeline is creating
  // near-duplicates.
  const slug = food.slug ?? ''
  const slugMatch = slug.match(/-(\d+)$/)
  if (slugMatch) {
    const n = parseInt(slugMatch[1], 10)
    if (n >= 3) {
      issues.push({
        code: 'slug_collision',
        message: `Slug suffix is "${slug}" — name+brand collides with multiple existing foods`,
      })
    }
  }

  const variant = food.variants?.find(v => v.isDefault) ?? food.variants?.[0]
  if (!variant) return issues
  const n = variant.nutrition

  // 2. No usable nutrition.
  if (!n || (n.calories === 0 && (n.protein ?? 0) === 0 && (n.carbs ?? 0) === 0 && (n.fats ?? 0) === 0)) {
    issues.push({
      code: 'no_nutrition',
      message: 'No usable nutrition (calories and macros are all zero)',
    })
    // Don't bother running the further numeric checks against zeros.
    return runBridgeCheck(variant, issues)
  }

  // 3. Negative values — a sign of bad upstream data or import bug.
  const negs: string[] = []
  if ((n.calories ?? 0) < 0) negs.push('calories')
  if ((n.protein ?? 0) < 0) negs.push('protein')
  if ((n.carbs ?? 0) < 0) negs.push('carbs')
  if ((n.fats ?? 0) < 0) negs.push('fats')
  if (negs.length > 0) {
    issues.push({
      code: 'negative_nutrition',
      message: `Negative nutrition values: ${negs.join(', ')}`,
    })
  }

  // 4. Calories out of range. Computed per 100g/100ml so package size and
  // native unit do not change the result. For discrete foods, only run this
  // check when a grams/ml bridge makes density knowable. Treating "1 serving"
  // as one gram used to flag essentially every saved recipe above 10 calories.
  const densityBasis = calorieDensityBasis(variant)
  const per100Cals = densityBasis
    ? ((n.calories ?? 0) / densityBasis.amount) * 100
    : null
  if (densityBasis && per100Cals != null && per100Cals > CALORIE_UPPER) {
    issues.push({
      code: 'calories_out_of_range',
      message: `Calories per 100${densityBasis.unit} = ${Math.round(per100Cals)}, above ${CALORIE_UPPER} threshold`,
    })
  }

  // 5. Macros consistency. The 4-9-4 model: protein 4 cal/g, carbs 4 cal/g,
  // fats 9 cal/g. Tolerance is 30% — fiber, alcohol, sugar alcohols, and
  // rounding all introduce slack. We skip when calories ≤ 0 to avoid div-by-0.
  const cals = n.calories ?? 0
  if (cals > 0) {
    const expected = 4 * (n.protein ?? 0) + 4 * (n.carbs ?? 0) + 9 * (n.fats ?? 0)
    const drift = Math.abs(expected - cals) / cals
    if (drift > MACRO_TOLERANCE) {
      issues.push({
        code: 'macros_inconsistent',
        message: `Macros (4P+4C+9F = ${Math.round(expected)}) don't match calories (${Math.round(cals)}); drift ${Math.round(drift * 100)}%`,
      })
    }
  }

  // 6. Bridge conflict
  return runBridgeCheck(variant, issues)
}

function runBridgeCheck(
  variant: FoodForReview['variants'][number],
  issues: ReviewIssue[],
): ReviewIssue[] {
  const su = (variant.servingUnit ?? '').toLowerCase()

  // A servingSize of exactly 100 is the per-100 MATH REFERENCE, not a claim
  // about the serving — that is how every OpenFoodFacts/USDA import is stored,
  // with the real serving weight carried in gramsPerServing/mlPerServing.
  // Cinnamon Toast Crunch is servingSize=100 g with gramsPerServing=40 and a
  // "40g" label, and it is completely correct. QuantityPicker and
  // servingOptions both read that shape as normal and rely on the two
  // differing; only this rule called it a conflict, and it did so for 2543 of
  // the 3656 OFF imports, burying ~700 real issues under false positives.
  //
  // A genuine conflict is when servingSize is NOT the per-100 reference and the
  // bridge still disagrees with it — then the two really are describing the
  // same serving with different numbers.
  const isPer100Reference = variant.servingSize === 100

  if (
    !isPer100Reference
    && variant.gramsPerServing != null
    && (su === 'g')
    && Math.abs(variant.gramsPerServing - (variant.servingSize ?? 0)) > 0.5
  ) {
    issues.push({
      code: 'bridge_conflict',
      message: `gramsPerServing=${variant.gramsPerServing} contradicts servingSize=${variant.servingSize} g`,
    })
  }
  if (
    !isPer100Reference
    && variant.mlPerServing != null
    && (su === 'ml')
    && Math.abs(variant.mlPerServing - (variant.servingSize ?? 0)) > 0.5
  ) {
    issues.push({
      code: 'bridge_conflict',
      message: `mlPerServing=${variant.mlPerServing} contradicts servingSize=${variant.servingSize} ml`,
    })
  }
  return issues
}
