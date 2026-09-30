import { z } from 'zod';
import { ActiveProgramStatusSchema } from './programs';

// ===========================================================================
// SCHEDULE — the wire contract for /api/schedule and /api/schedule/settings
//
// Re-aligned against the LIVE routes (NP-021). Every schema below names the
// route it mirrors; nothing here describes a response no route sends. What was
// here before did: a `{ schedule: [...] }` envelope with `phaseIndex` /
// `workoutIndex` slots, which no handler has ever answered with.
//
// Four rules travel with this domain and are asserted by
// webapp/tests/unit/contract/np021Schedule.test.ts:
//
//   1. A slot `date` is a DAY MARKER at 00:00Z, not an instant. Read it with
//      `slotDateKey` (`date.slice(0, 10)`) and NEVER through a timezone
//      offset: `new Date(w.date).getDate()` moves the marker a day backwards
//      for everyone west of UTC, which is how today's session used to render
//      on yesterday. `completedAt` is the opposite species — a real instant —
//      and does take the offset. Same rule, same names, as
//      webapp/lib/notifications/cronNotify.ts#slotDateKey and
//      webapp/tests/unit/dayMarkerConvention.test.ts.
//   2. GET /api/schedule answers `{ schedules: [ … ] }` — PLURAL and NESTED,
//      one document per enrolled program, each with its own
//      `scheduledWorkouts`. There is no flat top-level slot array.
//   3. A slot names its session with `phase` (1-BASED, as
//      webapp/models/Schedule.ts writes it) and `dayLabel` ("Day 1"). Indices
//      are a client-side detail; they never leave the server.
//   4. Every write carries `tz` — minutes WEST of UTC, a NUMBER (see src/tz.ts).
//      `apiFetch` merges `tz` and `tzZone` into the body of every date-scoped
//      POST/PUT/PATCH, so both are declared optional on the request schemas
//      even where a handler ignores them today.
//
// Response schemas are `.passthrough()` on purpose: a shipped store build has
// to survive a server that grew a field. The webapp contract harness is what
// stops a rename from sliding through that tolerance.
// ===========================================================================

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The five slot statuses webapp/models/Schedule.ts enforces.
 *
 * GET /api/schedule DERIVES some of them on read rather than reading them off
 * the document: a past `scheduled` slot is answered as `missed`, and a
 * future-dated `missed` slot is self-healed back to `scheduled`. So a client
 * must never assume the status it was last sent is the one that is stored.
 */
export const ScheduledWorkoutStatusSchema = z.enum([
  'scheduled',
  'completed',
  'missed',
  'skipped',
  'rest',
]);

export const SCHEDULED_WORKOUT_STATUSES = ScheduledWorkoutStatusSchema.options;

/**
 * `schedules[].programStatus`: the ENROLMENT's status
 * (models/UserProgress.ts, and `ActiveProgramStatusSchema` in ./programs),
 * plus the `'unknown'` the GET substitutes when the member has a schedule but
 * no matching `activePrograms` row — a real answer, not an error.
 */
export const ScheduleProgramStatusSchema = z.enum([
  ...ActiveProgramStatusSchema.options,
  'unknown',
]);

export const SCHEDULE_PROGRAM_STATUSES = ScheduleProgramStatusSchema.options;

/** `view` on GET /api/schedule. Anything else is treated as no range filter. */
export const ScheduleViewSchema = z.enum(['week', 'month', 'upcoming', 'all']);

export const SCHEDULE_VIEWS = ScheduleViewSchema.options;

export type ScheduledWorkoutStatus = z.infer<
  typeof ScheduledWorkoutStatusSchema
>;
export type ScheduleProgramStatus = z.infer<typeof ScheduleProgramStatusSchema>;
export type ScheduleView = z.infer<typeof ScheduleViewSchema>;

/**
 * Rule 1, as a function: the day a slot marker denotes, as YYYY-MM-DD.
 *
 * Slot dates are written at UTC midnight (`utcMidnightDateKey` in
 * webapp/lib/dayWindow.ts) and therefore denote a CALENDAR DAY. Taking the
 * date part is the whole reading — the same one
 * webapp/lib/notifications/cronNotify.ts#slotDateKey does for the web. Putting
 * a marker through a timezone offset shifts it a day backwards for anyone west
 * of UTC.
 */
export function slotDateKey(date: string): string {
  return date.slice(0, 10);
}

// ---------------------------------------------------------------------------
// The schedule document, as GET /api/schedule answers it.
// Mirrors webapp/app/api/schedule/route.ts (GET) + webapp/models/Schedule.ts.
// ---------------------------------------------------------------------------

