import { z } from 'zod';

export const ScheduleSlotStatus = z.enum([
  'scheduled',
  'completed',
  'missed',
  'skipped',
  'rest',
]);

export const ScheduleSlotSchema = z
  .object({
    date: z.string(),
    programId: z.string(),
    phaseIndex: z.number().int().min(0),
    workoutIndex: z.number().int().min(0),
    status: ScheduleSlotStatus,
  })
  .passthrough();

export const ScheduleResponseSchema = z
  .object({
    schedule: z.array(ScheduleSlotSchema),
  })
  .passthrough();

export type ScheduleSlot = z.infer<typeof ScheduleSlotSchema>;
export type ScheduleResponse = z.infer<typeof ScheduleResponseSchema>;

// ---------------------------------------------------------------------------
// Real GET /api/schedule shape: { schedules: [ { …, scheduledWorkouts: [...] } ] }
// (plural, nested, keyed by dayLabel/phase/workoutTitle with self-healed
// statuses). Mirrors webapp/app/api/schedule/route.ts.
// ---------------------------------------------------------------------------

export const ScheduledWorkoutSchema = z
  .object({
    date: z.string(),
    programId: z.string().optional(),
    dayLabel: z.string().optional(),
    status: z.string(),
    phase: z.number().optional(),
    workoutTitle: z.string().optional(),
    completedAt: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const ScheduleDocSchema = z
  .object({
    _id: z.string().optional(),
    programId: z.string(),
    programName: z.string().optional(),
    programStatus: z.string().optional(),
    settings: z.unknown().optional(),
    scheduledWorkouts: z.array(ScheduledWorkoutSchema).default([]),
  })
  .passthrough();

export const ScheduleApiResponseSchema = z
  .object({
    schedules: z.array(ScheduleDocSchema).default([]),
  })
  .passthrough();

export type ScheduledWorkout = z.infer<typeof ScheduledWorkoutSchema>;
export type ScheduleDoc = z.infer<typeof ScheduleDocSchema>;
export type ScheduleApiResponse = z.infer<typeof ScheduleApiResponseSchema>;
