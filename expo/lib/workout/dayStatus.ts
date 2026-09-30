export type ScheduledWorkoutStatus =
  | 'scheduled'
  | 'completed'
  | 'missed'
  | 'skipped'
  | 'rest';

export type WeekStripDayStatus = ScheduledWorkoutStatus | 'quick' | 'rest';

/**
 * Reduce a day's program-scheduled workout(s) plus any quick (one-off)
 * sessions into the single status the weekly calendar strip shows.
 *
 * Sourced identically from webapp/lib/workout/dayStatus.ts:
 * A completed workout always wins, whether it's the program's scheduled
 * slot or a quick session logged the same day.
 */
export function computeWeekStripDayStatus(
  workouts: { status: ScheduledWorkoutStatus }[] | undefined,
  quickSessions: { completed: boolean }[] | undefined,
): WeekStripDayStatus {
  const hasCompletedWorkout =
    !!workouts?.some((w) => w.status === 'completed') ||
    !!quickSessions?.some((q) => q.completed);
  if (hasCompletedWorkout) return 'completed';
  if (workouts && workouts.length > 0) return workouts[0]!.status;
  if (quickSessions && quickSessions.length > 0) return 'quick';
  return 'rest';
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Format a local Date as YYYY-MM-DD using local time components */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/** Sunday of the current week, shifted by `offset` weeks, at local midnight. */
export function weekStartFor(offset: number, baseDate: Date = new Date()): Date {
  const today = new Date(baseDate);
  today.setHours(0, 0, 0, 0);
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay() + offset * 7);
  return sunday;
}

export function getWeekDays(offset: number, baseDate: Date = new Date()): Date[] {
  const sunday = weekStartFor(offset, baseDate);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    days.push(d);
  }
  return days;
}

export function weekLabel(offset: number, days: Date[]): string {
  if (offset === 0) return 'This Week';
  if (offset === -1) return 'Last Week';
  if (offset === 1) return 'Next Week';
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(days[0]!)} – ${fmt(days[6]!)}`;
}
