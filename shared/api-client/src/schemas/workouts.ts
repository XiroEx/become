import { z } from 'zod';
import { ActivityStreakResultSchema } from './streak';

// ===========================================================================
// WORKOUTS — the wire contract for /api/workouts and every sub-route.
//
// Re-aligned against the LIVE routes (NP-018). Every schema below names the
// route it mirrors; nothing here describes a response no route sends. What was
// here before did: a `WorkoutLogSchema` / `WorkoutsListResponseSchema` /
// `SaveWorkoutResponseSchema` trio keyed by `phaseIndex` / `workoutIndex`,
// which no handler has ever answered with and which disagreed with the web's
// own hand copy. They are GONE — the shapes the routes really return are
// `StoredWorkoutLogSchema`, `WorkoutHistoryResponseSchema` and
// `WorkoutSaveResponseSchema`.
//
// The live workout is the most-used screen in the app, so FIVE RULES travel
// with this domain and every one of them is asserted — by
// webapp/tests/unit/contract/np018Workouts.test.ts against the real handlers,
// and by shared/api-client/tests/workoutsSchemas.test.ts against the bodies
// those handlers recorded:
//
//   1. TIMED WORK IS SAVED IN `duration` / `distance`, NEVER IN `reps` /
//      `weight`. The live view types cardio into the same two boxes as reps and
//      weight (the labels above them say Duration and Distance), so the client
//      moves the values into the right FIELDS on the way out — otherwise a
//      treadmill logs 1600 "lbs" and a plank logs 45 "reps", and history, PR
//      detection and the track view all read the lie. See
//      webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx.
//   2. A SKIPPED SET IS SAVED AS COMPLETED WITH `reps: 0` AND `weight: 0`, not
//      omitted and not `completed: false` — the set happened in the session's
//      timeline, it just carried no work. PR detection ignores a set with
//      reps 0 (webapp/lib/exercisePRs.ts), which is what keeps a skip out of
//      the records while still recording it.
//   3. `phase` IS 1-BASED on the wire, on the save body and on every log the
//      server hands back. The same rule as ./programs — an array index leaking
//      out logs a session against the wrong phase.
//   4. `performedAt` IS SENT ONLY ON THE COMPLETING SAVE. An autosave omits it,
//      so it can never disturb the log's date; the completing save carries the
//      day the member picked for a session that crossed midnight.
//   5. `tz` IN A BODY IS A NUMBER — minutes WEST of UTC (see src/tz.ts,
//      NP-009). `POST /api/workouts` PERSISTS a reported offset as the member's
//      zone, so a fabricated `tz: 0` marks them UTC and fires their morning
//      push at ~3am local. Never send one as a stand-in for "unknown".
//
// Response schemas are `.passthrough()` on purpose: a shipped store build has
// to survive a server that grew a field. The webapp contract harness is what
// stops a RENAME from sliding through that tolerance.
// ===========================================================================

// ---------------------------------------------------------------------------
// Vocabulary shared by the save body and the stored log
// ---------------------------------------------------------------------------

/** `tz` is minutes WEST of UTC, a NUMBER — rule 5. `tzZone` is the IANA name. */
const writeTzFields = {
  tz: z.number().int().optional(),
  tzZone: z.string().optional(),
} as const;

/**
 * What an exercise ASKS you to log, saved with it.
 *
 * Mirrors `PrescriptionSchema` in webapp/models/UserProgress.ts. It exists
 * because a session rebuilt from its log used to have to guess what to show —
 * it guessed 'reps', and a loaded movement came back with no weight box.
 * `sets` is a count; `reps`, `duration` and `rest` are the PRESCRIPTION
 * STRINGS as written in the program ("8-10", "45s", "60s"), not measurements.
 */
export const WorkoutPrescriptionSchema = z
  .object({
    sets: z.number().optional(),
    reps: z.string().optional(),
    duration: z.string().optional(),
    rest: z.string().optional(),
    /** Free-form on purpose — see WorkoutDraftExerciseSchema.trackingType. */
    trackingType: z.string().optional(),
  })
  .passthrough();

export type WorkoutPrescription = z.infer<typeof WorkoutPrescriptionSchema>;

// ---------------------------------------------------------------------------
// POST /api/workouts — the save body, as a discriminated union.
//
// Mirrors `WorkoutSaveRequest` and `QuickSessionSaveRequest` in
// webapp/app/api/workouts/route.ts, and the body
// LiveWorkoutClient.tsx#saveWorkout builds for each.
//
// ONE union rather than one loose object with everything optional: a quick
// session has no `programId`/`phase`/`day` and a program day has no
// `sessionId`, so a single shape made both halves optional and let a device
// send a body the server answers `400 Missing required fields` to. The
// discriminator is `kind` — ABSENT means a program save (the web sends no
// `kind` at all on that path, and the route only branches on
// `kind === 'quick'`), so the program member declares it as an optional
// literal.
// ---------------------------------------------------------------------------

/**
 * One logged set.
 *
 * `reps`/`weight` are the strength pair; `duration` (seconds), `distance`
 * (meters) and `speed` (mph) are the timed/cardio fields — rule 1. A skipped
 * set arrives here as `{ completed: true, reps: 0, weight: 0 }` — rule 2.
 */
export const WorkoutSaveSetSchema = z
  .object({
    setNumber: z.number().int().optional(),
    reps: z.number().optional(),
    weight: z.number().optional(),
    duration: z.number().optional(),
    distance: z.number().optional(),
    speed: z.number().optional(),
    completed: z.boolean(),
  })
  .passthrough();

