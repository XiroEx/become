/**
 * Hook and helpers for weight and measurement units across native screens.
 *
 * Reads `profile.weightUnit` (default `lbs` as onboarding writes it) so every
 * native weight display (training, dashboard, nutrition) renders in the member's
 * preferred unit.
 */

import { useCallback } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { formatWeight as formatWeightCore, type WeightUnit } from "@become/core";

/**
 * Format a weight value for display according to the unit:
 * whole numbers for lbs, 1 decimal place for kg.
 */
export function formatWeight(amount: number, unit: WeightUnit = "lbs"): string {
  return formatWeightCore(amount, unit);
}

export interface UseUnitsResult {
  /** The member's display unit ('lbs' | 'kg'). Defaults to 'lbs'. */
  unit: WeightUnit;
  /** Alias for `unit` matching UserProfile schema naming. */
  weightUnit: WeightUnit;
  isMetric: boolean;
  isImperial: boolean;
  /** Format a number in the member's preferred unit. */
  formatWeight: (amount: number) => string;
}

export function useUnits(): UseUnitsResult {
  const { user } = useAuth();
  const rawUnit = user?.profile?.weightUnit;
  const unit: WeightUnit = rawUnit === "kg" ? "kg" : "lbs";

  const format = useCallback(
    (amount: number) => formatWeightCore(amount, unit),
    [unit],
  );

  return {
    unit,
    weightUnit: unit,
    isMetric: unit === "kg",
    isImperial: unit === "lbs",
    formatWeight: format,
  };
}
