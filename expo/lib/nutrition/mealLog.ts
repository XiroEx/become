import type { MealLogResponse } from "@become/api-client";
import type { MealEntry, MealType } from "@/lib/nutrition/daySelector";

const MEAL_TYPES: ReadonlyArray<MealType> = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

function narrowMealType(value: string): MealType {
  return (MEAL_TYPES as readonly string[]).includes(value)
    ? (value as MealType)
    : "snack";
}

/**
 * Flatten the GET /api/nutrition/log response (meals → foods) into the flat
 * MealEntry list the presentational DayTotals consumes. The webapp keys macros
 * `calories/protein/carbs/fats`; we map those to kcal/protein/carbs/fat.
 */
export function toMealEntries(
  response: MealLogResponse | null | undefined,
  date: string,
): MealEntry[] {
  if (!response?.meals) return [];
  const entries: MealEntry[] = [];
  for (const meal of response.meals) {
    const mealType = narrowMealType(meal.mealType);
    for (const [i, food] of (meal.foods ?? []).entries()) {
      entries.push({
        id: food.id ?? `${meal.mealType}-${i}`,
        date,
        mealType,
        foodName: food.name,
        kcal: food.nutrition.calories,
        protein: food.nutrition.protein,
        carbs: food.nutrition.carbs,
        fat: food.nutrition.fats,
      });
    }
  }
  return entries;
}