/**
 * One logged exercise.
 *
 * Keyed by `name` (+ slug when the catalog knows it) rather than by index:
 * build-as-you-go lets a member add an exercise mid-session, so the position
 * of an exercise in the session is not stable enough to name it by.
 *
 * `originalExerciseSlug` / `swappedFromName` are the swap trail — the member
 * replaced the prescribed lift, and `GET /api/workouts/last-performance`
 * matches on the ORIGINAL slug too, so the history of the lift they swapped
 * away from still counts as "last time you did this".
 *
 * `addedAdHoc` + `prescription` are what make a resume able to rebuild the
 * EXERCISE rather than just its sets.
 */
export const WorkoutSaveExerciseSchema = z
  .object({
    name: z.string(),
    exerciseSlug: z.string().optional(),
    sets: z.array(WorkoutSaveSetSchema),
    groupId: z.string().optional(),
    /** Superset / circuit / triset / giant_set / emom / amrap — see
     *  `ExerciseGroupTypeSchema` in ./exercises for the vocabulary. Kept a
     *  plain string here because a LOG is historical data: a shipped build
     *  must not refuse a whole workout because an old log carries a grouping
     *  word that has since been renamed. */
    groupType: z.string().optional(),
    groupLabel: z.string().optional(),
    groupRounds: z.number().optional(),
    addedAdHoc: z.boolean().optional(),
    prescription: WorkoutPrescriptionSchema.optional(),
    originalExerciseSlug: z.string().optional(),
    swappedFromName: z.string().optional(),
  })
  .passthrough();

/** The fields both halves of the save union carry. */
const saveCommonFields = {
  exercises: z.array(WorkoutSaveExerciseSchema),
  completed: z.boolean(),
  /** MINUTES, and only sent on the completing save. */
  duration: z.number().optional(),
  /** Seconds the session was actually open, snapshotted at save time. */
  activeSeconds: z.number().optional(),
  notes: z.string().optional(),
  /**
   * The day this session counts as — ISO instant or YYYY-MM-DD. Rule 4: sent
   * ONLY on the completing save (a member who crossed midnight mid-workout
   * choosing which calendar day it belongs to, or a backdated quick session).
   * The server clamps it to ±1 year and falls back to now.
   */
  performedAt: z.string().optional(),
  ...writeTzFields,
} as const;

/**
 * A PROGRAM day save. `phase` is 1-based (rule 3); `day` is the label
 * ("Day 1"), never an index.
 */
export const WorkoutProgramSaveRequestSchema = z
  .object({
    /** Absent on every save the web sends. Declared so the union can
     *  discriminate, and so a native client may be explicit. */
    kind: z.literal('program').optional(),
    programId: z.string(),
    phase: z.number(),
    day: z.string(),
    ...saveCommonFields,
    /** ISO date of the exact Schedule slot this log fulfils, so a completion
     *  resolves THAT slot and never a neighbouring same-dayLabel one. */
    scheduledDate: z.string().optional(),
    /**
     * Client-generated id for ONE attempt at this program day, sent on EVERY
     * save of it — the program-workout analogue of a quick session's
     * `sessionId`. The server matches it BEFORE its date windows, so a save
     * replayed from the offline queue (including after local midnight, where
     * no window matches any more) updates the same log instead of logging a
     * second completed workout and running the completion side effects twice.
     *
     * Optional: a client that sends none falls through to exactly the window
     * rules that have always applied. An `Idempotency-Key` header is honoured
     * as an equivalent, for queues that key writes at the transport level.
     */
    attemptId: z.string().optional(),
  })
  .passthrough();

/**
 * A QUICK (ad-hoc) session save — a workout attached to no program.
 *
 * `sessionId` is the client-generated id every save of the session shares: the
 * first inserts the log, the rest update it in place.
 */
export const WorkoutQuickSaveRequestSchema = z
  .object({
    kind: z.literal('quick'),
    sessionId: z.string(),
    title: z.string().optional(),
    /** True while the session is still carrying its generated placeholder
     *  name, so the client knows to ask for a real one on finish. */
    needsName: z.boolean().optional(),
    focus: z.string().optional(),
    ...saveCommonFields,
    /**
     * Carried over from a favorited session's draft when it is repeated (a
     * repeat gets a new sessionId, so without this the star is lost). Honoured
     * only on the FIRST save for a sessionId, and SOFT-gated: at the free cap
     * the session still saves and the response carries `favoriteDenied`.
     */
    favorite: z.boolean().optional(),
    /**
     * True when this save is genuine engagement (the live view opening, or an
     * autosave from it) as opposed to "Plan it" writing a placeholder nobody
     * has started. Gates `startedAt` server-side, which is what
     * GET /api/workouts/in-progress separates "mid-workout" from "planned" by.
     * Only ever `false` from the plan-only path; an edit to an existing plan
     * OMITS it, so it cannot resurrect the plan as started.
     */
    started: z.boolean().optional(),
  })
  .passthrough();

/** The body POST /api/workouts takes: a program day, or a quick session. */
export const WorkoutSaveRequestSchema = z.discriminatedUnion('kind', [
  WorkoutProgramSaveRequestSchema,
  WorkoutQuickSaveRequestSchema,
]);

