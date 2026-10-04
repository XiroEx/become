/**
 * ─── Saved meals, natively (NP-143) ─────────────────────────────────────────
 *
 * The native half of the web's meal editor and meal page:
 * `webapp/components/meals/MealForm.tsx` (`POST /api/meals` quota-gated,
 * `PATCH /api/meals/{id}` feature-gated so a member at 3/3 can still edit,
 * image `POST|DELETE /api/meals/{id}/image` at 1600px,
 * `POST /api/meals/{id}/sync-plans` after edits) and
 * `webapp/app/dashboard/meals/[id]/page.tsx`
 * (`POST /api/meals/{id}/to-recipe`, `DELETE /api/meals/{id}`).
 * `POST /api/meals/{id}/save-as-food` exists but nothing on the web calls
 * it, so it is not ported.
 *
 * RULES THAT TRAVEL:
 *   • Creating spends a custom-meals slot; editing and deleting never do,
 *     and deleting frees the slot immediately (`invalidateEntitlements` on
 *     delete, `refresh` after a create).
 *   • A 403 carrying `feature` + `requiresTier` raises the upgrade sheet
 *     (`classifyApiError` → `plan-gate`). Any other refusal comes back with
 *     the server's own words and no sheet.
 *   • The meal photo goes through NP-059's capture + upload helpers at the
 *     web's 1600px / 0.82 (`MEAL_PHOTO_RESIZE`), multipart field `image`.
 */

import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";

const PassthroughSchema = z.object({}).passthrough();

const MealWriteResponseSchema = z
  .object({
    meal: z.object({ _id: z.string() }).passthrough().optional(),
    plannedCount: z.number().optional(),
  })
  .passthrough();

const ToRecipeResponseSchema = z
  .object({
    recipe: z.object({ _id: z.string() }).passthrough().optional(),
  })
  .passthrough();

const SyncPlansResponseSchema = z
  .object({
    updated: z.number().optional(),
  })
  .passthrough();

export interface SavedMealDeps {
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

export interface SavedMealInput {
  name: string;
  description?: string;
  tags: string[];
  defaultTag?: string;
  items: MealItemPayload[];
}

export interface SaveMealResult {
  mealId: string | null;
  plannedCount: number;
}

/** The web's `MealForm` validation, before any request. */
export function validateSavedMealInput(input: SavedMealInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (input.items.length === 0) return "Add at least one item.";
  return null;
}

/** The web's `MealForm#handleSave` body exactly: no `recipe` subfield. */
export function savedMealCreateBody(input: SavedMealInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    tags: input.tags,
    items: input.items.map((it) => ({
      ...(it.foodId ? { foodId: it.foodId } : {}),
      ...(it.variantId ? { variantId: it.variantId } : {}),
      ...(it.variantName ? { variantName: it.variantName } : {}),
      name: it.name,
      ...(it.brand ? { brand: it.brand } : {}),
      servingSize: it.servingSize,
      servingUnit: it.servingUnit,
      servings: it.servings,
      nutrition: it.nutrition,
      ...(it.servingLabel ? { servingLabel: it.servingLabel } : {}),
      ...(it.loggedQuantity != null ? { loggedQuantity: it.loggedQuantity } : {}),
      ...(it.loggedUnit ? { loggedUnit: it.loggedUnit } : {}),
      ...(it.loggedGramsPerServing != null
        ? { loggedGramsPerServing: it.loggedGramsPerServing }
        : {}),
      ...(it.loggedMlPerServing != null
        ? { loggedMlPerServing: it.loggedMlPerServing }
        : {}),
    })),
  };
  const description = input.description?.trim();
  if (description) body.description = description;
  if (input.defaultTag) body.defaultTag = input.defaultTag;
  return body;
}

/**
 * Create a saved meal (`POST /api/meals`, quota-gated). Throws whatever
 * `apiFetch` throws — the caller routes a 403-with-`feature` to the upgrade
 * sheet through `routeApiError` and shows anything else itself.
 */
export async function createSavedMeal(
  input: SavedMealInput,
  deps: SavedMealDeps,
): Promise<SaveMealResult> {
  const validation = validateSavedMealInput(input);
  if (validation) throw new Error(validation);
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  const res = await apiFetch("/api/meals", MealWriteResponseSchema, {
    method: "POST",
    baseUrl,
    getToken: () => token ?? undefined,
    body: savedMealCreateBody(input),
  });
  const mealId = res?.meal?._id ? String(res.meal._id) : null;
  return { mealId, plannedCount: 0 };
}

