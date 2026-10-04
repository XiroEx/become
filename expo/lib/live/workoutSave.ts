// `WorkoutSaveRequest` is `program | quick` (NP-018), and this screen only ever
// builds a program day: naming the half is what keeps `req.activeSeconds = …`
// below type-checked rather than narrowed away.
import type { WorkoutProgramSaveRequest } from "@become/api-client";
import { normalizeTracking, tracksTime, prescriptionOf } from "@become/core";
import type {
  LiveGrid,
  LiveWorkoutExercise,
} from "@/components/live/LiveWorkoutClient";

export interface BuildWorkoutSaveInput {
  programId: string;
  /** 1-based phase number, matching the webapp save contract. */
  phase: number;
  /** Workout day label, e.g. "Day 1". */
  day: string;
  exercises: LiveWorkoutExercise[];
  grid: LiveGrid;
  completed: boolean;
  activeSeconds?: number;
  notes?: string;
  /**
   * This attempt's client-generated id (see newWorkoutAttemptId). Sent on
   * every save of the attempt so the server can tell a REPLAY — a retry, or a
   * write flushed by the offline queue after local midnight — from a second
   * workout. Omitted, the save falls back to the server's date windows, which
   * is exactly how it behaved before.
   */
  attemptId?: string;
  /**
   * ISO date (or YYYY-MM-DD) of the exact Schedule slot this log fulfils (from `?sd=`),
   * so a completion resolves THAT slot and never a neighbouring same-dayLabel one.
   */
  scheduledDate?: string | null;
  /**
   * Which day the member picked for a workout that crossed midnight (set
   * by resolveDayChoice). Only ever sent on the completing save.
   */
  performedAt?: string | null;
  /** Device timezone offset in minutes west of UTC (`new Date().getTimezoneOffset()`). */
  tz?: number;
  /** IANA timezone identifier (e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone`). */
  tzZone?: string;
  /**
   * Map of exercise index to original exercise details for swapped exercises.
   */
  swappedExercises?: Record<number, { originalSlug: string; originalName: string }>;
}

/**
 * Mint an id for one attempt at a program workout. Held for the life of the
 * attempt (not regenerated per save) — that is what makes the id useful: every
 * save and every retry of the same workout carries the same one.
 */
export function newWorkoutAttemptId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  try {
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // fall through to the non-crypto id below
  }
  return `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build the POST /api/workouts payload from the live grid. Mirrors the webapp
 * live client: exercises keyed by name (+ slug), sets numbered from 1, with
 * reps/weight defaulting to 0 (server treats those as bodyweight/time-only).
 */
export function buildWorkoutSaveRequest(
  input: BuildWorkoutSaveInput,
): WorkoutProgramSaveRequest {
  const exercises = input.exercises.map((ex, index) => {
    const swap = input.swappedExercises?.[index];
    const t = normalizeTracking(ex.trackingType);
    const timed = tracksTime(t);
    const sets = (input.grid[ex.slug] ?? []).map((s, i) => {
      const set: {
        setNumber: number;
        reps: number;
        weight: number;
        completed: boolean;
        duration?: number;
        distance?: number;
        speed?: number;
      } = {
        setNumber: i + 1,
        reps: timed ? 0 : (s.reps ?? 0),
        weight: timed ? 0 : (s.weight ?? 0),
        completed: s.completed,
      };
      // Time/distance tracking types log these instead of (or alongside)
      // reps/weight — only attach when present so strength sets stay clean.
      if (timed && s.durationSec != null && s.durationSec > 0) {
        set.duration = s.durationSec;
      }
      if (t === "time_distance" && s.distance != null && s.distance > 0) {
        set.distance = s.distance;
      }
      // Speed rides along only when positive, like duration and distance —
      // the web's save body does the same (`parseFloat(set.speed) > 0`).
      if (s.speed != null && s.speed > 0) {
        set.speed = s.speed;
      }
      return set;
    });

    const origSlug = swap?.originalSlug || ex.originalExerciseSlug;
    const origName = swap?.originalName || ex.swappedFromName;

    return {
      name: ex.name,
      exerciseSlug: ex.slug,
      sets,
      ...(ex.groupId ? { groupId: ex.groupId } : {}),
      ...(ex.groupType ? { groupType: ex.groupType } : {}),
      ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
      ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
      prescription: prescriptionOf({
        name: ex.name,
        sets: ex.sets,
        reps: ex.repsLabel,
        trackingType: ex.trackingType ?? undefined,
        rest: ex.restSec != null ? `${ex.restSec}s` : undefined,
      }),
      ...(ex.addedAdHoc ? { addedAdHoc: true } : {}),
      ...(origSlug
        ? { originalExerciseSlug: origSlug, swappedFromName: origName || ex.name }
        : {}),
    };
  });

  const req: WorkoutProgramSaveRequest = {
    programId: input.programId,
    phase: input.phase,
    day: input.day,
    exercises,
    completed: input.completed,
  };
  if (input.activeSeconds !== undefined) req.activeSeconds = input.activeSeconds;
  if (input.completed) {
    req.duration = Math.max(
      1,
      Math.round((input.activeSeconds ?? 0) / 60) || 1,
    );
  }
  if (input.notes !== undefined) req.notes = input.notes;
  if (input.attemptId) req.attemptId = input.attemptId;
  if (input.scheduledDate) req.scheduledDate = input.scheduledDate;
  if (input.performedAt && input.completed) req.performedAt = input.performedAt;
  req.tz = input.tz !== undefined ? input.tz : new Date().getTimezoneOffset();
  if (input.tzZone) req.tzZone = input.tzZone;

  return req;
}
