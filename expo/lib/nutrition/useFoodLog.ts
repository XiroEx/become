import { useEffect, useMemo, useRef } from "react";
import { z } from "zod";
import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

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
    nutrition: FoodMacros;
    servings?: number;
    [k: string]: unknown;
  };
}

export interface SaveFoodInput {
  name: string;
  category: string;
  nutrition: FoodMacros;
  source?: string;
  [k: string]: unknown;
}

export interface UseFoodLogOptions {
  getToken: () => string | undefined;
}

/**
 * Food-log write operations:
 *  - addToLog: POST /api/nutrition/log { mealType, food, date }
 *  - removeFromLog: DELETE /api/nutrition/log?foodEntryId=…&date=… (query params)
 *  - saveFood: POST /api/nutrition/foods (auto-grow our DB on first USDA/OFF use)
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
    return {
      addToLog: (input: AddToLogInput) =>
        apiFetch("/api/nutrition/log", OkSchema, {
          method: "POST",
          body: input,
          ...base,
        }),
      removeFromLog: (input: { foodEntryId: string; date: string }) =>
        apiFetch(
          `/api/nutrition/log?foodEntryId=${encodeURIComponent(
            input.foodEntryId,
          )}&date=${encodeURIComponent(input.date)}`,
          OkSchema,
          { method: "DELETE", ...base },
        ),
      saveFood: (input: SaveFoodInput) =>
        apiFetch("/api/nutrition/foods", OkSchema, {
          method: "POST",
          body: input,
          ...base,
        }),
    };
  }, []);
}
