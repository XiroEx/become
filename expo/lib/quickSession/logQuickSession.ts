/**
 * ─── SESSION COMPLETE + LOG-OR-PLAN CALLS (NP-137) ───────────────────────────
 *
 * The two network calls behind `expo/components/workout/SessionBuilder.tsx`,
 * kept out of the component so tests drive them at the `apiFetch` seam:
 *
 *   • `completeSessionSuggest` / `completeSessionFinish` — the two modes of
 *     `POST /api/generate/session/complete` (webapp's `SessionBuilder` calls
 *     the same route with `{ mode: 'suggest' | 'finish', exercises }`).
 *     `/api/generate/*` is never metered: no allowance line, no gate check,
 *     no upgrade sheet. A 403 here without `feature` and `requiresTier` is an
 *     ordinary error, never the sheet — so these helpers do NOT classify and
 *     the component renders the server's own words.
 *   • `logQuickSession` — the native half of the copied
 *     `webapp/lib/quickSession/log.ts` (`buildLoggedExercises` +
 *     `localDateStr` come from `@become/core`; the token + POST cannot travel
 *     because native has no `localStorage` and no same-origin relative URL).
 *     A past/today date logs the session as done (`completed: true`,
 *     `started: true`); a future date plans it (`completed: false`,
 *     `started: false`, so it must not appear "in progress" the moment that
 *     date arrives — see `IWorkoutLog.startedAt`).
 */

import { z } from "zod";
import {
  apiFetch,
  CompleteSessionFinishResponseSchema,
  CompleteSessionSuggestResponseSchema,
  WorkoutSaveResponseSchema,
  type CompleteSessionExerciseInput,
  type CompleteSessionFinishResponse,
  type CompleteSessionSuggestResponse,
  type WorkoutQuickSaveRequest,
  type WorkoutSaveResponse,
} from "@become/api-client";
import {
  buildLoggedExercises,
  localDateStr,
  type DraftExercise,
} from "@become/core";

export interface ApiOpts {
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

function toCompleteInput(ex: DraftExercise): CompleteSessionExerciseInput {
  return {
    exerciseSlug: ex.exerciseSlug,
    name: ex.name,
    trackingType: ex.trackingType,
    sets: ex.sets,
    reps: ex.reps,
    ...(ex.rest ? { rest: ex.rest } : {}),
    ...(ex.duration ? { duration: ex.duration } : {}),
  };
}

/** One-tap complements for the current draft (`mode: 'suggest'`). */
export async function completeSessionSuggest(
  input: { exercises: DraftExercise[]; suggestionCount?: number },
  opts: ApiOpts = {},
): Promise<CompleteSessionSuggestResponse> {
  return apiFetch<z.infer<typeof CompleteSessionSuggestResponseSchema>>(
    "/api/generate/session/complete",
    CompleteSessionSuggestResponseSchema,
    {
      method: "POST",
      body: {
        mode: "suggest",
        exercises: input.exercises.map(toCompleteInput),
        suggestionCount: input.suggestionCount ?? 3,
      },
      ...opts,
    },
  );
}

/** "Finish this for me" (`mode: 'finish'`). */
export async function completeSessionFinish(
  input: { exercises: DraftExercise[]; exerciseCount?: number },
  opts: ApiOpts = {},
): Promise<CompleteSessionFinishResponse> {
  return apiFetch<z.infer<typeof CompleteSessionFinishResponseSchema>>(
    "/api/generate/session/complete",
    CompleteSessionFinishResponseSchema,
    {
      method: "POST",
      body: {
        mode: "finish",
        exercises: input.exercises.map(toCompleteInput),
        ...(input.exerciseCount !== undefined
          ? { exerciseCount: input.exerciseCount }
          : {}),
      },
      ...opts,
    },
  );
}

export interface QuickLogInput {
  sessionId: string;
  title: string;
  needsName?: boolean;
  focus?: string;
  exercises: DraftExercise[];
  /** YYYY-MM-DD. Past/today → logged done; future → planned. */
  date: string;
}

/**
 * POST the session to /api/workouts. Returns `{ done }` (was it logged as
 * done vs planned). Throws with a readable message on failure.
 */
export async function logQuickSession(
  input: QuickLogInput,
  opts: ApiOpts = {},
): Promise<{ done: boolean }> {
  const done = input.date <= localDateStr();
  const exercises = buildLoggedExercises(input.exercises, done);
  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const body: WorkoutQuickSaveRequest = {
    kind: "quick",
    sessionId: input.sessionId,
    title: input.title,
    ...(input.needsName !== undefined ? { needsName: input.needsName } : {}),
    ...(input.focus ? { focus: input.focus } : {}),
    exercises,
    completed: done,
    ...(done ? { duration: Math.max(1, Math.round(totalSets * 1.5)) } : {}),
    performedAt: input.date,
    // Backfilling a past/today session (`done`) is real activity; planning
    // a future one is not — it must not appear "in progress" the moment
    // that date arrives (see IWorkoutLog.startedAt).
    started: done,
    tz: new Date().getTimezoneOffset(),
  };
  try {
    await apiFetch<z.infer<typeof WorkoutSaveResponseSchema>>(
      "/api/workouts",
      WorkoutSaveResponseSchema,
      { method: "POST", body, ...opts },
    );
  } catch (e) {
    if (e instanceof Error && e.message) throw e;
    throw new Error("Failed to save session");
  }
  return { done };
}

export type { WorkoutSaveResponse };
