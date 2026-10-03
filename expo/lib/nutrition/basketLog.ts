/**
 * ─── Log several foods at once, save them as a meal, log a saved meal ───────
 *
 * The native half of the web's basket
 * (`webapp/components/nutrition/FoodSearchModal.tsx` + `handleAddMany` in
 * `webapp/app/dashboard/nutrition/page.tsx:600-650`), the saved-meal apply
 * (`webapp/components/meals/MealApplySheet.tsx:241-250` →
 * `POST /api/meals/[id]/log`) and "add to this meal"
 * (`page.tsx:694-703` → `POST /api/meal-logs/[id]/items`).
 *
 * RULES THAT TRAVEL:
 *
 *   • The log goes first and a failed meal save never costs it. `logBasket`
 *     awaits `POST /api/meal-logs` and only then attempts the best-effort
 *     `POST /api/meals`; a refusal (gate or otherwise) resolves with
 *     `mealSaved: false` instead of throwing.
 *   • The gate reads `canCreate`, not `allowed`, and is skipped while
 *     `enforced` is false or nothing is known yet. `canSaveMealsFromSnapshot`
 *     is that check, shared by the sheet and the screen.
 */

import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { todayLocalKey } from "@/lib/nutrition/mealPlanDates";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";

const PassthroughSchema = z.object({}).passthrough();

/**
 * May they keep another reusable meal? The web's `canSaveMeals`
 * (`webapp/app/dashboard/nutrition/page.tsx:202-205`): true while nothing is
 * known or the kill-switch is off, otherwise the snapshot's `canCreate` for
 * `custom-meals` — never recomputed, and never `allowed`, which stays true at
 * the cap so a capped member can still edit and delete what they own.
 */
export function canSaveMealsFromSnapshot(snapshot: {
  enforced?: boolean;
  features?: Record<string, { canCreate?: boolean } | null | undefined>;
} | null | undefined): boolean {
  if (!snapshot) return true;
  if (snapshot.enforced === false) return true;
  return snapshot.features?.["custom-meals"]?.canCreate !== false;
}

/**
 * The pre-filled basket name, the same shape as the web's
 * (`FoodSearchModal.tsx:1240-1245`) and the combine sheet's
 * (`lib/nutrition/combineItems.ts#defaultCombineName`). Two or three items
 * read best as their names; beyond that the list stops being a name.
 */
export function defaultBasketName(names: readonly string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length <= 3) return clean.join(" + ");
  return `${clean.slice(0, 2).join(" + ")} +${clean.length - 2} more`;
}

/** `loggedAt` for a basket / saved-meal log on `dateKey` (today → now). */
export function loggedAtForDate(dateKey?: string, now: Date = new Date()): string {
  if (!dateKey) return now.toISOString();
  if (dateKey === todayLocalKey(now)) return now.toISOString();
  return `${dateKey}T12:00:00.000Z`;
}

export interface LogBasketOptions {
  items: MealItemPayload[];
  tag?: string;
  dateKey?: string;
  loggedAt?: string;
  untimed?: boolean;
  /** Names the sitting on the log. Sent whenever set, saved or not. */
  mealName?: string;
  /** POST the items to `/api/meals` too. Only honoured with `mealName`. */
  saveAsMeal?: boolean;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
  now?: Date;
}

export interface LogBasketResult {
  data: unknown;
  /** True only when the reusable meal was actually kept. */
  mealSaved: boolean;
  /** The save refusal, when the log landed but the meal did not. */
  mealError: unknown;
}

/**
 * Log a whole basket in one pass, optionally keeping it as a reusable meal.
 *
 * Order matters: the log is what the member asked for, so it goes first and
 * a failure to save the meal never costs them the log.
 */
export async function logBasket(options: LogBasketOptions): Promise<LogBasketResult> {
  const {
    items,
    tag,
    dateKey,
    loggedAt,
    untimed = false,
    mealName,
    saveAsMeal = false,
    apiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;
  if (items.length === 0) throw new Error("Add at least one food");
  const now = options.now ?? new Date();
  const useTag = (tag ?? "snack").trim().toLowerCase() || "snack";
  const stamp = loggedAt ?? loggedAtForDate(dateKey, now);
  const trimmedMealName = (mealName ?? "").trim() || undefined;

  const data = await apiFetch("/api/meal-logs", PassthroughSchema, {
    method: "POST",
    baseUrl,
    getToken: () => token ?? undefined,
    body: {
      source: "manual",
      tags: [useTag],
      items,
      ...(trimmedMealName ? { mealName: trimmedMealName } : {}),
      loggedAt: stamp,
      untimed,
    },
  });

  let mealSaved = false;
  let mealError: unknown = null;
  if (trimmedMealName && saveAsMeal) {
    try {
      await apiFetch("/api/meals", PassthroughSchema, {
        method: "POST",
        baseUrl,
        getToken: () => token ?? undefined,
        body: { name: trimmedMealName, items },
      });
      mealSaved = true;
    } catch (err) {
      mealError = err;
    }
  }

  await invalidateMindSession().catch(() => {});

  return { data, mealSaved, mealError };
}

export interface LogSavedMealOptions {
  mealId: string;
  /** Multiplier on every item's servings. The server clamps to [0.05, 20]. */
  portion?: number;
  tag?: string;
  dateKey?: string;
  loggedAt?: string;
  untimed?: boolean;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
  now?: Date;
}

/** Log a saved meal, the native `POST /api/meals/[id]/log`. */
export async function logSavedMeal(options: LogSavedMealOptions): Promise<unknown> {
  const {
    mealId,
    portion = 1,
    tag,
    dateKey,
    loggedAt,
    untimed = false,
    apiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;
  const now = options.now ?? new Date();
  const useTag = (tag ?? "snack").trim().toLowerCase() || "snack";
  const stamp = loggedAt ?? loggedAtForDate(dateKey, now);
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
        loggedAt: stamp,
        untimed,
      },
    },
  );
  await invalidateMindSession().catch(() => {});
  return data;
}

export interface AddToLoggedMealOptions {
  logId: string;
  item: MealItemPayload;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/** Add one food into a specific logged sitting. */
export async function addToLoggedMeal(
  options: AddToLoggedMealOptions,
): Promise<unknown> {
  const { logId, item, apiFetch, token, baseUrl = WEBAPP_BASE_URL } = options;
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
  await invalidateMindSession().catch(() => {});
  return data;
}
