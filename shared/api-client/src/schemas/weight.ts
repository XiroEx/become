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

// GET /api/weight returns skip-tracking + prompt state (not the history).
// Mirrors webapp/app/api/weight/route.ts GET. The POST body uses `skip`
// (boolean) + `weight` (nullable) — see webapp POST.
export const WeightCheckResponseSchema = z
  .object({
    needsWeightCheck: z.boolean().optional(),
    consecutiveSkips: z.number().optional(),
    daysSinceLastEntry: z.number().optional(),
    lastWeight: z.number().nullable().optional(),
    todaysWeight: z.number().nullable().optional(),
  })
  .passthrough();

export const WeightPostRequestSchema = z.object({
  weight: z.number().positive().nullable(),
  skip: z.boolean().optional(),
  bodyFat: z.number().optional(),
});

export type WeightCheckResponse = z.infer<typeof WeightCheckResponseSchema>;
export type WeightPostRequest = z.infer<typeof WeightPostRequestSchema>;
export type WeightEntry = z.infer<typeof WeightEntrySchema>;
export type WeightHistoryResponse = z.infer<typeof WeightHistoryResponseSchema>;
export type LogWeightRequest = z.infer<typeof LogWeightRequestSchema>;
export type LogWeightResponse = z.infer<typeof LogWeightResponseSchema>;
