/**
 * ─── Fold items already logged into ONE sitting (NP-175) ─────────────────────
 *
 * The native half of `POST /api/meal-logs/combine`
 * (`webapp/app/api/meal-logs/combine/route.ts`). The multi-select in the search
 * sheet only helps going forward; this is the other half — three items logged
 * separately an hour ago collapse into "Turkey sandwich" without re-logging
 * them and re-deriving every serving by hand.
 *
 * THE RULE THAT TRAVELS: the server writes the merged log FIRST and only then
 * strips the picked items from their sources, inside ONE request. Never emulate
 * that here with a create plus several deletes — a dropped connection halfway
 * through would leave a half-merged day, and doing the strip first would turn a
 * visible duplicate into a log the member cannot reconstruct. One call, or
 * nothing.
 *
 * Saving the result as a reusable Meal is the only gated half (`custom-meals`,
 * route.ts:58-65). Combining the day's own rows is free, so a free member at
 * 3/3 meals still gets the fold — the caller passes `saveAsMeal: false` and the
 * route never reaches `requireQuota`.
 */

import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

/** One item on the day, addressed the way the route addresses it. */
export interface CombinePick {
  logId: string;
  itemId: string;
}

/**
 * A logged row the select mode can offer. Only rows carrying a real
 * subdocument `_id` get here: that id is how the server finds the item inside
 * its MealLog, so a row without one is not addressable and must not be
 * selectable (the web filters the same way — `TagSection.tsx:314`).
 */
export interface SelectableLogItem extends CombinePick {
  /** `logId:itemId` — the selection set's member. */
  key: string;
  name: string;
  servings: number;
  /** Already `nutrition × servings`, the day's own arithmetic. */
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface CombineTotals {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

interface NutritionLike {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
}

interface ItemLike {
  _id?: unknown;
  name?: unknown;
  servings?: unknown;
  nutrition?: NutritionLike | null;
}

interface LogLike {
  _id?: unknown;
  id?: unknown;
  items?: readonly ItemLike[] | null;
}

/** The selection set's member for one row. */
export function selectionKey(logId: string, itemId: string): string {
  return `${logId}:${itemId}`;
}

/** Add or remove one row, without mutating the set handed in. */
export function toggleSelection(
  selected: ReadonlySet<string>,
  key: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function positiveServings(value: unknown): number {
  return typeof value === "number" && value > 0 ? value : 1;
}

/**
 * Every addressable row of a sitting, in the order the day renders them.
 *
 * A log whose own id is missing is skipped with its items: a pick names both
 * ids and half of one is a 404 from the route.
 */
export function selectableLogItems(
  logs: readonly LogLike[] | null | undefined,
): SelectableLogItem[] {
  const out: SelectableLogItem[] = [];
  for (const log of logs ?? []) {
    const logId = String(log?._id ?? log?.id ?? "");
    if (!logId) continue;
    for (const item of log?.items ?? []) {
      // No subdocument id, no pick — see SelectableLogItem.
      if (item?._id === undefined || item?._id === null || item._id === "") continue;
      const itemId = String(item._id);
      const servings = positiveServings(item.servings);
      const nutrition = item.nutrition ?? {};
      out.push({
        key: selectionKey(logId, itemId),
        logId,
        itemId,
        name: String(item.name ?? "Food"),
        servings,
        calories: (nutrition.calories ?? 0) * servings,
        protein: (nutrition.protein ?? 0) * servings,
        carbs: (nutrition.carbs ?? 0) * servings,
        fats: (nutrition.fats ?? 0) * servings,
      });
    }
  }
  return out;
}

/** The picked rows, still in day order rather than tap order. */
export function pickedLogItems(
  items: readonly SelectableLogItem[],
  selected: ReadonlySet<string>,
): SelectableLogItem[] {
  return items.filter((item) => selected.has(item.key));
}

/** What the merged sitting will read, before it is written. */
export function combineTotals(
  items: readonly SelectableLogItem[],
): CombineTotals {
  return items.reduce<CombineTotals>(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fats: acc.fats + item.fats,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );
}

/**
 * The pre-filled name, the same shape as the search sheet's basket name
 * (`webapp/components/nutrition/FoodSearchModal.tsx:1240-1245`) so a meal built
 * either way reads the same in the list. Two or three items read best as their
 * names; beyond that the list stops being a name.
 */
export function defaultCombineName(
  items: readonly SelectableLogItem[],
): string {
  const names = items.map((item) => item.name.trim()).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length <= 3) return names.join(" + ");
  return `${names.slice(0, 2).join(" + ")} +${names.length - 2} more`;
}

/** One item is not a combination; it would just rename a row (route.ts:41-44). */
export function canCombine(items: readonly SelectableLogItem[]): boolean {
  return items.length >= 2;
}

/**
 * What the route answers with. Deliberately loose about `log`: the day is
 * refetched straight afterwards, so nothing here depends on parsing the merged
 * document, and a server that grows a field must not make a shipped build treat
 * a successful combine as a failure.
 */
export const CombineResponseSchema = z
  .object({
    success: z.boolean().optional(),
    /** The saved Meal's id when `saveAsMeal` was honoured, else null. */
    mealId: z.string().nullable().optional(),
    /** Source logs emptied by the move and deleted. */
    removedLogIds: z.array(z.string()).optional(),
  })
  .passthrough();

export type CombineResponse = z.infer<typeof CombineResponseSchema>;

export interface CombineLoggedItemsOptions {
  picks: readonly CombinePick[];
  /** Names the merged log; required when `saveAsMeal`. */
  mealName?: string | undefined;
  /** Keep the result as a reusable Meal. The only half `custom-meals` gates. */
  saveAsMeal?: boolean;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/**
 * ONE request. The create-then-strip ordering lives on the server and is not
 * reproducible from here — see the header.
 *
 * The two guards mirror the route's own 400s so an obviously bad combine is
 * refused without a round trip; everything else (a stale id, someone else's
 * log, the `custom-meals` gate) is the server's answer to give.
 */
export async function combineLoggedItems(
  options: CombineLoggedItemsOptions,
): Promise<CombineResponse> {
  const {
    picks,
    saveAsMeal = false,
    apiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;

  if (picks.length < 2) {
    throw new Error("Pick at least two items to combine");
  }
  const mealName = (options.mealName ?? "").trim();
  if (saveAsMeal && !mealName) {
    throw new Error("A meal needs a name");
  }

  return apiFetch("/api/meal-logs/combine", CombineResponseSchema, {
    method: "POST",
    baseUrl,
    getToken: () => token ?? undefined,
    body: {
      picks: picks.map((pick) => ({
        logId: String(pick.logId),
        itemId: String(pick.itemId),
      })),
      ...(mealName ? { mealName } : {}),
      saveAsMeal,
    },
  });
}
