import type { ScheduledWorkoutStatus } from "@become/api-client";
import { localDateKey } from "@/lib/time/localDay";

/**
 * The five statuses a schedule slot can carry, taken from the schema every
 * response is parsed with instead of being hand-copied beside it — a second
 * copy of a wire enum is what drifts in silence (NP-021).
 */
export type SlotStatus = ScheduledWorkoutStatus;

export interface ScheduledSlot {
  date: string;
  programId: string;
  phaseIndex: number;
  workoutIndex: number;
  status: SlotStatus;
  phase?: number;
  dayLabel?: string;
  workoutTitle?: string;
  programName?: string;
  programStatus?: string;
  completedAt?: string;
}

export interface QuickCalItem {
  sessionId?: string;
  title: string;
  date: string;
  completed: boolean;
  skipped?: boolean;
  exerciseCount: number;
  duration?: number;
  status: "completed" | "planned" | "incomplete" | "skipped";
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
 * Returns all slots scheduled on a given date (supporting multiple items per day).
 */
export function slotsForDate(
  slots: ScheduledSlot[],
  date: string,
): ScheduledSlot[] {
  return slots.filter((s) => s.date === date);
}

/**
 * Returns all quick sessions whose instant falls on the local calendar date.
 */
export function quickSessionsForDate(
  items: QuickCalItem[],
  date: string,
): QuickCalItem[] {
  return items.filter((q) => {
    const qDay = localDateKey(new Date(q.date));
    return qDay === date;
  });
}

/**
 * Rule: "made up" compares completedAt's local day with the slot marker.
 * Slot dates are markers (slice(0, 10)).
 * If completed on a subsequent local calendar day, it is a makeup.
 */
export function isMakeupWorkout(
  slotDate: string,
  completedAt?: string | null,
): boolean {
  if (!completedAt) return false;
  const slotDay = slotDate.slice(0, 10);
  const completedDay = localDateKey(new Date(completedAt));
  return completedDay > slotDay;
}

/**
 * Derive status for a quick session log:
 * Log dates are instants shown on the device's local day.
 */
export function quickSessionStatus(
  log: { date: string; completed?: boolean; skipped?: boolean },
  todayDate: string,
): "completed" | "planned" | "incomplete" | "skipped" {
  if (log.completed) return "completed";
  if (log.skipped) return "skipped";
  const logDay = localDateKey(new Date(log.date));
  return logDay >= todayDate ? "planned" : "incomplete";
}

/**
 * Maps raw workout logs into QuickCalItem list for calendar display.
 */
export function toQuickCalItems(
  logs:
    | Array<{
        kind?: string;
        sessionId?: string;
        title?: string;
        date: string;
        completed?: boolean;
        skipped?: boolean;
        exerciseCount?: number;
        duration?: number | null;
      }>
    | null
    | undefined,
  todayDate: string,
): QuickCalItem[] {
  if (!logs) return [];
  return logs
    .filter((l) => l.kind === "quick")
    .map((l) => ({
      sessionId: l.sessionId,
      title: l.title || "Quick Session",
      date: l.date,
      completed: !!l.completed,
      skipped: !!l.skipped,
      exerciseCount: l.exerciseCount ?? 0,
      duration: l.duration ?? undefined,
      status: quickSessionStatus(l, todayDate),
    }));
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
