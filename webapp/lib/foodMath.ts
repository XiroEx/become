// ---------------------------------------------------------------------------
// foodMath — single canonical "scale a variant's nutrition for a quantity-in-
// some-unit" helper. Replaces the ad-hoc per-surface math in
// FoodSearchModal / EditFoodModal / QuickAddModal.
//
// Every nutrition preview and submitted log entry should go through
// `nutritionForQuantity` (or its primitive `scalingFactor`). When the unit
// can't be reconciled with the variant — same family is fine; cross-family
// requires a bridge — we throw. The picker is responsible for not letting
// users pick combinations the variant can't honor.
// ---------------------------------------------------------------------------

import type { IFoodNutrition, IFoodVariant } from '@/models/Food'
import {
  type Unit,
  convert,
  convertWithBridge,
  familyOf,
} from '@/lib/units'

/** Subset of IFoodVariant that the math actually needs. */
export type VariantForMath = Pick<
  IFoodVariant,
  'servingSize' | 'servingUnit' | 'nutrition' | 'gramsPerServing' | 'mlPerServing'
>

/**
 * The weight (g) or volume (ml) of ONE real-world serving of this food, when
 * the food defines one. This is what a member means by "a portion".
 *
 * Imported records store nutrition per 100 g with the household portion in
 * gramsPerServing (broccoli: 100 g basis, 85 g bag). A mass-native food with no
 * bridge is its own serving (servingSize in servingUnit). A discrete food (1 bar,
 * 1 scoop) has no weight unless a bridge says so.
 */
export function realServing(
  variant: Pick<VariantForMath, 'servingSize' | 'servingUnit' | 'gramsPerServing' | 'mlPerServing'>,
): { grams?: number; ml?: number } | null {
  if (variant.gramsPerServing != null && variant.gramsPerServing > 0) return { grams: variant.gramsPerServing }
  if (variant.mlPerServing != null && variant.mlPerServing > 0) return { ml: variant.mlPerServing }
  const fam = familyOf(variant.servingUnit as Unit)
  if (fam === 'mass') return { grams: convert(variant.servingSize, variant.servingUnit as Unit, 'g') }
  if (fam === 'volume') return { ml: convert(variant.servingSize, variant.servingUnit as Unit, 'ml') }
  return null
}

/**
 * Multiplier applied to the variant's per-serving nutrition for a given
 * quantity in some unit. Throws if the unit can't be reconciled.
 *
 *   0. unit === 'serving':                  quantity × (one real serving)
 *   1. unit === variant.servingUnit:        quantity / servingSize
 *   2. same family as variant.servingUnit:  convert(quantity → servingUnit) / servingSize
 *   3. cross-family with bridge:            convertWithBridge → divide by servingSize
 *   4. otherwise: throw — UI shouldn't reach here
 */
export function scalingFactor(
  variant: VariantForMath,
  quantity: number,
  unit: Unit,
): number {
  const target = variant.servingUnit as Unit
  const servingSize = variant.servingSize

  if (!Number.isFinite(servingSize) || servingSize <= 0) {
    throw new Error(`variant.servingSize must be > 0 (got ${servingSize})`)
  }

  // 'serving' means N × the food's REAL portion, for any food that has one.
  //
  // Picking "1 portion (85 g)" used to hand the member the gram equivalent —
  // fill the box with 85, set the unit to g — so four portions meant working
  // out 4 × 85 by hand. Making the portion itself the unit lets them type 4.
  //
  // The maths route is deliberate: express N portions as a mass or volume, then
  // fall through to the ordinary paths below. That way this stays consistent
  // with what the picker previews for the same weight, rather than being a
  // second calculation that could drift from it (the 457-calorie protein bar
  // was exactly a number and a label describing different amounts).
  if (unit === 'serving' && target !== 'serving') {
    const one = realServing(variant)
    if (one?.grams != null) return scalingFactor(variant, quantity * one.grams, 'g')
    if (one?.ml != null) return scalingFactor(variant, quantity * one.ml, 'ml')
    // A discrete food with no bridge: one serving IS the variant's own unit.
    if (familyOf(target) === 'discrete') return quantity
    throw new Error('cannot resolve a serving for this food')
  }

  if (unit === target) {
    return quantity / servingSize
  }

  const fa = familyOf(unit)
  const fb = familyOf(target)

  if (fa === fb) {
    const inTarget = convert(quantity, unit, target)
    return inTarget / servingSize
  }

  const bridged = convertWithBridge(quantity, unit, target, {
    servingSize,
    servingUnit: target,
    gramsPerServing: variant.gramsPerServing,
    mlPerServing: variant.mlPerServing,
  })
  if (bridged == null) {
    throw new Error(`cannot convert ${unit} to ${target} without bridge`)
  }
  return bridged / servingSize
}

