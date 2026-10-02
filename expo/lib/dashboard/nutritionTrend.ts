/**
 * The one-line trend under the dashboard's Nutrition card (NP-061 / NP-149).
 *
 * Sourced from `@become/core` (vendored from webapp/lib/dashboard/nutritionTrend.ts).
 * Reads the last 7 days from /api/nutrition/summary and formats the trend:
 * days logged, days protein was hit, and average calories relative to goal.
 */

export {
  describeNutritionTrend,
  type SummaryDay,
  type NutritionTrend,
} from "@become/core";
