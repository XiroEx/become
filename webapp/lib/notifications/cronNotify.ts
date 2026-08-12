/**
 * Convert a UTC time to the user's local hour given their stored offset.
 * `tzOffsetMinutes` matches Date.getTimezoneOffset(): positive when local is
 * BEHIND UTC (e.g. 300 for EST). Returns null when the offset is unknown.
 */
export function localHourForUser(now: Date, tzOffsetMinutes: number | undefined): number | null {
  if (!Number.isFinite(tzOffsetMinutes as number)) return null
  const offset = tzOffsetMinutes as number
  const utcMs = now.getTime()
  const localMs = utcMs - offset * 60 * 1000
  return new Date(localMs).getUTCHours()
}

/**
 * Calendar-date key for a SCHEDULED WORKOUT SLOT.
 *
 * A slot's `date` is a day MARKER stored at UTC midnight — it means "Aug 13",
 * not an instant. Reading it through a timezone offset (as localDateKeyForUser
 * does, correctly, for real timestamps) shifts it a day earlier for anyone
 * behind UTC: Aug 13 00:00Z minus 4h is Aug 12 20:00, which keys as Aug 12.
 *
 * That is exactly what made the morning push name TOMORROW's workout. On
 * 2026-08-12 a member in EDT saw "Today: Day 3 · Legs" on the dashboard and got
 * a push for "Day 4 · Chest, Back", because the dashboard reads the marker as a
 * plain date (`date.split('T')[0]`) and the cron did not.
 *
 * It also fired reminders on rest days, since tomorrow's slot satisfied the
 * "is there a slot today?" gate.
 *
 * Read the marker the way the dashboard does: take the UTC date part, full stop.
 */
export function slotDateKey(date: Date | string): string {
  return typeof date === 'string'
    ? date.slice(0, 10)
    : date.toISOString().slice(0, 10)
}

/** Local-date key (YYYY-MM-DD) for a user given their stored offset. */
export function localDateKeyForUser(now: Date, tzOffsetMinutes: number | undefined): string {
  const offset = Number.isFinite(tzOffsetMinutes as number) ? (tzOffsetMinutes as number) : 0
  const localMs = now.getTime() - offset * 60 * 1000
  return new Date(localMs).toISOString().slice(0, 10)
}

export function isActiveProgramForSchedule(
  activePrograms: Array<{ programId: string; status?: string }> | undefined,
  scheduleProgramId: string | undefined,
): boolean {
  if (!scheduleProgramId) return false
  const activeProgram = activePrograms?.find((ap) => ap.programId === scheduleProgramId)
  if (!activeProgram) return false
  return !activeProgram.status || activeProgram.status === 'active' || activeProgram.status === 'in-progress'
}

/**
 * Resolve a workout's title from the LIVE program definition for a given phase +
 * dayLabel. The Schedule slot caches `workoutTitle` at generation time, so it
 * goes stale when the coach edits/reorders the program — the dashboard reads the
 * live program, so the reminder must too. Returns null when it can't resolve.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function workoutTitleForDay(phases: any[], phaseNum: number, dayLabel: string): string | null {
  if (!Array.isArray(phases) || phases.length === 0 || !dayLabel) return null
  const idx = Math.max(0, (Number(phaseNum) || 1) - 1)
  const phase = phases[idx] ?? phases[0]
  const raw = phase?.workouts
  if (!raw) return null
  const arr: Array<{ day?: string; title?: string }> = Array.isArray(raw)
    ? raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : Object.entries(raw).map(([day, w]) => ({ day, ...(w as any) }))
  const match = arr.find((w) => w.day === dayLabel)
  const t = match?.title
  return typeof t === 'string' && t.trim() ? t.trim() : null
}

export const WORKOUT_REMINDER_START_HOUR = 7
export const WORKOUT_REMINDER_END_HOUR = 11
/** Starts an hour after the workout window so the two morning nudges do not
 *  land in the same minute; they are separate reminders, not competing ones. */
export const MIND_REMINDER_START_HOUR = 8
export const MIND_REMINDER_END_HOUR = 11
export const REENGAGEMENT_START_HOUR = 12
export const REENGAGEMENT_END_HOUR = 18
export const WORKOUT_SCHEDULE_SELECT = 'userId programId scheduledWorkouts'
