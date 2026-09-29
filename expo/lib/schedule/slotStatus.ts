export type SlotStatus =
  | "scheduled"
  | "completed"
  | "missed"
  | "skipped"
  | "rest";

export interface ScheduledSlot {
  date: string;
  programId: string;
  phaseIndex: number;
  workoutIndex: number;
  status: SlotStatus;
}

/**
 * Stable identity for a slot: one program's one workout on one date.
 *
 * Used as a React `key`, including by the caller of `RescheduleModal`, where a
 * change of key is what resets the form — that component deliberately has no
 * re-seeding effect (see `components/schedule/RescheduleModal.tsx`). Keep the
 * four fields: two programs can schedule the same date, and a program can
 * schedule two workouts on one date.
 */
export function slotKey(slot: ScheduledSlot): string {
  return `${slot.date}-${slot.programId}-${slot.phaseIndex}-${slot.workoutIndex}`;
}

/**
 * Look up the slot for a given date. Returns null if none scheduled.
 * If there are multiple slots on a single date (e.g. two-a-days), the first
 * one wins (the webapp ordering is consistent so this matches behavior).
 */
export function slotForDate(
  slots: ScheduledSlot[],
  date: string,
): ScheduledSlot | null {
  return slots.find((s) => s.date === date) ?? null;
}

export function statusForDate(
  slots: ScheduledSlot[],
  date: string,
): SlotStatus | "none" {
  return slotForDate(slots, date)?.status ?? "none";
}

/**
 * Returns slots in ascending date order. Sort is stable; preserves
 * input ordering inside same-date groups.
 */
export function sortSlotsByDate(slots: ScheduledSlot[]): ScheduledSlot[] {
  return [...slots].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function upcomingSlots(
  slots: ScheduledSlot[],
  today: string,
): ScheduledSlot[] {
  return sortSlotsByDate(slots).filter((s) => s.date >= today);
}