export type WorkoutSaveSet = z.infer<typeof WorkoutSaveSetSchema>;
export type WorkoutSaveExercise = z.infer<typeof WorkoutSaveExerciseSchema>;
export type WorkoutProgramSaveRequest = z.infer<typeof WorkoutProgramSaveRequestSchema>;
export type WorkoutQuickSaveRequest = z.infer<typeof WorkoutQuickSaveRequestSchema>;
export type WorkoutSaveRequest = z.infer<typeof WorkoutSaveRequestSchema>;

// ---------------------------------------------------------------------------
// POST /api/workouts — the response
// ---------------------------------------------------------------------------

/**
 * A single PR the server's detection surfaced on this completion.
 *
 * `dimensions` is a subset of `maxWeight` / `maxReps` / `maxE1RM`
 * (webapp/lib/exercisePRs.ts). Left a plain string array so a fourth dimension
 * cannot make a shipped build drop the whole save response.
 */
export const NewPRSchema = z
  .object({
    exerciseSlug: z.string(),
    exerciseName: z.string(),
    dimensions: z.array(z.string()),
  })
  .passthrough();

/**
 * The streak block a completion carries — `recordStreakActivity`'s result, as
 * POST /api/workouts projects it.
 *
 * `ActivityStreakResultSchema` (./streak) is the same three fields POST
 * /api/mood and POST /api/weight send; the workout save adds the two the
 * finish screen renders.
 */
export const WorkoutStreakResultSchema = ActivityStreakResultSchema.extend({
  freezeUsed: z.boolean(),
  longestStreak: z.number().int().min(0),
});

/**
 * The canonical 403 gate body, as `webapp/lib/entitlements.ts#gateResponse`
 * sends it. Two surfaces in this domain use it: `favoriteDenied` on a quick
 * save (where the save SUCCEEDED and only the star was dropped) and the 403
 * from `PATCH /api/workouts/session` when a member at the cap stars a session.
 */
export const WorkoutGatePayloadSchema = z
  .object({
    /** The server owns the wording; the upgrade sheet renders it verbatim. */
    error: z.string().min(1),
    feature: z.string(),
    requiresTier: z.string(),
    limit: z.number().optional(),
    remaining: z.number().optional(),
    resetsAt: z.string().nullish(),
    window: z.string().optional(),
  })
  .passthrough();

/** The feature name a starred-session gate names. */
export const CUSTOM_SESSIONS_FEATURE = 'custom-sessions';

export const WorkoutSaveResponseSchema = z
  .object({
    message: z.string().optional(),
    completed: z.boolean().optional(),
    /** Program saves only. */
    programCompleted: z.boolean().optional(),
    /** Present only when `programCompleted` is true. */
    programName: z.string().optional(),
    /** Present only when the completion set at least one record. */
    newPRsAchieved: z.array(NewPRSchema).optional(),
    /** Present when the save recorded streak activity. */
    streak: WorkoutStreakResultSchema.optional(),
    /**
     * Quick saves only, and only when the star was soft-dropped at the free
     * cap. The save itself succeeded — this is an upsell hook, not an error.
     */
    favoriteDenied: WorkoutGatePayloadSchema.optional(),
  })
  .passthrough();

export type NewPR = z.infer<typeof NewPRSchema>;
export type WorkoutStreakResult = z.infer<typeof WorkoutStreakResultSchema>;
export type WorkoutGatePayload = z.infer<typeof WorkoutGatePayloadSchema>;
export type WorkoutSaveResponse = z.infer<typeof WorkoutSaveResponseSchema>;

// ---------------------------------------------------------------------------
// The STORED log, as the server hands it back.
//
// Mirrors `WorkoutLogSchema` / `ExerciseLogSchema` / `SetLogSchema` in
// webapp/models/UserProgress.ts. This is the raw `.lean()` sub-document —
// GET /api/workouts (`workout`) and GET /api/workouts/log (`log`) both answer
// with it untouched, so every measurement is `number | null`: the model
// DEFAULTS them to null rather than leaving them absent, and a schema that
// only allowed `number | undefined` refused every real log.
// ---------------------------------------------------------------------------

export const StoredWorkoutSetSchema = z
  .object({
    setNumber: z.number().optional(),
    reps: z.number().nullish(),
    weight: z.number().nullish(),
    duration: z.number().nullish(),
    distance: z.number().nullish(),
    speed: z.number().nullish(),
    completed: z.boolean().optional(),
  })
  .passthrough();

export const StoredWorkoutExerciseSchema = z
  .object({
    name: z.string(),
    exerciseSlug: z.string().optional(),
    sets: z.array(StoredWorkoutSetSchema).default([]),
    groupId: z.string().optional(),
    groupType: z.string().optional(),
    groupLabel: z.string().optional(),
    groupRounds: z.number().optional(),
    addedAdHoc: z.boolean().optional(),
    prescription: WorkoutPrescriptionSchema.optional(),
    originalExerciseSlug: z.string().optional(),
    swappedFromName: z.string().optional(),
  })
  .passthrough();

/** `kind` on a stored log. The model defaults it to 'program'. */
export const WorkoutLogKindSchema = z.enum(['program', 'quick']);
export const WORKOUT_LOG_KINDS = WorkoutLogKindSchema.options;

