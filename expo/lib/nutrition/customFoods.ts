/**
 * CREATE A CUSTOM FOOD — the native half of `POST /api/nutrition/foods`.
 *
 * The web's `dashboard/foods/new` posts `{ name, brand, category, variants }`
 * to the quota-gated create (`requireQuota('custom-foods')`, counted live on
 * `Food.authoredBy`), then bookmarks the new row (`POST /api/me/foods`) when
 * asked. A 403 from the create is a GATE (`feature: 'custom-foods'` +
 * `requiresTier`), so it goes to the upgrade sheet — never to the red banner
 * a validation failure gets.
 *
 * The payload shape is pinned to what the route actually reads
 * (`webapp/app/api/nutrition/foods/route.ts` → `importManualFood(body, …)`):
 * `name` + `category` are required, the macros ride inside
 * `variants[0].nutrition`, and the cross-domain bridges ride beside them as
 * `gramsPerServing` / `mlPerServing`. Nothing else is sent — `authoredBy` is
 * stamped server-side (`authored: true`), never read from the body, and
 * `barcode` is dropped for members (the route only honours it for admins).
 */

import { z } from "zod";
import { apiFetch, FoodImportResponseSchema } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { saveFoodBookmark } from "@/lib/nutrition/foodBookmarks";

export const CUSTOM_FOOD_CATEGORIES = [
  "Protein",
  "Grain",
  "Fruit",
  "Vegetable",
  "Dairy",
  "Fat",
  "Beverage",
  "Condiment",
  "Snack",
  "Other",
] as const;

export const CUSTOM_FOOD_SERVING_UNITS = [
  "g",
  "oz",
  "cup",
  "each",
  "ml",
  "tbsp",
  "tsp",
  "slice",
  "scoop",
] as const;

export interface CustomFoodMacros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  saturatedFat?: number;
}

export interface CustomFoodInput {
  name: string;
  brand?: string;
  category: string;
  servingSize: number;
  servingUnit: string;
  displayLabel?: string;
  nutrition: CustomFoodMacros;
  gramsPerServing?: number;
  mlPerServing?: number;
  /** Bookmark to My Foods after the create (the web's toggle, on by default). */
  bookmark?: boolean;
}

export interface CreateCustomFoodDeps {
  baseUrl?: string;
  getToken: () => string | undefined;
}

const CreateFoodResponseSchema = FoodImportResponseSchema.extend({
  created: z.boolean().optional(),
});

/**
 * Validate the form the way the web's submit handler does, before any request:
 * a name, a positive serving size, and finite non-negative required macros.
 * Returns the error line, or null when the input may be sent.
 */
export function validateCustomFoodInput(input: CustomFoodInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!Number.isFinite(input.servingSize) || input.servingSize <= 0) {
    return "Serving size must be a positive number.";
  }
  const { calories, protein, carbs, fats } = input.nutrition;
  if (
    ![calories, protein, carbs, fats].every(
      (n) => Number.isFinite(n) && (n as number) >= 0,
    )
  ) {
    return "Calories, protein, carbs, and fats are required.";
  }
  return null;
}

function optionalNumber(value: number | undefined): number | undefined {
  return value == null || !Number.isFinite(value) ? undefined : value;
}

/** The `variants[0]` the route's `importManualFood` reads. */
export function customFoodVariant(input: CustomFoodInput): Record<string, unknown> {
  const variant: Record<string, unknown> = {
    name: "Default",
    isDefault: true,
    servingSize: input.servingSize,
    servingUnit: input.servingUnit,
    nutrition: {
      calories: input.nutrition.calories,
      protein: input.nutrition.protein,
      carbs: input.nutrition.carbs,
      fats: input.nutrition.fats,
      ...(optionalNumber(input.nutrition.fiber) != null
        ? { fiber: optionalNumber(input.nutrition.fiber) }
        : {}),
      ...(optionalNumber(input.nutrition.sugar) != null
        ? { sugar: optionalNumber(input.nutrition.sugar) }
        : {}),
      ...(optionalNumber(input.nutrition.sodium) != null
        ? { sodium: optionalNumber(input.nutrition.sodium) }
        : {}),
      ...(optionalNumber(input.nutrition.saturatedFat) != null
        ? { saturatedFat: optionalNumber(input.nutrition.saturatedFat) }
        : {}),
    },
  };
  const label = input.displayLabel?.trim();
  if (label) variant.displayLabel = label;
  if (input.gramsPerServing != null && Number.isFinite(input.gramsPerServing)) {
    variant.gramsPerServing = input.gramsPerServing;
  }
  if (input.mlPerServing != null && Number.isFinite(input.mlPerServing)) {
    variant.mlPerServing = input.mlPerServing;
  }
  return variant;
}

/** The POST body: `{ name, brand?, category, variants: [variant] }`. */
export function customFoodCreateBody(
  input: CustomFoodInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    category: input.category,
    variants: [customFoodVariant(input)],
  };
  const brand = input.brand?.trim();
  if (brand) body.brand = brand;
  return body;
}

/**
 * POST the gated create, then bookmark when asked. Throws whatever `apiFetch`
 * throws — the caller routes a 403-with-`feature` to the upgrade sheet through
 * `routeApiError` and shows anything else itself. Returns the new food's id.
 */
export async function createCustomFood(
  input: CustomFoodInput,
  deps: CreateCustomFoodDeps,
): Promise<{ foodId: string | null }> {
  const validation = validateCustomFoodInput(input);
  if (validation) throw new Error(validation);
  const res = await apiFetch("/api/nutrition/foods", CreateFoodResponseSchema, {
    method: "POST",
    baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
    getToken: deps.getToken,
    body: customFoodCreateBody(input),
  });
  const foodId =
    res?.food?._id != null && String(res.food._id).length > 0
      ? String(res.food._id)
      : null;
  // Bookmark to My Foods if requested — non-fatal, like the web.
  if (input.bookmark !== false && foodId) {
    try {
      await saveFoodBookmark(foodId, deps.getToken);
    } catch {
      // non-fatal
    }
  }
  return { foodId };
}
