import type {
  MealLog,
} from "@become/api-client";
import { MealLogCreateResponseSchema, apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  buildServingChoiceGroups,
  findBestBridgeForUnit,
  type ServingChoice,
  type ServingOptionVariant,
} from "@/lib/nutrition/servingOptions";
import {
  nutritionForQuantity,
  scalingFactor,
  type FoodMacros,
  type VariantForMath,
} from "@/lib/nutrition/foodMath";
import type { Unit } from "@/lib/nutrition/units";
import type { ServingUnit } from "@become/core/nutrition/types";
import { findLogForTag } from "@/lib/nutrition/logTagMatch";
import { buildLoggedAt } from "@become/core/mealPlanDates";
import { localDateKey } from "@/lib/time/localDay";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import { isObjectIdString } from "@/lib/nutrition/foodImport";

export const DEFAULT_TAGS = ["breakfast", "lunch", "dinner", "snack"] as const;

export type TimeMode = "none" | "now" | "custom";

export interface VariantLike {
  _id?: string;
  id?: string;
  name?: string;
  isDefault?: boolean;
  servingSize: number;
  servingUnit: string;
  nutrition: FoodMacros;
  gramsPerServing?: number;
  mlPerServing?: number;
  alternateServings?: { label: string; multiplier: number; [k: string]: unknown }[];
  displayLabel?: string;
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

export function previewNutritionForChoice(
  variant: VariantLike,
  quantity: number,
  unit: string,
  choice?: ServingChoice | null,
): FoodMacros {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { calories: 0, protein: 0, carbs: 0, fats: 0 };
  }
  const optVariant: ServingOptionVariant = {
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit as ServingUnit,
    displayLabel: variant.displayLabel,
    alternateServings: variant.alternateServings?.map((a) => ({
      label: a.label,
      multiplier: a.multiplier,
    })),
    gramsPerServing: variant.gramsPerServing,
    mlPerServing: variant.mlPerServing,
  };
  const choiceGroups = buildServingChoiceGroups(optVariant);
  const activeBridge =
    choice && (choice.gramsPerServing != null || choice.mlPerServing != null)
      ? choice
      : findBestBridgeForUnit(choiceGroups, unit as Unit);

  const mathVariant: VariantForMath = {
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit as ServingUnit,
    nutrition: variant.nutrition,
    gramsPerServing: activeBridge?.gramsPerServing ?? variant.gramsPerServing,
    mlPerServing: activeBridge?.mlPerServing ?? variant.mlPerServing,
  };

  try {
    return nutritionForQuantity(mathVariant, quantity, unit as Unit);
  } catch {
    return { calories: 0, protein: 0, carbs: 0, fats: 0 };
  }
}

export function buildMealItemPayload(options: {
  food: {
    _id?: string;
    id?: string;
    name: string;
    brand?: string | null;
    [k: string]: unknown;
  };
  variant: VariantLike;
  quantity: number;
  unit: string;
  servingLabel?: string;
  choice?: ServingChoice | null;
}): MealItemPayload {
  const { food, variant, quantity, unit, servingLabel, choice } = options;
  const optVariant: ServingOptionVariant = {
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit as ServingUnit,
    displayLabel: variant.displayLabel,
    alternateServings: variant.alternateServings?.map((a) => ({
      label: a.label,
      multiplier: a.multiplier,
    })),
    gramsPerServing: variant.gramsPerServing,
    mlPerServing: variant.mlPerServing,
  };

  const choiceGroups = buildServingChoiceGroups(optVariant);
  const activeBridge =
    choice && (choice.gramsPerServing != null || choice.mlPerServing != null)
      ? choice
      : findBestBridgeForUnit(choiceGroups, unit as Unit);

  const mathVariant: VariantForMath = {
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit as ServingUnit,
    nutrition: variant.nutrition,
    gramsPerServing: activeBridge?.gramsPerServing ?? variant.gramsPerServing,
    mlPerServing: activeBridge?.mlPerServing ?? variant.mlPerServing,
  };

  const multiplier = scalingFactor(mathVariant, quantity, unit as Unit);

  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error(`Invalid scaling multiplier for ${quantity} ${unit}`);
  }

  const foodId = isObjectIdString(food._id)
    ? food._id
    : isObjectIdString(food.id)
      ? food.id
      : undefined;

  const variantId = isObjectIdString(variant._id)
    ? variant._id
    : isObjectIdString(variant.id)
      ? variant.id
      : undefined;

  const effectiveGramsPerServing = mathVariant.gramsPerServing;
  const effectiveMlPerServing = mathVariant.mlPerServing;

  return {
    ...(foodId ? { foodId } : {}),
    ...(variantId ? { variantId } : {}),
    ...(variant.name ? { variantName: variant.name } : {}),
    name: food.name,
    ...(food.brand ? { brand: food.brand } : {}),
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit,
    servings: multiplier,
    nutrition: {
      calories: Math.round(variant.nutrition.calories * 10) / 10,
      protein: Math.round(variant.nutrition.protein * 10) / 10,
      carbs: Math.round(variant.nutrition.carbs * 10) / 10,
      fats: Math.round(variant.nutrition.fats * 10) / 10,
      ...(variant.nutrition.fiber != null
        ? { fiber: Math.round(variant.nutrition.fiber * 10) / 10 }
        : {}),
      ...(variant.nutrition.sugar != null
        ? { sugar: Math.round(variant.nutrition.sugar * 10) / 10 }
        : {}),
      ...(variant.nutrition.sodium != null
        ? { sodium: Math.round(variant.nutrition.sodium * 1000) / 1000 }
        : {}),
      ...(variant.nutrition.saturatedFat != null
        ? { saturatedFat: Math.round(variant.nutrition.saturatedFat * 10) / 10 }
        : {}),
    },
    ...(servingLabel?.trim() ? { servingLabel: servingLabel.trim() } : {}),
    loggedQuantity: quantity,
    loggedUnit: unit,
    ...(effectiveGramsPerServing != null
      ? { loggedGramsPerServing: effectiveGramsPerServing }
      : {}),
    ...(effectiveMlPerServing != null
      ? { loggedMlPerServing: effectiveMlPerServing }
      : {}),
  };
}