export const StoredWorkoutLogSchema = z
  .object({
    /** ISO instant. The day the session is FILED UNDER. */
    date: z.string(),
    kind: WorkoutLogKindSchema.optional(),
    /** Program logs only. */
    programId: z.string().optional(),
    /** 1-BASED — rule 3. Program logs only. */
    phase: z.number().optional(),
    /** The day LABEL ("Day 1"). Program logs only. */
    day: z.string().optional(),
    /** ISO day marker of the Schedule slot this log fulfils. */
    scheduledDate: z.string().optional(),
    /** Quick logs only. */
    sessionId: z.string().optional(),
    /** Program logs only — the client's id for ONE attempt at this day. */
    attemptId: z.string().optional(),
    title: z.string().optional(),
    needsName: z.boolean().optional(),
    focus: z.string().optional(),
    completed: z.boolean().optional(),
    skipped: z.boolean().optional(),
    favorite: z.boolean().optional(),
    /** MINUTES. */
    duration: z.number().nullish(),
    /**
     * ISO instant, and the "has this been engaged" signal: written only once
     * the live view is actually opened, so a "Plan it" placeholder has none.
     * GET /api/workouts/in-progress gates on it.
     */
    startedAt: z.string().optional(),
    activeSeconds: z.number().optional(),
    notes: z.string().optional(),
    exercises: z.array(StoredWorkoutExerciseSchema).default([]),
  })
  .passthrough();

export type StoredWorkoutSet = z.infer<typeof StoredWorkoutSetSchema>;
export type StoredWorkoutExercise = z.infer<typeof StoredWorkoutExerciseSchema>;
export type WorkoutLogKind = z.infer<typeof WorkoutLogKindSchema>;
export type StoredWorkoutLog = z.infer<typeof StoredWorkoutLogSchema>;

// ---------------------------------------------------------------------------
// GET /api/workouts?programId=&day=&includeHistory=&tz= — open/resume the day
// ---------------------------------------------------------------------------

/**
 * `exerciseHistory[exerciseName]` — the best completed set of that exercise
 * from a log BEFORE today. Keyed by exercise NAME, not slug: that is what the
 * live view has in hand for every row, including an ad-hoc one the catalog
 * does not know.
 */
export const ExerciseHistoryEntrySchema = z
  .object({
    weight: z.number(),
    reps: z.number(),
    duration: z.number().nullish(),
    /** ISO instant of the log it came from. */
    date: z.string(),
  })
  .passthrough();

/**
 * `exercisePRs[exerciseName]` — the persisted `maxWeight` record, projected by
 * `formatPRsForLiveWorkout`. Only sent when `includeHistory=true`; `{}`
 * otherwise (an empty object, never absent).
 */
export const ExercisePRSummarySchema = z
  .object({
    weight: z.number(),
    reps: z.number(),
  })
  .passthrough();

/**
 * An abandoned program log old enough to need a decision, surfaced so the
 * member can resolve it through POST /api/workouts/resolve-incomplete.
 *
 * Never a quick session (those live in their own sessionId namespace) and
 * never the log the rolling in-progress window already claims for silent
 * resume — otherwise the same log would surface both as "today's workout" and
 * as a stale prompt in one response.
 */
export const StaleIncompleteWorkoutSchema = z
  .object({
    day: z.string(),
    /** 1-BASED — rule 3. */
    phase: z.number().nullish(),
    date: z.string(),
    exercises: z.array(StoredWorkoutExerciseSchema).default([]),
    completedExerciseCount: z.number().int().min(0),
    totalExerciseCount: z.number().int().min(0),
  })
  .passthrough();

/**
 * GET /api/workouts.
 *
 * `workout` is null when the day has no log yet — that is a fresh start, not
 * an error. `isResume` is true only for an OPEN log: a completed one still
 * comes back (it is what tells the client today's attempt is done) with
 * `isResume: false`.
 *
 * `exercisePRs` and `staleIncomplete` are absent from the one early answer for
 * a member with no UserProgress document at all.
 */
export const WorkoutResumeResponseSchema = z
  .object({
    workout: StoredWorkoutLogSchema.nullable(),
    isResume: z.boolean(),
    exerciseHistory: z.record(z.string(), ExerciseHistoryEntrySchema).default({}),
    exercisePRs: z.record(z.string(), ExercisePRSummarySchema).optional(),
    staleIncomplete: StaleIncompleteWorkoutSchema.nullish(),
  })
  .passthrough();

/** DELETE /api/workouts?programId=&day=&tz= — discard the OPEN log for a day.
 *  404s when there is no in-progress log inside the rolling window. */
export const WorkoutDiscardResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough();

export type ExerciseHistoryEntry = z.infer<typeof ExerciseHistoryEntrySchema>;
export type ExercisePRSummary = z.infer<typeof ExercisePRSummarySchema>;
export type StaleIncompleteWorkout = z.infer<typeof StaleIncompleteWorkoutSchema>;
export type WorkoutResumeResponse = z.infer<typeof WorkoutResumeResponseSchema>;
export type WorkoutDiscardResponse = z.infer<typeof WorkoutDiscardResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/workouts/in-progress?tz= — "are you mid-workout right now?"
// ---------------------------------------------------------------------------

/**
 * The workout the member is genuinely in the middle of.
 *
 * Every optional-on-the-model field is answered as `null` rather than omitted,
 * so a client reads one shape for both kinds. `startedAt` here is the LOG's
 * `date`, not its `startedAt` column.
 */
export const InProgressWorkoutSchema = z
  .object({
    kind: WorkoutLogKindSchema,
    programId: z.string().nullable(),
    day: z.string().nullable(),
    /** 1-BASED — rule 3. */
    phase: z.number().nullable(),
    sessionId: z.string().nullable(),
    title: z.string().nullable(),
    exerciseCount: z.number().int().min(0),
    startedAt: z.string(),
  })
  .passthrough();

