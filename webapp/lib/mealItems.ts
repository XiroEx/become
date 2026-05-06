import mongoose from 'mongoose'
import Food, { IFood } from '@/models/Food'
import { IMealItem, IMealNutrition } from '@/models/Meal'

// ---------------------------------------------------------------------------
// Shared helpers for working with meal/meal-log items.
//
// `resolveItemFromInput` turns a loose client payload into a normalized
// IMealItem, snapshotting nutrition from the underlying Food/variant when
// available so the log is stable against later edits.
// ---------------------------------------------------------------------------

export interface MealItemInput {
  foodId?: string | mongoose.Types.ObjectId
  variantId?: string | mongoose.Types.ObjectId
  variantName?: string
  name?: string
  brand?: string
  servingSize?: number
  servingUnit?: string
  servings?: number
  nutrition?: Partial<IMealNutrition>
}

function coerceObjectId(v: string | mongoose.Types.ObjectId | undefined): mongoose.Types.ObjectId | undefined {
  if (!v) return undefined
  if (v instanceof mongoose.Types.ObjectId) return v
  if (mongoose.Types.ObjectId.isValid(String(v))) return new mongoose.Types.ObjectId(String(v))
  return undefined
}

function coerceNutrition(n: Partial<IMealNutrition> | undefined): IMealNutrition {
  return {
    calories: n?.calories ?? 0,
    protein: n?.protein ?? 0,
    carbs: n?.carbs ?? 0,
    fats: n?.fats ?? 0,
    fiber: n?.fiber,
    sugar: n?.sugar,
    sodium: n?.sodium,
    saturatedFat: n?.saturatedFat,
  }
}

/**
 * Resolve a loose client item payload into a stored IMealItem.
 * If `foodId` is supplied, snapshots from the Food doc's chosen variant.
 * Client-supplied nutrition wins when present (rescaled servings already
 * factored into nutrition by the client are NOT touched here — see PATCH item).
 */
export async function resolveItemFromInput(input: MealItemInput): Promise<IMealItem> {
  let name = input.name
  let brand = input.brand
  let servingSize = input.servingSize
  let servingUnit = input.servingUnit
  let nutrition: IMealNutrition | undefined = input.nutrition ? coerceNutrition(input.nutrition) : undefined
  const foodObjectId = coerceObjectId(input.foodId)
  let variantObjectId = coerceObjectId(input.variantId)
  let variantName = input.variantName

  if (foodObjectId) {
    const foodDoc = await Food.findById(foodObjectId).lean<(IFood & { _id: mongoose.Types.ObjectId }) | null>()
    if (foodDoc) {
      const variant = variantObjectId
        ? foodDoc.variants.find(v => v._id?.toString() === variantObjectId!.toString())
        : undefined
      const chosen = variant ?? foodDoc.variants.find(v => v.isDefault) ?? foodDoc.variants[0]
      if (chosen) {
        if (!nutrition) nutrition = coerceNutrition(chosen.nutrition)
        if (servingSize == null) servingSize = chosen.servingSize
        if (!servingUnit) servingUnit = chosen.servingUnit
        if (!variantObjectId) variantObjectId = chosen._id
        if (!variantName) variantName = chosen.name
      }
      if (!name) name = foodDoc.name
      if (!brand) brand = foodDoc.brand
    }
  }

  if (!name) throw new Error('Item is missing required field: name')
  if (servingSize == null) throw new Error('Item is missing required field: servingSize')
  if (!servingUnit) throw new Error('Item is missing required field: servingUnit')
  if (!nutrition) throw new Error('Item is missing required field: nutrition')

  return {
    foodId: foodObjectId,
    variantId: variantObjectId,
    variantName,
    name,
    brand,
    servingSize,
    servingUnit,
    servings: input.servings ?? 1,
    nutrition,
  }
}

export async function resolveItemsFromInput(items: MealItemInput[]): Promise<IMealItem[]> {
  return Promise.all(items.map(resolveItemFromInput))
}
