/**
 * Bar height for one day of the Timeline week view's "Calories per day" chart.
 *
 * A day's raw calorie total can round-trip to slightly MORE than the week's
 * max (max is itself rounded before this runs, e.g. summary.max = 2091 while
 * that same day's dailyTotals.calories is the unrounded 2091.4), which would
 * push a bar's height% just past 100 — clamp it. A logged day with a tiny
 * calorie count (a black-coffee-only morning) still needs a visible sliver,
 * so it gets a 4% floor; a genuinely empty day stays at 0.
 */
export function weeklyChartBarHeightPct(calories: number, maxCalories: number): number {
  const pct = maxCalories > 0 ? (calories / maxCalories) * 100 : 0
  const floored = Math.max(pct, calories > 0 ? 4 : 0)
  return Math.min(floored, 100)
}