/**
 * A quick session PLANNED for the caller's local today and never started.
 *
 * Deliberately NOT `workout`: it is real information ("you have this
 * scheduled") but wording it as "get back into the workout" for a session
 * nobody opened is the bug this field exists to fix.
 */
export const PlannedQuickSessionSummarySchema = z
  .object({
    kind: z.literal('quick'),
    sessionId: z.string(),
    title: z.string().nullable(),
    exerciseCount: z.number().int().min(0),
  })
  .passthrough();

export const WorkoutInProgressResponseSchema = z
  .object({
    workout: InProgressWorkoutSchema.nullable(),
    planned: PlannedQuickSessionSummarySchema.nullable(),
  })
  .passthrough();

export type InProgressWorkout = z.infer<typeof InProgressWorkoutSchema>;
export type PlannedQuickSessionSummary = z.infer<typeof PlannedQuickSessionSummarySchema>;
export type WorkoutInProgressResponse = z.infer<typeof WorkoutInProgressResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/workouts/last-performance?slugs=a,b,c — "what did I do last time?"
// ---------------------------------------------------------------------------

/**
 * The LAST COMPLETED set of one exercise, from the most recent log containing
 * it. Matched by `exerciseSlug`, then by the swap-tracked
 * `originalExerciseSlug`, then by a normalisation of the name.
 *
 * Measurements are `number | null` for the same reason as the stored log: the
 * model defaults them.
 */
export const LastPerformanceEntrySchema = z
  .object({
    reps: z.number().nullish(),
    weight: z.number().nullish(),
    speed: z.number().nullish(),
    duration: z.number().nullish(),
    distance: z.number().nullish(),
    /** ISO instant of the log it came from. */
    date: z.string(),
    /** Absent for a quick session. */
    programId: z.string().optional(),
  })
  .passthrough();

/**
 * Keyed by the slug that was ASKED for (so a swap-matched hit comes back under
 * the requested slug), `null` for a slug with no history. `prs` travels with
 * the same request because a quick session has no program to hang a history
 * call off — without it, real lifting could never say "beat your PR". It is
 * absent from the empty answer for a request with no slugs.
 */
export const LastPerformanceResponseSchema = z
  .object({
    performances: z.record(z.string(), LastPerformanceEntrySchema.nullable()).default({}),
    prs: z.record(z.string(), ExercisePRSummarySchema).optional(),
  })
  .passthrough();

export type LastPerformanceEntry = z.infer<typeof LastPerformanceEntrySchema>;
export type LastPerformanceResponse = z.infer<typeof LastPerformanceResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/workouts/logs — TWO responses, chosen by the query string.
//
//   ?programId=…   one program's logs, trimmed to what the detail page needs
//   (no programId)  the full session history across program + quick sessions
// ---------------------------------------------------------------------------

/** One row of the `?programId=` answer. Builds the completedDays set. */
export const ProgramWorkoutLogSchema = z
  .object({
    day: z.string().optional(),
    /** 1-BASED — rule 3. */
    phase: z.number().optional(),
    completed: z.boolean(),
    date: z.string(),
    duration: z.number().nullish(),
  })
  .passthrough();

export const ProgramWorkoutLogsResponseSchema = z
  .object({
    logs: z.array(ProgramWorkoutLogSchema).default([]),
  })
  .passthrough();

/**
 * A saved exercise, DraftExercise-shaped, so a session can be REOPENED rather
 * than regenerated. Returned by `?withExercises=true` (quick sessions only)
 * and by GET /api/workouts/planned.
 *
 * Note the types: `sets` is a COUNT and `reps`/`duration`/`rest` are
 * PRESCRIPTION STRINGS — this is what to do next time, not what was done.
 * `equipment` / `laterality` / `movementPatterns` come from the exercise
 * CATALOG, because a log only ever kept the slug and a rebuilt dumbbell
 * exercise otherwise loses its per-bell weight convention.
 */
export const WorkoutDraftExerciseSchema = z
  .object({
    exerciseSlug: z.string(),
    name: z.string(),
    /**
     * What this exercise asks you to log. A plain string, not an enum, so a
     * catalog that grows a tracking type cannot make a shipped store build
     * drop a whole session — the same rule ./programs states.
     */
    trackingType: z.string(),
    equipment: z.array(z.string()).optional(),
    laterality: z.string().optional(),
    movementPatterns: z.array(z.string()).optional(),
    sets: z.number(),
    reps: z.string(),
    duration: z.string().optional(),
    rest: z.string().optional(),
    groupId: z.string().optional(),
    groupType: z.string().optional(),
    groupLabel: z.string().optional(),
    groupRounds: z.number().optional(),
    addedAdHoc: z.boolean().optional(),
  })
  .passthrough();

/**
 * One session in the history answer.
 *
 * `title` is always present: a program day falls back to "<program> · Day 1"
 * and a quick session to "Quick Session", so nothing renders blank. `skipped`
 * and `favorite` are always booleans (the route coerces them). `exercises` is
 * present only for a quick session read with `?withExercises=true`.
 */
