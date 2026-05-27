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
