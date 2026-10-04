import { z } from 'zod';

// ===========================================================================
// PROGRAMS — the wire contract for /api/programs/*
//
// Re-aligned against the LIVE routes (NP-019). Every schema below names the
// route it mirrors; nothing here describes a response no route sends.
//
// Three rules travel with this domain and are asserted by
// webapp/tests/unit/contract/np019Programs.test.ts:
//
//   1. `phase` numbers are 1-BASED on the wire. GET /api/programs/current-workout
//      answers `phase: 1` for the first phase, and POST /api/workouts expects
//      the same. The array index is a client-side detail; it never leaves.
//   2. Programs are addressed by `program_id` — the human slug
//      ("strength-foundation", "custom-a1b2c3-my-split-m0k1"), NOT the Mongo
//      `_id`. Every route param, every `programId` body field, is that slug.
//   3. `activePrograms[].status` values are the SERVER's:
//      active | in-progress | paused | completed (models/UserProgress.ts).
//      There is no 'abandoned' — abandoning REMOVES the entry.
//
// Response schemas are `.passthrough()` on purpose: a shipped store build has
// to survive a server that grew a field. The webapp contract harness is what
// stops a rename from sliding through that tolerance.
// ===========================================================================

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Exercise grouping, as stored and validated by webapp/models/Program.ts.
 * Note the underscore in `giant_set` — that is the wire value.
 */
export const ExerciseGroupTypeSchema = z.enum([
  'superset',
  'circuit',
  'triset',
  'giant_set',
  'emom',
  'amrap',
]);

export const EXERCISE_GROUP_TYPES = ExerciseGroupTypeSchema.options;

/**
 * The canonical `trackingType` values webapp/models/Exercise.ts enforces.
 *
 * Exported for narrowing, but the exercise field itself is a plain string:
 * the native live screen resolves it by substring (expo/lib/live/
 * trackingInputs.ts) precisely so a catalog that grows a new tracking type
 * cannot make a shipped build drop the whole workout.
 */
export const TrackingTypeSchema = z.enum([
  'reps_weight',
  'reps_bodyweight',
  'time',
  'time_distance',
  'intervals',
  'reps_only',
  'none',
]);

export const TRACKING_TYPES = TrackingTypeSchema.options;

/** Per-program coaching role override (webapp/models/Program.ts). */
export const ExerciseRoleSchema = z.enum([
  'compound',
  'secondary',
  'accessory',
]);

/** `activePrograms[].status` — the server's four values, no more. */
export const ActiveProgramStatusSchema = z.enum([
  'active',
  'in-progress',
  'paused',
  'completed',
]);

export const ACTIVE_PROGRAM_STATUSES = ActiveProgramStatusSchema.options;

/** Onboarding vocabulary shared with GET /api/programs/recommend. */
export const FitnessGoalSchema = z.enum([
  'lose_weight',
  'gain_muscle',
  'maintain',
  'improve_performance',
  'general_health',
]);

export const ExperienceLevelSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
]);

export const EquipmentAccessSchema = z.enum([
  'none',
  'dumbbells',
  'barbell',
  'cables',
  'full_gym',
]);

export type ExerciseGroupType = z.infer<typeof ExerciseGroupTypeSchema>;
export type TrackingType = z.infer<typeof TrackingTypeSchema>;
export type ExerciseRole = z.infer<typeof ExerciseRoleSchema>;
export type ActiveProgramStatus = z.infer<typeof ActiveProgramStatusSchema>;
export type FitnessGoal = z.infer<typeof FitnessGoalSchema>;
export type ExperienceLevel = z.infer<typeof ExperienceLevelSchema>;
export type EquipmentAccess = z.infer<typeof EquipmentAccessSchema>;

