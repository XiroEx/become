import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";

export type { MealItemPayload };

const PassthroughSchema = z.object({}).passthrough();

/**
 * One basket row: a fully-built item payload, so each entry keeps its own
 * quantity, unit and serving label — a burger, its bun and the sauce are not
 * the same amount of anything.
 */
export interface BasketEntry {
  item: MealItemPayload;
}

/** The pre-filled name, the web's shape (`FoodSearchModal.tsx:1240-1245`). */
export function defaultBasketMealName(names: readonly string[]): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length <= 3) return cleaned.join(" + ");
  return `${cleaned.slice(0, 2).join(" + ")} +${cleaned.length - 2} more`;
}

export interface LogBasketOptions {
  items: readonly MealItemPayload[];
  /** Meal-time tag, lowercased by the caller. Defaults to "snack". */
  tag?: string;
  /** ISO instant, when the member pinned a time. */
  loggedAt?: string;
  /** Logged for the day with no clock of its own. */
  untimed?: boolean;
  /** Keep the basket as a reusable meal; only honoured when non-empty. */
  mealName?: string | undefined;
  /** May they keep the result as a reusable meal? `custom-meals` `canCreate`. */
  canSaveMeals?: boolean;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

export interface LogBasketResult {
  /** The log went through — the part that matters. */
  logged: boolean;
  logId?: string;
  /** True when a reusable meal was kept alongside the log. */
  mealSaved: boolean;
  /** True when the log landed but the meal save was refused or failed. */
  mealSaveFailed: boolean;
  mealSaveError?: string;
  data?: unknown;
}

/**
 * Log a whole basket in one pass, optionally keeping it as a reusable meal —
 * the native half of the web's `handleAddMany`
 * (`webapp/app/dashboard/nutrition/page.tsx:600-650`).
 *
 * Order matters: the log is what the member asked for, so it goes FIRST and a
 * failure to save the meal never costs them the log. The meal save is
 * best-effort — a gate, a quota or a network failure keeps the log and reports
 * that the meal was not saved.
 *
 * `canSaveMeals` gates only the SAVE, never the log: a member without the
 * entitlement still gets the multi-add.
 */
export async function logBasket(
  options: LogBasketOptions,
): Promise<LogBasketResult> {
  const {
    items,
    tag,
    loggedAt,
    untimed = false,
    mealName,
    canSaveMeals = false,
    apiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;

  if (items.length === 0) {
    throw new Error("Add at least one item to log");
  }

  const useTag = (tag ?? "snack").trim().toLowerCase() || "snack";
  const trimmedMealName = (mealName ?? "").trim();
  // Only ask for a meal when they can keep one AND want to. Without this the
  // items are still logged together, which is the part that matters.
  const wantSave = canSaveMeals && trimmedMealName.length > 0;

  const resultData = await apiFetch("/api/meal-logs", PassthroughSchema, {
    method: "POST",
    baseUrl,
    getToken: () => token ?? undefined,
    body: {
      source: "manual",
      tags: [useTag],
      items,
      // Name the log even when they are not saving a reusable meal, so the
      // day reads "Turkey sandwich" instead of three loose rows.
      ...(trimmedMealName ? { mealName: trimmedMealName } : {}),
      ...(loggedAt ? { loggedAt } : {}),
      untimed: untimed === true,
    },
  });

  const typedResult = resultData as { log?: { _id?: string } } | undefined;
  const logId =
    typedResult?.log?._id != null ? String(typedResult.log._id) : undefined;

  let mealSaved = false;
  let mealSaveFailed = false;
  let mealSaveError: string | undefined;

  if (wantSave) {
    try {
      await apiFetch("/api/meals", PassthroughSchema, {
        method: "POST",
        baseUrl,
        getToken: () => token ?? undefined,
        body: { name: trimmedMealName, items },
      });
      mealSaved = true;
    } catch (err) {
      // Best effort. The items are already logged; failing to keep the meal
      // is worth a quieter message than losing the log would be.
      mealSaveFailed = true;
      mealSaveError =
        err instanceof Error ? err.message : "Could not save the meal.";
    }
  }

  // Every log drops the cached AI Mind session (NP-102).
  await invalidateMindSession();

  return {
    logged: true,
    logId,
    mealSaved,
    mealSaveFailed,
    ...(mealSaveError ? { mealSaveError } : {}),
    data: resultData,
  };
}

export interface LogSavedMealOptions {
  mealId: string;
  /** Fractional or multiple portion, e.g. 0.5 for half. Defaults to 1. */
  portion?: number;
  /** Meal-time tag, lowercased by the caller. Defaults to "snack". */
  tag?: string;
  /** ISO instant, when the member pinned a time. */
  loggedAt?: string;
  /** Logged for the day with no clock of its own. */
  untimed?: boolean;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

export interface LogSavedMealResult {
  success: boolean;
  logId?: string;
  data?: unknown;
}

/**
 * Log a saved meal with a portion — the native half of the web's
 * `MealApplySheet` (`webapp/components/meals/MealApplySheet.tsx:241-250`):
 * `POST /api/meals/{id}/log` with `portion`, `tags`, `loggedAt`, `untimed`.
 * The server scales every item's `servings` by `portion`, so half a meal at
 * half portion shows half the calories on the web.
 */
export async function logSavedMeal(
  options: LogSavedMealOptions,
): Promise<LogSavedMealResult> {
  const {
    mealId,
    portion = 1,
    tag,
    loggedAt,
    untimed = false,
    apiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;

  if (!mealId) {
    throw new Error("A meal is required");
  }
  if (!Number.isFinite(portion) || portion <= 0) {
    throw new Error("Pick a valid portion.");
  }

  const useTag = (tag ?? "snack").trim().toLowerCase() || "snack";

  const resultData = await apiFetch(
    `/api/meals/${encodeURIComponent(mealId)}/log`,
    PassthroughSchema,
    {
      method: "POST",
      baseUrl,
      getToken: () => token ?? undefined,
      body: {
        portion,
        tags: [useTag],
        ...(loggedAt ? { loggedAt } : {}),
        untimed: untimed === true,
      },
    },
  );

  const typedResult = resultData as { log?: { _id?: string } } | undefined;
  const logId =
    typedResult?.log?._id != null ? String(typedResult.log._id) : undefined;

  await invalidateMindSession();

  return { success: true, logId, data: resultData };
}

export interface AddToLoggedMealOptions {
  logId: string;
  item: MealItemPayload;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/**
 * Add a food into a specific logged sitting — the native half of the web's
 * "Add to this meal" (`page.tsx:694-703`): `POST /api/meal-logs/{id}/items`.
 */
export async function addToLoggedMeal(
  options: AddToLoggedMealOptions,
): Promise<{ success: boolean; data?: unknown }> {
  const { logId, item, apiFetch, token, baseUrl = WEBAPP_BASE_URL } = options;

  if (!logId) {
    throw new Error("A logged meal is required");
  }

  const resultData = await apiFetch(
    `/api/meal-logs/${encodeURIComponent(logId)}/items`,
    PassthroughSchema,
    {
      method: "POST",
      baseUrl,
      getToken: () => token ?? undefined,
      body: item,
    },
  );

  await invalidateMindSession();

  return { success: true, data: resultData };
}
