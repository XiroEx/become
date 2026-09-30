import type { MealLogResponse } from "@become/api-client";
import type { MealEntry, MealType } from "@/lib/nutrition/daySelector";

const MEAL_TYPES: readonly MealType[] = [
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
 *
 * A log entry's `nutrition` is the food's PER-SERVING block and `servings` is
 * how much of it was eaten — the server totals the day as `nutrition ×
 * servings` (`webapp/models/Meal.ts#computeTotalNutrition`) and the web
 * renders each row the same way, so reading the block alone showed one serving
 * of a three-serving entry.
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
      const servings =
        typeof food.servings === "number" &&
        Number.isFinite(food.servings) &&
        food.servings > 0
          ? food.servings
          : 1;
      entries.push({
        id: food.id ?? `${meal.mealType}-${i}`,
        date,
        mealType,
        foodName: food.name,
        kcal: food.nutrition.calories * servings,
        protein: food.nutrition.protein * servings,
        carbs: food.nutrition.carbs * servings,
        fat: food.nutrition.fats * servings,
      });
    }
  }
  return entries;
}
