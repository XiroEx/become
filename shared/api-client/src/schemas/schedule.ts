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