export const WorkoutHistoryEntrySchema = z
  .object({
    kind: WorkoutLogKindSchema,
    title: z.string(),
    focus: z.string().optional(),
    programId: z.string().optional(),
    programName: z.string().optional(),
    day: z.string().optional(),
    /** 1-BASED — rule 3. */
    phase: z.number().optional(),
    sessionId: z.string().optional(),
    completed: z.boolean(),
    skipped: z.boolean(),
    favorite: z.boolean(),
    date: z.string(),
    duration: z.number().nullish(),
    exerciseCount: z.number().int().min(0),
    completedSets: z.number().int().min(0),
    exercises: z.array(WorkoutDraftExerciseSchema).optional(),
  })
  .passthrough();

/**
 * The history answer. Newest first.
 *
 * `favoriteSessionOrder` is the member's manual drag order for STARRED quick
 * sessions in the Sessions list — every other surface ignores it and keeps the
 * date-desc sort above.
 */
export const WorkoutHistoryResponseSchema = z
  .object({
    logs: z.array(WorkoutHistoryEntrySchema).default([]),
    favoriteSessionOrder: z.array(z.string()).default([]),
  })
  .passthrough();

export type ProgramWorkoutLog = z.infer<typeof ProgramWorkoutLogSchema>;
export type ProgramWorkoutLogsResponse = z.infer<typeof ProgramWorkoutLogsResponseSchema>;
export type WorkoutDraftExercise = z.infer<typeof WorkoutDraftExerciseSchema>;
export type WorkoutHistoryEntry = z.infer<typeof WorkoutHistoryEntrySchema>;
export type WorkoutHistoryResponse = z.infer<typeof WorkoutHistoryResponseSchema>;

// ---------------------------------------------------------------------------
// PATCH /api/workouts/logs — correct the measurements in ONE completed log
// ---------------------------------------------------------------------------

/**
 * Which log to correct. A discriminated union because the two kinds are
 * located differently: a quick session by its stable `sessionId` (with `date`
 * as the fallback for a log written before ids existed), a program day by its
 * immutable program/day/date tuple. Ownership is the authenticated
 * UserProgress document — there is no id to guess at.
 */
export const QuickWorkoutLogLocatorSchema = z
  .object({
    kind: z.literal('quick'),
    sessionId: z.string().optional(),
    /** ISO instant, matched exactly. Required when `sessionId` is absent. */
    date: z.string().optional(),
  })
  .passthrough();

export const ProgramWorkoutLogLocatorSchema = z
  .object({
    kind: z.literal('program'),
    programId: z.string(),
    day: z.string(),
    /** ISO instant, matched exactly. */
    date: z.string(),
  })
  .passthrough();

export const WorkoutLogLocatorSchema = z.discriminatedUnion('kind', [
  QuickWorkoutLogLocatorSchema,
  ProgramWorkoutLogLocatorSchema,
]);

/** A corrected set. `setNumber` is required — the row is being rewritten. */
export const WorkoutLogCorrectionSetSchema = z
  .object({
    setNumber: z.number().int(),
    reps: z.number().optional(),
    weight: z.number().optional(),
    duration: z.number().optional(),
    distance: z.number().optional(),
    speed: z.number().optional(),
    completed: z.boolean().optional(),
  })
  .passthrough();

/**
 * A corrected exercise. Identity is FIXED: the server refuses a correction
 * whose slug (or, for a catalog-less exercise, name) does not match the saved
 * one, and refuses any change to the exercise COUNT — this path corrects
 * measurements, it does not turn a workout into a different workout.
 */
export const WorkoutLogCorrectionExerciseSchema = z
  .object({
    name: z.string(),
    exerciseSlug: z.string().optional(),
    sets: z.array(WorkoutLogCorrectionSetSchema),
  })
  .passthrough();

export const WorkoutLogCorrectionSchema = z
  .object({
    /** Quick sessions only — renaming a program day is refused with a 400. */
    title: z.string().optional(),
    /** MINUTES. */
    duration: z.number().optional(),
    notes: z.string().optional(),
    exercises: z.array(WorkoutLogCorrectionExerciseSchema),
  })
  .passthrough();

export const WorkoutLogCorrectionRequestSchema = z
  .object({
    locator: WorkoutLogLocatorSchema,
    correction: WorkoutLogCorrectionSchema,
  })
  .passthrough();

/**
 * `recalculatedPRs` is the number of exercises the member now holds a record
 * for. Every PR is replayed from scratch on a correction, because an
 * incremental update cannot REMOVE a maximum that a lowered set no longer
 * justifies.
 */
export const WorkoutLogCorrectionResponseSchema = z
  .object({
    success: z.boolean(),
    recalculatedPRs: z.number().int().min(0),
  })
  .passthrough();

export type QuickWorkoutLogLocator = z.infer<typeof QuickWorkoutLogLocatorSchema>;
export type ProgramWorkoutLogLocator = z.infer<typeof ProgramWorkoutLogLocatorSchema>;
export type WorkoutLogLocator = z.infer<typeof WorkoutLogLocatorSchema>;
export type WorkoutLogCorrectionSet = z.infer<typeof WorkoutLogCorrectionSetSchema>;
export type WorkoutLogCorrectionExercise = z.infer<typeof WorkoutLogCorrectionExerciseSchema>;
export type WorkoutLogCorrection = z.infer<typeof WorkoutLogCorrectionSchema>;
export type WorkoutLogCorrectionRequest = z.infer<typeof WorkoutLogCorrectionRequestSchema>;
export type WorkoutLogCorrectionResponse = z.infer<typeof WorkoutLogCorrectionResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/workouts/log?programId=&date=YYYY-MM-DD — one past program log
// ---------------------------------------------------------------------------