/**
 * Edit a saved meal (`PATCH /api/meals/{id}`, feature-gated — never
 * quota-gated, so a member at 3/3 can still edit). Returns the server's
 * `plannedCount` so the caller can offer the sync-plans confirm.
 */
export async function updateSavedMeal(
  mealId: string,
  input: SavedMealInput,
  deps: SavedMealDeps,
): Promise<SaveMealResult> {
  const validation = validateSavedMealInput(input);
  if (validation) throw new Error(validation);
  if (!mealId) throw new Error("A meal is required.");
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  const res = await apiFetch(
    `/api/meals/${encodeURIComponent(mealId)}`,
    MealWriteResponseSchema,
    {
      method: "PATCH",
      baseUrl,
      getToken: () => token ?? undefined,
      body: savedMealCreateBody(input),
    },
  );
  const id = res?.meal?._id ? String(res.meal._id) : mealId;
  return { mealId: id, plannedCount: res?.plannedCount ?? 0 };
}

/**
 * Delete a saved meal (`DELETE /api/meals/{id}`, ungated — it frees a
 * custom-meals slot immediately). Throws on refusal; the caller shows the
 * server's words.
 */
export async function deleteSavedMeal(
  mealId: string,
  deps: SavedMealDeps,
): Promise<void> {
  if (!mealId) throw new Error("A meal is required.");
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  await apiFetch(`/api/meals/${encodeURIComponent(mealId)}`, PassthroughSchema, {
    method: "DELETE",
    baseUrl,
    getToken: () => token ?? undefined,
  });
}

/**
 * Turn a saved meal into a recipe (`POST /api/meals/{id}/to-recipe`). This
 * is a MOVE server-side — the meal is replaced by the recipe — so the
 * caller routes to the returned recipe id.
 */
export async function convertMealToRecipe(
  mealId: string,
  deps: SavedMealDeps,
): Promise<{ recipeId: string | null }> {
  if (!mealId) throw new Error("A meal is required.");
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  const res = await apiFetch(
    `/api/meals/${encodeURIComponent(mealId)}/to-recipe`,
    ToRecipeResponseSchema,
    {
      method: "POST",
      baseUrl,
      getToken: () => token ?? undefined,
    },
  );
  return { recipeId: res?.recipe?._id ? String(res.recipe._id) : null };
}

/**
 * Propagate an edit to the planned copies
 * (`POST /api/meals/{id}/sync-plans`). Plan items are snapshots, not live
 * refs, so the server rewrites them. Returns how many slots were updated.
 */
export async function syncMealPlans(
  mealId: string,
  deps: SavedMealDeps,
): Promise<{ updated: number }> {
  if (!mealId) throw new Error("A meal is required.");
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  const res = await apiFetch(
    `/api/meals/${encodeURIComponent(mealId)}/sync-plans`,
    SyncPlansResponseSchema,
    {
      method: "POST",
      baseUrl,
      getToken: () => token ?? undefined,
    },
  );
  return { updated: res?.updated ?? 0 };
}

/**
 * Remove a meal's photo (`DELETE /api/meals/{id}/image`). Owner or admin
 * only, like the web's `MealForm#handleRemoveImage`.
 */
export async function deleteMealImage(
  mealId: string,
  deps: SavedMealDeps,
): Promise<void> {
  if (!mealId) throw new Error("A meal is required.");
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  await apiFetch(
    `/api/meals/${encodeURIComponent(mealId)}/image`,
    PassthroughSchema,
    {
      method: "DELETE",
      baseUrl,
      getToken: () => token ?? undefined,
    },
  );
}

/** Own-category tags only — never the meal-time defaults (the web's `allTags`). */
export function mealTagOptions(
  defaults: readonly unknown[],
  userTags: readonly unknown[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...defaults, ...userTags]) {
    const norm = String(t).trim().toLowerCase();
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

/** A custom tag, normalised the web's way (`MealForm#handleAddCustomTag`). */
export function normalizeCustomTag(raw: string): string | null {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return norm ? norm : null;
}

export function titleCaseMealTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}
