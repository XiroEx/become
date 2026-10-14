import { convert, familyOf, type Unit } from './units'

// ---------------------------------------------------------------------------
// foodReview — auto-flag rules for the Food collection.
//
// Import and reconciliation writers persist both the materialized boolean and
// provenance (ownership, rule version, issue codes). The admin detail page
// also re-runs these rules so it can distinguish stored evidence from the live
// result after underlying food data or the rule set changes.
//
// Tolerances are deliberately permissive — we only want to flag genuinely
// suspect entries, not borderline ones. Better to under-flag than over-flag.
// ---------------------------------------------------------------------------

export const REVIEW_ISSUE_CODES = [
  'slug_collision',
  'calories_out_of_range',
  'negative_nutrition',
  'macros_inconsistent',
  'no_nutrition',
  'bridge_conflict',
] as const

export type ReviewIssueCode = (typeof REVIEW_ISSUE_CODES)[number]

export interface ReviewIssue {
  code: ReviewIssueCode
  message: string
}

/**
 * Bump whenever the automatic rules change in a way that may change a stored
 * flag. Reconciliation reports the version that produced its decision.
 */
export const FOOD_REVIEW_RULE_VERSION = '2026-08-23.1'

export type FoodReviewOwner = 'automatic' | 'manual'
export const FOOD_REVIEW_ORIGINS = [
  'import',
  'rules',
  'admin',
  'reconcile',
  'legacy-created-flag',
] as const

export type FoodReviewOrigin = (typeof FOOD_REVIEW_ORIGINS)[number]

