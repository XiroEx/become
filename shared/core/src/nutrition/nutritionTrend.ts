/**
 * The one-line trend under the dashboard's Nutrition card.
 *
 * Today's numbers were accurate but said nothing about direction. This reads
 * the last 7 days from /api/nutrition/summary and says how logging is going:
 * days logged, days protein was hit, and the average against the calorie goal.
 */

export interface SummaryDay {
  date: string
  calories: number
  protein: number
  hasData: boolean
  mealCount?: number
}

export interface NutritionTrend {
  /** Days in the window with any food logged. */
  loggedDays: number
  totalDays: number
  /** Days protein reached the goal (only meaningful when a goal is set). */
  proteinHitDays: number | null
  /** Average calories over LOGGED days; null when nothing was logged. */
  avgCalories: number | null
  /** avgCalories relative to the goal: 'under' | 'near' | 'over' | null. */
  calorieRead: 'under' | 'near' | 'over' | null
  /** The sentence to show. */
  line: string
}

export function describeNutritionTrend(
  days: SummaryDay[],
  goals: { calories: number; protein: number },
): NutritionTrend {
  const window = days.slice(-7)
  const logged = window.filter(d => d.hasData && (d.calories > 0 || (d.mealCount ?? 0) > 0))
  const totalDays = window.length || 7
  const loggedDays = logged.length

  const proteinHitDays = goals.protein > 0
    ? logged.filter(d => d.protein >= goals.protein).length
    : null

  const avgCalories = loggedDays > 0
    ? Math.round(logged.reduce((s, d) => s + d.calories, 0) / loggedDays)
    : null

  let calorieRead: NutritionTrend['calorieRead'] = null
  if (avgCalories != null && goals.calories > 0) {
    const ratio = avgCalories / goals.calories
    calorieRead = ratio < 0.9 ? 'under' : ratio > 1.1 ? 'over' : 'near'
  }

  let line: string
  if (loggedDays === 0) {
    line = 'Nothing logged in the last 7 days'
  } else {
    const parts = [`Logged ${loggedDays} of ${totalDays} days`]
    if (proteinHitDays != null) parts.push(`protein hit ${proteinHitDays}`)
    if (avgCalories != null && calorieRead) {
      const word = calorieRead === 'near' ? 'on target' : calorieRead
      parts.push(`avg ${avgCalories.toLocaleString()} cal (${word})`)
    }
    line = parts.join(' · ')
  }

  return { loggedDays, totalDays, proteinHitDays, avgCalories, calorieRead, line }
}
