/**
 * Pure serving-scaling math. The webapp stores food nutrition per 100g and
 * computes consumed kcal/macros at log time. We mirror that here so the
 * native side and the future shared/api-client/ converge.
 */
export interface FoodNutrition {
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface MacroBreakdown {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type ServingUnit = "g" | "oz" | "custom";

export interface ServingSpec {
  unit: ServingUnit;
  amount: number;
  /** Required for `custom` units; defaults to 28.3495 for `oz`. */
  gramsPerUnit?: number;
}

export const GRAMS_PER_OZ = 28.3495;

export function gramsForServing(spec: ServingSpec): number {
  if (!Number.isFinite(spec.amount) || spec.amount <= 0) return 0;
  switch (spec.unit) {
    case "g":
      return spec.amount;
    case "oz":
      return spec.amount * (spec.gramsPerUnit ?? GRAMS_PER_OZ);
    case "custom":
      if (!spec.gramsPerUnit || spec.gramsPerUnit <= 0) return 0;
      return spec.amount * spec.gramsPerUnit;
  }
}

export function scaleNutrition(
  food: FoodNutrition,
  grams: number,
): MacroBreakdown {
  if (!Number.isFinite(grams) || grams <= 0) {
    return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }
  const factor = grams / 100;
  return {
    kcal: food.kcalPer100g * factor,
    protein: food.proteinPer100g * factor,
    carbs: food.carbsPer100g * factor,
    fat: food.fatPer100g * factor,
  };
}

export function macroBreakdownForServing(
  food: FoodNutrition,
  spec: ServingSpec,
): MacroBreakdown {
  return scaleNutrition(food, gramsForServing(spec));
}
