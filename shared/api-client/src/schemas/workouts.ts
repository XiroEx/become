import { z } from 'zod';

export const SetLogSchema = z.object({
  reps: z.number().int().min(0).optional(),
  weight: z.number().min(0).optional(),
  completed: z.boolean(),
  notes: z.string().optional(),
});

export const ExerciseLogSchema = z.object({
  exerciseSlug: z.string(),
  sets: z.array(SetLogSchema),
});

export const WorkoutLogSchema = z
  .object({
    programId: z.string(),
    phaseIndex: z.number().int().min(0),
    workoutIndex: z.number().int().min(0),
    date: z.string(),
    exercises: z.array(ExerciseLogSchema),
    completed: z.boolean(),
  })
  .passthrough();

export const WorkoutsListResponseSchema = z.object({
  workouts: z.array(WorkoutLogSchema),
});

export const SaveWorkoutResponseSchema = z.object({
  success: z.boolean(),
  workout: WorkoutLogSchema.optional(),
});

export type SetLog = z.infer<typeof SetLogSchema>;
export type ExerciseLog = z.infer<typeof ExerciseLogSchema>;
export type WorkoutLog = z.infer<typeof WorkoutLogSchema>;
export type WorkoutsListResponse = z.infer<typeof WorkoutsListResponseSchema>;
export type SaveWorkoutResponse = z.infer<typeof SaveWorkoutResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/workouts save contract (the live-workout completion payload).
// Mirrors WorkoutSaveRequest in webapp/app/api/workouts/route.ts — note this is
// keyed by exercise `name` + 1-based `phase` + `day` label, distinct from the
// stored WorkoutLog shape above.
// ---------------------------------------------------------------------------

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

export const WorkoutSaveExerciseSchema = z
  .object({
    name: z.string(),
    exerciseSlug: z.string().optional(),
    sets: z.array(WorkoutSaveSetSchema),
    groupId: z.string().optional(),
    groupType: z.string().optional(),
  })
  .passthrough();

export const WorkoutSaveRequestSchema = z
  .object({
    programId: z.string(),
    phase: z.number(),
    day: z.string(),
    exercises: z.array(WorkoutSaveExerciseSchema),
    completed: z.boolean(),
    duration: z.number().optional(),
    activeSeconds: z.number().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

/** A single PR surfaced by the server's detection on completion. */
export const NewPRSchema = z
  .object({
    exerciseSlug: z.string(),
    exerciseName: z.string(),
    dimensions: z.array(z.string()),
  })
  .passthrough();

export const WorkoutSaveResponseSchema = z
  .object({
    message: z.string().optional(),
    completed: z.boolean().optional(),
    programCompleted: z.boolean().optional(),
    programName: z.string().optional(),
    newPRsAchieved: z.array(NewPRSchema).optional(),
  })
  .passthrough();

export type WorkoutSaveSet = z.infer<typeof WorkoutSaveSetSchema>;
export type WorkoutSaveExercise = z.infer<typeof WorkoutSaveExerciseSchema>;
export type WorkoutSaveRequest = z.infer<typeof WorkoutSaveRequestSchema>;
export type NewPR = z.infer<typeof NewPRSchema>;
export type WorkoutSaveResponse = z.infer<typeof WorkoutSaveResponseSchema>;
