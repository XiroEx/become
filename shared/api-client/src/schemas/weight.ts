import { z } from 'zod';
import { ActivityStreakResultSchema } from './streak';

export const WeightEntrySchema = z
  .object({
    date: z.string(),
    weight: z.number().nullable(),
    skipped: z.boolean().optional(),
  })
  .passthrough();
export type WeightEntry = z.infer<typeof WeightEntrySchema>;

export const GoalReachedSchema = z
  .object({
    pillar: z.literal('nutrition'),
    direction: z.enum(['lose', 'gain']),
    unit: z.enum(['lbs', 'kg']),
    targetWeight: z.number(),
    startWeight: z.number(),
    currentWeight: z.number(),
    totalChange: z.number(),
    days: z.number().int().min(0),
  })
  .passthrough();
export type GoalReached = z.infer<typeof GoalReachedSchema>;

export const LogWeightRequestSchema = z
  .object({
    weight: z.number().positive().nullable().optional(),
    date: z.string().optional(),
    skip: z.boolean().optional(),
    skipped: z.boolean().optional(),
    unit: z.enum(['lbs', 'kg']).optional(),
    bodyFat: z.number().optional(),
    loggedAt: z.string().optional(),
    tz: z.number().int().optional(),
  })
  .passthrough();
export type LogWeightRequest = z.infer<typeof LogWeightRequestSchema>;

export const LogWeightResponseSchema = z
  .object({
    success: z.boolean(),
    date: z.string().optional(),
    applied: z.boolean().optional(),
    duplicate: z.boolean().optional(),
    streak: ActivityStreakResultSchema.optional(),
    goalReached: GoalReachedSchema.optional(),
    entry: WeightEntrySchema.optional(),
  })
  .passthrough();
export type LogWeightResponse = z.infer<typeof LogWeightResponseSchema>;

// GET /api/weight returns skip-tracking + prompt state (not the history).
// Mirrors webapp/app/api/weight/route.ts GET.
export const WeightCheckResponseSchema = z
  .object({
    needsWeightCheck: z.boolean(),
    consecutiveSkips: z.number(),
    isMandatory: z.boolean().optional(),
    showReminder: z.boolean().optional(),
    daysSinceLastEntry: z.number(),
    lastWeight: z.number().nullable().optional(),
    todaysWeight: z.number().nullable().optional(),
  })
  .passthrough();
export type WeightCheckResponse = z.infer<typeof WeightCheckResponseSchema>;

export const WeightPromptResponseSchema = WeightCheckResponseSchema;
export type WeightPromptResponse = WeightCheckResponse;

export const WeightPostRequestSchema = z
  .object({
    weight: z.number().positive().nullable().optional(),
    skip: z.boolean().optional(),
    unit: z.enum(['lbs', 'kg']).optional(),
    bodyFat: z.number().optional(),
    date: z.string().optional(),
    loggedAt: z.string().optional(),
    tz: z.number().int().optional(),
  })
  .passthrough();
export type WeightPostRequest = z.infer<typeof WeightPostRequestSchema>;
