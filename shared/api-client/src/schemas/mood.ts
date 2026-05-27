import { z } from 'zod';

export const MoodScale = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const MoodEntrySchema = z.object({
  date: z.string(),
  mood: MoodScale,
  notes: z.string().optional(),
});

export const MoodHistoryResponseSchema = z.object({
  history: z.array(MoodEntrySchema),
});

export const LogMoodRequestSchema = z.object({
  mood: MoodScale,
  notes: z.string().optional(),
  date: z.string().optional(),
  tz: z.string().optional(),
});

export const LogMoodResponseSchema = z.object({
  success: z.boolean(),
  entry: MoodEntrySchema.optional(),
});

export type MoodEntry = z.infer<typeof MoodEntrySchema>;
export type MoodHistoryResponse = z.infer<typeof MoodHistoryResponseSchema>;
export type LogMoodRequest = z.infer<typeof LogMoodRequestSchema>;
export type LogMoodResponse = z.infer<typeof LogMoodResponseSchema>;
