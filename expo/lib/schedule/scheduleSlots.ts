import type { ScheduleApiResponse } from "@become/api-client";
import type { ScheduledSlot, SlotStatus } from "@/lib/schedule/slotStatus";

const SLOT_STATUSES: ReadonlyArray<SlotStatus> = [
  "scheduled",
  "completed",
  "missed",
  "skipped",
  "rest",
];

function narrowStatus(value: string): SlotStatus {
  return (SLOT_STATUSES as readonly string[]).includes(value)
    ? (value as SlotStatus)
    : "scheduled";
}

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
 * a YYYY-MM-DD key, phase → 0-based phaseIndex, and dayLabel → workoutIndex.
 */
export function toScheduledSlots(
  response: ScheduleApiResponse | null | undefined,
): ScheduledSlot[] {
  if (!response?.schedules) return [];
  const slots: ScheduledSlot[] = [];
  for (const schedule of response.schedules) {
    for (const w of schedule.scheduledWorkouts ?? []) {
      slots.push({
        date: w.date.slice(0, 10),
        programId: w.programId ?? schedule.programId,
        phaseIndex: Math.max(0, (w.phase ?? 1) - 1),
        workoutIndex: workoutIndexFromDayLabel(w.dayLabel),
        status: narrowStatus(w.status),
      });
    }
  }
  return slots;
}
