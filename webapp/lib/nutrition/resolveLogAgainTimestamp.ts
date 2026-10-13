import { buildLoggedAt } from '@/lib/mealPlanDates'

export type LogAgainTimeMode = 'now' | 'custom' | 'none'

export interface LogAgainFields {
  loggedAt: string
  untimed: boolean
}

/**
 * loggedAt/untimed for a saved estimate being (re)logged from Estimate
 * history's "Log to a day" sheet. `dateKey` (YYYY-MM-DD) backdates onto that
 * day; null means today. `timeMode` follows the same three-way model
 * MealApplySheet/FoodSearchModal use for logging a saved thing onto a chosen
 * day: 'custom' stamps the picked `customTime` and marks the entry timed
 * (sorts by the clock); 'now' and 'none' both go out untimed — the day view
 * places them by the tag's anchor time instead of the clock reading — 'now'
 * just previews as "right now" in the sheet while 'none' reads as "no time".
 */
export function resolveLogAgainTimestamp(
  dateKey: string | null,
  timeMode: LogAgainTimeMode,
  customTime: string | null,
  anchorHHMM: string,
  now: Date = new Date(),
): LogAgainFields {
  return {
    loggedAt: buildLoggedAt(dateKey, timeMode === 'custom' ? customTime : anchorHHMM, undefined, now),
    untimed: timeMode !== 'custom',
  }
}
