// Shared nutrition types.
//
// These were historically exported from the (now-removed) NutritionLog model.
// Food logging is fully owned by MealLog; this file holds the small shared
// shapes that both the API compat layer and the client surfaces still use:
//   - IFoodEntry: the legacy per-food shape returned by /api/nutrition/log
//     (assembled from MealLog items)
//   - IQuickAdd: a macros-only "quick add" entry (stored on DayNutrition)
import type { Types } from 'mongoose'

export interface IFoodNutrition {
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber?: number
  sugar?: number
  sodium?: number
}

export interface IFoodEntry {
  id: string
  foodId?: Types.ObjectId | string
  variantId?: Types.ObjectId | string
  variantName?: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  servings: number
  nutrition: IFoodNutrition
  // PR 4 picker rework — provenance carried through so re-edit clients can avoid
  // synthesizing from `multiplier × servingSize`. Optional: old entries omit them.
  loggedQuantity?: number
  loggedUnit?: string
  loggedGramsPerServing?: number
  loggedMlPerServing?: number
}

export interface IQuickAdd {
  id: string
  calories: number
  protein: number
  carbs: number
  fats: number
  note?: string
  loggedAt: Date
}
