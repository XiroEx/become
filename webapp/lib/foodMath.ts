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
 * Multiplier applied to the variant's per-serving nutrition for a given
 * quantity in some unit. Throws if the unit can't be reconciled.
 *
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

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
