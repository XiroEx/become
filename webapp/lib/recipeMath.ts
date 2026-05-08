// ---------------------------------------------------------------------------
// recipeMath — bridge estimators for recipe-derived foods.
//
// When a Meal is saved as a Food (POST /api/meals/[id]/save-as-food), we
// want the resulting Food variant to expose a `gramsPerServing` (and
// occasionally `mlPerServing`) bridge so the picker can render meaningful
// gram-based quick options. The estimators here look at the meal's items
// and the recipe servings count and compute "average grams per serving"
// IF the math is reliable.
//
// "Reliable" means every item can be summed in the target family. If any
// item bails (e.g. unit is `each` with no foodId, or a volume item lacks a
// gramsPerServing on the linked Food variant), we return undefined rather
// than fudging a partial total. A misleading bridge is worse than none.
//
// The grams estimator is async because volume→mass items require a Food
// lookup. The ml estimator is sync (it only succeeds when every item is
// already volume-native).
// ---------------------------------------------------------------------------

import type { IMeal, IMealItem } from '@/models/Meal'
import Food, { type IFood, type IFoodVariant } from '@/models/Food'
import { Types } from 'mongoose'
import { convert, familyOf, type Unit } from '@/lib/units'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MASS_UNITS: ReadonlySet<Unit> = new Set(['g', 'oz', 'lb'])
const VOLUME_UNITS: ReadonlySet<Unit> = new Set(['ml', 'fl_oz', 'cup', 'tbsp', 'tsp'])

function asUnit(u: string | undefined): Unit | null {
  if (!u) return null
  const lower = u.toLowerCase()
  // Only the canonical Unit identifiers — recipe items snapshot the variant's
  // ServingUnit so they're already canonical, but we belt-and-brace here.
  switch (lower) {
    case 'g': case 'oz': case 'lb':
    case 'ml': case 'fl_oz': case 'cup': case 'tbsp': case 'tsp':
    case 'each': case 'slice': case 'scoop': case 'serving':
      return lower as Unit
    default:
      return null
  }
}

/** Total quantity of an item in its native unit: servingSize × servings. */
function totalQuantity(item: IMealItem): number {
  const size = item.servingSize ?? 0
  const count = item.servings ?? 1
  return size * count
}

/**
 * Find the variant inside a Food doc that the item snapshot refers to. We
 * prefer an exact `variantId` match, then fall back to default variant.
 */
function variantFor(food: IFood, item: IMealItem): IFoodVariant | undefined {
  if (item.variantId) {
    const idStr = String(item.variantId)
    const match = food.variants.find(v => String(v._id) === idStr)
    if (match) return match
  }
  return food.variants.find(v => v.isDefault) ?? food.variants[0]
}

/**
 * Load every Food referenced by the meal's items in a single query. Returns
 * a Map keyed by foodId (as string).
 */
async function loadLinkedFoods(meal: IMeal): Promise<Map<string, IFood>> {
  const ids = new Set<string>()
  for (const item of meal.items) {
    if (item.foodId) ids.add(String(item.foodId))
  }
  if (ids.size === 0) return new Map()
  const foods = await Food.find({
    _id: { $in: [...ids].map(id => new Types.ObjectId(id)) },
  }).lean<IFood[]>()
  const map = new Map<string, IFood>()
  for (const f of foods) {
    if (f._id) map.set(String(f._id), f)
  }
  return map
}

// ---------------------------------------------------------------------------
// Public estimators
// ---------------------------------------------------------------------------

/**
 * Estimate the average gram weight of one serving of a recipe-derived food.
 *
 * Returns undefined when the math isn't reliable. We bail rather than guess:
 *   - No `recipe.servings` (or <= 0)
 *   - Any item is in the discrete family (`each`/`slice`/`scoop`/`serving`)
 *     since we don't know the gram weight without a per-item bridge
 *   - A volume-native item exists without a usable `gramsPerServing` bridge
 *     on the linked Food variant
 *   - Any item's unit is unrecognized
 *
 * Algorithm when it succeeds:
 *   1. For each item compute `totalQuantity = servingSize × servings`.
 *   2. If unit is mass: convert totalQuantity to grams via `convert`.
 *   3. If unit is volume: look up the linked Food's variant `gramsPerServing`
 *      and scale: totalQuantity / variant.servingSize × gramsPerServing.
 *   4. Sum across items, divide by recipe.servings, round to nearest gram.
 */
