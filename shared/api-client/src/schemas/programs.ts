import { z } from 'zod';

export const ActiveProgramStatus = z.enum([
  'active',
  'paused',
  'completed',
  'abandoned',
]);

export const ActiveProgramSchema = z
  .object({
    programId: z.string(),
    startedAt: z.string().optional(),
    status: ActiveProgramStatus.optional(),
    phaseIndex: z.number().int().min(0).optional(),
    workoutIndex: z.number().int().min(0).optional(),
    totalWorkouts: z.number().int().min(0).optional(),
    completedWorkouts: z.number().int().min(0).optional(),
  })
  .passthrough();

export const ActiveProgramsResponseSchema = z
  .object({
    programs: z.array(ActiveProgramSchema),
  })
  .passthrough();

export type ActiveProgram = z.infer<typeof ActiveProgramSchema>;
export type ActiveProgramsResponse = z.infer<
  typeof ActiveProgramsResponseSchema
>;

// ---------------------------------------------------------------------------
// Real webapp dashboard read endpoints.
// GET /api/programs/active returns { activePrograms: [...] } (note the key —
// distinct from the speculative ActiveProgramsResponseSchema above which uses
// `programs`). Mirrors webapp/app/api/programs/active/route.ts.
// ---------------------------------------------------------------------------

export const ActiveProgramSummarySchema = z
  .object({
    programId: z.string(),
    programName: z.string(),
    startDate: z.string().nullable().optional(),
    currentPhase: z.number().int().optional(),
    currentDay: z.string().nullable().optional(),
    completedWorkouts: z.number().int().min(0).optional(),
    totalWorkouts: z.number().int().min(0).optional(),
    progress: z.number().optional(),
    status: z.string().optional(),
    lastWorkoutDate: z.string().nullable().optional(),
  })
  .passthrough();

export const ActiveProgramsApiResponseSchema = z
  .object({
    activePrograms: z.array(ActiveProgramSummarySchema),
  })
  .passthrough();

// GET /api/programs/current-workout?programId=… (hydrated workout for today).
// Mirrors webapp/app/api/programs/current-workout/route.ts.
export const CurrentWorkoutExerciseSchema = z
  .object({
    exerciseSlug: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    sets: z.number().optional(),
    reps: z.string().optional(),
    rest: z.string().optional(),
    details: z.string().optional(),
  })
  .passthrough();

export const CurrentWorkoutSchema = z
  .object({
    day: z.string().optional(),
    title: z.string(),
    exercises: z.array(CurrentWorkoutExerciseSchema),
  })
  .passthrough();

export const CurrentWorkoutResponseSchema = z
  .object({
    workout: CurrentWorkoutSchema,
    phase: z.number().optional(),
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

export type ActiveProgramSummary = z.infer<typeof ActiveProgramSummarySchema>;
export type ActiveProgramsApiResponse = z.infer<
  typeof ActiveProgramsApiResponseSchema
>;
export type CurrentWorkoutResponse = z.infer<
  typeof CurrentWorkoutResponseSchema
>;

// ---------------------------------------------------------------------------
// Program catalog: list + search.
// GET /api/programs returns a BARE ARRAY of hydrated programs.
// GET /api/programs/search?q=… returns { programs, pagination, availableTags }
// with projected summaries. Both use the raw Mongo field names (program_id,
// duration_weeks, training_days_per_week, target_user). Mirrors
// webapp/app/api/programs/route.ts and .../programs/search/route.ts.
// ---------------------------------------------------------------------------

export const ProgramCatalogItemSchema = z
  .object({
    _id: z.string().optional(),
    program_id: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    duration_weeks: z.number().optional(),
    training_days_per_week: z.number().optional(),
    goal: z.string().optional(),
    target_user: z.string().optional(),
    tags: z.array(z.string()).optional(),
    equipment: z.array(z.string()).optional(),
  })
  .passthrough();

export const ProgramListResponseSchema = z.array(ProgramCatalogItemSchema);

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

export type ProgramCatalogItem = z.infer<typeof ProgramCatalogItemSchema>;
export type ProgramListResponse = z.infer<typeof ProgramListResponseSchema>;
export type ProgramSearchResponse = z.infer<typeof ProgramSearchResponseSchema>;

// GET /api/programs/saved → { savedPrograms: [ …program, savedAt, order ] }.
// POST/DELETE /api/programs/saved { programId } → { success, message }.
// Mirrors webapp/app/api/programs/saved/route.ts.
export const SavedProgramsResponseSchema = z
  .object({
    savedPrograms: z.array(ProgramCatalogItemSchema),
  })
  .passthrough();

export const SaveToggleResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
  })
  .passthrough();

export type SavedProgramsResponse = z.infer<typeof SavedProgramsResponseSchema>;
export type SaveToggleResponse = z.infer<typeof SaveToggleResponseSchema>;

// Shared response for the enroll / start-date / abandon mutations. They return
// varying success-ish payloads (enroll/abandon: { success, message };
// start-date: { message, startDate, … }), so both fields are optional.
// Mirrors webapp/app/api/programs/{enroll,start-date,abandon}/route.ts.
export const ProgramMutationResponseSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().optional(),
    startDate: z.string().optional(),
  })
  .passthrough();

export type ProgramMutationResponse = z.infer<
  typeof ProgramMutationResponseSchema
>;

// ---------------------------------------------------------------------------
// Program detail: GET /api/programs/[programId] returns the hydrated full
// program (phases → workouts → exercises). Mirrors
// webapp/app/api/programs/[programId]/route.ts + models/Program.ts.
// ---------------------------------------------------------------------------

export const ProgramExerciseSchema = z
  .object({
    exerciseSlug: z.string().optional(),
    name: z.string().optional(),
    category: z.string().optional(),
    sets: z.number().optional(),
    reps: z.string().optional(),
    rest: z.string().optional(),
    type: z.string().optional(),
    details: z.string().optional(),
  })
  .passthrough();

export const ProgramWorkoutSchema = z
  .object({
    day: z.string().optional(),
    title: z.string(),
    exercises: z.array(ProgramExerciseSchema).default([]),
  })
  .passthrough();

export const ProgramPhaseSchema = z
  .object({
    phase: z.string(),
    weeks: z.string().optional(),
    focus: z.string().optional(),
    workouts: z.array(ProgramWorkoutSchema).default([]),
  })
  .passthrough();

export const ProgramDetailResponseSchema = z
  .object({
    _id: z.string().optional(),
    program_id: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    duration_weeks: z.number().optional(),
    training_days_per_week: z.number().optional(),
    goal: z.string().optional(),
    target_user: z.string().optional(),
    tags: z.array(z.string()).optional(),
    equipment: z.array(z.string()).optional(),
    phases: z.array(ProgramPhaseSchema).default([]),
  })
  .passthrough();

export type ProgramExercise = z.infer<typeof ProgramExerciseSchema>;
export type ProgramWorkout = z.infer<typeof ProgramWorkoutSchema>;
export type ProgramPhase = z.infer<typeof ProgramPhaseSchema>;
export type ProgramDetailResponse = z.infer<typeof ProgramDetailResponseSchema>;
