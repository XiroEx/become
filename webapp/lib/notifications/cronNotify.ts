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

export const WORKOUT_REMINDER_START_HOUR = 7
export const WORKOUT_REMINDER_END_HOUR = 11
export const REENGAGEMENT_START_HOUR = 12
export const REENGAGEMENT_END_HOUR = 18
export const WORKOUT_SCHEDULE_SELECT = 'userId programId scheduledWorkouts'
