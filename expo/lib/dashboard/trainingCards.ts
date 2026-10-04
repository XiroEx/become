import { slotDateKey, type ScheduleApiResponse } from "@become/api-client";
import { localDateKey } from "@/lib/time/localDay";

/**
 * One missed session on the dashboard, in the web's shape
 * (`webapp/components/NextWorkoutCard.tsx`): the slot's day marker, the
 * program it belongs to, and the labels the card prints.
 */
export interface MissedWorkoutSummary {
  /** Day marker `YYYY-MM-DD` (`slotDateKey`, never through a timezone). */
  date: string;
  programId: string;
  programName: string;
  dayLabel: string;
  workoutTitle: string;
  phase?: number;
  workoutIndex: number;
  phaseIndex: number;
}

/**
 * The next scheduled session on or after the device's local today, in the
 * web's shape: the earliest `scheduled` slot by slot marker across
 * in-progress programs, with the Today / Tomorrow / date label the web
 * prints (`getDateLabel` in `NextWorkoutCard.tsx`).
 */
export interface NextWorkoutSummary {
  /** Day marker `YYYY-MM-DD`. */
  date: string;
  programId: string;
  programName: string;
  dayLabel: string;
  workoutTitle: string;
  phase?: number;
  workoutIndex: number;
  phaseIndex: number;
  /** "Today" | "Tomorrow" | "Wed, Oct 8". */
  dateLabel: string;
}

export interface TrainingCards {
  next: NextWorkoutSummary | null;
  missed: MissedWorkoutSummary[];
}

/**
 * `YYYY-MM-DD` for the device's local calendar day — the same construction
 * as `localDateKey`, inlined here so this module stays a pure function of
 * its inputs (tests pin the day by passing `now`).
 */
export function localDayKey(now: Date = new Date()): string {
  return localDateKey(now);
}

/** "Day 1" → 0, "Day 12" → 11, anything without a trailing number → 0. */
export function dayLabelToIndex(dayLabel: string | undefined): number {
  if (!dayLabel) return 0;
  const m = dayLabel.match(/(\d+)\s*$/);
  if (!m) return 0;
  return Math.max(0, Number(m[1]) - 1);
}

/** The web's `getDateLabel`: Today / Tomorrow / "Wed, Oct 8". */
export function dateLabelForSlot(dateKey: string, now: Date = new Date()): string {
  const todayKey = localDayKey(now);
  const tom = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomorrowKey = localDayKey(tom);
  if (dateKey === todayKey) return "Today";
  if (dateKey === tomorrowKey) return "Tomorrow";
  const [y, m, d] = dateKey.split("-").map(Number);
  const parsed = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Port of `NextWorkoutCard.tsx`'s selection: over in-progress programs, the
 * earliest `scheduled` slot on or after today by slot marker is next;
 * `missed` slots are listed newest first. Slot dates are markers
 * (`slice(0, 10)`); today is the device's local date.
 */
export function selectTrainingCards(
  response: ScheduleApiResponse | null | undefined,
  now: Date = new Date(),
): TrainingCards {
  const todayKey = localDayKey(now);
  let next: NextWorkoutSummary | null = null;
  let nextKey = "";
  const missed: MissedWorkoutSummary[] = [];

  for (const schedule of response?.schedules ?? []) {
    if (
      schedule.programStatus !== "in-progress" &&
      schedule.programStatus !== "active"
    ) {
      continue;
    }
    const programId = schedule.programId ?? "";
    const programName = schedule.programName ?? "";
    for (const w of schedule.scheduledWorkouts ?? []) {
      const key =
        typeof w.date === "string" ? slotDateKey(w.date) : todayKey;
      const dayLabel = w.dayLabel ?? "";
      const workoutTitle = w.workoutTitle ?? "";
      const workoutIndex = dayLabelToIndex(w.dayLabel);
      const phaseIndex = Math.max(0, (w.phase ?? 1) - 1);
      if (w.status === "missed") {
        missed.push({
          date: key,
          programId: w.programId ?? programId,
          programName,
          dayLabel,
          workoutTitle,
          ...(w.phase !== undefined ? { phase: w.phase } : {}),
          workoutIndex,
          phaseIndex,
        });
      } else if (w.status === "scheduled" && key >= todayKey) {
        if (!next || key < nextKey) {
          next = {
            date: key,
            programId: w.programId ?? programId,
            programName,
            dayLabel,
            workoutTitle,
            ...(w.phase !== undefined ? { phase: w.phase } : {}),
            workoutIndex,
            phaseIndex,
            dateLabel: dateLabelForSlot(key, now),
          };
          nextKey = key;
        }
      }
    }
  }

  // Newest first, exactly as the web sorts them.
  missed.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return { next, missed };
}

/**
 * The web's Current Program percentage
 * (`DashboardClient.tsx`): completed over total sessions, falling back to
 * the week ratio only when the counts are missing.
 */
export function currentProgramPercent(input: {
  completedWorkouts?: number | null;
  totalWorkouts?: number | null;
  currentWeek: number;
  totalWeeks: number;
}): number {
  const { completedWorkouts, totalWorkouts, currentWeek, totalWeeks } = input;
  if (
    totalWorkouts != null &&
    totalWorkouts > 0 &&
    completedWorkouts != null
  ) {
    return Math.round((completedWorkouts / totalWorkouts) * 100);
  }
  if (totalWeeks > 0) {
    return Math.round((currentWeek / totalWeeks) * 100);
  }
  return 0;
}
