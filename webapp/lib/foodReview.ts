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

  const variant = food.variants?.[0]
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

  // 4. Calories out of range. Computed PER 100g/100ml — i.e. on a normalized
  // basis so package-size differences don't trip the check. We use the
  // variant's servingSize as the denominator: a Branded "1 cookie 30g" food
  // with 200 cal would normalize to 666 per 100g, well within range.
  const servingSize = variant.servingSize && variant.servingSize > 0 ? variant.servingSize : 100
  const per100Cals = ((n.calories ?? 0) / servingSize) * 100
  if (per100Cals > CALORIE_UPPER) {
    issues.push({
      code: 'calories_out_of_range',
      message: `Calories per 100${(variant.servingUnit ?? 'g').toLowerCase()} = ${Math.round(per100Cals)}, above ${CALORIE_UPPER} threshold`,
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
  if (
    variant.gramsPerServing != null
    && (su === 'g')
    && Math.abs(variant.gramsPerServing - (variant.servingSize ?? 0)) > 0.5
  ) {
    issues.push({
      code: 'bridge_conflict',
      message: `gramsPerServing=${variant.gramsPerServing} contradicts servingSize=${variant.servingSize} g`,
    })
  }
  if (
    variant.mlPerServing != null
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
