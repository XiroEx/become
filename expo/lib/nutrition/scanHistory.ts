/**
 * ─── Estimate history: reopen, re-log, delete (NP-141) ──────────────────────
 *
 * The native half of `webapp/app/dashboard/nutrition/scans/page.tsx`: the
 * saved photo/describe estimates (`GET /api/nutrition/scans?limit=60`) with
 * thumbnails through `AuthedImage`, reopen into the native review with the
 * saved items (`GET /api/nutrition/scans/{id}`), re-log with the day, time
 * and tag picker (`POST /api/meal-logs`), and delete with optimistic removal
 * (`DELETE /api/nutrition/scans/{id}`).
 *
 * RULES THAT TRAVEL:
 *   • Re-logging uses the tag's schedule anchor for 'no time' exactly as the
 *     web does (`webapp/lib/nutrition/resolveLogAgainTimestamp.ts`):
 *     `loggedAt` is `buildLoggedAt(dateKey, timeMode === 'custom' ? time :
 *     anchorHHMM, …)` and `untimed` is `timeMode !== 'custom'`. 'now' and
 *     'none' both go out untimed — the day view places them by the tag's
 *     anchor instead of the clock — 'now' just previews as "right now" in
 *     the sheet while 'none' reads as "no time".
 *   • Re-log items are a straight repost of the scan's items (foodId when
 *     present, per-serving nutrition × servings), the same payload the web's
 *     `logAgain` sends.
 *   • Reopening rebuilds review rows from the scan exactly the way the web's
 *     `SnapPlateModal` does for `initialReview` (per-serving nutrition kept,
 *     `servings` as the count, `servingUnit` as the unit, matched rows
 *     pre-checked).
 *   • Delete is optimistic: the row leaves the list first and comes back only
 *     when the DELETE fails.
 */

import { z } from "zod";
import { apiFetch } from "@become/api-client";
import {
  anchorMinutesForTag,
  formatHHMM,
  type TagWindow,
} from "@become/core/nutrition/mealSchedule";
import { buildLoggedAt } from "@become/core/mealPlanDates";
import { formatAmount, type ReviewItem } from "@become/core";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { invalidateMindSession } from "@/lib/mind/sessionCache";

/** The three-way time model the web's "Log to a day" sheet uses. */
export type ScanLogAgainTimeMode = "now" | "custom" | "none";

export interface ScanLogAgainSelection {
  /** YYYY-MM-DD, or null for today. */
  dateKey: string | null;
  tag: string;
  timeMode: ScanLogAgainTimeMode;
  /** "HH:MM" — only read when `timeMode` is `custom`. */
  time: string | null;
}

export interface ScanLogAgainDeps {
  baseUrl?: string;
  getToken?: () => string | undefined;
  now?: Date;
  /** Injected fetch for tests — the app leaves it unset (uses apiFetch). */
  apiFetchImpl?: typeof apiFetch;
}

/**
 * `loggedAt`/`untimed` for a saved estimate being (re)logged — the exact rule
 * from `webapp/lib/nutrition/resolveLogAgainTimestamp.ts`. The tag's schedule
 * anchor stands in for 'no time' so the day view orders the entry by its tag
 * instead of the clock.
 */
export function resolveScanLogAgainTimestamp(
  dateKey: string | null,
  timeMode: ScanLogAgainTimeMode,
  customTime: string | null,
  anchorHHMM: string,
  now: Date = new Date(),
): { loggedAt: string; untimed: boolean } {
  return {
    loggedAt: buildLoggedAt(
      dateKey,
      timeMode === "custom" ? customTime : anchorHHMM,
      undefined,
      now,
    ),
    untimed: timeMode !== "custom",
  };
}

export interface ScanLogItem {
  foodId?: string;
  name: string;
  brand?: string;
  servingSize: number;
  servingUnit: string;
  servings: number;
  nutrition: { calories: number; protein: number; carbs: number; fats: number };
  confidence?: number;
  matchKind?: string;
}

export interface SavedScan {
  _id: string;
  source: string;
  note?: string;
  tag?: string;
  thumb?: string;
  imageUrl?: string;
  items: ScanLogItem[];
  totalNutrition: { calories: number; protein: number; carbs: number; fats: number };
  createdAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * The scan's items as the `POST /api/meal-logs` payload — a straight repost
 * of what the web's `logAgain` sends (foodId when present, per-serving
 * nutrition × servings).
 */
export function scanLogItems(scan: SavedScan): Record<string, unknown>[] {
  return (scan.items ?? []).map((it) => {
    const rec = asRecord(it) ?? {};
    const nutritionRec = asRecord(rec.nutrition) ?? {};
    const foodId = typeof rec.foodId === "string" && rec.foodId ? rec.foodId : undefined;
    const brand = typeof rec.brand === "string" && rec.brand ? rec.brand : undefined;
    return {
      ...(foodId ? { foodId } : {}),
      name: typeof rec.name === "string" ? rec.name : "Food",
      ...(brand ? { brand } : {}),
      servingSize: toNumber(rec.servingSize, 1),
      servingUnit:
        typeof rec.servingUnit === "string" && rec.servingUnit
          ? rec.servingUnit
          : "serving",
      servings: toNumber(rec.servings, 1),
      nutrition: {
        calories: toNumber(nutritionRec.calories, 0),
        protein: toNumber(nutritionRec.protein, 0),
        carbs: toNumber(nutritionRec.carbs, 0),
        fats: toNumber(nutritionRec.fats, 0),
      },
    };
  });
}

