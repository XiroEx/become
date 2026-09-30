import { z } from 'zod';
import { ActivityStreakResultSchema } from './streak';

export const MoodScale = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type MoodScaleValue = z.infer<typeof MoodScale>;

export const MoodEntrySchema = z
  .object({
    date: z.string(),
    mood: MoodScale,
    notes: z.string().optional(),
  })
  .passthrough();
export type MoodEntry = z.infer<typeof MoodEntrySchema>;

export const LogMoodRequestSchema = z
  .object({
    mood: MoodScale,
    notes: z.string().optional(),
    date: z.string().optional(),
    loggedAt: z.string().optional(),
    tz: z.number().int().optional(),
  })
  .passthrough();
export type LogMoodRequest = z.infer<typeof LogMoodRequestSchema>;

export const LogMoodResponseSchema = z
  .object({
    success: z.boolean(),
    mood: MoodScale.optional(),
    date: z.string().optional(),
    applied: z.boolean().optional(),
    streak: ActivityStreakResultSchema.optional(),
    entry: MoodEntrySchema.optional(),
  })
  .passthrough();
export type LogMoodResponse = z.infer<typeof LogMoodResponseSchema>;

// GET /api/mood returns today's mood check state
export const MoodCheckResponseSchema = z
  .object({
    needsMoodCheck: z.boolean(),
    todaysMood: z.number().nullable(),
    daysSinceLastEntry: z.number(),
  })
  .passthrough();
export type MoodCheckResponse = z.infer<typeof MoodCheckResponseSchema>;

// GET /api/progress returns the mood history as `moodData`, each point a
// pre-formatted date label + numeric value. Mirrors
// webapp/lib/data/userProgress.ts formatProgressData().
export const ProgressMoodPointSchema = z
  .object({
    date: z.string(),
    value: MoodScale,
  })
  .passthrough();

export const ProgressMoodResponseSchema = z
  .object({
    moodData: z.array(ProgressMoodPointSchema).default([]),
  })
  .passthrough();

export type ProgressMoodPoint = z.infer<typeof ProgressMoodPointSchema>;
export type ProgressMoodResponse = z.infer<typeof ProgressMoodResponseSchema>;