/**
 * Scale an IFoodNutrition by a numeric factor with the same rounding rules
 * the existing FoodSearchModal applies (1 decimal for macros / fiber / sugar /
 * saturated fat; 3 decimals for sodium because it's logged in grams).
 */
export function scaleNutrition(
  nutrition: IFoodNutrition,
  factor: number,
): IFoodNutrition {
  return {
    calories: round1(nutrition.calories * factor),
    protein:  round1(nutrition.protein  * factor),
    carbs:    round1(nutrition.carbs    * factor),
    fats:     round1(nutrition.fats     * factor),
    fiber:        nutrition.fiber        != null ? round1(nutrition.fiber        * factor) : undefined,
    sugar:        nutrition.sugar        != null ? round1(nutrition.sugar        * factor) : undefined,
    sodium:       nutrition.sodium       != null ? round3(nutrition.sodium       * factor) : undefined,
    saturatedFat: nutrition.saturatedFat != null ? round1(nutrition.saturatedFat * factor) : undefined,
  }
}

/**
 * Compute scaled nutrition for `quantity unit` against the variant. Throws
 * when the unit can't be reconciled (caller's responsibility to gate UI).
 */
export function nutritionForQuantity(
  variant: VariantForMath,
  quantity: number,
  unit: Unit,
): IFoodNutrition {
  const factor = scalingFactor(variant, quantity, unit)
  return scaleNutrition(variant.nutrition, factor)
}

/**
 * Scale a variant's stored nutrition to its actual per-serving values.
 *
 * Background: OpenFoodFacts imports are stored as per-100g canonical
 * (`servingSize=100`, `servingUnit='g'`) with the user-facing serving in
 * `gramsPerServing` (e.g. 38 for a one-bag chip serving). The stored
 * `nutrition` is per the canonical 100g, so the UI must scale it down to
 * the actual serving for display. Same idea for `ml` / `mlPerServing`.
 *
 * When `gramsPerServing` / `mlPerServing` match the storage size, or are
 * absent, or the unit isn't 'g' or 'ml' (e.g. 'each' / 'slice'), the
 * original nutrition is returned unchanged (scale = 1).
 *
 * Used by per-serving display surfaces (food detail page, variants list).
 * Logging code paths must NOT use this — they send the raw stored
 * nutrition along with `loggedQuantity` / `loggedGramsPerServing` so the
 * server can do its own scaling.
 */
export function scalePerServingNutrition(
  variant: {
    servingUnit?: string
    servingSize: number
    gramsPerServing?: number
    mlPerServing?: number
    nutrition: IFoodNutrition
  },
): IFoodNutrition {
  const unit = variant.servingUnit
  const size = variant.servingSize
  if (unit === 'g'
    && variant.gramsPerServing != null
    && variant.gramsPerServing > 0
    && size > 0
    && Math.abs(variant.gramsPerServing - size) > 0.001) {
    return scaleNutrition(variant.nutrition, variant.gramsPerServing / size)
  }
  if (unit === 'ml'
    && variant.mlPerServing != null
    && variant.mlPerServing > 0
    && size > 0
    && Math.abs(variant.mlPerServing - size) > 0.001) {
    return scaleNutrition(variant.nutrition, variant.mlPerServing / size)
  }
  return variant.nutrition
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
