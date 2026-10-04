import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

/**
 * ─── My Stuff data + save-or-log rule (NP-142) ───────────────────────────────
 *
 * The web's My Stuff (`webapp/app/dashboard/meals/page.tsx`): three tabs —
 * Meals (`GET /api/meals`), Recipes (the member's own,
 * `GET /api/nutrition/recipes?mine=true`) and Foods (bookmarked,
 * `GET /api/me/foods`) — with search + tag filter, log sheets, and the recipe
 * save-or-log rule. `/dashboard/nutrition/recipes` redirects there.
 *
 * THE RULE THAT TRAVELS: a recipe is never logged directly. The first tap
 * mints (or reuses) a Food through `POST /api/nutrition/recipes/{id}/save-as-food`
 * (a `custom-foods` create); once saved, tapping logs that Food.
 */

export const SaveAsFoodResponseSchema = z
  .object({
    success: z.boolean().optional(),
    created: z.boolean().optional(),
    alreadyExisted: z.boolean().optional(),
    food: z.object({}).passthrough().optional(),
  })
  .passthrough();

export type SaveAsFoodResponse = z.infer<typeof SaveAsFoodResponseSchema>;

export interface SaveAsFoodDeps {
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/**
 * Mint (or reuse) the Food behind a recipe.
 *
 * Idempotent server-side: re-saving returns the existing food with
 * `alreadyExisted: true`. A refusal (e.g. the `custom-foods` cap) throws the
 * `ApiError` untouched so the caller routes it through `routeApiError` —
 * which raises the upgrade sheet for a plan gate.
 */
export async function saveRecipeAsFood(
  recipeId: string,
  deps: SaveAsFoodDeps,
): Promise<SaveAsFoodResponse> {
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  if (!recipeId) throw new Error("A recipe is required");
  return apiFetch(
    `/api/nutrition/recipes/${encodeURIComponent(recipeId)}/save-as-food`,
    SaveAsFoodResponseSchema,
    {
      method: "POST",
      baseUrl,
      getToken: () => token ?? undefined,
    },
  );
}

export interface UnsaveFoodDeps {
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

const UnsaveResponseSchema = z.object({}).passthrough();

/**
 * Remove a food from the member's saved foods
 * (`DELETE /api/me/foods/{foodId}` — the web's `handleRemoveFood`).
 */
export async function unsaveFood(
  foodId: string,
  deps: UnsaveFoodDeps,
): Promise<boolean> {
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  if (!foodId) return false;
  try {
    await apiFetch(
      `/api/me/foods/${encodeURIComponent(foodId)}`,
      UnsaveResponseSchema,
      {
        method: "DELETE",
        baseUrl,
        getToken: () => token ?? undefined,
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** Client-side name/brand filter for the Foods tab (the web's `filteredFoods`). */
export function filterSavedFoodsByQuery<T extends { name: string; brand?: unknown }>(
  foods: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...foods];
  return foods.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (typeof f.brand === "string" && f.brand.toLowerCase().includes(q)),
  );
}

/** Own-category tags only — never the meal-time defaults (the web's `allTags`). */
export function ownCategoryTags(userTags: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of userTags) {
    const norm = String(t).toLowerCase();
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

export function foodIdOf(food: { _id?: unknown; id?: unknown }): string {
  const raw = food._id ?? food.id;
  return raw == null ? "" : String(raw);
}

export function recipeIdOf(recipe: { _id?: unknown; id?: unknown }): string {
  const raw = recipe._id ?? recipe.id;
  return raw == null ? "" : String(raw);
}
