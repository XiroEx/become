import { useEffect, useMemo, useRef } from "react";
import { z } from "zod";
import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { watchUnauthorized } from "@/lib/auth/unauthorized";
import { tzBodyFields, withTz } from "@/lib/nutrition/localDay";

const OkSchema = z.object({}).passthrough();

export interface FoodMacros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface AddToLogInput {
  mealType: string;
  date: string;
  food: {
    name: string;
    /**
     * PER-SERVING snapshot, NOT the consumed amount: the server totals an
     * entry as `nutrition × servings` (`webapp/models/Meal.ts` →
     * `computeTotalNutrition`), which is exactly what the web sends. Scaling
     * here as well double-counts the entry.
     */
    nutrition: FoodMacros;
    /** Multiplier on `nutrition` — the amount the member actually logged. */
    servings?: number;
    [k: string]: unknown;
  };
}

export interface UseFoodLogOptions {
  getToken: () => string | undefined;
}

/**
 * Food-log write operations:
 *  - addToLog: POST /api/nutrition/log { mealType, food, date, tz }
 *  - removeFromLog: DELETE /api/nutrition/log?foodEntryId=…&date=…&tz=…
 *
 * There is deliberately no `saveFood` here. It POSTed `/api/nutrition/foods`,
 * which is `requireQuota('custom-foods')` and stamps `authoredBy` — logging a
 * USDA/OpenFoodFacts hit would have charged the member's custom-food
 * allowance for a row they never authored (and, with no `servingSize` in the
 * payload, 500ed before the log ever ran). External hits are materialised
 * through the ungated `POST /api/nutrition/foods/import`
 * (`lib/nutrition/foodImport.ts`) instead.
 *
 * Both calls carry `tz` (minutes west of UTC) so the day they land on is the
 * device's, not UTC's.
 */
export function useFoodLog(options: UseFoodLogOptions) {
  // Keep the latest getToken in a ref so the callbacks stay stable across
  // renders but always read the current token.
  const getTokenRef = useRef(options.getToken);
  useEffect(() => {
    getTokenRef.current = options.getToken;
  });
  return useMemo(() => {
    const base = {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => getTokenRef.current(),
    };
    // These two call apiFetch directly rather than through useMutation, so
    // they report their own failures to the one 401 handler.
    return {
      addToLog: (input: AddToLogInput) =>
        watchUnauthorized(
          apiFetch("/api/nutrition/log", OkSchema, {
            method: "POST",
            // The POST reads its offset from the BODY (readTzOffsetFromBody).
            body: { ...input, ...tzBodyFields() },
            ...base,
          }),
        ),
      removeFromLog: (input: { foodEntryId: string; date: string }) =>
        watchUnauthorized(
          apiFetch(
            withTz(
              `/api/nutrition/log?foodEntryId=${encodeURIComponent(
                input.foodEntryId,
              )}&date=${encodeURIComponent(input.date)}`,
            ),
            OkSchema,
            { method: "DELETE", ...base },
          ),
        ),
    };
  }, []);
}
