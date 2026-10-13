/**
 * Nutrition adherence over a 7-day window: how many days were logged, how many
 * hit the protein floor — against the member's own targets. Pure.
 */

export interface AdherenceDay {
  date: string
  calories: number
  protein: number
  hasData: boolean
  mealCount?: number
}

export interface AdherenceTargets {
  logDaysPerWeek: number
  proteinDaysPerWeek: number
}

export interface AdherenceRead {
  logDays: number
  proteinDays: number
  totalDays: number
  logTarget: number
  proteinTarget: number
  /** Logging days on target. */
  logOk: boolean
  /** Protein days on target (only judged when protein goal is known). */
  proteinOk: boolean | null
  /** Protein was tracked (goal known and at least one logged day). */
  proteinJudged: boolean
}

export function readAdherence(
  days: AdherenceDay[],
  proteinGoal: number | null,
  targets: AdherenceTargets,
): AdherenceRead {
  const window = days.slice(-7)
  const logged = window.filter(d => d.hasData && (d.calories > 0 || (d.mealCount ?? 0) > 0))
  const logDays = logged.length
  const totalDays = window.length || 7
  const proteinJudged = !!proteinGoal && proteinGoal > 0 && logDays > 0
  const proteinDays = proteinJudged ? logged.filter(d => d.protein >= (proteinGoal as number)).length : 0
  const logTarget = Math.max(0, Math.min(7, targets.logDaysPerWeek))
  const proteinTarget = Math.max(0, Math.min(7, targets.proteinDaysPerWeek))
  return {
    logDays,
    proteinDays,
    totalDays,
    logTarget,
    proteinTarget,
    logOk: logDays >= logTarget,
    proteinOk: proteinJudged ? proteinDays >= proteinTarget : null,
    proteinJudged,
  }
}
