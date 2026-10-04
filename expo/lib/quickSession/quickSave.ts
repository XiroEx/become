/**
 * THE QUICK-SESSION SAVE BODY (NP-226).
 *
 * Native port of the `kind: 'quick'` branch of `saveWorkout` in
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
 * (l.1112-1135): `{ kind:'quick', sessionId, title, needsName, focus?,
 * favorite?, exercises, completed, activeSeconds, duration (on completion),
 * performedAt?, started: true, tz, tzZone }`, validated with
 * `WorkoutQuickSaveRequestSchema` from `@become/api-client`.
 *
 * The `.exercises` mapping is `buildWorkoutSaveRequest`'s
 * (`@/lib/live/workoutSave.ts`) — the same sets the program path sends
 * (setNumber from 1, reps/weight defaulting to 0, duration/distance/speed only
 * when positive), plus the prescription every exercise carries so a reopened
 * session rebuilds the EXERCISE rather than just its sets. The prescription
 * is built from the `LiveWorkoutExercise` fields (`sets`, `repsLabel`,
 * `trackingType`, `restSec`) the same way `buildWorkoutSaveRequest` does.
 *
 * Rules that travel from the web:
 *  - a repeat saves under its own `sessionId`, never its `sourceSessionId`
 *    (the caller passes the live sessionId; the source id never reaches here);
 *  - a planned session is not "in progress" until this screen's first save
 *    sends `started: true` — every save from this screen sends it;
 *  - `performedAt` is sent ONLY on the completing save;
 *  - `duration` (minutes) is sent ONLY on the completing save.
 */

import {
  WorkoutQuickSaveRequestSchema,
  type WorkoutQuickSaveRequest,
} from "@become/api-client";
import { normalizeTracking, tracksTime } from "@become/core";
import type {
  LiveGrid,
  LiveWorkoutExercise,
} from "@/components/live/LiveWorkoutClient";

export interface BuildQuickSaveInput {
  /** This run's own session id — never a repeat's `sourceSessionId`. */
  sessionId: string;
  title: string;
  /** True while the session still carries its generated placeholder name. */
  needsName: boolean;
  focus?: string;
  favorite?: boolean;
  exercises: LiveWorkoutExercise[];
  grid: LiveGrid;
  completed: boolean;
  /** Seconds the session was actually open, snapshotted at save time. */
  activeSeconds: number;
  /**
   * Which day the member picked for a workout that crossed midnight. Only
   * ever sent on the completing save.
   */
  performedAt?: string | null;
  /** Device timezone offset in minutes west of UTC. */
  tz?: number;
  /** IANA timezone identifier. */
  tzZone?: string;
  notes?: string;
}

/**
 * Build the POST /api/workouts quick body from the live grid. Throws when the
 * body fails `WorkoutQuickSaveRequestSchema` — a save that cannot validate is
 * a bug at the call site, not a payload to send.
 */
export function buildQuickSaveRequest(
  input: BuildQuickSaveInput,
): WorkoutQuickSaveRequest {
  const exercises = input.exercises.map((ex) => {
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
      if (timed && s.durationSec != null && s.durationSec > 0) {
        set.duration = s.durationSec;
      }
      if (t === "time_distance" && s.distance != null && s.distance > 0) {
        set.distance = s.distance;
      }
      if (s.speed != null && s.speed > 0) {
        set.speed = s.speed;
      }
      return set;
    });

    const origSlug = ex.originalExerciseSlug;
    const origName = ex.swappedFromName;

    return {
      name: ex.name,
      exerciseSlug: ex.slug,
      sets,
      ...(ex.groupId ? { groupId: ex.groupId } : {}),
      ...(ex.groupType ? { groupType: ex.groupType } : {}),
      ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
      ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
      prescription: {
        sets: Math.max(1, ex.sets ?? 1),
        ...(ex.repsLabel ? { reps: ex.repsLabel } : {}),
        ...(ex.trackingType ? { trackingType: ex.trackingType } : {}),
        ...(ex.restSec != null ? { rest: `${ex.restSec}s` } : {}),
      },
      ...(ex.addedAdHoc ? { addedAdHoc: true } : {}),
      ...(origSlug
        ? { originalExerciseSlug: origSlug, swappedFromName: origName || ex.name }
        : {}),
    };
  });

  const body: Record<string, unknown> = {
    kind: "quick",
    sessionId: input.sessionId,
    title: input.title,
    needsName: input.completed ? false : input.needsName,
    ...(input.focus ? { focus: input.focus } : {}),
    ...(input.favorite ? { favorite: true } : {}),
    exercises,
    completed: input.completed,
    activeSeconds: input.activeSeconds,
    ...(input.completed
      ? { duration: Math.max(1, Math.round(input.activeSeconds / 60)) || 1 }
      : {}),
    ...(input.performedAt && input.completed
      ? { performedAt: input.performedAt }
      : {}),
    // Reaching this save means the live view is genuinely open — this stamps
    // / refreshes startedAt server-side, which is what turns a same-day
    // "Plan it" placeholder into a real in-progress workout.
    started: true,
    tz: input.tz !== undefined ? input.tz : new Date().getTimezoneOffset(),
    ...(input.tzZone ? { tzZone: input.tzZone } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };

  return WorkoutQuickSaveRequestSchema.parse(body);
}
