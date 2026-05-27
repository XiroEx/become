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
