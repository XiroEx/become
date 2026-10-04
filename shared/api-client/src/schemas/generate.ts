import { z } from 'zod';
import { WorkoutDraftExerciseSchema } from './workouts';

// ===========================================================================
// GENERATE — the wire contract for POST /api/generate/session.
//
// Mirrors `webapp/app/api/generate/session/route.ts`:
//   Body:    { focus, exerciseCount?, difficulty?, equipment?, includeCardio?, seed? }
//   Returns: { session: DraftSession, seed }
//
// Rules that travel with this domain:
//   1. `/api/generate/*` is permanently UNMETERED — the deterministic fallback
//      every AI route degrades to (pinned by
//      webapp/tests/unit/allowance/inventory.test.ts and
//      webapp/tests/unit/entitlements/generatorFallback.test.ts). Workout Now
//      only goes through `/api/ai` when the member has switched AI on
//      (NP-136 adds the switch; this card ships deterministic-only).
//   2. `focus` is REQUIRED and must be a known focus key — the route answers
//      400 'A valid focus is required' otherwise.
//   3. `seed` in the RESPONSE echoes the seed the session was built with (the
//      route mints one when the body carries none), so Regenerate can send a
//      fresh seed and get a different session.
//   4. The session's exercises are `WorkoutDraftExercise`-shaped (the same
//      draft the history route hands back for a repeat), so the preview can be
//      stashed and started without a second fetch.
//
// Response schemas are `.passthrough()` on purpose: a shipped store build has
// to survive a server that grew a field. The webapp contract harness
// (webapp/tests/unit/contract/np076Generate.test.ts) is what stops a RENAME
// from sliding through that tolerance.
// ===========================================================================

/**
 * The known focus keys — `webapp/lib/quickSession/types.ts#FocusKey`.
 * A plain enum (not a free string) so a typo'd focus fails client-side before
 * the server answers 400.
 */
export const GenerateFocusSchema = z.enum([
  'full_body',
  'upper',
  'lower',
  'push',
  'pull',
  'legs',
  'glutes',
  'core',
  'arms',
  'chest',
  'back',
  'shoulders',
  'cardio',
]);

export const GENERATE_FOCUS_KEYS = GenerateFocusSchema.options;

export type GenerateFocus = z.infer<typeof GenerateFocusSchema>;

/**
 * POST /api/generate/session — the request body.
 *
 * Mirrors `GenerateSessionOptions` in `webapp/lib/quickSession/types.ts`:
 * `exerciseCount` is clamped 3–10 server-side, `seed` is minted server-side
 * when omitted (so Regenerate simply omits it again for a fresh draw).
 */
export const GenerateSessionRequestSchema = z
  .object({
    focus: GenerateFocusSchema,
    /** Target number of exercises (clamped 3–10 by the route). */
    exerciseCount: z.number().optional(),
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
 * The draft session the generator answers with — the same in-flight shape the
 * history route hands back for a repeat (`WorkoutDraftExercise`-shaped
 * exercises, `title` + optional `focus`).
 */
/**
 * One generated exercise: `WorkoutDraftExercise` plus the catalog's
 * `primaryMuscles`, which `toDraftExercise` in
 * `webapp/lib/quickSession/generate.ts` always copies onto the draft.
 */
export const GenerateDraftExerciseSchema = WorkoutDraftExerciseSchema.extend({
  primaryMuscles: z.array(z.string()).optional(),
});

export const GenerateSessionDraftSchema = z
  .object({
    title: z.string(),
    focus: z.string().optional(),
    exercises: z.array(GenerateDraftExerciseSchema),
  })
  .passthrough();

export type GenerateSessionDraft = z.infer<typeof GenerateSessionDraftSchema>;

/**
 * POST /api/generate/session — the response: `{ session, seed }`.
 */
export const GenerateSessionResponseSchema = z
  .object({
    session: GenerateSessionDraftSchema,
    seed: z.number(),
  })
  .passthrough();

export type GenerateSessionResponse = z.infer<typeof GenerateSessionResponseSchema>;
