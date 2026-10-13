/**
 * CORRECT A LOGGED WORKOUT (NP-166).
 *
 * Native port of `webapp/components/workout/TrainingLogCorrectionModal.tsx`
 * (the progress page's per-workout "Correct this workout") and its wire,
 * `PATCH /api/workouts/logs`:
 *
 *   • the locator is ownership-scoped by the authenticated UserProgress
 *     document — a quick log is located by its stable `sessionId` (with the
 *     ISO `date` as the fallback for a log written before ids existed), a
 *     program log by its immutable program/day/date tuple;
 *   • the correction rewrites measurements only (exercise identity and count
 *     stay fixed — the server refuses anything else), and the server replays
 *     every completed log into `exercisePRs` before saving, so a lowered set
 *     removes a stale record instead of leaving it behind;
 *   • validation lives on the server (`webapp/lib/workoutLogCorrections.ts`:
 *     negative or non-finite numbers are refused, reps must be whole). The
 *     client sends what the member typed and renders the server's `error`
 *     verbatim — a correction that would make a set invalid never fails
 *     silently and never with invented wording.
 *
 * The sheet (`components/workout/TrainingLogCorrectionSheet.tsx`) edits a
 * `CorrectableWorkout`; the three adapters below build one from each surface
 * that can open it:
 *
 *   • progress workout rows already carry full set data (`detailedWorkouts`);
 *   • a sessions-hub or history quick row fetches its logged sets from
 *     `GET /api/workouts/session?id=` (the session read normalises every
 *     measurement to `number | null`, exactly the shape the editor needs);
 *   • a history program row fetches its stored log from
 *     `GET /api/workouts/log?programId=&date=` (the raw log, sets included).
 */

