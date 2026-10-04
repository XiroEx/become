import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { invalidateMindSession } from "@/lib/mind/sessionCache";

const SaveAsFoodResponseSchema = z
  .object({
    success: z.boolean().optional(),
    created: z.boolean().optional(),
    alreadyExisted: z.boolean().optional(),
    food: z.object({}).passthrough().optional(),
  })
  .passthrough();

export interface SaveRecipeAsFoodResult {
  /** True when the recipe already had a Food (idempotent reuse). */
  alreadyExisted: boolean;
  /** The minted (or reused) Food, as the server flattened it. */
  food: Record<string, unknown> | null;
  raw: unknown;
}

/**
 * Save-or-Log, first half (NP-142): `POST /api/nutrition/recipes/{id}/save-as-food`.
 *
 * A recipe is never logged directly. The first tap mints a Food through this
 * route (gated by `custom-foods`); the next tap logs that Food. Idempotent —
 * re-saving returns the existing food with `alreadyExisted: true`.
 */
export async function saveRecipeAsFood(options: {
  recipeId: string;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}): Promise<SaveRecipeAsFoodResult> {
  const { recipeId, apiFetch, token, baseUrl = WEBAPP_BASE_URL } = options;
  if (!recipeId) throw new Error("A recipe is required");
  const data = await apiFetch(
    `/api/nutrition/recipes/${encodeURIComponent(recipeId)}/save-as-food`,
    SaveAsFoodResponseSchema,
    {
      method: "POST",
      baseUrl,
      getToken: () => token ?? undefined,
    },
  );
  const food =
    data.food && typeof data.food === "object"
      ? (data.food as Record<string, unknown>)
      : null;
  return {
    alreadyExisted: data.alreadyExisted === true,
    food,
    raw: data,
  };
}

/**
 * Log a saved food through `POST /api/meal-logs` — the web's `FoodLogSheet`
 * (`webapp/components/meals/FoodLogSheet.tsx`): per-serving nutrition plus the
 * multiplier as `servings`, filed under a tag, untimed.
 */
export async function logSavedFood(options: {
  item: Record<string, unknown>;
  tag?: string;
  loggedAt?: string;
  untimed?: boolean;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}): Promise<unknown> {
  const {
    item,
    tag = "snack",
    loggedAt,
    untimed = true,
    apiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;
  const useTag = tag.trim().toLowerCase() || "snack";
  const data = await apiFetch("/api/meal-logs", SaveAsFoodResponseSchema, {
    method: "POST",
    baseUrl,
    getToken: () => token ?? undefined,
    body: {
      items: [item],
      tags: [useTag],
      loggedAt: loggedAt ?? new Date().toISOString(),
      untimed: untimed === true,
    },
  });
  await invalidateMindSession();
  return data;
}

/**
 * Unsave a food (`DELETE /api/me/foods/{foodId}`) — the web's
 * `handleRemoveFood` (`webapp/app/dashboard/meals/page.tsx`).
 */
export async function unsaveFood(options: {
  foodId: string;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}): Promise<void> {
  const { foodId, apiFetch, token, baseUrl = WEBAPP_BASE_URL } = options;
  if (!foodId) throw new Error("A food is required");
  await apiFetch(
    `/api/me/foods/${encodeURIComponent(foodId)}`,
    SaveAsFoodResponseSchema,
    {
      method: "DELETE",
      baseUrl,
      getToken: () => token ?? undefined,
    },
  );
}
