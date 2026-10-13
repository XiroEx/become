/**
 * ─── Recipes, natively (NP-144) ─────────────────────────────────────────────
 *
 * The native half of the web's recipe surfaces:
 * `webapp/app/dashboard/recipes/[id]/page.tsx`
 * (`GET /api/nutrition/recipes/{id}`, `POST .../save-as-food`,
 * `POST .../to-meal`, `DELETE`) and
 * `webapp/components/nutrition/RecipeForm.tsx`
 * (`POST /api/nutrition/recipes`, `PUT /api/nutrition/recipes/{id}`,
 * image `POST /api/nutrition/recipes/{id}/image`).
 *
 * RULES THAT TRAVEL:
 *   • A recipe's per-serving macros live in `totalsPerServing`
 *     (`webapp/models/Recipe.ts`) — shown as-is, never divided again.
 *   • Save-as-food spends `custom-foods`; to-meal spends `custom-meals`.
 *   • Ownership is `createdBy` on the recipe; to-meal is a MOVE for the owner
 *     (the recipe and its image are deleted once the meal exists) and a COPY
 *     for anyone else (`webapp/lib/nutrition/recipeConvert.ts`). The response
 *     reports the `mode` so the client never guesses whether the source
 *     survived.
 *   • A 403 carrying `feature` + `requiresTier` raises the upgrade sheet
 *     (plan-gates story). Any other refusal comes back with the server's own
 *     words and no sheet.
 *   • The recipe photo goes through NP-059's capture + upload helpers at the
 *     web's 1600px / 0.82 (`MEAL_PHOTO_RESIZE`), multipart field `image`.
 */

import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { RecipeSummary } from "@/components/recipes/RecipeCard";
import type { RecipeDetailViewModel } from "@/components/recipes/RecipeDetail";
import type {
  Recipe,
  RecipesListResponse,
} from "@become/api-client";

function recipeId(r: Recipe): string {
  return r._id ?? r.id ?? "";
}

function formatAmount(amount: number | undefined, unit: string | undefined): string {
  if (amount === undefined) return unit ?? "";
  return unit ? `${amount} ${unit}` : String(amount);
}

/**
 * Map the recipes-list response to the presentational RecipeSummary list.
 *
 * `totalsPerServing` is where the web stores a recipe's macros
 * (`webapp/models/Recipe.ts`). This used to read `nutrition`, which no handler
 * has ever sent, so every card showed no calories at all.
 */
export function toRecipeSummaries(
  response: RecipesListResponse | null | undefined,
): RecipeSummary[] {
  if (!response?.recipes) return [];
  return response.recipes.map((r) => ({
    id: recipeId(r),
    name: r.name,
    description: r.description ?? "",
    thumbnailUrl: r.imageUrl ?? null,
    totalKcal: r.totalsPerServing?.calories,
    servings: r.servings,
  }));
}

/**
 * Map a recipe doc to the RecipeDetail view model.
 *
 * `totalsPerServing` is ALREADY per serving — the route sums the ingredients
 * and divides by `servings` before storing it — so it is shown as-is and never
 * divided again.
 */
export function toRecipeDetailViewModel(
  recipe: Recipe & { createdBy?: unknown },
  currentUserId?: string | null,
): RecipeDetailViewModel {
  const n = recipe.totalsPerServing;
  const owner = recipe.createdBy == null ? "" : String(recipe.createdBy);
  return {
    id: recipeId(recipe),
    name: recipe.name,
    description: recipe.description ?? "",
    ingredients: (recipe.ingredients ?? []).map((ing, i) => ({
      slug: `ingredient-${i}`,
      name: ing.name,
      amount: formatAmount(ing.amount, ing.unit),
      // The row's TOTAL contribution (`amount × unit`), never divided by
      // servings — the web's right-aligned ingredient-row figure.
      calories: ing.nutrition?.calories ?? 0,
    })),
    instructions: recipe.instructions ?? [],
    perServing: {
      kcal: n?.calories ?? 0,
      protein: n?.protein ?? 0,
      carbs: n?.carbs ?? 0,
      fat: n?.fats ?? 0,
    },
    servings: recipe.servings ?? 1,
    thumbnailUrl: recipe.imageUrl ?? null,
    tags: Array.isArray(recipe.tags) ? [...recipe.tags] : [],
    prepTime: recipe.prepTime ?? undefined,
    cookTime: recipe.cookTime ?? undefined,
    isOwner: Boolean(currentUserId && owner && owner === currentUserId),
  };
}

