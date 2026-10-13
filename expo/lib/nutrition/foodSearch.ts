import type { FoodSearchResponse, FoodSearchItem } from "@become/api-client";
import type {
  FoodSearchResult,
  FoodSource,
} from "@/components/nutrition/FoodSearchInput";
import { foodRowParam } from "@/lib/nutrition/foodImport";

/**
 * Map the webapp food `source` string to the presentational tier.
 *
 * The web says `openfoodfacts` (that is the string the search route and the
 * import route both use); `off` only ever appears as the `off-` id prefix.
 * Accepting just `off` here mapped every OpenFoodFacts row to "custom", which
 * then skipped the external path entirely.
 */
export function narrowFoodSource(value: string | undefined): FoodSource {
  if (value === "usda") return "usda";
  if (value === "off" || value === "openfoodfacts") return "off";
  return "custom"; // manual / custom / saved DB foods
}

/** The id a search row is addressed by — synthetic for external hits. */
export function foodSearchRowId(food: FoodSearchItem): string {
  return food._id ?? food.id ?? "";
}

/** Flatten the food-search response into the presentational result list. */
export function toFoodSearchResults(
  response: FoodSearchResponse | null | undefined,
): FoodSearchResult[] {
  if (!response?.foods) return [];
  return response.foods.map((f) => ({
    id: foodSearchRowId(f),
    name: f.name,
    brand: f.brand ?? null,
    source: narrowFoodSource(f.source),
    // The flattened DEFAULT VARIANT's block, which is per SERVING — the row's
    // `kcalPer100g` name is the presentational component's, not the wire's. No
    // route has ever sent a bare top-level `calories`, so the fallback that read
    // one is gone with the schema that invented it.
    kcalPer100g: f.nutrition?.calories ?? 0,
  }));
}

/** The raw row behind a presentational result, by id. */
export function findFoodSearchRow(
  response: FoodSearchResponse | null | undefined,
  id: string,
): FoodSearchItem | null {
  return (response?.foods ?? []).find((f) => foodSearchRowId(f) === id) ?? null;
}

/**
 * Where tapping a search result goes. A `usda-*` / `off-*` hit has no Food
 * document yet, so the row travels with it: the detail screen re-imports it as
 * `{ source: 'manual', data }` when the source import can't answer.
 */
export function foodDetailHref(id: string, row?: unknown): string {
  const path = `/(tabs)/nutrition/food/${encodeURIComponent(id)}`;
  const param = row ? foodRowParam(row) : null;
  return param ? `${path}?row=${encodeURIComponent(param)}` : path;
}