export interface LogFoodEntryOptions {
  food: {
    _id?: string;
    id?: string;
    name: string;
    brand?: string | null;
    [k: string]: unknown;
  };
  variant: VariantLike;
  quantity: number;
  unit: string;
  servingLabel?: string;
  choice?: ServingChoice | null;
  tag?: string;
  date?: string; // YYYY-MM-DD
  timeMode?: TimeMode;
  customTime?: string | null; // e.g. "14:30"
  existingLogs?: MealLog[];
  defaultTags?: readonly string[];
  token?: string | null;
  baseUrl?: string;
}

export async function logFoodEntry(options: LogFoodEntryOptions): Promise<{
  success: boolean;
  log?: MealLog;
  itemPayload: MealItemPayload;
  endpoint: string;
}> {
  const {
    food,
    variant,
    quantity,
    unit,
    servingLabel,
    choice,
    tag,
    date,
    timeMode = "none",
    customTime,
    existingLogs = [],
    defaultTags = DEFAULT_TAGS,
    token,
    baseUrl = WEBAPP_BASE_URL,
  } = options;

  const itemPayload = buildMealItemPayload({
    food,
    variant,
    quantity,
    unit,
    servingLabel,
    choice,
  });

  const useTag = (tag || "snack").trim().toLowerCase();
  const now = new Date();
  const todayStr = localDateKey(now);
  const activeDate = date || todayStr;
  const isToday = activeDate === todayStr;
  const untimed = timeMode === "none";

  let loggedAt: string;
  let isCustomTime = false;

  if (timeMode === "custom" && customTime) {
    isCustomTime = true;
    loggedAt = buildLoggedAt(activeDate, customTime, undefined, now);
  } else if (timeMode === "none") {
    if (!isToday) {
      // Non-today date with no time logs at YYYY-MM-DDT12:00:00.000Z
      loggedAt = `${activeDate}T12:00:00.000Z`;
    } else {
      loggedAt = now.toISOString();
    }
  } else {
    // timeMode === 'now'
    loggedAt = isToday ? now.toISOString() : `${activeDate}T12:00:00.000Z`;
  }

  // A picked time always creates a new MealLog.
  // Otherwise smart-append only when target log's untimed-ness matches.
  const smartTarget = isCustomTime
    ? undefined
    : findLogForTag(existingLogs, useTag, defaultTags);

  const existing =
    smartTarget && Boolean(smartTarget.untimed) === untimed
      ? smartTarget
      : undefined;

  let res: { success: boolean; log: MealLog };
  let endpoint: string;

  if (existing?._id) {
    endpoint = `/api/meal-logs/${encodeURIComponent(existing._id)}/items`;
    res = await apiFetch(endpoint, MealLogCreateResponseSchema, {
      method: "POST",
      body: itemPayload,
      baseUrl,
      getToken: () => token ?? undefined,
    });
  } else {
    endpoint = "/api/meal-logs";
    res = await apiFetch(endpoint, MealLogCreateResponseSchema, {
      method: "POST",
      body: {
        items: [itemPayload],
        tags: [useTag],
        loggedAt,
        untimed,
      },
      baseUrl,
      getToken: () => token ?? undefined,
    });
  }

  // Every log drops the cached AI Mind session (NP-102)
  await invalidateMindSession();

  return {
    success: res.success,
    log: res.log,
    itemPayload,
    endpoint,
  };
}
