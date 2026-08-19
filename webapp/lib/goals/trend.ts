/**
 * Rolling-average weight — what adaptive nutrition targets recalculate from.
 *
 * lib/nutrition/tdee.ts turns a single bodyweight number into calories. Which
 * number to feed it matters: a single weigh-in is mostly water and sodium, not
 * signal, so reacting to it swings the calorie target around on noise. A
 * trailing average is the same idea /api/goals already uses for pace and
 * "achieved" (lib/goals/pace.ts, lib/goals/ensure.ts) — smooth first, then act.
 */

import type { WeightPoint } from '@/lib/goals/ensure'

const DEFAULT_WINDOW_DAYS = 14
/** ~2.2 lb. Small enough to catch a real move, large enough not to chase noise
 *  or recompute on every single log. */
const DEFAULT_DRIFT_KG = 1

/**
 * Mean weight over the trailing window. Falls back to the single latest entry
 * when the window is empty (a lapsed logger with only older points) so a
 * member who hasn't weighed in for a month still gets an honest number instead
 * of nothing. Null only when there is no weight history at all.
 */
export function trendWeightKg(series: WeightPoint[], now: Date, windowDays = DEFAULT_WINDOW_DAYS): number | null {
  if (!series.length) return null
  const cutoff = new Date(now.getTime() - windowDays * 86_400_000)
  const inWindow = series.filter(p => p.date >= cutoff && p.date <= now)
  const pts = inWindow.length ? inWindow : series.slice(-1)
  return pts.reduce((sum, p) => sum + p.kg, 0) / pts.length
}

/**
 * Has the trend moved far enough from the weight targets were last computed
 * from to be worth recalculating?
 *
 * A null trend (no logged history yet) never triggers a recalc — the onboarding
 * point-in-time weight is the best information available until logging starts,
 * and there's nothing to average.
 */
export function needsWeightRecalc(
  calcWeightKg: number | null | undefined,
  trendKg: number | null,
  thresholdKg = DEFAULT_DRIFT_KG,
): boolean {
  if (trendKg == null) return false
  if (calcWeightKg == null) return true
  return Math.abs(trendKg - calcWeightKg) > thresholdKg
}