/**
 * The stored log for a single day, plus the history that predates it — the
 * same `exerciseHistory` projection GET /api/workouts sends, computed relative
 * to THAT day rather than to today.
 *
 * `date` is matched against the UTC calendar day.
 */
export const PastWorkoutLogResponseSchema = z
  .object({
    log: StoredWorkoutLogSchema.nullable(),
    exerciseHistory: z.record(z.string(), ExerciseHistoryEntrySchema).default({}),
  })
  .passthrough();

export type PastWorkoutLogResponse = z.infer<typeof PastWorkoutLogResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/workouts/planned — quick sessions planned for a FUTURE day
// ---------------------------------------------------------------------------

/**
 * A planned quick session, rebuilt DraftSession-shaped so the client can stash
 * it and start it under the SAME sessionId — finishing it then CONSUMES the
 * plan instead of leaving an orphan beside a new log.
 *
 * Strictly future-dated: a plan for today is `planned` on
 * GET /api/workouts/in-progress instead.
 */
export const PlannedQuickSessionSchema = z
  .object({
    sessionId: z.string(),
    /** Falls back to "Planned session", so nothing renders blank. */
    title: z.string(),
    needsName: z.boolean().optional(),
    focus: z.string().optional(),
    date: z.string(),
    exerciseCount: z.number().int().min(0),
    exercises: z.array(WorkoutDraftExerciseSchema).default([]),
  })
  .passthrough();

export const PlannedWorkoutsResponseSchema = z
  .object({
    planned: z.array(PlannedQuickSessionSchema).default([]),
  })
  .passthrough();

export type PlannedQuickSession = z.infer<typeof PlannedQuickSessionSchema>;
export type PlannedWorkoutsResponse = z.infer<typeof PlannedWorkoutsResponseSchema>;

// ---------------------------------------------------------------------------
// /api/workouts/session — one quick session: read, manage, delete
// ---------------------------------------------------------------------------

/**
 * A logged set as the session read hands it back: every measurement
 * NORMALISED to `number | null`, never absent, so the resumed rows line up
 * whatever the log happened to store.
 */
export const QuickSessionSetSchema = z
  .object({
    setNumber: z.number().optional(),
    reps: z.number().nullable(),
    weight: z.number().nullable(),
    duration: z.number().nullable(),
    /** Cardio is a distance and a speed, not a load — rule 1. */
    distance: z.number().nullable(),
    speed: z.number().nullable(),
    completed: z.boolean(),
  })
  .passthrough();

/**
 * A session exercise with its LOGGED sets (not a prescription) plus the
 * grouping and prescription needed to rebuild it — a superset dropped here
 * comes back as two unrelated exercises.
 */
export const QuickSessionExerciseSchema = z
  .object({
    name: z.string(),
    exerciseSlug: z.string(),
    trackingType: z.string(),
    equipment: z.array(z.string()).optional(),
    laterality: z.string().optional(),
    movementPatterns: z.array(z.string()).optional(),
    sets: z.array(QuickSessionSetSchema).default([]),
    groupId: z.string().optional(),
    groupType: z.string().optional(),
    groupLabel: z.string().optional(),
    groupRounds: z.number().optional(),
    groupRest: z.string().optional(),
    addedAdHoc: z.boolean().optional(),
    prescription: WorkoutPrescriptionSchema.optional(),
  })
  .passthrough();

export const QuickSessionSchema = z
  .object({
    sessionId: z.string().optional(),
    /** Falls back to "Quick Session". */
    title: z.string(),
    needsName: z.boolean().optional(),
    focus: z.string().optional(),
    date: z.string(),
    completed: z.boolean(),
    duration: z.number().nullish(),
    exercises: z.array(QuickSessionExerciseSchema).default([]),
  })
  .passthrough();

/** GET /api/workouts/session?id=. A 404 answers `{ session: null }` — the same
 *  shape, so a client has one branch rather than two. */
export const QuickSessionResponseSchema = z
  .object({
    session: QuickSessionSchema.nullable(),
  })
  .passthrough();

/**
 * PATCH /api/workouts/session — manage one quick session. At least one of
 * `date` / `skipped` / `title` / `favorite` is required; they may be sent
 * together.
 *
 * `date` re-dates the session (YYYY-MM-DD or ISO) and deliberately does NOT
 * stamp `startedAt`: dragging a never-started plan onto today must not make it
 * look in progress. `favorite: true` is the one gated field — a STARRED quick
 * session is what "custom session" means for the free allowance — and a member
 * at the cap gets the canonical 403 (`WorkoutGatePayloadSchema`). Unstarring
 * is always free, so there is always a way back under the cap.
 */
export const QuickSessionPatchRequestSchema = z
  .object({
    id: z.string(),
    date: z.string().optional(),
    skipped: z.boolean().optional(),
    title: z.string().optional(),
    favorite: z.boolean().optional(),
    ...writeTzFields,
  })
  .passthrough();

export const QuickSessionPatchResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough();

/** DELETE /api/workouts/session?id= — remove the log. Idempotent. */
export const QuickSessionDeleteResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough();

export type QuickSessionSet = z.infer<typeof QuickSessionSetSchema>;
export type QuickSessionExercise = z.infer<typeof QuickSessionExerciseSchema>;
export type QuickSession = z.infer<typeof QuickSessionSchema>;
export type QuickSessionResponse = z.infer<typeof QuickSessionResponseSchema>;
export type QuickSessionPatchRequest = z.infer<typeof QuickSessionPatchRequestSchema>;
export type QuickSessionPatchResponse = z.infer<typeof QuickSessionPatchResponseSchema>;
export type QuickSessionDeleteResponse = z.infer<typeof QuickSessionDeleteResponseSchema>;

