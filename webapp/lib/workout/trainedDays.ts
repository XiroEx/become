/**
 * "Did the member train on this day?" — the ONE union of the two places a
 * workout can live.
 *
 *   - `workoutLogs` — sessions done IN Become. `date` is an INSTANT, so its
 *     local day comes through the member's offset.
 *   - `externalWorkouts` — tracked sessions done elsewhere and imported from
 *     Apple Health / Health Connect (Jon, 2026-10-26: an outdoor walk recorded
 *     by Whoop ticks off "I did a workout today"). `date` is a 00:00Z DAY
 *     MARKER, so it is read at offset 0 — putting it through the offset would
 *     move every evening session west of UTC onto the day before.
 *
 * Every reader that asks "which days did they train" goes through here rather
 * than walking workoutLogs on its own, so the next one cannot forget the
 * second array. What an external session must NOT do — complete a scheduled
 * program slot — is enforced by the opposite: nothing that completes a slot
 * reads this file.
 */
import { dateKey } from '@/lib/dayWindow'

export interface TrainedLogLike {
  date: Date | string
  completed?: boolean
}

export interface ExternalWorkoutLike {
  date: Date | string
}

/** The local day keys of tracked external workouts, optionally from `sinceKey` on. */
export function externalWorkoutDayKeys(
  entries: readonly ExternalWorkoutLike[] | null | undefined,
  sinceKey?: string,
): Set<string> {
  const out = new Set<string>()
  for (const e of entries ?? []) {
    const d = new Date(e.date)
    if (Number.isNaN(d.getTime())) continue
    const key = dateKey(d, 0) // day marker
    if (sinceKey && key < sinceKey) continue
    out.add(key)
  }
  return out
}

/** Local day keys of COMPLETED Become workouts, from `since` (an instant) on. */
export function loggedWorkoutDayKeys(
  logs: readonly TrainedLogLike[] | null | undefined,
  tzOffset: number,
  since?: Date,
): Set<string> {
  const out = new Set<string>()
  for (const l of logs ?? []) {
    if (l.completed !== true || !l.date) continue
    const d = new Date(l.date)
    if (Number.isNaN(d.getTime())) continue
    if (since && d < since) continue
    out.add(dateKey(d, tzOffset))
  }
  return out
}

/**
 * Every local day the member trained: completed Become workouts UNION tracked
 * external ones. `since` bounds the logs (an instant) and `sinceKey` the
 * external days (a day key); pass the pair that describes the same window.
 */
export function trainedDayKeys(
  progress: {
    workoutLogs?: readonly TrainedLogLike[] | null
    externalWorkouts?: readonly ExternalWorkoutLike[] | null
  } | null | undefined,
  tzOffset: number,
  window: { since?: Date; sinceKey?: string } = {},
): Set<string> {
  const days = loggedWorkoutDayKeys(progress?.workoutLogs, tzOffset, window.since)
  for (const k of externalWorkoutDayKeys(progress?.externalWorkouts, window.sinceKey)) days.add(k)
  return days
}

/** Has the member got a tracked external workout on `dayKey`? */
export function hasExternalWorkoutOn(
  entries: readonly ExternalWorkoutLike[] | null | undefined,
  dayKey: string,
): boolean {
  return externalWorkoutDayKeys(entries).has(dayKey)
}
