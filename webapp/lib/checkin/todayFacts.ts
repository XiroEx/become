/**
 * Whether today's check-in (mood + weight) is already covered, from raw
 * UserProgress history arrays. Shared by /api/checkin (the in-app modal) and
 * the cron's check-in push reminder so "logged today" means exactly the same
 * thing on both paths — the day-window bugs this app has hit before all came
 * from two call sites computing "today" slightly differently.
 */

import { isEntryOnDay } from '@/lib/dayWindow'

/**
 * The check-in feature's "day" starts at 4am local, not midnight — scoped to
 * check-in ONLY (mood/weight history elsewhere still key off real midnight).
 *
 * A member who opens the app at 1am is finishing YESTERDAY's check-in, not
 * starting today's; the day only rolls over once they're plausibly awake. This
 * came from a real report: a member who opened the app repeatedly all day
 * Wednesday never saw the check-in at all, because it had been marked "shown"
 * (partially filled, never completed) shortly before midnight Tuesday, and the
 * 8-hour partial-reask throttle carried that stamp across the midnight
 * boundary into Wednesday morning. See lib/checkin/status.ts for how
 * `shownToday` (computed from this boundary) overrides that throttle.
 */
export const CHECK_IN_DAY_START_HOUR = 4

/**
 * Shifts a browser tz offset (Date.getTimezoneOffset semantics) so that
 * feeding the result into localDateKey()/isEntryOnDay() rolls the calendar
 * day over at CHECK_IN_DAY_START_HOUR local time instead of local midnight.
 */
export function checkInTzOffset(tzOffsetMinutes: number): number {
  return tzOffsetMinutes + CHECK_IN_DAY_START_HOUR * 60
}

export interface CheckInSourceDoc {
  moodHistory?: Array<{ date: Date | string }>
  weightHistory?: Array<{ date: Date | string }>
  checkIn?: { lastSkippedDate?: Date | string | null } | null
}

export interface CheckInTodayFacts {
  moodLoggedToday: boolean
  weightLoggedToday: boolean
  skippedToday: boolean
}

export function checkInFactsForToday(
  doc: CheckInSourceDoc | null | undefined,
  todayKey: string,
  tzOffsetMinutes: number,
): CheckInTodayFacts {
  const moodLoggedToday = !!doc?.moodHistory?.some((e) => isEntryOnDay(e.date, todayKey, tzOffsetMinutes))
  const weightLoggedToday = !!doc?.weightHistory?.some((e) => isEntryOnDay(e.date, todayKey, tzOffsetMinutes))
  const skipped = doc?.checkIn?.lastSkippedDate
  const skippedToday = skipped ? isEntryOnDay(skipped, todayKey, tzOffsetMinutes) : false
  return { moodLoggedToday, weightLoggedToday, skippedToday }
}
