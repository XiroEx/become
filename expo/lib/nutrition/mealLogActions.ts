import { z } from "zod";
import type { apiFetch as ApiFetchType } from "@become/api-client";
import { scalingFactor } from "@/lib/nutrition/foodMath";
import {
  type ServingChoice,
  servingChoiceDisplayLabel,
  variantForServingChoice,
} from "@/lib/nutrition/servingOptions";
import type { Unit } from "@/lib/nutrition/units";
import { findLogForTag } from "@/lib/nutrition/logTagMatch";
import { buildLoggedAt, todayLocalKey } from "@/lib/nutrition/mealPlanDates";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import { WEBAPP_BASE_URL } from "@/lib/config";

export const DEFAULT_TAGS = ["breakfast", "lunch", "dinner", "snack"] as const;

const PassthroughSchema = z.object({}).passthrough();

export interface FoodMacros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  saturatedFat?: number;
}

export interface MealItemPayload {
  foodId?: string;
  variantId?: string;
  variantName?: string;
  name: string;
  brand?: string;
  servingSize: number;
  servingUnit: string;
  servings: number;
  nutrition: FoodMacros;
  servingLabel?: string;
  loggedQuantity: number;
  loggedUnit: string;
  loggedGramsPerServing?: number;
  loggedMlPerServing?: number;
}

export interface BuildMealItemPayloadOptions {
  food: {
    _id?: string | null;
    id?: string | null;
    name?: string | null;
    brand?: string | null;
    [k: string]: unknown;
  };
  variant: any;
  quantity: number;
  unit: string;
  servingChoice?: ServingChoice;
  servingLabel?: string;
}

/**
 * Builds the canonical item payload emitted by the quantity picker,
 * matching web's IFoodEntry / MealItemInput shape.
 */
export function buildMealItemPayload(
  options: BuildMealItemPayloadOptions,
): MealItemPayload {
  const { food, variant, quantity, unit, servingChoice, servingLabel } = options;

  const effectiveVariant = servingChoice
    ? variantForServingChoice(variant, servingChoice)
    : variant;

  const servings = scalingFactor(
    effectiveVariant,
    quantity,
    unit as Unit,
  );

  const effectiveGramsPerServing =
    servingChoice?.gramsPerServing ?? variant.gramsPerServing;
  const effectiveMlPerServing =
    servingChoice?.mlPerServing ?? variant.mlPerServing;

  const rawFoodId = food._id ?? food.id;
  const foodId = rawFoodId ? String(rawFoodId) : undefined;

  const effectiveServingLabel =
    servingLabel ??
    (servingChoice ? servingChoiceDisplayLabel(servingChoice) : undefined);

  const payload: MealItemPayload = {
    ...(foodId ? { foodId } : {}),
    ...(variant._id ? { variantId: String(variant._id) } : {}),
    ...(variant.name ? { variantName: String(variant.name) } : {}),
    name: String(food.name ?? variant.name ?? "Food"),
    ...(food.brand ? { brand: String(food.brand) } : {}),
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit,
    servings,
    nutrition: variant.nutrition,
    ...(effectiveServingLabel ? { servingLabel: effectiveServingLabel } : {}),
    loggedQuantity: quantity,
    loggedUnit: unit,
    ...(effectiveGramsPerServing != null
      ? { loggedGramsPerServing: effectiveGramsPerServing }
      : {}),
    ...(effectiveMlPerServing != null
      ? { loggedMlPerServing: effectiveMlPerServing }
      : {}),
  };

  return payload;
}

export interface LogFoodItemOptions {
  item: MealItemPayload;
  tag?: string;
  date?: string;
  timeMode?: "now" | "picked" | "none";
  pickedTime?: string | null;
  existingLogs?: {
    _id: string;
    tags?: string[];
    mealName?: string;
    untimed?: boolean;
    loggedAt?: string | Date;
  }[];
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  baseUrl?: string;
  now?: Date;
}

export interface LogFoodItemResult {
  success: boolean;
  appended: boolean;
  logId?: string;
  data?: unknown;
}

/**
 * Log food through /api/meal-logs, enforcing the travel rules:
 * 1. A picked time always creates a new MealLog.
 * 2. Smart-append only when the target log's untimed-ness matches (findLogForTag).
 * 3. A non-today date with no time logs at YYYY-MM-DDT12:00:00.000Z.
 * 4. Every log drops the cached AI Mind session (NP-102).
 */
export async function logFoodItem(
  options: LogFoodItemOptions,
): Promise<LogFoodItemResult> {
  const {
    item,
    tag = "snack",
    date,
    timeMode = "now",
    pickedTime,
    existingLogs = [],
    apiFetch,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;

  const now = options.now ?? new Date();
  const dateParam = date ?? todayLocalKey(now);
  const isToday = dateParam === todayLocalKey(now);
  const useTag = tag.trim().toLowerCase() || "snack";
  const untimed = timeMode === "none";
  const isPickedTime = timeMode === "picked";

  // A picked time always creates a new MealLog (never smart-appends).
  const smartTarget = isPickedTime
    ? undefined
    : findLogForTag(existingLogs, useTag, DEFAULT_TAGS);

  // Smart-append only when target log's untimed-ness matches.
  const canSmartAppend = Boolean(
    smartTarget && Boolean(smartTarget.untimed) === untimed,
  );

  let resultData: unknown;
  let targetLogId: string | undefined;

  if (canSmartAppend && smartTarget) {
    targetLogId = smartTarget._id;
    resultData = await apiFetch(
      `/api/meal-logs/${encodeURIComponent(smartTarget._id)}/items`,
      PassthroughSchema,
      {
        method: "POST",
        baseUrl,
        getToken: () => token ?? undefined,
        body: item,
      },
    );
  } else {
    // New MealLog: determine loggedAt
    let loggedAt: string;
    if (isPickedTime) {
      loggedAt = buildLoggedAt(dateParam, pickedTime ?? null, undefined, now);
    } else if (!isToday) {
      // Non-today date with no time (or default time) logs at noon UTC
      loggedAt = `${dateParam}T12:00:00.000Z`;
    } else {
      loggedAt = now.toISOString();
    }

    resultData = await apiFetch("/api/meal-logs", PassthroughSchema, {
      method: "POST",
      baseUrl,
      getToken: () => token ?? undefined,
      body: {
        items: [item],
        tags: [useTag],
        loggedAt,
        untimed,
      },
    });

    const typedResult = resultData as { log?: { _id?: string } } | undefined;
    targetLogId = typedResult?.log?._id;
  }

  // Every log drops the cached AI Mind session (NP-102).
  await invalidateMindSession();

  return {
    success: true,
    appended: canSmartAppend,
    logId: targetLogId,
    data: resultData,
  };
}