// ---------------------------------------------------------------------------
// THE HYDRATED PROGRAM EXERCISE — typed ONCE, used everywhere.
//
// webapp/lib/hydrateExercises.ts resolves `exerciseSlug` against the exercises
// collection and merges the catalog's fields onto the program's own
// prescription. Both GET /api/programs/[programId] and
// GET /api/programs/current-workout return exercises in exactly this shape, so
// there is one schema for both — the native live screen used to hand-cast
// `groupId`/`groupType`/`trackingType` off an untyped object because these
// fields only ever rode through `.passthrough()`.
//
// The prescription half is the program's (models/Program.ts IProgramExercise);
// the catalog half is hydrated (models/Exercise.ts) and is absent for a slug
// the catalog does not own.
// ---------------------------------------------------------------------------

/** Admin-set framing for the demo video (webapp/lib/videoFraming.ts). */
export const ExerciseVideoFramingSchema = z
  .object({
    fit: z.enum(['contain', 'cover']).optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
    zoom: z.number().optional(),
  })
  .passthrough();

/** Demo-video in/out points, in seconds. */
export const ExerciseVideoTrimSchema = z
  .object({
    start: z.number().optional(),
    end: z.number().optional(),
  })
  .passthrough();

export const ProgramExerciseSchema = z
  .object({
    // --- identity -----------------------------------------------------
    /** The link to the catalog. `__protocol__*` slugs are routing markers. */
    exerciseSlug: z.string().optional(),
    name: z.string().optional(),
    /** Stored per-program override of the catalog category. */
    category: z.string().optional(),
    /** Hydrated: the catalog `category`, re-keyed as `type` for the client. */
    type: z.string().optional(),

    // --- the prescription (what this exercise DOES here) --------------
    sets: z.number().optional(),
    /** Free text: "5", "8-12", "AMRAP". */
    reps: z.string().optional(),
    /** Free text: "90 sec", "2-3 min". */
    rest: z.string().optional(),
    /** Free text: "3-1-1-0" (eccentric-pause-concentric-pause). */
    tempo: z.string().optional(),
    rpe: z.number().optional(),
    percentOf1RM: z.number().optional(),
    /** Free text for timed work: "30 sec". */
    duration: z.string().optional(),
    role: ExerciseRoleSchema.optional(),
    /** Coach notes for this exercise in this workout. */
    details: z.string().optional(),
    tip: z.string().optional(),

    // --- grouping (supersets, circuits, EMOMs) ------------------------
    /** Exercises sharing a groupId are performed as one block. */
    groupId: z.string().optional(),
    groupType: ExerciseGroupTypeSchema.optional(),
    groupLabel: z.string().optional(),
    /** Free text rest between rounds of the group. */
    groupRest: z.string().optional(),
    groupRounds: z.number().optional(),

    // --- hydrated from the exercise catalog ---------------------------
    /** Selects the per-set inputs the live screen renders. */
    trackingType: z.string().optional(),
    difficulty: z.string().optional(),
    laterality: z.string().optional(),
    primaryMuscles: z.array(z.string()).optional(),
    equipment: z.array(z.string()).optional(),
    movementPatterns: z.array(z.string()).optional(),
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    videoWidth: z.number().optional(),
    videoHeight: z.number().optional(),
    videoFraming: ExerciseVideoFramingSchema.optional(),
    videoTrim: ExerciseVideoTrimSchema.optional(),
  })
  .passthrough();

/**
 * GET /api/programs/current-workout returns the SAME hydrated exercise as the
 * program detail route — both go through hydrateExercises. Kept as a named
 * alias so the current-workout call site reads for what it is.
 */
export const CurrentWorkoutExerciseSchema = ProgramExerciseSchema;

export type ProgramExercise = z.infer<typeof ProgramExerciseSchema>;
export type CurrentWorkoutExercise = ProgramExercise;
export type ExerciseVideoFraming = z.infer<typeof ExerciseVideoFramingSchema>;
export type ExerciseVideoTrim = z.infer<typeof ExerciseVideoTrimSchema>;

// ---------------------------------------------------------------------------
// Program documents: detail, catalog item, custom, saved.
// ---------------------------------------------------------------------------

