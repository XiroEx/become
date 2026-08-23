export type ScheduledWorkoutStatus = 'scheduled' | 'completed' | 'missed' | 'skipped' | 'rest'

export type WeekStripDayStatus = ScheduledWorkoutStatus | 'quick' | 'rest'

/**
 * Reduce a day's program-scheduled workout(s) plus any quick (one-off)
 * sessions into the single status the weekly calendar strip shows.
 *
 * A completed workout always wins, whether it's the program's scheduled
 * slot or a quick session logged the same day — previously the strip only
 * looked at the (first) program workout's status, so a day where someone
 * did a quick workout instead of (or in addition to) their still-"scheduled"
 * program workout showed as not-done.
 */
export function computeWeekStripDayStatus(
  workouts: Array<{ status: ScheduledWorkoutStatus }> | undefined,
  quickSessions: Array<{ completed: boolean }> | undefined,
): WeekStripDayStatus {
  const hasCompletedWorkout =
    !!workouts?.some((w) => w.status === 'completed') ||
    !!quickSessions?.some((q) => q.completed)
  if (hasCompletedWorkout) return 'completed'
  if (workouts && workouts.length > 0) return workouts[0].status
  if (quickSessions && quickSessions.length > 0) return 'quick'
  return 'rest'
}