// ─── The recipe editor's write model ─────────────────────────────────────────
// The web's `RecipeForm` ingredient row: a picked food's per-unit nutrition
// plus the amount the member chose. The payload's `nutrition` is the row's
// TOTAL contribution (perUnit × amount); the route sums the rows and divides
// by `servings` to get `totalsPerServing`.

export interface RecipeIngredientMacros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface RecipeIngredientInput {
  key: string;
  name: string;
  brand?: string;
  amount: number;
  unit: string;
  perUnit: RecipeIngredientMacros;
  foodId?: string;
  variantId?: string;
  variantName?: string;
}

export interface RecipeFormInput {
  name: string;
  description?: string;
  servings: number;
  prepTime?: number;
  cookTime?: number;
  instructions: string[];
  tags: string[];
  ingredients: RecipeIngredientInput[];
}

export interface RecipeFormDeps {
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

const RecipeWriteResponseSchema = z
  .object({
    recipe: z.object({ _id: z.string() }).passthrough().optional(),
  })
  .passthrough();

const ToMealResponseSchema = z
  .object({
    meal: z.object({ _id: z.string() }).passthrough().optional(),
    mode: z.string().optional(),
  })
  .passthrough();

const PassthroughSchema = z.object({}).passthrough();

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** The web's `RecipeForm` validation, before any request. */
export function validateRecipeFormInput(input: RecipeFormInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (input.ingredients.length === 0) return "Add at least one ingredient.";
  return null;
}

/**
 * The web's `RecipeForm#handleSave` body exactly: `category: 'Other'`,
 * per-row `nutrition` as the row total, `servings` floored at 1.
 */
export function recipeCreateBody(input: RecipeFormInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    category: "Other",
    servings: Math.max(1, input.servings || 1),
    instructions: input.instructions,
    tags: input.tags,
    ingredients: input.ingredients.map((ing) => ({
      ...(ing.foodId ? { foodId: ing.foodId } : {}),
      ...(ing.variantId ? { variantId: ing.variantId } : {}),
      ...(ing.variantName ? { variantName: ing.variantName } : {}),
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      nutrition: {
        calories: Math.round(ing.perUnit.calories * ing.amount),
        protein: round1(ing.perUnit.protein * ing.amount),
        carbs: round1(ing.perUnit.carbs * ing.amount),
        fats: round1(ing.perUnit.fats * ing.amount),
      },
    })),
  };
  const description = input.description?.trim();
  if (description) body.description = description;
  if (input.prepTime != null && Number.isFinite(input.prepTime)) {
    body.prepTime = input.prepTime;
  }
  if (input.cookTime != null && Number.isFinite(input.cookTime)) {
    body.cookTime = input.cookTime;
  }
  return body;
}

/**
 * Seed the editor from a fetched recipe (the web's edit-page load): each
 * stored row's `nutrition` is the row TOTAL, so `perUnit` divides it back by
 * `amount` — the exact inverse of `recipeCreateBody`.
 */