export const ProgramWorkoutSchema = z
  .object({
    day: z.string().optional(),
    title: z.string(),
    exercises: z.array(ProgramExerciseSchema).default([]),
  })
  .passthrough();

/**
 * `workouts` defaults to [] because GET /api/programs/search projects
 * `phases.phase/weeks/focus` only — a phase with no workouts is a real,
 * expected shape there.
 */
export const ProgramPhaseSchema = z
  .object({
    phase: z.string(),
    weeks: z.string().optional(),
    focus: z.string().optional(),
    workouts: z.array(ProgramWorkoutSchema).default([]),
  })
  .passthrough();

/**
 * Every field webapp/models/Program.ts persists, as it comes off the wire.
 * Declared as a plain shape so the custom-program and saved-program responses
 * can be built from the same keys instead of drifting from them.
 */
const programDocumentShape = {
  _id: z.string().optional(),
  __v: z.number().optional(),
  /** The address. Rule 2 above. */
  program_id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  duration_weeks: z.number().optional(),
  training_days_per_week: z.number().optional(),
  goal: z.string().optional(),
  /** "Beginner" … "Intermediate to Advanced" — display copy, not an id. */
  target_user: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  phases: z.array(ProgramPhaseSchema).default([]),
  isCustom: z.boolean().optional(),
  /** Owner id for a custom program; absent on the shared catalog. */
  createdBy: z.string().nullable().optional(),
  /** Members a trainer/admin shared this custom program with. */
  sharedWith: z.array(z.string()).optional(),
  coverImage: z.string().nullable().optional(),
  coverParallax: z.boolean().optional(),
  coverZoom: z.number().optional(),
  coverPositionX: z.number().optional(),
  coverPositionY: z.number().optional(),
} as const;

/** GET /api/programs/[programId] — the hydrated full program. */
export const ProgramDetailResponseSchema = z
  .object(programDocumentShape)
  .passthrough();

/**
 * A list/search row: the SAME document, but `phases` is a projection and may
 * be absent or carry phase headers with no `workouts` at all (see
 * GET /api/programs/search). A browse card must never assume the sessions are
 * there — that is the one difference from the detail response, and it is why
 * this is its own schema rather than an alias of it.
 */
export const ProgramCatalogItemSchema = z
  .object({
    ...programDocumentShape,
    phases: z.array(ProgramPhaseSchema).optional(),
  })
  .passthrough();

/** GET /api/programs — a BARE ARRAY of programs, fully hydrated. */
export const ProgramListResponseSchema = z.array(ProgramCatalogItemSchema);

export type ProgramWorkout = z.infer<typeof ProgramWorkoutSchema>;
export type ProgramPhase = z.infer<typeof ProgramPhaseSchema>;
export type ProgramDetailResponse = z.infer<typeof ProgramDetailResponseSchema>;
export type ProgramCatalogItem = z.infer<typeof ProgramCatalogItemSchema>;
export type ProgramListResponse = z.infer<typeof ProgramListResponseSchema>;

/** Path param for the program-scoped routes. */
export const ProgramIdParamSchema = z.object({
  programId: z.string(),
});

export type ProgramIdParam = z.infer<typeof ProgramIdParamSchema>;

// ---------------------------------------------------------------------------
// GET /api/programs/search — catalog search + filters + pagination.
// Mirrors webapp/app/api/programs/search/route.ts.
// ---------------------------------------------------------------------------

/**
 * The query the client builds. Every value is serialised into the query
 * string; `tag` repeats (`?tag=a&tag=b`), which is why it is an array here.
 */
export const ProgramSearchQuerySchema = z.object({
  q: z.string().optional(),
  tag: z.array(z.string()).optional(),
  /** `target_user`, matched exactly. */
  level: z.string().optional(),
  minWeeks: z.number().int().min(0).optional(),
  maxWeeks: z.number().int().min(0).optional(),
  /** `training_days_per_week`, matched exactly. */
  days: z.number().int().min(1).max(7).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
});

