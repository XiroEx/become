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

// ─── Workouts done outside Become (card 6adf69c7) ───────────────────────────

/**
 * A tracked workout another app recorded (an outdoor walk Whoop tracked),
 * imported from Apple Health / Health Connect and read back through
 * `GET /api/workouts/external`. An EXTRA activity on its day: it ticks off
 * "I trained today" and never completes the program slot beside it (Jon,
 * 2026-10-26), so the calendar draws it in its own colour, never the
 * program's completed green.
 */
export interface ExternalCalItem {
  externalId: string;
  /** The session's own local day, `YYYY-MM-DD` — a plain date, no zone. */
  date: string;
  startedAt: string;
  activityName: string;
  durationMin: number;
  distanceKm?: number;
  energyKcal?: number;
  originApp?: string;
}

/** The parsed GET answer → calendar items, oldest first. */
export function toExternalCalItems(
  response:
    | {
        workouts?: {
          externalId: string;
          date: string;
          startedAt: string;
          activityName: string;
          durationMin: number;
          distanceKm?: number;
          energyKcal?: number;
          originApp?: string;
        }[];
      }
    | null
    | undefined,
): ExternalCalItem[] {
  return [...(response?.workouts ?? [])]
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
    .map((w) => ({
      externalId: w.externalId,
      date: w.date.slice(0, 10),
      startedAt: w.startedAt,
      activityName: w.activityName || "Workout",
      durationMin: w.durationMin,
      ...(w.distanceKm != null ? { distanceKm: w.distanceKm } : {}),
      ...(w.energyKcal != null ? { energyKcal: w.energyKcal } : {}),
      ...(w.originApp ? { originApp: w.originApp } : {}),
    }));
}

/** The external workouts on one local day — matched on the stored day key. */
export function externalWorkoutsForDate(
  items: ExternalCalItem[],
  date: string,
): ExternalCalItem[] {
  return items.filter((x) => x.date === date);
}

const KM_PER_MILE = 1.609344;

/**
 * "Tracked by Whoop · 45 min · 2.1 mi · 180 kcal" — the web's
 * `externalWorkoutDetail` (`webapp/lib/workout/externalWorkoutCopy.ts`),
 * word for word, so the two calendars describe a walk the same way. Distance
 * follows the member's unit system: kg members read km, lbs members miles.
 */
export function externalWorkoutDetail(
  w: Pick<ExternalCalItem, "durationMin" | "distanceKm" | "energyKcal" | "originApp">,
  unit: "lbs" | "kg",
): string {
  const parts: string[] = [
    w.originApp ? `Tracked by ${w.originApp}` : "Tracked workout",
  ];
  if (w.durationMin > 0) parts.push(`${Math.round(w.durationMin)} min`);
  if (w.distanceKm != null && w.distanceKm > 0) {
    parts.push(
      unit === "kg"
        ? `${(Math.round(w.distanceKm * 10) / 10).toFixed(1)} km`
        : `${(Math.round((w.distanceKm / KM_PER_MILE) * 10) / 10).toFixed(1)} mi`,
    );
  }
  if (w.energyKcal != null && w.energyKcal > 0) {
    parts.push(`${Math.round(w.energyKcal)} kcal`);
  }
  return parts.join(" · ");
}

/** The legend and badge word — the web's `EXTERNAL_WORKOUT_LABEL`. */
export const EXTERNAL_WORKOUT_LABEL = "Extra activity";
