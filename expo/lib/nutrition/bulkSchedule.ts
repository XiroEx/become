import { z } from "zod";
import {
  apiFetch as defaultApiFetch,
  type apiFetch as ApiFetchType,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { MealPlanSchema, type MealPlan } from "@/lib/nutrition/mealPlans";
import { clampRepeat, type MealPlanRepeatInput } from "@/lib/nutrition/mealPlanApi";

/**
 * ─── Bulk schedule-meals API client (NP-177) ─────────────────────────────────
 *
 * The native port of the two bulk endpoints behind the web's
 * `ScheduleMealsDrawer` (`webapp/components/nutrition/ScheduleMealsDrawer.tsx`)
 * and `PlanToolsSheets` (`webapp/app/dashboard/timeline/PlanToolsSheets.tsx`):
 *
 * - `copyDayForward` -> POST /api/meal-plans/bulk-from-day
 *   (`webapp/app/api/meal-plans/bulk-from-day/route.ts`).
 * - `applyMealToDays` -> POST /api/meal-plans/bulk-from-meal
 *   (`webapp/app/api/meal-plans/bulk-from-meal/route.ts`).
 *
 * RULES THAT TRAVEL:
 * - Planned dates are local calendar dates (`YYYY-MM-DD`, never ISO
 *   timestamps). The server's merge / replace / fail modes decide duplicates,
 *   so the client always sends `mode` explicitly (the web sends `'merge'`).
 * - `repeat` is clamped client-side to 1..30 by day, 1..52 by week (the
 *   route 400s anything else) and is only sent when the caller opened the
 *   Repeat disclosure with count > 1.
 * - Past targets are skipped server-side (`skippedPast`); the client never
 *   filters them out of the request.
 */

export type BulkConflictMode = "merge" | "replace" | "fail";

export type BulkSourceType = "log" | "plan";

const BulkResponseSchema = z
  .object({
    created: z.number().default(0),
    merged: z.number().default(0),
    replaced: z.number().default(0),
    conflicts: z.array(MealPlanSchema).default([]),
    plans: z.array(MealPlanSchema).default([]),
    skippedPast: z.array(z.string()).default([]),
    seriesId: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export type BulkScheduleResult = z.infer<typeof BulkResponseSchema>;

export interface BulkScheduleResponse extends BulkScheduleResult {
  plans: MealPlan[];
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function assertDateKey(value: string, field: string): void {
  if (!DATE_KEY.test(value)) {
    throw new Error(`${field} must be a local YYYY-MM-DD key`);
  }
}

export interface CopyDayForwardInput {
  /** Local `YYYY-MM-DD` key copied FROM. */
  sourceDate: string;
  /** `'log'` = what they ate, `'plan'` = what they planned (web default). */
  sourceType: BulkSourceType;
  /** Local `YYYY-MM-DD` keys copied TO. */
  targetDates: readonly string[];
  /** Duplicate policy — the web always sends `'merge'`. */
  mode?: BulkConflictMode;
  apiFetch?: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/**
 * Copy one day's rows onto target dates as plans.
 * Mirrors `CopyDayForwardSheet#doSubmit` / `CopyDayTab#doSubmit`: one POST
 * with `{ sourceDate, sourceType, targetDates, mode: 'merge' }`.
 */
export async function copyDayForward(
  input: CopyDayForwardInput,
): Promise<BulkScheduleResponse> {
  const {
    sourceDate,
    sourceType,
    targetDates,
    mode = "merge",
    apiFetch = defaultApiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = input;
  assertDateKey(sourceDate, "sourceDate");
  if (sourceType !== "log" && sourceType !== "plan") {
    throw new Error("sourceType must be 'log' or 'plan'");
  }
  if (!Array.isArray(targetDates) || targetDates.length === 0) {
    throw new Error("targetDates must be a non-empty array");
  }
  for (const t of targetDates) assertDateKey(t, "targetDates[]");
  const data = await apiFetch("/api/meal-plans/bulk-from-day", BulkResponseSchema, {
    method: "POST",
    baseUrl,
    getToken: () => token ?? undefined,
    body: {
      sourceDate,
      sourceType,
      targetDates: [...targetDates],
      mode,
    },
  });
  return { ...data, plans: data.plans ?? [] };
}

export interface ApplyMealToDaysInput {
  /** The saved Meal template to schedule. */
  mealId: string;
  /** Local `YYYY-MM-DD` keys to schedule it on. */
  targetDates: readonly string[];
  /** Meal-time tag the plans are filed under (lower-cased). */
  tag: string;
  notes?: string;
  /** Duplicate policy — the web always sends `'merge'`. */
  mode?: BulkConflictMode;
  /**
   * Recurrence, sent only when the Repeat disclosure is open with
   * count > 1 (`repeatOpen && repeatCount > 1` on the web).
   */
  repeat?: MealPlanRepeatInput;
  apiFetch?: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/**
 * Schedule one saved meal across a range — one plan per day, exactly as the
 * web's `ApplyMealToDaysSheet#doSubmit` / `FromTemplateTab#doSubmit` does:
 * one POST with `{ mealId, tag, targetDates, mode: 'merge', repeat? }`.
 */
export async function applyMealToDays(
  input: ApplyMealToDaysInput,
): Promise<BulkScheduleResponse> {
  const {
    mealId,
    targetDates,
    tag,
    notes,
    mode = "merge",
    repeat,
    apiFetch = defaultApiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = input;
  if (!mealId) throw new Error("mealId is required");
  const useTag = tag.trim().toLowerCase();
  if (!useTag) throw new Error("tag is required");
  if (!Array.isArray(targetDates) || targetDates.length === 0) {
    throw new Error("targetDates must be a non-empty array");
  }
  for (const t of targetDates) assertDateKey(t, "targetDates[]");
  const body: Record<string, unknown> = {
    mealId,
    tag: useTag,
    targetDates: [...targetDates],
    mode,
  };
  if (notes !== undefined) body.notes = notes;
  if (repeat) {
    const clamped = clampRepeat(repeat);
    if (clamped && clamped.count > 1) body.repeat = clamped;
  }
  const data = await apiFetch("/api/meal-plans/bulk-from-meal", BulkResponseSchema, {
    method: "POST",
    baseUrl,
    getToken: () => token ?? undefined,
    body,
  });
  return { ...data, plans: data.plans ?? [] };
}

/**
 * Add N calendar days to a local `YYYY-MM-DD` key (pure calendar math, no TZ
 * surprises — the same UTC-key arithmetic as `@become/core/mealPlanDates`).
 */
export function addDaysToKey(key: string, n: number): string {
  assertDateKey(key, "key");
  const [y, m, d] = key.split("-").map(Number);
  const base = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1));
  base.setUTCDate(base.getUTCDate() + n);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Every local `YYYY-MM-DD` key from `fromKey`..`toKey` inclusive (capped at
 * 60, the web's safety cap in `CopyDayTab` / `FromTemplateTab`).
 */
export function expandDateRange(fromKey: string, toKey: string): string[] {
  assertDateKey(fromKey, "fromKey");
  assertDateKey(toKey, "toKey");
  const out: string[] = [];
  let cursor = fromKey;
  while (cursor <= toKey) {
    out.push(cursor);
    cursor = addDaysToKey(cursor, 1);
    if (out.length >= 60) break;
  }
  return out;
}

/**
 * The forward range behind "copy N days forward": `source + 1 ..
 * source + forwardDays` (the web's `CopyDayForwardSheet#targetDates`).
 */
export function forwardTargetDates(sourceKey: string, forwardDays: number): string[] {
  assertDateKey(sourceKey, "sourceKey");
  const n = Math.max(1, Math.min(30, Math.round(forwardDays)));
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(addDaysToKey(sourceKey, i));
  return out;
}

/**
 * The web's bulk-op confirm gate (`PlanToolsSheets.tsx` / `ScheduleMealsDrawer.tsx`):
 * any op affecting > 7 distinct target dates shows a confirmation step.
 */
export function needsBulkConfirm(targetCount: number): boolean {
  return targetCount > 7;
}

/**
 * The web's toast for a bulk op (`timeline/page.tsx#onApplied`):
 * `"<total> plan(s) created"` / `"<total> meal plan(s) created"`.
 */
export function bulkResultToast(
  result: Pick<BulkScheduleResponse, "created" | "merged" | "replaced">,
  kind: "plan" | "meal-plan" = "plan",
): string {
  const total = result.created + result.merged + result.replaced;
  const noun = kind === "meal-plan" ? "meal plan" : "plan";
  return `${total} ${noun}${total === 1 ? "" : "s"} created`;
}