/**
 * `schedules[].settings` — this used to be `z.unknown()`, so the native
 * settings screen hand-cast it to read the member's training days back.
 *
 * `trainingDays` is 0=Sun … 6=Sat and is what the generator lays sessions on;
 * `startDate` is a 00:00Z day marker (rule 1). The model persists these two
 * fields and nothing else — `autoAdvance` and friends are native-local state,
 * not something the server ever sends.
 */
export const ScheduleSettingsSchema = z
  .object({
    trainingDays: z.array(z.number().int().min(0).max(6)).default([]),
    startDate: z.string().optional(),
  })
  .passthrough();

/**
 * One session on one day. `date` is the day MARKER (rule 1); `completedAt` is
 * an instant and is present only on a completed slot.
 *
 * `status` is `.catch()`-guarded rather than strict: a server that grows a
 * sixth status must not make a shipped build drop the whole calendar, so an
 * unrecognised value reads as `scheduled` — which is what the native
 * flattener used to do by hand. The contract harness asserts the real values,
 * so a RENAME still fails there rather than being silently absorbed here.
 */
export const ScheduledWorkoutSchema = z
  .object({
    date: z.string(),
    programId: z.string().optional(),
    /** 1-BASED. Rule 3. */
    phase: z.number().int().optional(),
    /** "Day 1", "Day 2" — the label, not an index. Rule 3. */
    dayLabel: z.string().optional(),
    /** Cached from the program: "Upper Body Strength". */
    workoutTitle: z.string().optional(),
    status: ScheduledWorkoutStatusSchema.catch('scheduled'),
    completedAt: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

/**
 * One program's schedule. `scheduledWorkouts` is FILTERED to the requested
 * range (`from`/`to`, or the `view` window) while statuses are computed across
 * the whole schedule first, so an empty array means "nothing in this window",
 * never "no schedule".
 */
export const ScheduleDocSchema = z
  .object({
    _id: z.string().optional(),
    programId: z.string(),
    programName: z.string().optional(),
    programStatus: ScheduleProgramStatusSchema.catch('unknown').optional(),
    settings: ScheduleSettingsSchema.optional(),
    scheduledWorkouts: z.array(ScheduledWorkoutSchema).default([]),
  })
  .passthrough();

/**
 * GET /api/schedule?programId&from&to&view&tz — `{ schedules: [ … ] }`.
 * Rule 2. `schedules` defaults to [] because a member with no schedule at all
 * gets exactly `{ schedules: [] }`.
 */
export const ScheduleApiResponseSchema = z
  .object({
    schedules: z.array(ScheduleDocSchema).default([]),
  })
  .passthrough();

/**
 * The query GET /api/schedule reads. `from`/`to` only apply TOGETHER (the
 * route checks `from && to`); either one alone is ignored, and `view` is the
 * fallback window.
 */
export const ScheduleQuerySchema = z.object({
  programId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  view: ScheduleViewSchema.optional(),
  /** Minutes WEST of UTC. Rule 4. Anchors the route's idea of "today". */
  tz: z.number().int().optional(),
});

export type ScheduleSettings = z.infer<typeof ScheduleSettingsSchema>;
export type ScheduledWorkout = z.infer<typeof ScheduledWorkoutSchema>;
export type ScheduleDoc = z.infer<typeof ScheduleDocSchema>;
export type ScheduleApiResponse = z.infer<typeof ScheduleApiResponseSchema>;
export type ScheduleQuery = z.infer<typeof ScheduleQuerySchema>;

// ---------------------------------------------------------------------------
// POST /api/schedule — build a schedule for an enrolled program.
// Mirrors webapp/app/api/schedule/route.ts (POST). Upserts: posting again for
// the same program REPLACES the schedule (and every slot status with it).
// ---------------------------------------------------------------------------

/** 0=Sun … 6=Sat. Non-empty — the route 400s on `[]`. */
const trainingDaysField = z.array(z.number().int().min(0).max(6)).min(1);

/**
 * `tz` / `tzZone` are merged into every date-scoped write body by `apiFetch`
 * (src/tz.ts), so every request schema here declares them. POST /api/schedule
 * does not read `tz` today; it is still on the wire.
 */
const writeTzFields = {
  tz: z.number().int().optional(),
  tzZone: z.string().optional(),
} as const;

export const ScheduleCreateRequestSchema = z.object({
  programId: z.string(),
  trainingDays: trainingDaysField,
  /** YYYY-MM-DD, read as 00:00 UTC on that day. Required here. */
  startDate: z.string(),
  ...writeTzFields,
});

export const ScheduleCreateResponseSchema = z
  .object({
    message: z.string(),
    schedule: z
      .object({
        _id: z.string().optional(),
        programId: z.string(),
        programName: z.string().optional(),
        settings: ScheduleSettingsSchema.optional(),
        totalScheduledWorkouts: z.number().int().min(0),
        /** Day markers (rule 1); absent when the program has no sessions. */
        firstWorkout: z.string().optional(),
        lastWorkout: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type ScheduleCreateRequest = z.infer<typeof ScheduleCreateRequestSchema>;
export type ScheduleCreateResponse = z.infer<
  typeof ScheduleCreateResponseSchema
>;

// ---------------------------------------------------------------------------
// PATCH /api/schedule — the eight actions, as a discriminated union.
// Mirrors webapp/app/api/schedule/route.ts (PATCH).
//
// `action` is the discriminant, so a body is checked against the ONE shape its
// action requires: `reschedule` without `newDate`, or `shift` without `days`,
// stops being a 400 discovered on a device.
// ---------------------------------------------------------------------------

/** Every action the handler's switch accepts, in the order it documents them. */
export const SCHEDULE_PATCH_ACTIONS = [
  'skip',
  'unskip',
  'uncomplete',
  'reschedule',
  'swap',
  'shift',
  'pause',
  'resume',
] as const;

export const SchedulePatchActionSchema = z.enum(SCHEDULE_PATCH_ACTIONS);

/**
 * The three PROGRAM-level actions — the ones that need no `workoutDate`
 * (`programLevelActions` in the route).
 */
export const SCHEDULE_PROGRAM_LEVEL_ACTIONS = [
  'shift',
  'pause',
  'resume',
] as const;

const patchBase = {
  programId: z.string(),
  ...writeTzFields,
} as const;

/**
 * Which slot to act on: the slot's own day marker. Matched by UTC midnight of
 * the day, so `2026-06-01` and `2026-06-01T00:00:00.000Z` name the same slot —
 * and a date with no slot on it is a 404, not a no-op.
 */
const workoutDateField = z.string();

/** Mark a session skipped. Also clears an unfinished log for that day. */
export const ScheduleSkipRequestSchema = z.object({
  ...patchBase,
  action: z.literal('skip'),
  workoutDate: workoutDateField,
});

/** Undo a skip. A slot that is not `skipped` is left alone. */
export const ScheduleUnskipRequestSchema = z.object({
  ...patchBase,
  action: z.literal('unskip'),
  workoutDate: workoutDateField,
});

/**
 * Undo a completion: the slot goes back to `scheduled`, the completed log is
 * removed and the completed count is given back. A slot that is not
 * `completed` is left alone.
 */
export const ScheduleUncompleteRequestSchema = z.object({
  ...patchBase,
  action: z.literal('uncomplete'),
  workoutDate: workoutDateField,
});

/** Move ONE session to another day. Clears a `missed` flag on the way. */
export const ScheduleRescheduleRequestSchema = z.object({
  ...patchBase,
  action: z.literal('reschedule'),
  workoutDate: workoutDateField,
  /** The day marker to move it to. */
  newDate: z.string(),
});

/**
 * Exchange the dates of two sessions. The server has always accepted this;
 * neither the web nor native has a screen that sends it, so it is typed here
 * and called by nobody — refused with a 400 if either side is `completed`.
 */
export const ScheduleSwapRequestSchema = z.object({
  ...patchBase,
  action: z.literal('swap'),
  workoutDate: workoutDateField,
  /** The other session's day marker. A date with no slot is a 404. */
  swapWithDate: z.string(),
});

/** Move every FUTURE scheduled session by `days` and regenerate from there. */
export const ScheduleShiftRequestSchema = z.object({
  ...patchBase,
  action: z.literal('shift'),
  /**
   * Whole days: positive delays, negative pulls forward. NEVER 0 — the route's
   * `!days` guard answers 400, so "shift by nothing" must not be sent at all.
   */
  days: z.number().int().refine((days) => days !== 0, {
    message: 'days must not be 0 — the route refuses it',
  }),
});

/** Park the program. Needs no schedule to exist. */
export const SchedulePauseRequestSchema = z.object({
  ...patchBase,
  action: z.literal('pause'),
});

/** Un-park it and re-lay the remaining sessions from `resumeDate` (or today). */
export const ScheduleResumeRequestSchema = z.object({
  ...patchBase,
  action: z.literal('resume'),
  resumeDate: z.string().optional(),
});

export const SchedulePatchRequestSchema = z.discriminatedUnion('action', [
  ScheduleSkipRequestSchema,
  ScheduleUnskipRequestSchema,
  ScheduleUncompleteRequestSchema,
  ScheduleRescheduleRequestSchema,
  ScheduleSwapRequestSchema,
  ScheduleShiftRequestSchema,
  SchedulePauseRequestSchema,
  ScheduleResumeRequestSchema,
]);

export type SchedulePatchAction = z.infer<typeof SchedulePatchActionSchema>;
export type ScheduleSkipRequest = z.infer<typeof ScheduleSkipRequestSchema>;
export type ScheduleUnskipRequest = z.infer<typeof ScheduleUnskipRequestSchema>;
export type ScheduleUncompleteRequest = z.infer<
  typeof ScheduleUncompleteRequestSchema
>;
export type ScheduleRescheduleRequest = z.infer<
  typeof ScheduleRescheduleRequestSchema
>;
export type ScheduleSwapRequest = z.infer<typeof ScheduleSwapRequestSchema>;
export type ScheduleShiftRequest = z.infer<typeof ScheduleShiftRequestSchema>;
export type SchedulePauseRequest = z.infer<typeof SchedulePauseRequestSchema>;
export type ScheduleResumeRequest = z.infer<typeof ScheduleResumeRequestSchema>;
export type SchedulePatchRequest = z.infer<typeof SchedulePatchRequestSchema>;

// --- and what the PATCH answers with -------------------------------------

/**
 * skip | unskip | uncomplete | reschedule | swap — the SLOT-level actions all
 * answer with the program's slots as they now stand, re-sorted by date.
 */
export const ScheduleSlotActionResponseSchema = z
  .object({
    message: z.string(),
    schedule: z
      .object({
        programId: z.string(),
        scheduledWorkouts: z.array(ScheduledWorkoutSchema).default([]),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * shift | pause | resume — the PROGRAM-level actions answer with counters and
 * no slots. `pause`, and `resume` on a program with no schedule, answer with
 * `{ message, programId }` alone; only `shift` reports `nextWorkout`.
 */
export const ScheduleProgramActionResponseSchema = z
  .object({
    message: z.string(),
    programId: z.string(),
    totalScheduledWorkouts: z.number().int().min(0).optional(),
    futureWorkouts: z.number().int().min(0).optional(),
    /** A day marker (rule 1). `shift` only. */
    nextWorkout: z.string().optional(),
  })
  .passthrough();

/**
 * What a caller that does not know which action it just sent must accept. The
 * slot shape is tried first: it is the only one with a `schedule` key, and the
 * program shape requires the `programId` the slot shape does not carry, so
 * neither can absorb the other's body.
 */
export const SchedulePatchResponseSchema = z.union([
  ScheduleSlotActionResponseSchema,
  ScheduleProgramActionResponseSchema,
]);

export type ScheduleSlotActionResponse = z.infer<
  typeof ScheduleSlotActionResponseSchema
>;
export type ScheduleProgramActionResponse = z.infer<
  typeof ScheduleProgramActionResponseSchema
>;
export type SchedulePatchResponse = z.infer<typeof SchedulePatchResponseSchema>;

// ---------------------------------------------------------------------------
// PUT /api/schedule/settings — change the training days, re-lay the future.
// Mirrors webapp/app/api/schedule/settings/route.ts. Note the verb: PUT, not
// PATCH, and the route has no other method.
// ---------------------------------------------------------------------------

export const ScheduleSettingsUpdateRequestSchema = z.object({
  programId: z.string(),
  trainingDays: trainingDaysField,
  /**
   * Optional here, unlike POST: omitted means "from the caller's local today",
   * which is why this route reads `tz`. Sending one also moves the enrolment's
   * `startDate`.
   */
  startDate: z.string().optional(),
  ...writeTzFields,
});

export const ScheduleSettingsUpdateResponseSchema = z
  .object({
    message: z.string(),
    schedule: z
      .object({
        programId: z.string(),
        settings: ScheduleSettingsSchema.optional(),
        totalScheduledWorkouts: z.number().int().min(0),
        /** Sessions left where they were, and sessions re-laid. */
        pastWorkouts: z.number().int().min(0),
        futureWorkouts: z.number().int().min(0),
      })
      .passthrough(),
  })
  .passthrough();

export type ScheduleSettingsUpdateRequest = z.infer<
  typeof ScheduleSettingsUpdateRequestSchema
>;
export type ScheduleSettingsUpdateResponse = z.infer<
  typeof ScheduleSettingsUpdateResponseSchema
>;
