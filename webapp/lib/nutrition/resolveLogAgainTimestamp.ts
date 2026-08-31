import { combineDateWithNowTime } from '@/lib/mealPlanDates'

/**
 * Timestamp for re-logging a saved estimate from Estimate history. `dateKey`
 * (YYYY-MM-DD) backdates the log onto that day at the current wall-clock
 * time — the same convention FoodLogSheet uses for a picked date. `null`
 * means "right now, today", which was the ONLY option before the "Log to a
 * day" picker existed: every re-log landed on the current instant regardless
 * of when the estimate was actually eaten.
 */
export function resolveLogAgainTimestamp(dateKey: string | null, now: Date = new Date()): string {
  return dateKey ? combineDateWithNowTime(dateKey, now) : now.toISOString()
}