export const ProgramSearchPaginationSchema = z
  .object({
    page: z.number().optional(),
    limit: z.number().optional(),
    total: z.number().optional(),
    totalPages: z.number().optional(),
    hasMore: z.boolean().optional(),
  })
  .passthrough();

export const ProgramSearchResponseSchema = z
  .object({
    programs: z.array(ProgramCatalogItemSchema),
    pagination: ProgramSearchPaginationSchema.optional(),
    availableTags: z.array(z.string()).optional(),
  })
  .passthrough();

export type ProgramSearchQuery = z.infer<typeof ProgramSearchQuerySchema>;
export type ProgramSearchPagination = z.infer<
  typeof ProgramSearchPaginationSchema
>;
export type ProgramSearchResponse = z.infer<typeof ProgramSearchResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/programs/recommend — the onboarding ranking (NP-057 reads this).
// Mirrors webapp/app/api/programs/recommend/route.ts + lib/programMatch.ts.
// ---------------------------------------------------------------------------

/**
 * All optional: anything omitted falls back to the saved profile, EXCEPT when
 * `profile` is '0'. The onboarding wizard sends `profile: '0'` because it must
 * rank on the answers given in THIS session — otherwise a member redoing
 * onboarding is ranked against the equipment they are in the middle of
 * replacing.
 */
export const ProgramRecommendQuerySchema = z.object({
  /** Ordered; index 0 is the primary goal. Serialised comma-separated. */
  goals: z.array(FitnessGoalSchema).optional(),
  level: ExperienceLevelSchema.optional(),
  days: z.number().int().min(1).max(7).optional(),
  /** Serialised comma-separated. */
  equipment: z.array(EquipmentAccessSchema).optional(),
  /** 1..10, default 3. */
  limit: z.number().int().min(1).max(10).optional(),
  /** '0' disables the saved-profile fallback. Anything else keeps it. */
  profile: z.enum(['0', '1']).optional(),
});

/** What the ranking actually used, echoed back so the UI can explain itself. */
export const ProgramRecommendBasisSchema = z
  .object({
    goals: z.array(z.string()).default([]),
    experienceLevel: z.string().nullable(),
    weeklyAvailability: z.number().nullable(),
    equipmentAccess: z.array(z.string()).default([]),
  })
  .passthrough();

export const ProgramRecommendationSchema = z
  .object({
    program_id: z.string(),
    name: z.string(),
    description: z.string(),
    goal: z.string(),
    target_user: z.string(),
    training_days_per_week: z.number().nullable(),
    duration_weeks: z.number().nullable(),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().nullable(),
    score: z.number(),
    /** Member-facing match reasons, already phrased for display. */
    reasons: z.array(z.string()).default([]),
  })
  .passthrough();

export const ProgramRecommendResponseSchema = z
  .object({
    basedOn: ProgramRecommendBasisSchema,
    recommendations: z.array(ProgramRecommendationSchema),
  })
  .passthrough();

export type ProgramRecommendQuery = z.infer<typeof ProgramRecommendQuerySchema>;
export type ProgramRecommendBasis = z.infer<typeof ProgramRecommendBasisSchema>;
export type ProgramRecommendation = z.infer<typeof ProgramRecommendationSchema>;
export type ProgramRecommendResponse = z.infer<
  typeof ProgramRecommendResponseSchema
>;

// ---------------------------------------------------------------------------
// GET /api/programs/active — "Continue Training".
// Mirrors webapp/app/api/programs/active/route.ts. Note the key is
// `activePrograms`, and completed programs are filtered OUT of it.
// ---------------------------------------------------------------------------

export const ActiveProgramSummarySchema = z
  .object({
    programId: z.string(),
    programName: z.string(),
    startDate: z.string().nullable().optional(),
    /** 1-based. Rule 1 above. */
    currentPhase: z.number().int().optional(),
    currentDay: z.string().nullable().optional(),
    completedWorkouts: z.number().int().min(0).optional(),
    totalWorkouts: z.number().int().min(0).optional(),
    /** Whole percent, 0-100, derived from the schedule. */
    progress: z.number().optional(),
    status: ActiveProgramStatusSchema.optional(),
    lastWorkoutDate: z.string().nullable().optional(),
  })
  .passthrough();

