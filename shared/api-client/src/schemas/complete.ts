import { z } from 'zod';
import { WorkoutDraftExerciseSchema } from './workouts';

// ===========================================================================
// SESSION COMPLETE — the wire contract for POST /api/generate/session/complete.
// (NP-137.)
//
// Mirrors `webapp/app/api/generate/session/complete/route.ts`:
//   Body:    { exercises, mode?: 'finish' | 'suggest', exerciseCount?,
//              suggestionCount?, difficulty?, equipment?, seed? }
//   Returns: `{ session, seed }` in finish mode, `{ suggestions, seed }` in
//            suggest mode.
//
// Rules that travel with this domain:
//   1. `/api/generate/*` is never metered — no allowance line, no gate check,
//      no upgrade sheet on this call. A 403 here without `feature` and
//      `requiresTier` is an ordinary error, never the sheet.
//   2. `exercises` is REQUIRED and non-empty — the route answers 400
//      'A non-empty exercises array is required' otherwise.
//   3. `mode` defaults to 'finish' server-side.
//   4. The finish answer's `session.title` is EMPTY BY DESIGN — the client
//      owns the title and must merge it with the builder's current title
//      instead of overwriting it with a generated one.
//   5. A suggestion whose slug is already in the draft is dropped client-side
//      (the web filters `chosenSlugs`); the appended finish exercises are
//      deduped the same way.
//
// Response schemas are `.passthrough()` on purpose: a shipped store build has
// to survive a server that grew a field. The webapp contract harness is what
// stops a RENAME from sliding through that tolerance.
// ===========================================================================

/**
 * One exercise the client sends in — the draft row, minus the fields the
 * server re-derives. Mirrors `CompleteSessionExerciseInput` in
 * `webapp/lib/quickSession/types.ts`.
 */
export const CompleteSessionExerciseInputSchema = z
  .object({
    exerciseSlug: z.string(),
    name: z.string().optional(),
    trackingType: z.string().optional(),
    sets: z.number().optional(),
    reps: z.string().optional(),
    rest: z.string().optional(),
    duration: z.string().optional(),
  })
  .passthrough();

export type CompleteSessionExerciseInput = z.infer<
  typeof CompleteSessionExerciseInputSchema
>;

/** POST /api/generate/session/complete — the request body. */
export const CompleteSessionRequestSchema = z
  .object({
    exercises: z.array(CompleteSessionExerciseInputSchema).min(1),
    /** Defaults to 'finish' server-side. */
    mode: z.enum(['finish', 'suggest']).optional(),
    /** Target total exercise count for finish mode (clamped 3–10 server-side). */
    exerciseCount: z.number().optional(),
    /** Number of one-tap suggestions (clamped 1–6 server-side). */
    suggestionCount: z.number().optional(),
    difficulty: z.string().optional(),
    equipment: z.array(z.string()).optional(),
    seed: z.number().optional(),
  })
  .passthrough();

export type CompleteSessionRequest = z.infer<
  typeof CompleteSessionRequestSchema
>;

/**
 * One one-tap suggestion: a draft exercise plus the human reason
 * ("Same movement pattern"), already ordered. Mirrors `ComplementSuggestion`
 * in `webapp/lib/quickSession/types.ts`.
 */
export const ComplementSuggestionSchema = z
  .object({
    exercise: WorkoutDraftExerciseSchema.passthrough(),
    reason: z.string(),
  })
  .passthrough();

export type ComplementSuggestion = z.infer<typeof ComplementSuggestionSchema>;

/**
 * POST /api/generate/session/complete — the finish answer: `{ session, seed }`.
 * `session.title` is EMPTY BY DESIGN (rule 4) — the client keeps its own.
 */
export const CompleteSessionFinishResponseSchema = z
  .object({
    session: z
      .object({
        title: z.string(),
        focus: z.string().optional(),
        exercises: z.array(WorkoutDraftExerciseSchema.passthrough()).default([]),
      })
      .passthrough(),
    seed: z.number().optional(),
  })
  .passthrough();

export type CompleteSessionFinishResponse = z.infer<
  typeof CompleteSessionFinishResponseSchema
>;

/**
 * POST /api/generate/session/complete — the suggest answer:
 * `{ suggestions, seed }`.
 */
export const CompleteSessionSuggestResponseSchema = z
  .object({
    suggestions: z.array(ComplementSuggestionSchema).default([]),
    seed: z.number().optional(),
  })
  .passthrough();

export type CompleteSessionSuggestResponse = z.infer<
  typeof CompleteSessionSuggestResponseSchema
>;
