import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";

/**
 * ─── Log a basket, a saved meal, or into a sitting (NP-094) ──────────────────
 *
 * The web's basket (`webapp/components/nutrition/FoodSearchModal.tsx` +
 * `webapp/app/dashboard/nutrition/page.tsx#handleAddMany`): several foods
 * collected in one pass are logged in ONE `POST /api/meal-logs` request, and
 * keeping them as a reusable meal is a best-effort second request
 * (`POST /api/meals`) that never costs the log.
 *
 * THE RULE THAT TRAVELS: the log goes first and a failed meal save never
 * costs it. The save is best-effort — a quota gate, an outage, anything —
 * and the member is told the log landed but the meal was not kept.
 *
 * `canCreate`, not `allowed`: a member at 3/3 may still edit and delete the
 * meals they have, so `allowed` stays true for them on purpose. The sheet
 * hides the save half when `canCreate` is false; the route refuses either
 * way. And when `enforced` is false (or nothing is known yet) there is no
 * gate at all — the save half shows.
 */

const PassthroughSchema = z.object({}).passthrough();

export interface BasketLogOptions {
  /** Fully-built item payloads, one per basket row. */
  items: readonly MealItemPayload[];
  /** Meal-time tag the sitting is filed under. */
  tag?: string;
  /** Explicit instant; defaults to now. */
  loggedAt?: string;
  /** Logged for the day with no clock. */
  untimed?: boolean;
  /**
   * Keep the basket as a reusable meal. Sent only when the caller already
   * checked `canSaveMeals` — the server is still the gate.
   */
  mealName?: string | undefined;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

export interface BasketLogResult {
  /** The log landed. Always true when this resolves. */
  logged: boolean;
  /** The saved Meal's id when the keep succeeded. */
  mealId?: string | null;
  /** True when the log landed but the keep did not. */
  mealNotSaved: boolean;
  data?: unknown;
}

/**
 * ONE log request, then — only when asked — ONE best-effort meal save.
 * A refused save resolves with `mealNotSaved: true`; it never throws the
 * log away.
 */
export async function logBasket(
  options: BasketLogOptions,
): Promise<BasketLogResult> {
  const {
    items,
    tag = "snack",
    loggedAt,
    untimed = false,
    mealName,
    apiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;

  if (items.length === 0) {
    throw new Error("Add at least one food to log");
  }

  const useTag = tag.trim().toLowerCase() || "snack";
  const name = (mealName ?? "").trim();

  const data = await apiFetch("/api/meal-logs", PassthroughSchema, {
    method: "POST",
    baseUrl,
    getToken: () => token ?? undefined,
    body: {
      source: "manual",
      tags: [useTag],
      items: [...items],
      // Name the log even when it is not kept as a reusable meal, so the
      // day reads "Turkey sandwich" instead of three loose rows.
      ...(name ? { mealName: name } : {}),
      ...(loggedAt ? { loggedAt } : {}),
      untimed: untimed === true,
    },
  });

  await invalidateMindSession();

  // The keep is the extra, and it is what needs `custom-meals`. Best
  // effort: the items are already logged, so a refusal is worth a quieter
  // message than losing the log would be.
  if (name) {
    try {
      const saved = (await apiFetch("/api/meals", PassthroughSchema, {
        method: "POST",
        baseUrl,
        getToken: () => token ?? undefined,
        body: { name, items: [...items] },
      })) as { meal?: { _id?: string } } | undefined;
      const mealId =
        saved && typeof saved === "object" && "meal" in saved
          ? (saved.meal?._id ?? null)
          : null;
      return { logged: true, mealId, mealNotSaved: false, data };
    } catch {
      return { logged: true, mealId: null, mealNotSaved: true, data };
    }
  }

  return { logged: true, mealId: null, mealNotSaved: false, data };
}

/** The pre-filled name, the same shape as the web basket's (`FoodSearchModal.tsx`). */
export function defaultBasketMealName(
  items: readonly { name?: unknown }[],
): string {
  const names = items
    .map((item) => String(item.name ?? "").trim())
    .filter(Boolean);
  if (names.length === 0) return "";
  if (names.length <= 3) return names.join(" + ");
  return `${names.slice(0, 2).join(" + ")} +${names.length - 2} more`;
}

export interface LogSavedMealOptions {
  /** The saved Meal template to log. */
  mealId: string;
  /** Multiplier on every item's servings. Defaults to 1. */
  portion?: number;
  /** Meal-time tag the sitting is filed under. */
  tag?: string;
  /** Explicit instant; defaults to now. */
  loggedAt?: string;
  /** Logged for the day with no clock. */
  untimed?: boolean;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/**
 * Log a saved meal through `POST /api/meals/{id}/log` — the web's
 * `MealApplySheet` (`webapp/components/meals/MealApplySheet.tsx:241-250`).
 * The server scales every item's servings by `portion` and recomputes the
 * totals, so half portion natively reads half the calories on the web.
 */
export async function logSavedMeal(
  options: LogSavedMealOptions,
): Promise<unknown> {
  const {
    mealId,
    portion = 1,
    tag = "snack",
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

  const useTag = tag.trim().toLowerCase() || "snack";

  const data = await apiFetch(
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

  await invalidateMindSession();

  return data;
}

export interface AddToLoggedMealOptions {
  /** The sitting to append to — the web's `addToLogId`. */
  logId: string;
  item: MealItemPayload;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/**
 * Add one food into a specific logged sitting
 * (`POST /api/meal-logs/{id}/items` — the web's "add to this meal").
 */
export async function addToLoggedMeal(
  options: AddToLoggedMealOptions,
): Promise<unknown> {
  const { logId, item, apiFetch, token, baseUrl = WEBAPP_BASE_URL } = options;

  if (!logId) {
    throw new Error("A logged meal is required");
  }

  const data = await apiFetch(
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

  return data;
}
