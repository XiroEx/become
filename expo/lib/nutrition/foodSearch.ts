import type {
  FoodSearchResponse,
  FoodDetailFood,
} from "@become/api-client";
import type {
  FoodSearchResult,
  FoodSource,
} from "@/components/nutrition/FoodSearchInput";
import type { FoodNutrition } from "@/lib/nutrition/servingMath";

/** Map the webapp food `source` string to the presentational tier. */
export function narrowFoodSource(value: string | undefined): FoodSource {
  if (value === "usda") return "usda";
  if (value === "off") return "off";
  return "custom"; // manual / custom / saved DB foods
}

/** Flatten the food-search response into the presentational result list. */
export function toFoodSearchResults(
  response: FoodSearchResponse | null | undefined,
): FoodSearchResult[] {
  if (!response?.foods) return [];
  return response.foods.map((f) => ({
    id: f._id ?? f.id ?? "",
    name: f.name,
    brand: f.brand ?? null,
    source: narrowFoodSource(f.source),
    kcalPer100g: f.nutrition?.calories ?? f.calories ?? 0,
  }));
}

/** Map a food-detail record to the ServingPicker per-100g nutrition shape. */
export function toServingFood(food: FoodDetailFood): FoodNutrition {
  const n = food.nutrition ?? {};
  return {
    kcalPer100g: n.calories ?? 0,
    proteinPer100g: n.protein ?? 0,
    carbsPer100g: n.carbs ?? 0,
    fatPer100g: n.fats ?? 0,
  };
}