export const ActiveProgramsApiResponseSchema = z
  .object({
    activePrograms: z.array(ActiveProgramSummarySchema),
  })
  .passthrough();

export type ActiveProgramSummary = z.infer<typeof ActiveProgramSummarySchema>;
export type ActiveProgramsApiResponse = z.infer<
  typeof ActiveProgramsApiResponseSchema
>;

// ---------------------------------------------------------------------------
// GET /api/programs/current-workout?programId=…[&day=…]
// Mirrors webapp/app/api/programs/current-workout/route.ts.
// ---------------------------------------------------------------------------

export const CurrentWorkoutQuerySchema = z.object({
  programId: z.string(),
  /** A day LABEL ("Day 1"), not a date. Omitted = next scheduled session. */
  day: z.string().optional(),
});

export const CurrentWorkoutSchema = z
  .object({
    day: z.string().optional(),
    title: z.string(),
    exercises: z.array(CurrentWorkoutExerciseSchema).default([]),
  })
  .passthrough();

export const CurrentWorkoutResponseSchema = z
  .object({
    workout: CurrentWorkoutSchema,
    /** 1-BASED. Rule 1 above. */
    phase: z.number().int().min(1).optional(),
    day: z.string().optional(),
    phaseInfo: z
      .object({
        name: z.string().optional(),
        focus: z.string().optional(),
        weeks: z.string().optional(),
      })
      .passthrough()
      .optional(),
    completedWorkouts: z.number().int().min(0).optional(),
    totalWorkouts: z.number().int().min(0).optional(),
  })
  .passthrough();

export type CurrentWorkoutQuery = z.infer<typeof CurrentWorkoutQuerySchema>;
export type CurrentWorkout = z.infer<typeof CurrentWorkoutSchema>;
export type CurrentWorkoutResponse = z.infer<
  typeof CurrentWorkoutResponseSchema
>;

// ---------------------------------------------------------------------------
// Enrolment: POST /api/programs/enroll.
// Mirrors webapp/app/api/programs/enroll/route.ts. NP-057's onboarding
// finishes here.
// ---------------------------------------------------------------------------

/** A permanent exercise substitution recorded against an enrolment. */
export const ExerciseSwapSchema = z
  .object({
    originalSlug: z.string(),
    replacementSlug: z.string(),
    replacementName: z.string(),
    swappedAt: z.string().optional(),
  })
  .passthrough();

/** The enrolment row itself (models/UserProgress.ts IActiveProgram). */
export const EnrolledProgramSchema = z
  .object({
    programId: z.string(),
    programName: z.string(),
    startDate: z.string(),
    /** 1-based. Rule 1 above. */
    currentPhase: z.number().int(),
    currentDay: z.string(),
    completedWorkouts: z.number().int().min(0),
    totalWorkouts: z.number().int().min(0),
    status: ActiveProgramStatusSchema,
    lastWorkoutDate: z.string().nullable().optional(),
    hasSchedule: z.boolean().optional(),
    exerciseSwaps: z.array(ExerciseSwapSchema).optional(),
  })
  .passthrough();

/** `startDate` is a plain YYYY-MM-DD local day; omitted means today. */
export const ProgramEnrollRequestSchema = z.object({
  programId: z.string(),
  startDate: z.string().optional(),
});

/** 200 on a fresh enrolment. */
export const ProgramEnrollResponseSchema = z
  .object({
    message: z.string(),
    activeProgram: EnrolledProgramSchema,
    /** Only ever present, and only ever true, on the already-enrolled answer. */
    alreadyEnrolled: z.literal(true).optional(),
  })
  .passthrough();

/**
 * 200 when the member is already enrolled. Same status code as a fresh
 * enrolment — `alreadyEnrolled` is the only thing that tells them apart, so a
 * client must read it rather than assume a 409.
 */