const MealLogCreateResponseSchema = z
  .object({
    log: z.object({ _id: z.string() }).passthrough().optional(),
    mealLog: z.object({ _id: z.string() }).passthrough().optional(),
    _id: z.string().optional(),
  })
  .passthrough();

export interface LogScanAgainResult {
  ok: boolean;
  mealLogId?: string;
  error?: string;
}

/**
 * Re-log a saved estimate to a chosen day, time and tag — the native
 * `logAgain`. `windows` supplies the tag's schedule anchor for 'no time',
 * exactly as the web passes `formatHHMM(anchorMinutesForTag(windows, tag))`.
 */
export async function logScanAgain(
  scan: SavedScan,
  selection: ScanLogAgainSelection,
  windows: TagWindow[],
  deps: ScanLogAgainDeps = {},
): Promise<LogScanAgainResult> {
  const items = scanLogItems(scan);
  if (items.length === 0) {
    return { ok: false, error: "Nothing to log." };
  }
  const tag = (selection.tag ?? "").trim().toLowerCase() || "snack";
  const anchorHHMM = formatHHMM(anchorMinutesForTag(windows, tag));
  const { loggedAt, untimed } = resolveScanLogAgainTimestamp(
    selection.dateKey,
    selection.timeMode,
    selection.time,
    anchorHHMM,
    deps.now ?? new Date(),
  );
  try {
    const fetchImpl = deps.apiFetchImpl ?? apiFetch;
    const created = await fetchImpl(
      "/api/meal-logs",
      MealLogCreateResponseSchema,
      {
        method: "POST",
        baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
        ...(deps.getToken ? { getToken: deps.getToken } : {}),
        body: { items, tags: [tag], loggedAt, untimed },
      },
    );
    const rawId = created.log?._id ?? created.mealLog?._id ?? created._id;
    const mealLogId = rawId ? String(rawId) : undefined;
    await invalidateMindSession();
    return { ok: true, ...(mealLogId ? { mealLogId } : {}) };
  } catch (err) {
    const message =
      err instanceof Error && err.message ? err.message : "Could not log. Try again.";
    return { ok: false, error: message };
  }
}

const DeleteScanResponseSchema = z.object({}).passthrough();

/** `DELETE /api/nutrition/scans/{id}`. Throws on failure — the caller restores. */
export async function deleteSavedScan(
  scanId: string,
  deps: ScanLogAgainDeps = {},
): Promise<void> {
  const fetchImpl = deps.apiFetchImpl ?? apiFetch;
  await fetchImpl(
    `/api/nutrition/scans/${encodeURIComponent(scanId)}`,
    DeleteScanResponseSchema,
    {
      method: "DELETE",
      baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
      ...(deps.getToken ? { getToken: deps.getToken } : {}),
    },
  );
}

export interface ScanReviewItem {
  foodId?: string;
  name: string;
  brand?: string;
  estimatedServing?: string;
  servingSize?: number;
  servingUnit?: string;
  servings?: number;
  nutrition: { calories: number; protein: number; carbs: number; fats: number };
  confidence?: number;
  matchKind?: string;
}

/**
 * Rebuild review rows from a saved scan — the same mapping the web's
 * `SnapPlateModal` applies to `initialReview` when a scan is reopened:
 * per-serving nutrition is kept as-is, `servings` becomes the count,
 * `servingUnit` the unit, and matched rows arrive pre-checked.
 */
export function reviewItemsFromScan(items: ScanReviewItem[]): ReviewItem[] {
  return (items ?? []).map((si) => {
    const rec = asRecord(si) ?? {};
    const nutritionRec = asRecord(rec.nutrition) ?? {};
    const nutrition = {
      calories: toNumber(nutritionRec.calories, 0),
      protein: toNumber(nutritionRec.protein, 0),
      carbs: toNumber(nutritionRec.carbs, 0),
      fats: toNumber(nutritionRec.fats, 0),
    };
    const servings = toNumber(rec.servings, 1);
    const unitLabel =
      typeof rec.servingUnit === "string" && rec.servingUnit
        ? rec.servingUnit
        : "serving";
    const name = typeof rec.name === "string" ? rec.name : "Food";
    const brand = typeof rec.brand === "string" && rec.brand ? rec.brand : undefined;
    const estimatedServing =
      typeof rec.estimatedServing === "string" && rec.estimatedServing
        ? rec.estimatedServing
        : formatAmount(servings, unitLabel);
    const confidence = toNumber(rec.confidence, 0.8);
    const matchKind =
      typeof rec.matchKind === "string" && rec.matchKind ? rec.matchKind : null;
    const foodId = typeof rec.foodId === "string" && rec.foodId ? rec.foodId : "";
    const servingSize = toNumber(rec.servingSize, 1);
    return {
      name,
      ...(brand ? { brand } : {}),
      estimatedServing,
      nutrition,
      confidence,
      multiplier: servings,
      unitLabel,
      removed: false,
      matchChecked: true,
      match: matchKind
        ? {
            kind: matchKind as "food" | "meal" | "recipe",
            id: foodId,
            name,
            ...(brand ? { brand } : {}),
            servingSize,
            servingUnit: unitLabel,
            nutrition,
            source: matchKind,
            confidence: confidence || 1,
          }
        : null,
      origServing: {
        nutrition,
        unitLabel,
        multiplier: servings,
        label: formatAmount(servings, unitLabel),
      },
    };
  });
}

/** The saved tag, normalised the way the log call files it. */
export function scanDefaultTag(scan: SavedScan, fallback: string): string {
  const tag = (scan.tag ?? "").trim().toLowerCase();
  return tag || fallback;
}