import {
  apiFetch,
  ApiError,
  WorkoutLogCorrectionRequestSchema,
  WorkoutLogCorrectionResponseSchema,
  type ProgressDetailedWorkout,
  type QuickSession,
  type StoredWorkoutLog,
  type WorkoutLogCorrectionRequest,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

export type CorrectionField = "reps" | "weight" | "duration" | "distance" | "speed";

export const CORRECTION_FIELDS: CorrectionField[] = [
  "reps",
  "weight",
  "duration",
  "distance",
  "speed",
];

const FIELD_UNITS: Partial<Record<CorrectionField, string>> = {
  weight: "lb",
  duration: "sec",
  distance: "m",
  speed: "mph",
};

export interface CorrectableSet {
  reps: number | null;
  weight: number | null;
  duration: number | null;
  distance: number | null;
  speed: number | null;
  completed: boolean;
}

export interface CorrectableExercise {
  name: string;
  slug?: string;
  sets: CorrectableSet[];
}

export interface CorrectableWorkout {
  kind: "program" | "quick";
  /** Short display label ("Fri, Sep 26"). */
  date: string;
  /** The same instant as an ISO string — the correction locator's `date`. */
  rawDate: string;
  sessionId?: string;
  programId?: string;
  /** The day label ("Day 1"). Program logs only; quick logs fall back to the title. */
  day: string;
  title?: string;
  /** MINUTES. */
  duration?: number | null;
  /** Only sent when known: the quick-session read carries no notes, and sending
   *  a blank would wipe notes the member wrote on the web. */
  notes?: string;
  notesKnown: boolean;
  exercises: CorrectableExercise[];
}

// ─── Adapters ───────────────────────────────────────────────────────────────

function toCorrectableSet(raw: {
  reps?: number | null;
  weight?: number | null;
  duration?: number | null;
  distance?: number | null;
  speed?: number | null;
  completed?: boolean;
}): CorrectableSet {
  return {
    reps: raw.reps ?? null,
    weight: raw.weight ?? null,
    duration: raw.duration ?? null,
    distance: raw.distance ?? null,
    speed: raw.speed ?? null,
    completed: raw.completed !== false,
  };
}

/** Progress workout rows already carry every set — no fetch needed. */
export function correctableFromProgressWorkout(
  w: ProgressDetailedWorkout,
): CorrectableWorkout {
  const kind = w.kind === "program" ? "program" : "quick";
  return {
    kind,
    date: w.date,
    rawDate: w.rawDate,
    ...(w.sessionId ? { sessionId: w.sessionId } : {}),
    ...(w.programId ? { programId: w.programId } : {}),
    day: w.day,
    ...(w.title ? { title: w.title } : {}),
    duration: w.duration ?? null,
    notes: w.notes ?? "",
    notesKnown: true,
    exercises: (w.exercises ?? []).map(
      (ex: ProgressDetailedWorkout["exercises"][number]) => ({
        name: ex.name,
        ...(ex.slug ? { slug: ex.slug } : {}),
        sets: (ex.sets ?? []).map(toCorrectableSet),
      }),
    ),
  };
}

/**
 * A quick log read back from `GET /api/workouts/session?id=`. The read carries
 * no notes, so `notesKnown` is false and the correction leaves them untouched.
 */
export function correctableFromQuickSession(s: QuickSession): CorrectableWorkout {
  const instant = new Date(s.date);
  const label = Number.isNaN(instant.getTime())
    ? s.date
    : instant.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  return {
    kind: "quick",
    date: label,
    rawDate: s.date,
    ...(s.sessionId ? { sessionId: s.sessionId } : {}),
    day: s.title || "Quick Session",
    title: s.title || "Quick Session",
    duration: s.duration ?? null,
    notesKnown: false,
    exercises: (s.exercises ?? []).map((ex: QuickSession["exercises"][number]) => ({
      name: ex.name,
      ...(ex.exerciseSlug ? { slug: ex.exerciseSlug } : {}),
      sets: (ex.sets ?? []).map(toCorrectableSet),
    })),
  };
}

/**
 * A program log read back from `GET /api/workouts/log?programId=&date=`. The
 * raw log is the whole document, notes included when the member wrote any.
 */
export function correctableFromStoredLog(log: StoredWorkoutLog): CorrectableWorkout {
  const kind = log.kind === "quick" ? "quick" : "program";
  const instant = new Date(log.date);
  const label = Number.isNaN(instant.getTime())
    ? log.date
    : instant.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  return {
    kind,
    date: label,
    rawDate: log.date,
    ...(log.sessionId ? { sessionId: log.sessionId } : {}),
    ...(log.programId ? { programId: log.programId } : {}),
    day: log.day ?? log.title ?? "Workout",
    ...(log.title ? { title: log.title } : {}),
    duration: log.duration ?? null,
    notes: log.notes ?? "",
    notesKnown: true,
    exercises: (log.exercises ?? []).map((ex: StoredWorkoutLog["exercises"][number]) => ({
      name: ex.name,
      ...(ex.exerciseSlug ? { slug: ex.exerciseSlug } : {}),
      sets: (ex.sets ?? []).map(toCorrectableSet),
    })),
  };
}

// ─── Draft ──────────────────────────────────────────────────────────────────

export interface CorrectionSetDraft {
  reps: string;
  weight: string;
  duration: string;
  distance: string;
  speed: string;
  completed: boolean;
}

export interface CorrectionDraft {
  title: string;
  /** MINUTES, as typed. */
  duration: string;
  notes: string;
  sets: CorrectionSetDraft[][];
}

function textOf(value: number | null): string {
  return value === null ? "" : String(value);
}

export function draftFromWorkout(workout: CorrectableWorkout): CorrectionDraft {
  return {
    title: workout.title ?? "",
    duration: workout.duration == null ? "" : String(workout.duration),
    notes: workout.notes ?? "",
    sets: workout.exercises.map((ex) =>
      ex.sets.map((set) => ({
        reps: textOf(set.reps),
        weight: textOf(set.weight),
        duration: textOf(set.duration),
        distance: textOf(set.distance),
        speed: textOf(set.speed),
        completed: set.completed,
      })),
    ),
  };
}

/**
 * The web's `updateSet` rule: blank means empty, anything else goes through
 * `Number` untouched — including a negative or a fraction. The server owns
 * validation and answers with its own words; the client must not pre-empt it.
 */
export function parseDraftNumber(raw: string): number | null {
  if (raw === "") return null;
  return Number(raw);
}

/**
 * Which measurement columns the editor shows for one exercise — the web's
 * rule: a column appears when any set holds it, with reps/weight defaulting
 * on for a strength-looking exercise.
 */
export function visibleCorrectionFields(
  sets: { reps: number | null; weight: number | null; duration: number | null; distance: number | null; speed: number | null }[],
): CorrectionField[] {
  const hasDuration = sets.some((s) => s.duration !== null);
  const hasDistance = sets.some((s) => s.distance !== null);
  const hasSpeed = sets.some((s) => s.speed !== null);
  const hasReps = sets.some((s) => s.reps !== null) || (!hasDuration && !hasDistance);
  const hasWeight = sets.some((s) => s.weight !== null) || hasReps;
  return ([
    hasReps && "reps",
    hasWeight && "weight",
    hasDuration && "duration",
    hasDistance && "distance",
    hasSpeed && "speed",
  ].filter(Boolean) as CorrectionField[]);
}

// ─── Changes (the review step) ──────────────────────────────────────────────

function displayCorrectionValue(value: number | null, field: CorrectionField): string {
  if (value === null) return "empty";
  const unit = FIELD_UNITS[field];
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * The review list — the web's `changes` memo, same lines: title (quick only),
 * duration, notes, then per-set measurements and counted state.
 */
export function correctionChanges(
  original: CorrectableWorkout,
  draft: CorrectionDraft,
): string[] {
  const out: string[] = [];
  if (
    original.kind === "quick" &&
    draft.title.trim() !== (original.title ?? original.day).trim()
  ) {
    out.push(
      `Title: \u201c${original.title ?? original.day}\u201d \u2192 \u201c${draft.title.trim() || "Untitled"}\u201d`,
    );
  }
  const nextDuration = parseDraftNumber(draft.duration);
  if ((nextDuration ?? null) !== (original.duration ?? null)) {
    out.push(
      `Duration: ${original.duration ?? "empty"} \u2192 ${nextDuration ?? "empty"} min`,
    );
  }
  if (original.notesKnown && draft.notes.trim() !== (original.notes ?? "").trim()) {
    out.push("Workout notes changed");
  }
  for (let ei = 0; ei < original.exercises.length; ei += 1) {
    const exercise = original.exercises[ei]!;
    const draftSets = draft.sets[ei] ?? [];
    for (let si = 0; si < exercise.sets.length; si += 1) {
      const prior = exercise.sets[si]!;
      const next = draftSets[si];
      if (!next) continue;
      for (const field of CORRECTION_FIELDS) {
        const nextValue = parseDraftNumber(next[field]);
        if (nextValue !== prior[field]) {
          out.push(
            `${exercise.name} \u00b7 Set ${si + 1} ${field}: ${displayCorrectionValue(prior[field], field)} \u2192 ${displayCorrectionValue(nextValue, field)}`,
          );
        }
      }
      if (next.completed !== prior.completed) {
        out.push(
          `${exercise.name} \u00b7 Set ${si + 1}: ${prior.completed ? "counted" : "not counted"} \u2192 ${next.completed ? "counted" : "not counted"}`,
        );
      }
    }
  }
  return out;
}

// ─── The wire (the web's path, method and body) ─────────────────────────────

export function correctionPath(): string {
  return "/api/workouts/logs";
}

/**
 * The web's save body: the locator (quick by `sessionId`, program by its
 * tuple) plus the correction. Title travels for quick sessions only — the
 * server refuses a program rename with a 400.
 */
export function correctionRequest(
  original: CorrectableWorkout,
  draft: CorrectionDraft,
): WorkoutLogCorrectionRequest {
  const locator =
    original.kind === "quick"
      ? {
          kind: "quick" as const,
          ...(original.sessionId ? { sessionId: original.sessionId } : {}),
          date: original.rawDate,
        }
      : {
          kind: "program" as const,
          programId: original.programId ?? "",
          day: original.day,
          date: original.rawDate,
        };
  const duration = parseDraftNumber(draft.duration);
  return {
    locator,
    correction: {
      ...(original.kind === "quick"
        ? { title: draft.title.trim() || original.day }
        : {}),
      ...(duration !== null && !Number.isNaN(duration) ? { duration } : {}),
      ...(original.notesKnown ? { notes: draft.notes } : {}),
      exercises: original.exercises.map((exercise, ei) => ({
        name: exercise.name,
        ...(exercise.slug ? { exerciseSlug: exercise.slug } : {}),
        sets: exercise.sets.map((_, si) => {
          const next = draft.sets[ei]?.[si];
          const set: Record<string, number | boolean> = {
            setNumber: si + 1,
            completed: next?.completed !== false,
          };
          for (const field of CORRECTION_FIELDS) {
            const value = next ? parseDraftNumber(next[field]) : null;
            if (value !== null && !Number.isNaN(value)) set[field] = value;
          }
          return set as {
            setNumber: number;
            completed?: boolean;
            reps?: number;
            weight?: number;
            duration?: number;
            distance?: number;
            speed?: number;
          };
        }),
      })),
    },
  };
}

export interface SubmitCorrectionOptions {
  authToken?: string | null;
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
}

/**
 * Save the correction through the web's endpoint. The body is parsed against
 * the shared contract first, so a builder bug fails loudly instead of sending
 * a shape the server would half-apply. A refused correction throws the
 * `ApiError` carrying the server's `error` — the sheet renders it verbatim.
 */
export async function submitWorkoutCorrection(
  original: CorrectableWorkout,
  draft: CorrectionDraft,
  options: SubmitCorrectionOptions = {},
): Promise<void> {
  const body = WorkoutLogCorrectionRequestSchema.parse(
    correctionRequest(original, draft),
  );
  await apiFetch(correctionPath(), WorkoutLogCorrectionResponseSchema, {
    method: "PATCH",
    baseUrl: options.baseUrl ?? WEBAPP_BASE_URL,
    getToken: options.getToken ?? (() => options.authToken ?? undefined),
    body,
  });
}

/** The server's `error` verbatim when it sent one, else the caller's copy. */
export function correctionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | null;
    if (body && typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }
    return fallback;
  }
  return "Network error \u2014 your original log is unchanged";
}
