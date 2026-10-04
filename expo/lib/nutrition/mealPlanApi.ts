import { z } from "zod";
import {
  apiFetch as defaultApiFetch,
  ApiError,
  type apiFetch as ApiFetchType,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { MealPlanSchema, type MealPlan } from "@/lib/nutrition/mealPlans";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";

/**
 * ─── Native meal-plan API client (NP-229) ───────────────────────────────────
 *
 * No UI. Ports the request/response shapes of
 * `webapp/app/api/meal-plans/route.ts` (POST) and
 * `webapp/app/api/meal-plans/[id]/route.ts` (PATCH, DELETE):
 *
 * - `createMealPlan` -> POST /api/meal-plans. `plannedDate` is a local
 *   `YYYY-MM-DD` key (never an ISO timestamp); the tag is lower-cased; item
 *   fields are exactly the web's (`webapp/app/dashboard/nutrition/page.tsx`:
 *   `foodId, variantId, variantName, name, brand, servingSize, servingUnit,
 *   servings, nutrition, servingLabel, loggedQuantity, loggedUnit,
 *   loggedGramsPerServing, loggedMlPerServing` — build them with
 *   `buildMealItemPayload` from `mealLogActions`). `repeat` is clamped
 *   client-side to 1..30 by day, 1..52 by week (route.ts).
 * - `updateMealPlanItems` -> PATCH /api/meal-plans/{id} with the FULL
 *   `items[]` (`webapp/components/nutrition/EditFoodModal.tsx`: replace the
 *   matching item by `_id`, send the whole array).
 * - `deleteMealPlan` -> DELETE /api/meal-plans/{id} (+ `?series=true` to drop
 *   the whole series, `webapp/app/dashboard/timeline/page.tsx`).
 * - `planResultToast` -> the web's exact toast strings (timeline/page.tsx).
 *
 * The existing GET / promote / skip / DELETE calls in
 * `app/(app)/(tabs)/nutrition/index.tsx` stay as they are.
 */

export type MealPlanRepeatEvery = "day" | "week";

export interface MealPlanRepeatInput {
  every: MealPlanRepeatEvery;
  count: number;
}

export type MealPlanConflictMode = "merge" | "replace" | "fail";

/**
 * One planned row, exactly the web's item shape. `MealItemPayload` (built by
 * `buildMealItemPayload`) already carries exactly these fields, so it is the
 * canonical input — this alias names the intent at the plan boundary.
 */
export type MealPlanItemInput = MealItemPayload;

export const MAX_REPEAT_COUNT_BY_DAY = 30;
export const MAX_REPEAT_COUNT_BY_WEEK = 52;

/**
 * Clamp a repeat to what the route accepts (route.ts:178-193): 1..30 by day,
 * 1..52 by week. Anything else is a caller bug — the server 400s it — so an
 * unknown `every` is dropped rather than sent.
 */
export function clampRepeat(
  repeat: MealPlanRepeatInput,
): { every: MealPlanRepeatEvery; count: number } | undefined {
  if (repeat.every !== "day" && repeat.every !== "week") return undefined;
  const max = repeat.every === "day" ? MAX_REPEAT_COUNT_BY_DAY : MAX_REPEAT_COUNT_BY_WEEK;
  const count = Math.floor(Number(repeat.count));
  if (!Number.isFinite(count)) return undefined;
  return { every: repeat.every, count: Math.min(Math.max(count, 1), max) };
}

const SeriesResponseSchema = z
  .object({
    seriesId: z.string(),
    created: z.number(),
    merged: z.number(),
    replaced: z.number(),
    conflicts: z.array(MealPlanSchema).default([]),
    plans: z.array(MealPlanSchema).default([]),
  })
  .passthrough();

export type MealPlanSeriesResponse = z.infer<typeof SeriesResponseSchema>;

const OneTimeResponseSchema = z
  .object({
    plan: MealPlanSchema,
    merged: z.boolean().optional(),
    replaced: z.boolean().optional(),
  })
  .passthrough();

export type MealPlanOneTimeResponse = z.infer<typeof OneTimeResponseSchema>;

/** Loose envelope: the POST answers one of two shapes; branch on `seriesId`. */
const AnyResponseSchema = z.record(z.string(), z.unknown());

const UpdateMealPlanResponseSchema = z
  .object({ plan: MealPlanSchema })
  .passthrough();

const DeleteMealPlanResponseSchema = z
  .object({
    success: z.boolean().default(true),
    deletedCount: z.number().default(1),
  })
  .passthrough();

export interface CreateMealPlanInput {
  /** Local `YYYY-MM-DD` key. Never an ISO timestamp. */
  plannedDate: string;
  tag: string;
  items?: readonly MealPlanItemInput[];
  mealId?: string;
  notes?: string;
  mode?: MealPlanConflictMode;
  repeat?: MealPlanRepeatInput;
  apiFetch?: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

export type CreateMealPlanResult =
  | { plan: MealPlan; merged?: boolean; replaced?: boolean }
  | {
      seriesId: string;
      created: number;
      merged: number;
      replaced: number;
      conflicts: MealPlan[];
      plans: MealPlan[];
    }
  | { conflict: MealPlan };

/** 400 `plan_past_date` — the slot is before yesterday-UTC. */
export class MealPlanPastDateError extends Error {
  readonly code = "plan_past_date" as const;
  constructor() {
    super("Cannot plan for a past date");
    this.name = "MealPlanPastDateError";
  }
}

/** 409 `plan_already_promoted` — the plan already lives in the log. */
export class MealPlanAlreadyPromotedError extends Error {
  readonly code = "plan_already_promoted" as const;
  readonly logId: string | null;
  constructor(logId: string | null) {
    super("This plan was already logged");
    this.name = "MealPlanAlreadyPromotedError";
    this.logId = logId;
  }
}

function serverErrorOf(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | null | undefined;
    return typeof body?.error === "string" ? body.error : undefined;
  }
  return undefined;
}

function existingPlanOf(error: ApiError): MealPlan | undefined {
  const body = error.body as { existingPlan?: unknown } | null | undefined;
  const parsed = MealPlanSchema.safeParse(body?.existingPlan);
  return parsed.success ? parsed.data : undefined;
}

function isLocalDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * POST /api/meal-plans. Resolves both shapes: one-time
 * `{ plan, merged?, replaced? }` and series
 * `{ seriesId, created, merged, replaced, conflicts, plans }`.
 * A 409 `plan_exists` (mode `'fail'` against an occupied slot) RESOLVES with
 * `{ conflict: existingPlan }` rather than throwing; a 400 `plan_past_date`
 * throws `MealPlanPastDateError`.
 */
export async function createMealPlan(
  input: CreateMealPlanInput,
): Promise<CreateMealPlanResult> {
  const {
    plannedDate,
    tag,
    items,
    mealId,
    notes,
    mode,
    repeat,
    apiFetch = defaultApiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = input;

  if (!isLocalDateKey(plannedDate)) {
    throw new Error("plannedDate must be a local YYYY-MM-DD key");
  }
  const useTag = tag.trim().toLowerCase();
  if (!useTag) throw new Error("tag is required");

  const clampedRepeat = repeat ? clampRepeat(repeat) : undefined;

  const body: Record<string, unknown> = { plannedDate, tag: useTag };
  if (items && items.length > 0) body.items = [...items];
  if (mealId) body.mealId = mealId;
  if (notes !== undefined) body.notes = notes;
  if (mode) body.mode = mode;
  if (clampedRepeat) body.repeat = clampedRepeat;

  let data: z.infer<typeof AnyResponseSchema>;
  try {
    data = await apiFetch("/api/meal-plans", AnyResponseSchema, {
      method: "POST",
      baseUrl,
      getToken: () => token ?? undefined,
      body,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const code = serverErrorOf(error);
      if (error.status === 409 && code === "plan_exists") {
        const existingPlan = existingPlanOf(error);
        if (existingPlan) return { conflict: existingPlan };
      }
      if (error.status === 400 && code === "plan_past_date") {
        throw new MealPlanPastDateError();
      }
    }
    throw error;
  }

  if (typeof data.seriesId === "string") {
    const parsed = SeriesResponseSchema.parse(data);
    return {
      seriesId: parsed.seriesId,
      created: parsed.created,
      merged: parsed.merged,
      replaced: parsed.replaced,
      conflicts: parsed.conflicts,
      plans: parsed.plans,
    };
  }
  const parsed = OneTimeResponseSchema.parse(data);
  return {
    plan: parsed.plan,
    ...(parsed.merged === true ? { merged: true as const } : {}),
    ...(parsed.replaced === true ? { replaced: true as const } : {}),
  };
}

export interface UpdateMealPlanItemsOptions {
  apiFetch?: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/**
 * PATCH /api/meal-plans/{id} with the FULL `items[]` — the web replaces the
 * matching item by `_id` client-side and sends the whole array
 * (`EditFoodModal.tsx`). A 409 `plan_already_promoted` throws
 * `MealPlanAlreadyPromotedError` (with the log id when the server sent one).
 */
export async function updateMealPlanItems(
  planId: string,
  items: readonly MealPlanItemInput[],
  options: UpdateMealPlanItemsOptions = {},
): Promise<{ plan: MealPlan }> {
  const {
    apiFetch = defaultApiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;
  if (!planId) throw new Error("planId is required");
  try {
    const data = await apiFetch(
      `/api/meal-plans/${encodeURIComponent(planId)}`,
      UpdateMealPlanResponseSchema,
      {
        method: "PATCH",
        baseUrl,
        getToken: () => token ?? undefined,
        body: { items: [...items] },
      },
    );
    return { plan: data.plan };
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      serverErrorOf(error) === "plan_already_promoted"
    ) {
      const body = error.body as { logId?: unknown } | null | undefined;
      throw new MealPlanAlreadyPromotedError(
        typeof body?.logId === "string" ? body.logId : null,
      );
    }
    throw error;
  }
}

export interface DeleteMealPlanOptions {
  /**
   * `true` appends `?series=true` so the API drops every sibling active plan
   * sharing the seriesId (`timeline/page.tsx#handleDeletePlan`).
   */
  series?: boolean;
  apiFetch?: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
}

/** DELETE /api/meal-plans/{id}[?series=true]. Hard delete, any status. */
export async function deleteMealPlan(
  planId: string,
  options: DeleteMealPlanOptions = {},
): Promise<{ success: boolean; deletedCount: number }> {
  const {
    series = false,
    apiFetch = defaultApiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;
  if (!planId) throw new Error("planId is required");
  const path =
    `/api/meal-plans/${encodeURIComponent(planId)}` +
    (series ? "?series=true" : "");
  const data = await apiFetch(path, DeleteMealPlanResponseSchema, {
    method: "DELETE",
    baseUrl,
    getToken: () => token ?? undefined,
  });
  return { success: data.success, deletedCount: data.deletedCount };
}

/** Exact copy of the web's `timeline/page.tsx#titleCaseTag`. */
export function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

export type PlanResultForToast = Exclude<CreateMealPlanResult, { conflict: MealPlan }>;

/**
 * The web's exact toast strings (`timeline/page.tsx`):
 * "N Lunch plans created (x new, y merged)", "Added to existing Lunch plan",
 * "Replaced existing Lunch plan", "Planned for Lunch".
 */
export function planResultToast(
  result: PlanResultForToast,
  tag: string,
): string {
  const label = titleCaseTag(tag.trim().toLowerCase() || "snack");
  if ("seriesId" in result) {
    const total = result.created + result.merged + result.replaced;
    const parts: string[] = [];
    if (result.created) parts.push(`${result.created} new`);
    if (result.merged) parts.push(`${result.merged} merged`);
    if (result.replaced) parts.push(`${result.replaced} replaced`);
    return `${total} ${label} plans created (${parts.join(", ")})`;
  }
  if (result.merged) return `Added to existing ${label} plan`;
  if (result.replaced) return `Replaced existing ${label} plan`;
  return `Planned for ${label}`;
}
