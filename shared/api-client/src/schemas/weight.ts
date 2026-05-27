import { z } from 'zod';

export const WeightEntrySchema = z.object({
  date: z.string(),
  weight: z.number().nullable(),
  skipped: z.boolean().optional(),
});

export const WeightHistoryResponseSchema = z.object({
  history: z.array(WeightEntrySchema),
});

export const LogWeightRequestSchema = z.object({
  weight: z.number().positive().nullable(),
  date: z.string().optional(),
  skipped: z.boolean().optional(),
  tz: z.string().optional(),
});

export const LogWeightResponseSchema = z.object({
  success: z.boolean(),
  entry: WeightEntrySchema.optional(),
});

export type WeightEntry = z.infer<typeof WeightEntrySchema>;
export type WeightHistoryResponse = z.infer<typeof WeightHistoryResponseSchema>;
export type LogWeightRequest = z.infer<typeof LogWeightRequestSchema>;
export type LogWeightResponse = z.infer<typeof LogWeightResponseSchema>;