export async function estimatedGramsPerServing(
  meal: IMeal,
): Promise<number | undefined> {
  const servings = meal.recipe?.servings
  if (!servings || servings <= 0) return undefined
  if (!meal.items || meal.items.length === 0) return undefined

  // Decide if we even need to load Foods (only when at least one item is
  // volume-native — mass items don't need the bridge).
  const needsLookup = meal.items.some(item => {
    const u = asUnit(item.servingUnit)
    return u != null && VOLUME_UNITS.has(u)
  })

  const linkedFoods = needsLookup ? await loadLinkedFoods(meal) : new Map<string, IFood>()

  let totalGrams = 0
  for (const item of meal.items) {
    const unit = asUnit(item.servingUnit)
    if (!unit) return undefined

    const family = familyOf(unit)
    const qty = totalQuantity(item)
    if (!Number.isFinite(qty) || qty <= 0) return undefined

    if (family === 'mass') {
      // Same-family conversion to grams is exact and bridge-free.
      totalGrams += convert(qty, unit, 'g')
      continue
    }

    if (family === 'volume') {
      // Need a gramsPerServing bridge on the linked Food's variant.
      if (!item.foodId) return undefined
      const food = linkedFoods.get(String(item.foodId))
      if (!food) return undefined
      const variant = variantFor(food, item)
      if (!variant) return undefined
      const variantUnit = asUnit(variant.servingUnit)
      const grams = variant.gramsPerServing
      if (grams == null || !variantUnit) return undefined

      // Convert the item's volume into the variant's serving-volume unit
      // (it's normally identical, but be defensive when the snapshot drifts
      // from the live variant), then scale by gramsPerServing.
      let qtyInVariantUnit: number
      if (variantUnit === unit) {
        qtyInVariantUnit = qty
      } else if (familyOf(variantUnit) === 'volume') {
        qtyInVariantUnit = convert(qty, unit, variantUnit)
      } else {
        // Variant moved to a non-volume unit since the snapshot was taken —
        // we can't trust the bridge in that case.
        return undefined
      }
      const itemGrams = (qtyInVariantUnit / variant.servingSize) * grams
      if (!Number.isFinite(itemGrams)) return undefined
      totalGrams += itemGrams
      continue
    }

    // discrete — bail; we don't have per-item bridges for "each"/"slice"/etc.
    return undefined
  }

  if (!Number.isFinite(totalGrams) || totalGrams <= 0) return undefined
  const perServing = totalGrams / servings
  if (!Number.isFinite(perServing) || perServing <= 0) return undefined
  return Math.round(perServing)
}

/**
 * Estimate average ml per serving for a recipe-derived food.
 *
 * Symmetric to grams but stricter: only succeeds when EVERY item is volume-
 * native AND no items pull in mass. Most recipes won't satisfy this — that's
 * fine. Mass items can't be converted to ml without a per-variant bridge,
 * and surfacing a half-truth is the failure mode we explicitly reject.
 *
 * Sync because we only need the items themselves; no Food lookups.
 */
export function estimatedMlPerServing(meal: IMeal): number | undefined {
  const servings = meal.recipe?.servings
  if (!servings || servings <= 0) return undefined
  if (!meal.items || meal.items.length === 0) return undefined

  let totalMl = 0
  for (const item of meal.items) {
    const unit = asUnit(item.servingUnit)
    if (!unit) return undefined
    if (!VOLUME_UNITS.has(unit)) return undefined
    const qty = totalQuantity(item)
    if (!Number.isFinite(qty) || qty <= 0) return undefined
    totalMl += convert(qty, unit, 'ml')
  }

  if (!Number.isFinite(totalMl) || totalMl <= 0) return undefined
  const perServing = totalMl / servings
  if (!Number.isFinite(perServing) || perServing <= 0) return undefined
  return Math.round(perServing)
}