export interface FoodReviewFlagState {
  owner: FoodReviewOwner
  issueCodes: ReviewIssueCode[]
  ruleVersion: string
  origin: FoodReviewOrigin
  updatedAt: Date
  updatedBy?: string
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

function sortedIssueCodes(issues: ReviewIssue[]): ReviewIssueCode[] {
  return [...new Set(issues.map(issue => issue.code))].sort()
}

/** The complete pair an automatic writer must persist together. */
export function computeAutomaticReviewState(
  food: FoodForReview,
  options: { at?: Date; origin?: Extract<FoodReviewOrigin, 'import' | 'rules' | 'reconcile' | 'legacy-created-flag'> } = {},
): { needsReview: boolean; reviewFlag: FoodReviewFlagState; issues: ReviewIssue[] } {
  const issues = computeReviewIssues(food)
  return {
    needsReview: issues.length > 0,
    reviewFlag: {
      owner: 'automatic',
      issueCodes: sortedIssueCodes(issues),
      ruleVersion: FOOD_REVIEW_RULE_VERSION,
      origin: options.origin ?? 'rules',
      updatedAt: options.at ?? new Date(),
    },
    issues,
  }
}

/** An explicit admin choice owns the flag even when that choice is `false`. */
export function manualReviewState(
  needsReview: boolean,
  options: { at?: Date; updatedBy?: string } = {},
): { needsReview: boolean; reviewFlag: FoodReviewFlagState } {
  return {
    needsReview,
    reviewFlag: {
      owner: 'manual',
      issueCodes: [],
      ruleVersion: FOOD_REVIEW_RULE_VERSION,
      origin: 'admin',
      updatedAt: options.at ?? new Date(),
      ...(options.updatedBy ? { updatedBy: options.updatedBy } : {}),
    },
  }
}

export function isAutomaticReviewOwned(
  flag: Pick<FoodReviewFlagState, 'owner'> | null | undefined,
): boolean {
  return flag?.owner === 'automatic'
}

export interface AdminFoodQueryParamsValidation {
  valid: boolean
  error?: string
  issues: ReviewIssueCode[]
  origins: FoodReviewOrigin[]
  excludeLegacy: boolean
}

export function validateAdminFoodQueryParams(
  searchParams: URLSearchParams,
): AdminFoodQueryParamsValidation {
  const issueRaw = searchParams.getAll('issue').join(',')
  const rawIssues = issueRaw
    ? issueRaw.split(',').map(s => s.trim()).filter(Boolean)
    : []

  for (const code of rawIssues) {
    if (!REVIEW_ISSUE_CODES.includes(code as ReviewIssueCode)) {
      return {
        valid: false,
        error: `Unknown issue code: "${code}". Allowed issue codes: ${REVIEW_ISSUE_CODES.join(', ')}`,
        issues: [],
        origins: [],
        excludeLegacy: false,
      }
    }
  }

  const originRaw = searchParams.getAll('origin').join(',')
  const rawOrigins = originRaw
    ? originRaw.split(',').map(s => s.trim()).filter(Boolean)
    : []

  for (const orig of rawOrigins) {
    if (!FOOD_REVIEW_ORIGINS.includes(orig as FoodReviewOrigin)) {
      return {
        valid: false,
        error: `Unknown origin: "${orig}". Allowed origins: ${FOOD_REVIEW_ORIGINS.join(', ')}`,
        issues: [],
        origins: [],
        excludeLegacy: false,
      }
    }
  }

  const excludeLegacy =
    searchParams.get('excludeLegacy') === '1' ||
    searchParams.get('excludeLegacy') === 'true' ||
    searchParams.get('exclude_legacy') === '1' ||
    searchParams.get('exclude_legacy') === 'true'

  return {
    valid: true,
    issues: rawIssues as ReviewIssueCode[],
    origins: rawOrigins as FoodReviewOrigin[],
    excludeLegacy,
  }
}

export interface BuildAdminFoodsFilterOptions {
  q?: string
  flagged?: boolean
  source?: string
  issues?: ReviewIssueCode[]
  origins?: FoodReviewOrigin[]
  excludeLegacy?: boolean
}

export function buildAdminFoodsFilter(
  options: BuildAdminFoodsFilterOptions,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {}
  const andClauses: Record<string, unknown>[] = []

  if (options.flagged) {
    filter.needsReview = true
  }

  if (options.source && ['manual', 'usda', 'openfoodfacts'].includes(options.source)) {
    filter.source = options.source
  }

  if (options.q && options.q.trim()) {
    const regex = { $regex: options.q.trim(), $options: 'i' }
    andClauses.push({
      $or: [{ name: regex }, { brand: regex }, { aliases: regex }, { slug: regex }],
    })
  }

  if (options.issues && options.issues.length > 0) {
    filter['reviewFlag.issueCodes'] =
      options.issues.length === 1 ? options.issues[0] : { $in: options.issues }
  }

  if (options.origins && options.origins.length > 0) {
    if (options.origins.includes('legacy-created-flag')) {
      andClauses.push({
        $or: [
          { 'reviewFlag.origin': { $in: options.origins } },
          { reviewFlag: null },
        ],
      })
    } else {
      filter['reviewFlag.origin'] =
        options.origins.length === 1 ? options.origins[0] : { $in: options.origins }
    }
  }

  if (options.excludeLegacy) {
    filter['reviewFlag'] = { $ne: null }
    filter['reviewFlag.origin'] = { $ne: 'legacy-created-flag' }
    filter['reviewFlag.issueCodes.0'] = { $exists: true }
  }

  if (andClauses.length === 1) {
    Object.assign(filter, andClauses[0])
  } else if (andClauses.length > 1) {
    filter.$and = andClauses
  }

  return filter
}

export function buildAdminFoodsReviewFacet(): Record<string, Record<string, unknown>[]> {
  const facet: Record<string, Record<string, unknown>[]> = {
    total: [{ $count: 'count' }],
    legacy: [
      {
        $match: {
          $or: [
            { reviewFlag: null },
            { 'reviewFlag.origin': 'legacy-created-flag' },
            { 'reviewFlag.issueCodes': { $size: 0 } },
            { 'reviewFlag.issueCodes': { $exists: false } },
          ],
        },
      },
      { $count: 'count' },
    ],
  }

  for (const code of REVIEW_ISSUE_CODES) {
    facet[code] = [
      { $match: { 'reviewFlag.issueCodes': code } },
      { $count: 'count' },
    ]
  }

  return facet
}

export function parseAdminFoodsReviewFacetResult(
  stats?: Record<string, Array<{ count: number }>>,
): {
  flaggedCount: number
  legacyCount: number
  issueCounts: Record<ReviewIssueCode, number>
} {
  const flaggedCount = stats?.total?.[0]?.count ?? 0
  const legacyCount = stats?.legacy?.[0]?.count ?? 0
  const issueCounts: Record<ReviewIssueCode, number> = {
    slug_collision: 0,
    calories_out_of_range: 0,
    negative_nutrition: 0,
    macros_inconsistent: 0,
    no_nutrition: 0,
    bridge_conflict: 0,
  }

  for (const code of REVIEW_ISSUE_CODES) {
    issueCounts[code] = stats?.[code]?.[0]?.count ?? 0
  }

  return { flaggedCount, legacyCount, issueCounts }
}
