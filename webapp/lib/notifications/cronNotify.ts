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
/** The daily Mind session nudge shares the morning with the workout reminder;
 *  the route sends at most ONE morning push per user, workout first. */
export const MIND_REMINDER_START_HOUR = 7
export const MIND_REMINDER_END_HOUR = 11
export const REENGAGEMENT_START_HOUR = 12
export const REENGAGEMENT_END_HOUR = 18
export const WORKOUT_SCHEDULE_SELECT = 'userId programId scheduledWorkouts'
