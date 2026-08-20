/**
 * Whether today's check-in (mood + weight) is already covered, from raw
 * UserProgress history arrays. Shared by /api/checkin (the in-app modal) and
 * the cron's check-in push reminder so "logged today" means exactly the same
 * thing on both paths — the day-window bugs this app has hit before all came
 * from two call sites computing "today" slightly differently.
 */

import { isEntryOnDay } from '@/lib/dayWindow'

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