export const ProgramAlreadyEnrolledResponseSchema = z
  .object({
    message: z.string(),
    alreadyEnrolled: z.literal(true),
    activeProgram: EnrolledProgramSchema,
  })
  .passthrough();

export type ExerciseSwap = z.infer<typeof ExerciseSwapSchema>;
export type EnrolledProgram = z.infer<typeof EnrolledProgramSchema>;
export type ProgramEnrollRequest = z.infer<typeof ProgramEnrollRequestSchema>;
export type ProgramEnrollResponse = z.infer<typeof ProgramEnrollResponseSchema>;
export type ProgramAlreadyEnrolledResponse = z.infer<
  typeof ProgramAlreadyEnrolledResponseSchema
>;

// ---------------------------------------------------------------------------
// PUT /api/programs/start-date — move an enrolment and regenerate its schedule.
// Mirrors webapp/app/api/programs/start-date/route.ts.
// ---------------------------------------------------------------------------

export const ProgramStartDateRequestSchema = z.object({
  programId: z.string(),
  /** YYYY-MM-DD. Read as 00:00 UTC on that day. */
  startDate: z.string(),
});

/**
 * The three schedule counters are present only when a Schedule existed and was
 * regenerated; a member who set a start date before building a schedule gets
 * `{ message, startDate }` alone.
 */
export const ProgramStartDateResponseSchema = z
  .object({
    message: z.string(),
    startDate: z.string(),
    totalScheduledWorkouts: z.number().int().min(0).optional(),
    futureWorkouts: z.number().int().min(0).optional(),
    nextWorkout: z.string().nullable().optional(),
  })
  .passthrough();

export type ProgramStartDateRequest = z.infer<
  typeof ProgramStartDateRequestSchema
>;
export type ProgramStartDateResponse = z.infer<
  typeof ProgramStartDateResponseSchema
>;

// ---------------------------------------------------------------------------
// POST /api/programs/abandon — drop the enrolment and its schedule.
// Workout logs are KEPT; only the enrolment goes.
// Mirrors webapp/app/api/programs/abandon/route.ts.
// ---------------------------------------------------------------------------

export const ProgramAbandonRequestSchema = z.object({
  programId: z.string(),
});

export const ProgramAbandonResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
  })
  .passthrough();

export type ProgramAbandonRequest = z.infer<typeof ProgramAbandonRequestSchema>;
export type ProgramAbandonResponse = z.infer<
  typeof ProgramAbandonResponseSchema
>;

// ---------------------------------------------------------------------------
// Custom programs: GET|POST /api/programs/custom and
// GET|PUT|PATCH|DELETE /api/programs/custom/[programId].
// Mirrors webapp/app/api/programs/custom/**/route.ts + lib/programFields.ts.
// ---------------------------------------------------------------------------

/**
 * The ONLY fields a member may supply, mirroring
 * CUSTOM_PROGRAM_INPUT_FIELDS in webapp/lib/programFields.ts.
 *
 * `program_id`, `isCustom`, `createdBy`, `sharedWith` and the cover fields are
 * SERVER-CONTROLLED and are silently dropped from a request body — sending
 * them is not an error, it just does nothing. This schema is deliberately
 * `.strict()`-free but names no forbidden key, so a client built from it
 * cannot accidentally try.
 */
export const CustomProgramInputSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  duration_weeks: z.number().optional(),
  training_days_per_week: z.number().optional(),
  goal: z.string().optional(),
  target_user: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  phases: z.array(ProgramPhaseSchema).optional(),
});

/** PUT/PATCH send the same allow-list; every field is optional on an update. */
export const CustomProgramUpdateRequestSchema =
  CustomProgramInputSchema.partial();

/**
 * A custom program as the list route returns it: the program document plus
 * who owns it. `sharedByName` is present only on programs shared WITH the
 * caller, which is also exactly when `isOwner` is false.
 */