export function recipeToFormInput(recipe: Recipe): RecipeFormInput {
  return {
    name: recipe.name ?? "",
    description: recipe.description ?? undefined,
    servings: recipe.servings ?? 1,
    prepTime: recipe.prepTime ?? undefined,
    cookTime: recipe.cookTime ?? undefined,
    instructions: Array.isArray(recipe.instructions) ? [...recipe.instructions] : [],
    tags: Array.isArray(recipe.tags) ? [...recipe.tags] : [],
    ingredients: (recipe.ingredients ?? []).map((ing) => {
      const amount =
        typeof ing.amount === "number" && ing.amount > 0 ? ing.amount : 1;
      const n = ing.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
      return {
        key: ingredientKey(),
        name: String(ing.name ?? ""),
        amount,
        unit: String(ing.unit ?? "serving"),
        perUnit: {
          calories: (n.calories ?? 0) / amount,
          protein: (n.protein ?? 0) / amount,
          carbs: (n.carbs ?? 0) / amount,
          fats: (n.fats ?? 0) / amount,
        },
        ...(ing.foodId ? { foodId: String(ing.foodId) } : {}),
        ...(ing.variantId ? { variantId: String(ing.variantId) } : {}),
        ...(ing.variantName ? { variantName: String(ing.variantName) } : {}),
      };
    }),
  };
}

export function ingredientKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build one ingredient row from a picked food (the web's
 * `RecipeForm#handleAddIngredient`): `amount` is the pick's servings, `unit`
 * its serving unit, `perUnit` its per-serving nutrition.
 */
export function recipeIngredientFromPick(pick: {
  name: string;
  brand?: string;
  amount: number;
  unit: string;
  perUnit: RecipeIngredientMacros;
  foodId?: string;
  variantId?: string;
  variantName?: string;
}): RecipeIngredientInput {
  return {
    key: ingredientKey(),
    name: pick.name,
    ...(pick.brand ? { brand: pick.brand } : {}),
    amount: pick.amount,
    unit: pick.unit,
    perUnit: { ...pick.perUnit },
    ...(pick.foodId ? { foodId: pick.foodId } : {}),
    ...(pick.variantId ? { variantId: pick.variantId } : {}),
    ...(pick.variantName ? { variantName: pick.variantName } : {}),
  };
}

/** Live per-serving preview: row totals summed, divided by servings. */
export function recipeFormTotals(input: {
  ingredients: readonly { amount: number; perUnit: RecipeIngredientMacros }[];
  servings: number;
}): RecipeIngredientMacros {
  const servings = input.servings > 0 ? input.servings : 1;
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fats = 0;
  for (const ing of input.ingredients) {
    calories += ing.perUnit.calories * ing.amount;
    protein += ing.perUnit.protein * ing.amount;
    carbs += ing.perUnit.carbs * ing.amount;
    fats += ing.perUnit.fats * ing.amount;
  }
  return {
    calories: round1(calories / servings),
    protein: round1(protein / servings),
    carbs: round1(carbs / servings),
    fats: round1(fats / servings),
  };
}

/**
 * Create a recipe (`POST /api/nutrition/recipes`). Throws whatever `apiFetch`
 * throws — the caller routes a 403-with-`feature` to the upgrade sheet through
 * `routeApiError` and shows anything else itself.
 */
export async function createRecipe(
  input: RecipeFormInput,
  deps: RecipeFormDeps,
): Promise<{ recipeId: string | null }> {
  const validation = validateRecipeFormInput(input);
  if (validation) throw new Error(validation);
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  const res = await apiFetch("/api/nutrition/recipes", RecipeWriteResponseSchema, {
    method: "POST",
    baseUrl,
    getToken: () => token ?? undefined,
    body: recipeCreateBody(input),
  });
  return { recipeId: res?.recipe?._id ? String(res.recipe._id) : null };
}

/**
 * Edit a recipe (`PUT /api/nutrition/recipes/{id}`, owner-only — never
 * quota-gated, so a member at 3/3 can still edit). Throws on refusal; the
 * caller shows the server's words.
 */
