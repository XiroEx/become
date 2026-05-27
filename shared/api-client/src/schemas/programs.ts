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