export const CustomProgramSchema = z
  .object({
    ...programDocumentShape,
    isOwner: z.boolean().optional(),
    sharedByName: z.string().optional(),
  })
  .passthrough();

/** GET /api/programs/custom */
export const CustomProgramsResponseSchema = z
  .object({
    programs: z.array(CustomProgramSchema),
  })
  .passthrough();

/**
 * POST /api/programs/custom (201) and GET|PUT|PATCH
 * /api/programs/custom/[programId] (200) all answer with the program document
 * itself — no envelope.
 */
export const CustomProgramResponseSchema = CustomProgramSchema;

/** DELETE /api/programs/custom/[programId] */
export const CustomProgramDeleteResponseSchema = z
  .object({
    ok: z.boolean(),
  })
  .passthrough();

export type CustomProgramInput = z.infer<typeof CustomProgramInputSchema>;
export type CustomProgramUpdateRequest = z.infer<
  typeof CustomProgramUpdateRequestSchema
>;
export type CustomProgram = z.infer<typeof CustomProgramSchema>;
export type CustomProgramsResponse = z.infer<
  typeof CustomProgramsResponseSchema
>;
export type CustomProgramResponse = CustomProgram;
export type CustomProgramDeleteResponse = z.infer<
  typeof CustomProgramDeleteResponseSchema
>;

// ---------------------------------------------------------------------------
// Exercise swaps: POST|DELETE /api/programs/swap.
// Mirrors webapp/app/api/programs/swap/route.ts. A swap is PERMANENT for the
// enrolment: current-workout applies it on every load.
// ---------------------------------------------------------------------------

export const ProgramSwapRequestSchema = z.object({
  programId: z.string(),
  originalSlug: z.string(),
  replacementSlug: z.string(),
  /** Required by the route — it is what the member sees after the swap. */
  replacementName: z.string(),
});

/** DELETE takes its two fields as QUERY params, not a body. */
export const ProgramSwapDeleteQuerySchema = z.object({
  programId: z.string(),
  originalSlug: z.string(),
});

/** Both verbs answer `{ message }` — there is no `success` flag here. */
export const ProgramSwapResponseSchema = z
  .object({
    message: z.string(),
  })
  .passthrough();

export type ProgramSwapRequest = z.infer<typeof ProgramSwapRequestSchema>;
export type ProgramSwapDeleteQuery = z.infer<
  typeof ProgramSwapDeleteQuerySchema
>;
export type ProgramSwapResponse = z.infer<typeof ProgramSwapResponseSchema>;

// ---------------------------------------------------------------------------
// Saved programs: GET|POST|DELETE|PATCH /api/programs/saved.
// Mirrors webapp/app/api/programs/saved/route.ts.
// ---------------------------------------------------------------------------

/** A saved program: the projected document plus where it sits in the list. */
export const SavedProgramSchema = z
  .object({
    ...programDocumentShape,
    savedAt: z.string().optional(),
    order: z.number().int().optional(),
  })
  .passthrough();

export const SavedProgramsResponseSchema = z
  .object({
    /** Already sorted by `order`. */
    savedPrograms: z.array(SavedProgramSchema),
  })
  .passthrough();

/** POST and DELETE both take `{ programId }`. */
export const SaveProgramRequestSchema = z.object({
  programId: z.string(),
});

/**
 * PATCH reorders. The array IS the new order — index 0 becomes `order: 0` —
 * and any id missing from it is dropped from the member's saved list.
 */
export const SavedProgramsReorderRequestSchema = z.object({
  programIds: z.array(z.string()),
});

/** POST, DELETE and PATCH all answer `{ success, message }`. */
export const SaveToggleResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
  })
  .passthrough();

export const SavedProgramsReorderResponseSchema = SaveToggleResponseSchema;

export type SavedProgram = z.infer<typeof SavedProgramSchema>;
export type SavedProgramsResponse = z.infer<typeof SavedProgramsResponseSchema>;
export type SaveProgramRequest = z.infer<typeof SaveProgramRequestSchema>;
export type SavedProgramsReorderRequest = z.infer<
  typeof SavedProgramsReorderRequestSchema
