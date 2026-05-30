import { z } from 'zod';

/**
 * GET /api/streak response (mirrors webapp/app/api/streak/route.ts).
 * `streakFreezes` > 0 means a freeze is available to spend.
 */
export const StreakResponseSchema = z
  .object({
    streakDays: z.number().int().min(0),
    longestStreak: z.number().int().min(0),
    streakFreezes: z.number().int().min(0),
    milestonesReached: z.array(z.number()).optional(),
    activityToday: z.boolean().optional(),
    nextMilestone: z.number().nullable().optional(),
    lastActivityDate: z.string().nullable().optional(),
  })
  .passthrough();

export type StreakResponse = z.infer<typeof StreakResponseSchema>;
