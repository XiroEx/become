// Group/bulk-serving down-weighting for food-search ranking.
//
// A search for "coca cola" was crowning an Open Food Facts entry whose serving is
// the whole 67.6 fl oz / 2 L bottle (≈ 2800 cal) as the Best Match, over a normal
// single-serving can. Someone logging a drink means the individual serving — so we
// softly demote results whose single "serving" is really a multi-serving container.
//
// The penalty is a positive number ADDED to the relevance score (lower = better in
// the search sort), and is capped well below a single word-coverage step (100) so it
// only reorders results that are otherwise equally relevant — it never lets a
// less-relevant food outrank a more-relevant one, and it leaves normal foods at 0.

export interface ServingWeightInput {
  servingSize?: number
  servingUnit?: string
  gramsPerServing?: number | null
  mlPerServing?: number | null
  alternateServings?: ({ label?: string; multiplier?: number } | null)[] | null
  nutrition?: { calories?: number } | null
}

// Individual servings sit at/below these; beyond them we assume a bulk container.
const SINGLE_SERVING_KCAL = 700   // most single foods/meals are under ~700 cal
const KCAL_DIVISOR = 50           // gentle ramp: +1 penalty per 50 cal over
const KCAL_CAP = 45
const BULK_AMOUNT = 1500          // g or ml — catches ~2 L bottles / family bags
const AMOUNT_DIVISOR = 100
const AMOUNT_CAP = 20

/** Calories for the food's displayed single serving. Mirrors `rowCalories` in
 *  FoodSearchModal: our DB foods store per-serving calories (scale 1 for
 *  non-mass/volume units like cup/oz/each); OFF/USDA store per-100 with a
 *  gramsPerServing/mlPerServing bridge that scales up to the real serving. */
export function servingCalories(item: ServingWeightInput): number {
  const per = Number(item?.nutrition?.calories) || 0
  const size = Number(item?.servingSize) || 0
  let scale = 1
  if (item?.servingUnit === 'g' && Number(item.gramsPerServing) > 0 && size > 0
      && Math.abs(Number(item.gramsPerServing) - size) > 0.001) {
    scale = Number(item.gramsPerServing) / size
  } else if (item?.servingUnit === 'ml' && Number(item.mlPerServing) > 0 && size > 0
      && Math.abs(Number(item.mlPerServing) - size) > 0.001) {
    scale = Number(item.mlPerServing) / size
  }
  return per * scale
}

/** Effective single-serving mass/volume (g or ml), best-effort across sources. */
export function servingAmount(item: ServingWeightInput): number | null {
  const size = Number(item?.servingSize) || 0
  if (Number(item?.gramsPerServing) > 0) return Number(item!.gramsPerServing)
  if (Number(item?.mlPerServing) > 0) return Number(item!.mlPerServing)
  if ((item?.servingUnit === 'g' || item?.servingUnit === 'ml') && size > 0 && size !== 100) return size
  const mult = Number(item?.alternateServings?.[0]?.multiplier)
  if (mult > 0) return mult * (size > 0 ? size : 100)
  return null
}

export function groupServingPenalty(item: ServingWeightInput): number {
  let penalty = 0

  const kcal = servingCalories(item)
  if (kcal > SINGLE_SERVING_KCAL) {
    penalty += Math.min((kcal - SINGLE_SERVING_KCAL) / KCAL_DIVISOR, KCAL_CAP)
  }

  // Catch large-volume servings whose calories are low (e.g. a 2 L diet soda).
  const amount = servingAmount(item)
  if (amount != null && amount > BULK_AMOUNT) {
    penalty += Math.min((amount - BULK_AMOUNT) / AMOUNT_DIVISOR, AMOUNT_CAP)
  }

  return penalty
}