>;
export type SaveToggleResponse = z.infer<typeof SaveToggleResponseSchema>;
export type SavedProgramsReorderResponse = SaveToggleResponse;

// ---------------------------------------------------------------------------
// GET /api/programs/[programId]/journey — the end-of-program recap.
// Mirrors webapp/app/api/programs/[programId]/journey/route.ts.
// ---------------------------------------------------------------------------

/** Volume is always in POUNDS, whatever unit the member logs in. */
export const ProgramJourneyWeightChangeSchema = z
  .object({
    startLbs: z.number(),
    endLbs: z.number(),
    change: z.number(),
  })
  .passthrough();

/** `date` is pre-formatted display copy ("Jun 3, 2026"), not an ISO date. */
export const ProgramJourneyPRSchema = z
  .object({
    name: z.string(),
    weight: z.number(),
    reps: z.number(),
    date: z.string(),
  })
  .passthrough();

/**
 * `startDate`/`endDate` are pre-formatted ("June 3, 2026") and are null until
 * the member has completed a session in this program; `goal` is absent
 * entirely on that empty answer.
 */
export const ProgramJourneyResponseSchema = z
  .object({
    programName: z.string(),
    durationWeeks: z.number(),
    goal: z.string().nullable().optional(),
    totalSessions: z.number().int().min(0),
    totalVolumeLbs: z.number(),
    weightChange: ProgramJourneyWeightChangeSchema.nullable(),
    /** At most six, heaviest first. */
    topPRs: z.array(ProgramJourneyPRSchema),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
  })
  .passthrough();

export type ProgramJourneyWeightChange = z.infer<
  typeof ProgramJourneyWeightChangeSchema
>;
export type ProgramJourneyPR = z.infer<typeof ProgramJourneyPRSchema>;
export type ProgramJourneyResponse = z.infer<
  typeof ProgramJourneyResponseSchema
>;

// ---------------------------------------------------------------------------
// Public shares: POST /api/share — a public, read-only snapshot of a program,
// a single program workout, or a one-off / generated session.
// Mirrors webapp/app/api/share/route.ts. Answers 201 with `{ shareId, url }`
// where `url` is a RELATIVE path (`/share/<shareId>`); the native share sheet
// opens the absolute URL on the web's domain so a signed-out recipient lands
// on the public web page (`webapp/app/share/[shareId]`).
// ---------------------------------------------------------------------------

/** The loose draft shape a one-off / generated session snapshots. */
export const ShareSessionExerciseSchema = z
  .object({
    exerciseSlug: z.string().optional(),
    name: z.string().optional(),
    sets: z.number().optional(),
    reps: z.string().optional(),
    rest: z.string().optional(),
    details: z.string().optional(),
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    groupId: z.string().optional(),
    groupType: z.string().optional(),
    groupLabel: z.string().optional(),
    groupRest: z.string().optional(),
    groupRounds: z.number().optional(),
  })
  .passthrough();

export const ShareSessionSchema = z
  .object({
    title: z.string(),
    focus: z.string().optional(),
    exercises: z.array(ShareSessionExerciseSchema),
  })
  .passthrough();

export const ShareCreateRequestSchema = z.object({
  kind: z.enum(['program', 'workout', 'session']),
  programId: z.string().optional(),
  day: z.string().optional(),
  phase: z.string().optional(),
  session: ShareSessionSchema.optional(),
});

export const ShareCreateResponseSchema = z
  .object({
    shareId: z.string(),
    /** A RELATIVE path — `/share/<shareId>`, not an absolute URL. */
    url: z.string(),
  })
  .passthrough();

export type ShareSessionExercise = z.infer<typeof ShareSessionExerciseSchema>;
export type ShareSession = z.infer<typeof ShareSessionSchema>;
export type ShareCreateRequest = z.infer<typeof ShareCreateRequestSchema>;
export type ShareCreateResponse = z.infer<typeof ShareCreateResponseSchema>;
