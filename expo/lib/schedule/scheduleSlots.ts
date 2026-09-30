import { slotDateKey, type ScheduleApiResponse } from "@become/api-client";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";

/** "Day 1" → 0, "Day 12" → 11, anything without a trailing number → 0. */
export function workoutIndexFromDayLabel(dayLabel: string | undefined): number {
  if (!dayLabel) return 0;
  const m = dayLabel.match(/(\d+)\s*$/);
  if (!m) return 0;
  return Math.max(0, Number(m[1]) - 1);
}

/**
 * Flatten the nested GET /api/schedule response into the presentational
 * ScheduledSlot list: one slot per scheduledWorkout, with the date reduced to
 * its YYYY-MM-DD day key, `phase` (1-based on the wire) → 0-based phaseIndex,
 * and `dayLabel` → workoutIndex.
 *
 * The date goes through `slotDateKey`, never through a timezone offset: a slot
 * date is a DAY MARKER stored at 00:00Z, so reading it as a local instant moves
 * it a day backwards for every member west of UTC. Same rule, same name, as the
 * web's `slotDateKey` (webapp/lib/notifications/cronNotify.ts).
 *
 * `status` arrives already narrowed to the five the server can send: the shared
 * schema absorbs an unrecognised value as `scheduled` rather than dropping the
 * whole response, which is what the hand-rolled narrowing here used to do.
 */
export function toScheduledSlots(
  response: ScheduleApiResponse | null | undefined,
): ScheduledSlot[] {
  if (!response?.schedules) return [];
  const slots: ScheduledSlot[] = [];
  for (const schedule of response.schedules) {
    for (const w of schedule.scheduledWorkouts ?? []) {
      slots.push({
        date: slotDateKey(w.date),
        programId: w.programId ?? schedule.programId,
        phaseIndex: Math.max(0, (w.phase ?? 1) - 1),
        workoutIndex: workoutIndexFromDayLabel(w.dayLabel),
        status: w.status,
      });
    }
  }
  return slots;
}
