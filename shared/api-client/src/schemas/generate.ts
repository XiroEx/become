import { z } from 'zod';

// ===========================================================================
// POST /api/generate/session — the deterministic quick-session generator.
//
// The wire contract for the Workout Now sheet (NP-076). The route is
// permanently UNMETERED (webapp/tests/unit/allowance/inventory.test.ts pins
// it): it is the fallback every AI route degrades to, so it works for every
// member, including a free one past the AI allowance. Workout Now only goes
// through /api/ai when the member has switched AI on (NP-136 adds the switch;
// this card ships the deterministic path only).
//
// Mirrors `GenerateSessionOptions` in webapp/lib/quickSession/types.ts (the
// request) and the `{ session, seed }` envelope in
// webapp/app/api/generate/session/route.ts (the response).
//
// Response schemas are `.passthrough()` on purpose: a shipped store build has
// to survive a server that grew a field. The webapp contract harness is what
// stops a RENAME from sliding through that tolerance.
// ===========================================================================

/**
 * The focus vocabulary. A plain string, not an enum, so a catalog that grows
 * a focus cannot make a shipped store build drop a whole session — the same
 * rule workouts/programs state for tracking types.
 */
export const GenerateSessionFocusSchema = z.string();

export type GenerateSessionFocus = z.infer<typeof GenerateSessionFocusSchema>;

/**
 * POST /api/generate/session — the request body.
 *
 * `focus` is required (the route 400s without a valid one); everything else
 * is an optional filter the generator clamps server-side (exerciseCount 3–10).
 * `seed` drives the splash of randomness: omit it and the server mints one,
 * send it back and the same session reproduces.
 */
export const GenerateSessionRequestSchema = z
  .object({
    focus: GenerateSessionFocusSchema,
    /** Target number of exercises (clamped 3–10 server-side). */
    exerciseCount: z.number().int().optional(),
    /** Cap difficulty — exercises at this level or easier are eligible. */
    difficulty: z.string().optional(),
    /** Available equipment. Empty/omitted = no equipment constraint. */
    equipment: z.array(z.string()).optional(),
    /** Allow a cardio finisher even on a strength focus. */
    includeCardio: z.boolean().optional(),
    /** Seed for the splash of randomness (deterministic per seed). */
    seed: z.number().optional(),
  })
  .passthrough();

export type GenerateSessionRequest = z.infer<typeof GenerateSessionRequestSchema>;

/**
 * One exercise in a generated draft session.
 *
 * `sets` is a COUNT; `reps`/`duration`/`rest` are PRESCRIPTION STRINGS as
 * written in the program ("8-12", "45 sec", "60s"), not measurements — the
 * same convention `WorkoutDraftExerciseSchema` in ./workouts states.
 */
export const GenerateSessionDraftExerciseSchema = z
  .object({
    exerciseSlug: z.string(),
    name: z.string(),
    trackingType: z.string(),
    sets: z.number(),
    reps: z.string(),
    rest: z.string().optional(),
    duration: z.string().optional(),
    primaryMuscles: z.array(z.string()).optional(),
    equipment: z.array(z.string()).optional(),
    laterality: z.string().optional(),
    movementPatterns: z.array(z.string()).optional(),
    groupId: z.string().optional(),
    groupType: z.string().optional(),
    groupLabel: z.string().optional(),
    groupRest: z.string().optional(),
    groupRounds: z.number().optional(),
    addedAdHoc: z.boolean().optional(),
  })
  .passthrough();

export type GenerateSessionDraftExercise = z.infer<
  typeof GenerateSessionDraftExerciseSchema
>;

/**
 * The in-flight, program-less session the generator hands back. The client
 * stashes it and hands it to the live workout engine — it is NOT persisted
 * here (it is saved on completion via POST /api/workouts as kind:'quick').
 */
export const GenerateSessionDraftSchema = z
  .object({
    title: z.string(),
    focus: z.string().optional(),
    exercises: z.array(GenerateSessionDraftExerciseSchema),
    source: z.string().optional(),
  })
  .passthrough();

export type GenerateSessionDraft = z.infer<typeof GenerateSessionDraftSchema>;

/**
 * POST /api/generate/session — the response envelope.
 *
 * `seed` is the seed the session was built with (minted server-side when the
 * request omits one): send it back as the next request's `seed` to reproduce
 * the session, or omit it for a different one (Regenerate).
 */
export const GenerateSessionResponseSchema = z
  .object({
    session: GenerateSessionDraftSchema,
    seed: z.number(),
  })
  .passthrough();

export type GenerateSessionResponse = z.infer<typeof GenerateSessionResponseSchema>;