export async function updateRecipe(
  recipeIdValue: string,
  input: RecipeFormInput,
  deps: RecipeFormDeps,
): Promise<{ recipeId: string | null }> {
  const validation = validateRecipeFormInput(input);
  if (validation) throw new Error(validation);
  if (!recipeIdValue) throw new Error("A recipe is required.");
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  const res = await apiFetch(
    `/api/nutrition/recipes/${encodeURIComponent(recipeIdValue)}`,
    RecipeWriteResponseSchema,
    {
      method: "PUT",
      baseUrl,
      getToken: () => token ?? undefined,
      body: recipeCreateBody(input),
    },
  );
  return { recipeId: res?.recipe?._id ? String(res.recipe._id) : recipeIdValue };
}

/**
 * Delete a recipe (`DELETE /api/nutrition/recipes/{id}`, owner-only —
 * ungated). Throws on refusal; the caller shows the server's words.
 */
export async function deleteRecipe(
  recipeIdValue: string,
  deps: RecipeFormDeps,
): Promise<void> {
  if (!recipeIdValue) throw new Error("A recipe is required.");
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  await apiFetch(
    `/api/nutrition/recipes/${encodeURIComponent(recipeIdValue)}`,
    PassthroughSchema,
    {
      method: "DELETE",
      baseUrl,
      getToken: () => token ?? undefined,
    },
  );
}

export type RecipeConvertMode = "move" | "copy";

/**
 * Turn a recipe into a meal (`POST /api/nutrition/recipes/{id}/to-meal`,
 * `custom-meals`-gated). For the OWNER this is a MOVE — the recipe is gone
 * server-side — for anyone else a COPY. The response reports the `mode` so
 * the caller never guesses whether the source survived.
 */
export async function convertRecipeToMeal(
  recipeIdValue: string,
  deps: RecipeFormDeps,
): Promise<{ mealId: string | null; mode: RecipeConvertMode | null }> {
  if (!recipeIdValue) throw new Error("A recipe is required.");
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  const res = await apiFetch(
    `/api/nutrition/recipes/${encodeURIComponent(recipeIdValue)}/to-meal`,
    ToMealResponseSchema,
    {
      method: "POST",
      baseUrl,
      getToken: () => token ?? undefined,
    },
  );
  const mealId = res?.meal?._id ? String(res.meal._id) : null;
  const mode: RecipeConvertMode | null =
    res?.mode === "move" || res?.mode === "copy" ? res.mode : null;
  return { mealId, mode };
}

/** A recipe's photo. Multipart field `image` — see `uploadRecipeImage`. */
export function recipeImagePath(recipeIdValue: string): string {
  return `/api/nutrition/recipes/${encodeURIComponent(recipeIdValue)}/image`;
}

/** Remove a recipe's photo (`DELETE .../image`). Owner or admin only. */
export async function deleteRecipeImage(
  recipeIdValue: string,
  deps: RecipeFormDeps,
): Promise<void> {
  if (!recipeIdValue) throw new Error("A recipe is required.");
  const { apiFetch, token, baseUrl = WEBAPP_BASE_URL } = deps;
  await apiFetch(recipeImagePath(recipeIdValue), PassthroughSchema, {
    method: "DELETE",
    baseUrl,
    getToken: () => token ?? undefined,
  });
}

/** Own-category tags only — never the meal-time defaults (the web's `allTags`). */
export function recipeTagOptions(
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

/** A custom tag, normalised the web's way (`RecipeForm#toggleTag` input). */
export function normalizeRecipeTag(raw: string): string | null {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return norm ? norm : null;
}

export function titleCaseRecipeTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

/** Ownership is `createdBy` on the recipe — the web's PUT/DELETE predicate. */
export function isRecipeOwner(
  recipe: { createdBy?: unknown } | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!recipe || !userId) return false;
  const raw = recipe.createdBy;
  if (raw == null) return false;
  const owner = typeof raw === "string" ? raw : String(raw);
  if (!owner || owner === "[object Object]") return false;
  return owner === userId;
}