// ---------------------------------------------------------------------------
// PATCH /api/workouts/favorite-order — the Sessions list drag order
// ---------------------------------------------------------------------------

/**
 * `order` is the FULL new order of starred quick-session ids, not a delta. The
 * server trims, drops blanks, de-duplicates (keeping the first occurrence) and
 * refuses more than 200 entries, then answers with what it stored — so the
 * client renders the normalised list rather than its own optimistic one.
 */
export const FavoriteOrderRequestSchema = z
  .object({
    order: z.array(z.string()),
  })
  .passthrough();

export const FavoriteOrderResponseSchema = z
  .object({
    success: z.boolean(),
    favoriteSessionOrder: z.array(z.string()).default([]),
  })
  .passthrough();

export type FavoriteOrderRequest = z.infer<typeof FavoriteOrderRequestSchema>;
export type FavoriteOrderResponse = z.infer<typeof FavoriteOrderResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/workouts/resolve-incomplete — settle an abandoned program day
// ---------------------------------------------------------------------------

/**
 * What to do with the stale log GET /api/workouts surfaced as
 * `staleIncomplete`:
 *
 *   continue — re-date it to now, so it becomes today's in-progress workout
 *   restart  — delete it and start the same day fresh
 *   count    — complete it as it stands (every set filled), advance the day,
 *              mark the schedule slot completed and record streak activity
 *   skip     — delete it and advance the day WITHOUT counting it; the slot
 *              becomes 'skipped'
 */
export const ResolveIncompleteActionSchema = z.enum([
  'continue',
  'restart',
  'count',
  'skip',
]);

export const RESOLVE_INCOMPLETE_ACTIONS = ResolveIncompleteActionSchema.options;

export const ResolveIncompleteRequestSchema = z
  .object({
    programId: z.string(),
    day: z.string(),
    /** 1-BASED — rule 3. */
    phase: z.number(),
    action: ResolveIncompleteActionSchema,
    ...writeTzFields,
  })
  .passthrough();

/**
 * `nextDay` / `nextPhase` are the day the enrolment now points at, and are
 * BOTH null for `continue` and `restart` — those two resolve the log without
 * moving the program on.
 */
export const ResolveIncompleteResponseSchema = z
  .object({
    action: ResolveIncompleteActionSchema,
    nextDay: z.string().nullable(),
    /** 1-BASED — rule 3. */
    nextPhase: z.number().nullable(),
  })
  .passthrough();

export type ResolveIncompleteAction = z.infer<typeof ResolveIncompleteActionSchema>;
export type ResolveIncompleteRequest = z.infer<typeof ResolveIncompleteRequestSchema>;
export type ResolveIncompleteResponse = z.infer<typeof ResolveIncompleteResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/workouts/exercise-suggestions?slugs=a,b,c
// ---------------------------------------------------------------------------

/**
 * A nudge shown AT the exercise it belongs to, inside the session, at the
 * moment of doing it — "add 5 lb to lat pulldown" belongs there and not on the
 * dashboard.
 *
 * Mirrors `Suggestion` in webapp/lib/suggestions/types.ts. `severity`,
 * `placement` and `source` are plain strings rather than enums: the engine
 * grows sources, and a build that shipped before a new severity existed must
 * render the card rather than drop the whole response. Every suggestion this
 * route answers with carries `placement: 'exercise'` and a
 * `sourceData.exerciseSlug` from the requested set.
 */
export const ExerciseSuggestionSchema = z
  .object({
    id: z.string(),
    severity: z.string(),
    title: z.string(),
    body: z.string(),
    placement: z.string().optional(),
    primaryAction: z
      .object({
        label: z.string(),
        href: z.string(),
      })
      .passthrough()
      .optional(),
    dismissible: z.boolean(),
    /** Days a dismissal lasts. Absent means dismissed for good. */
    cooldownDays: z.number().optional(),
    source: z.string(),
    sourceData: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const ExerciseSuggestionsResponseSchema = z
  .object({
    suggestions: z.array(ExerciseSuggestionSchema).default([]),
  })
  .passthrough();

export type ExerciseSuggestion = z.infer<typeof ExerciseSuggestionSchema>;
export type ExerciseSuggestionsResponse = z.infer<typeof ExerciseSuggestionsResponseSchema>;

// ---------------------------------------------------------------------------
// WHAT USED TO BE HERE, AND WHY IT IS NOT
//
// `WorkoutLogSchema`, `WorkoutsListResponseSchema` and
// `SaveWorkoutResponseSchema` described a `{ workouts: [ { programId,
// phaseIndex, workoutIndex, date, exercises, completed } ] }` API that no
// handler has ever answered with: there is no `/api/workouts` list route, no
// response carries a `workouts` key, and `phaseIndex`/`workoutIndex` are
// client-side details the server never sees (it addresses a session by 1-based
// `phase` + `day` LABEL — rule 3). They also disagreed with the web's own hand
// copy in webapp/lib/sharedApiTypes.ts, which used `logs`/`day`/`phase`.
//
// A speculative schema is worse than no schema: it reads like a contract and
// binds nothing. `shared/api-client/tests/workoutsSchemas.test.ts` fails if any
// of the three names comes back.
// ---------------------------------------------------------------------------
