import { z } from 'zod';
import { ActivityStreakResultSchema } from './streak';

/**
 * ─── Tracked workouts done OUTSIDE Become (card 6adf69c7, Part B) ────────────
 *
 * Mirrors webapp/app/api/workouts/external/route.ts and
 * webapp/lib/workout/externalWorkouts.ts. Jon, 2026-10-26: a walk Whoop
 * recorded, a Strava run, an Apple Watch session — synced in from Apple Health
 * or Health Connect — shows on the calendar as an EXTRA activity, ticks off "I
 * did a workout today", and never completes the scheduled program slot.
 *
 * Four rules travel with this file:
 *
 *   1. `date` is the SESSION's own local day (`YYYY-MM-DD`), built on the phone
 *      from the session's own zone offset. The server refuses an import with
 *      none, a future day, and one older than 90 days.
 *   2. `(source, externalId)` is unique. A re-delivery answers
 *      `{ applied: false, duplicate: true }` and changes nothing.
 *   3. Only TRACKED sessions are sent (HealthKit `tracked`, Health Connect
 *      `recordingMethod` !== manual entry), and never Become's own exports.
 *      The phone decides both, because only the platform knows.
 *   4. A session from TODAY credits the streak day once; an older one credits
 *      nothing — the same rule as an imported weigh-in.
 */

export const ExternalWorkoutSourceSchema = z.enum(['healthkit', 'health-connect']);
export type ExternalWorkoutSource = z.infer<typeof ExternalWorkoutSourceSchema>;

/** One session, as the phone sends it. */
export const ExternalWorkoutImportItemSchema = z
  .object({
    source: ExternalWorkoutSourceSchema,
    externalId: z.string().min(1).max(200),
    /** The session's own local day, `YYYY-MM-DD`. */
    date: z.string(),
    startedAt: z.string(),
    endedAt: z.string(),
    /** Normalised on the server to kebab-case. */
    activityType: z.string().max(64).optional(),
    activityName: z.string().max(80).optional(),
    /** Moving time when the tracker reported one; the span otherwise. */
    durationMin: z.number().nonnegative().optional(),
    distanceKm: z.number().nonnegative().optional(),
    energyKcal: z.number().nonnegative().optional(),
    /** The app that recorded it, as a display name ("Strava"). */
    originApp: z.string().max(80).optional(),
  })
  .passthrough();
export type ExternalWorkoutImportItem = z.infer<typeof ExternalWorkoutImportItemSchema>;

/** At most this many sessions per POST; the phone chunks a first sync. */
export const EXTERNAL_WORKOUT_MAX_BATCH = 50;

export const ExternalWorkoutsImportRequestSchema = z
  .object({
    workouts: z.array(ExternalWorkoutImportItemSchema).min(1).max(EXTERNAL_WORKOUT_MAX_BATCH),
    tz: z.number().int().optional(),
    tzZone: z.string().optional(),
  })
  .passthrough();
export type ExternalWorkoutsImportRequest = z.infer<typeof ExternalWorkoutsImportRequestSchema>;

export const ExternalWorkoutImportResultSchema = z
  .object({
    externalId: z.string().nullable(),
    source: z.string().nullable(),
    date: z.string().optional(),
    applied: z.boolean(),
    duplicate: z.boolean().optional(),
    /** Why this one item was refused. The rest of the batch is unaffected. */
    error: z.string().optional(),
  })
  .passthrough();
export type ExternalWorkoutImportResult = z.infer<typeof ExternalWorkoutImportResultSchema>;

export const ExternalWorkoutsImportResponseSchema = z
  .object({
    success: z.boolean(),
    results: z.array(ExternalWorkoutImportResultSchema),
    /** Present only when a session from TODAY was applied for the first time. */
    streak: ActivityStreakResultSchema.optional(),
  })
  .passthrough();
export type ExternalWorkoutsImportResponse = z.infer<typeof ExternalWorkoutsImportResponseSchema>;

/** One stored session, as both calendars read it. */
export const ExternalWorkoutSchema = z
  .object({
    source: ExternalWorkoutSourceSchema,
    externalId: z.string(),
    /** Local day, `YYYY-MM-DD` — a plain calendar date, never put through a zone. */
    date: z.string(),
    startedAt: z.string(),
    endedAt: z.string(),
    activityType: z.string(),
    activityName: z.string(),
    durationMin: z.number(),
    distanceKm: z.number().optional(),
    energyKcal: z.number().optional(),
    originApp: z.string().optional(),
  })
  .passthrough();
export type ExternalWorkout = z.infer<typeof ExternalWorkoutSchema>;

/** GET /api/workouts/external?from=&to=&tz= — inclusive local days. */
export const ExternalWorkoutsResponseSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    workouts: z.array(ExternalWorkoutSchema),
  })
  .passthrough();
export type ExternalWorkoutsResponse = z.infer<typeof ExternalWorkoutsResponseSchema>;
