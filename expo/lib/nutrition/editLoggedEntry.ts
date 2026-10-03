import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import { WEBAPP_BASE_URL } from "@/lib/config";

/**
 * ─── Edit a logged item or a whole logged meal, natively ────────────────────
 *
 * The web's `EditFoodModal.tsx` PATCHes
 * `/api/meal-logs/{logId}/items/{itemId}` with `servings`, the `logged*`
 * provenance quartet, an optional wholesale `nutrition` override (only when
 * the member corrected the macros) and an optional `servingLabel`, plus the
 * `tag`/`fromTag` pair and the time patch. `EditMealModal.tsx` PATCHes
 * `/api/meal-logs/{logId}` with the same `tag`/`fromTag` + time patch to move
 * the whole meal.
 *
 * This module is the native half of BOTH routes. It never touches the shared
 * Food: `nutrition` is the member's own per-serving correction, replaced
 * wholesale by the route — so it is sent ONLY when the member corrected the
 * macros, never as a round-tripped copy of what is already stored.
 */

export interface EditLogItemNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  saturatedFat?: number;
}

export interface EditLogItemInput {
  logId: string;
  itemId: string;
  /** Multiplier the picker solved for the new amount (back-compat `servings`). */
  servings: number;
  loggedQuantity: number;
  loggedUnit: string;
  loggedGramsPerServing?: number;
  loggedMlPerServing?: number;
  /**
   * Per-serving correction. Sent ONLY when the member corrected the macros —
   * the route replaces nutrition wholesale, so sending it unconditionally
   * would rewrite good data with a round-tripped copy of itself.
   */
  nutrition?: EditLogItemNutrition;
  /** Only when the member actually retyped the serving label. */
  servingLabel?: string;
  /** Only when the member moved this row to another tag. */
  tag?: string;
  /** The tag the row is currently shown under (required alongside `tag`). */
  fromTag?: string;
  /** Only when the member changed the clock time (or cleared it). */
  loggedAt?: string;
  untimed?: boolean;
  apiFetch?: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

export interface EditMealLogInput {
  logId: string;
  /** Only when the member moved the whole meal to another tag. */
  tag?: string;
  /** The tag the meal is currently shown under (required alongside `tag`). */
  fromTag?: string;
  /** Only when the member changed the clock time (or cleared it). */
  loggedAt?: string;
  untimed?: boolean;
  apiFetch?: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

export interface EditLogResult {
  success: boolean;
  moved?: boolean;
  data?: unknown;
}

const PassthroughSchema = z.object({}).passthrough();

function authFor(input: { token?: string | null }) {
  return input.token ? { getToken: () => input.token as string } : {};
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Translate a stored MealLog timestamp into an `HH:mm` field value. Untimed
 * logs deliberately render empty: their timestamp only pins the calendar day
 * and is not a user-entered clock time. Mirrors
 * `webapp/lib/nutrition/logTime.ts#mealLogTimeInputValue`.
 */
export function mealLogTimeInputValue(
  loggedAt: string | Date | undefined,
  untimed = false,
): string {
  if (!loggedAt || untimed) return "";
  const date = loggedAt instanceof Date ? new Date(loggedAt) : new Date(loggedAt);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Build the time fields accepted by MealLog PATCH routes. The calendar date
 * comes from the existing instant; only its local clock is changed. Clearing
 * the input returns to the explicit no-time state without dropping loggedAt,
 * because the schema and day-level queries still require a timestamp. Mirrors
 * `webapp/lib/nutrition/logTime.ts#mealLogTimePatch`.
 */
export function mealLogTimePatch(
  loggedAt: string | Date | undefined,
  time: string,
): { loggedAt?: string; untimed: boolean } {
  if (!time) return { untimed: true };

  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const basis =
    loggedAt instanceof Date ? new Date(loggedAt) : new Date(loggedAt ?? "");
  if (!match || Number.isNaN(basis.getTime())) return { untimed: true };

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return { untimed: true };

  basis.setHours(hours, minutes, 0, 0);
  return { loggedAt: basis.toISOString(), untimed: false };
}

/**
 * Build the `tag`/`fromTag` pair the move routes expect. Returns `{}` when
 * the member did not move anything, so callers can spread it unconditionally.
 */
export function mealLogTagPatch(
  currentTag: string | undefined,
  selectedTag: string | undefined,
): { tag: string; fromTag: string } | Record<string, never> {
  const from = normalizeTag(currentTag ?? "");
  const to = normalizeTag(selectedTag ?? "");
  if (!to || to === from) return {};
  return { tag: to, fromTag: from || "snack" };
}

/**
 * PATCH one logged item: quantity/unit provenance, optional wholesale macro
 * correction, optional tag move, optional time patch. Refetch the day after.
 */
export async function editLoggedItem(
  input: EditLogItemInput,
): Promise<EditLogResult> {
  const {
    logId,
    itemId,
    servings,
    loggedQuantity,
    loggedUnit,
    apiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = input;
  if (!apiFetch) throw new Error("apiFetch is required");
  if (!logId || !itemId) throw new Error("logId and itemId are required");
  if (!Number.isFinite(servings) || servings <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  if (!Number.isFinite(loggedQuantity) || loggedQuantity <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const body: Record<string, unknown> = {
    servings,
    loggedQuantity,
    loggedUnit,
  };
  if (input.loggedGramsPerServing != null) {
    body.loggedGramsPerServing = input.loggedGramsPerServing;
  }
  if (input.loggedMlPerServing != null) {
    body.loggedMlPerServing = input.loggedMlPerServing;
  }
  // Only when the member corrected the macros — the route replaces nutrition
  // wholesale, so an unconditional send would rewrite good data with a
  // round-tripped copy of itself.
  if (input.nutrition) {
    body.nutrition = { ...input.nutrition };
  }
  if (input.servingLabel !== undefined) {
    body.servingLabel = input.servingLabel;
  }
  if (input.tag !== undefined && input.fromTag !== undefined) {
    body.tag = input.tag;
    body.fromTag = input.fromTag;
  }
  if (input.loggedAt !== undefined) {
    body.loggedAt = input.loggedAt;
  }
  if (input.untimed !== undefined) {
    body.untimed = input.untimed;
  }

  const data = await apiFetch(
    `/api/meal-logs/${encodeURIComponent(logId)}/items/${encodeURIComponent(itemId)}`,
    PassthroughSchema,
    {
      method: "PATCH",
      baseUrl,
      ...authFor({ token }),
      body,
    },
  );
  await invalidateMindSession();
  const moved = Boolean(
    (data as { moved?: unknown } | null | undefined)?.moved,
  );
  return { success: true, moved, data };
}

/**
 * PATCH a whole logged meal: move every food in the log together (tag move)
 * and/or change its clock time. Refetch the day after.
 */
export async function editLoggedMeal(
  input: EditMealLogInput,
): Promise<EditLogResult> {
  const { logId, apiFetch, token, baseUrl = WEBAPP_BASE_URL } = input;
  if (!apiFetch) throw new Error("apiFetch is required");
  if (!logId) throw new Error("logId is required");

  const body: Record<string, unknown> = {};
  if (input.tag !== undefined && input.fromTag !== undefined) {
    body.tag = input.tag;
    body.fromTag = input.fromTag;
  }
  if (input.loggedAt !== undefined) {
    body.loggedAt = input.loggedAt;
  }
  if (input.untimed !== undefined) {
    body.untimed = input.untimed;
  }
  if (Object.keys(body).length === 0) {
    throw new Error("Nothing to save");
  }

  const data = await apiFetch(
    `/api/meal-logs/${encodeURIComponent(logId)}`,
    PassthroughSchema,
    {
      method: "PATCH",
      baseUrl,
      ...authFor({ token }),
      body,
    },
  );
  await invalidateMindSession();
  return { success: true, data };
}
