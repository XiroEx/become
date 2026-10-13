/**
 * Model types required by pure nutrition calculations.
 *
 * In webapp these are imported from `@/models/Food` with Mongoose `Types.ObjectId`.
 * In `@become/core`, ObjectId fields are represented as strings so the package
 * remains free of database or Node-only dependencies.
 */

export type ServingUnit =
  | 'g'
  | 'oz'
  | 'cup'
  | 'each'
  | 'ml'
  | 'tbsp'
  | 'tsp'
  | 'slice'
  | 'scoop'
  | 'serving'

export type FoodSource = 'usda' | 'openfoodfacts' | 'manual'

export interface IFoodNutrition {
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber?: number
  sugar?: number
  sodium?: number
  saturatedFat?: number
}

export interface IAlternateServing {
  label: string
  multiplier: number
}

export interface IFoodVariant {
  _id?: string
  name: string
  isDefault: boolean
  servingSize: number
  servingUnit: ServingUnit
  displayLabel?: string
  alternateServings: IAlternateServing[]
  nutrition: IFoodNutrition
  gramsPerServing?: number
  mlPerServing?: number
  externalId?: string
  externalDataType?: string
}

export interface QuantityPickerVariant {
  servingSize: IFoodVariant['servingSize']
  servingUnit: IFoodVariant['servingUnit']
  displayLabel?: IFoodVariant['displayLabel']
  alternateServings?: IFoodVariant['alternateServings']
  nutrition: IFoodNutrition
  gramsPerServing?: IFoodVariant['gramsPerServing']
  mlPerServing?: IFoodVariant['mlPerServing']
}

export interface EstimatedPlateItem {
  name: string
  brand?: string
  estimatedServing: string
  nutrition: IFoodNutrition
  confidence: number
}

export interface PlateEstimate {
  items: EstimatedPlateItem[]
  total?: IFoodNutrition
  caveats?: string[]
  allowanceTicket?: string
}

export interface IFoodEntry {
  id?: string
  foodId?: string
  variantId?: string
  variantName?: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  servings: number
  nutrition: IFoodNutrition
  servingLabel?: string
  loggedQuantity?: number
  loggedUnit?: string
  loggedGramsPerServing?: number
  loggedMlPerServing?: number
}

