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

/**
 * Streak result returned by activity-logging routes (POST /api/mood, POST /api/weight).
 * Mirrors recordStreakActivity() in webapp/lib/streak.ts.
 */
export const ActivityStreakResultSchema = z
  .object({
    streakDays: z.number().int().min(0),
    streakExtended: z.boolean(),
    newMilestone: z.number().int().nullable().optional(),
  })
  .passthrough();

export type ActivityStreakResult = z.infer<typeof ActivityStreakResultSchema>;
export const LogActivityStreakSchema = ActivityStreakResultSchema;
export type LogActivityStreak = ActivityStreakResult;

// ─── Every-pillar streaks (GET /api/streaks) ─────────────────────────────────

export const StreakOverallSchema = z
  .object({
    current: z.number().int().min(0),
    best: z.number().int().min(0),
    freezes: z.number().int().min(0),
    milestonesReached: z.array(z.number().int()),
    nextMilestone: z.number().int().nullable(),
    activeToday: z.boolean(),
    lastActivityDate: z.string().nullable(),
  })
  .passthrough();

export type StreakOverall = z.infer<typeof StreakOverallSchema>;

export const StreakPillarBaseSchema = z
  .object({
    unit: z.literal('days'),
    current: z.number().int().min(0),
    best: z.number().int().min(0),
    activeToday: z.boolean(),
  })
  .passthrough();

export type StreakPillarBase = z.infer<typeof StreakPillarBaseSchema>;

export const StreakWorkoutPillarSchema = z
  .object({
    unit: z.literal('days'),
    current: z.number().int().min(0),
    best: z.number().int().min(0),
    thisWeek: z.number().int().min(0),
    target: z.number().int().nullable(),
    metThisWeek: z.boolean(),
    weekLost: z.boolean(),
    weeksOnTarget: z.number().int().min(0),
    remainingThisWeek: z.number().int().min(0),
  })
  .passthrough();

export type StreakWorkoutPillar = z.infer<typeof StreakWorkoutPillarSchema>;

export const StreakSuperTodaySchema = z
  .object({
    nutrition: z.boolean(),
    mindset: z.boolean(),
    trained: z.boolean(),
    restDay: z.boolean(),
    weekOnTrack: z.boolean(),
  })
  .passthrough();

export type StreakSuperToday = z.infer<typeof StreakSuperTodaySchema>;

export const StreakSuperFreezeSchema = z
  .object({
    available: z.boolean(),
    returnsOn: z.string().nullable(),
    usedDays: z.array(z.string()),
    frozenToday: z.boolean(),
  })
  .passthrough();

export type StreakSuperFreeze = z.infer<typeof StreakSuperFreezeSchema>;

export const StreakSuperPillarSchema = z
  .object({
    unit: z.literal('days'),
    current: z.number().int().min(0),
    best: z.number().int().min(0),
    activeToday: z.boolean(),
    today: StreakSuperTodaySchema,
    freeze: StreakSuperFreezeSchema,
  })
  .passthrough();

export type StreakSuperPillar = z.infer<typeof StreakSuperPillarSchema>;

export const StreakPillarsSchema = z
  .object({
    workout: StreakWorkoutPillarSchema,
    nutrition: StreakPillarBaseSchema,
    mindset: StreakPillarBaseSchema,
    super: StreakSuperPillarSchema,
  })
  .passthrough();

export type StreakPillars = z.infer<typeof StreakPillarsSchema>;

export const CREDIT_PILLARS = ['workout', 'nutrition', 'mindset'] as const;
export const CreditPillarSchema = z.enum(CREDIT_PILLARS);
export type CreditPillar = z.infer<typeof CreditPillarSchema>;

export const StreakCreditsSchema = z
  .object({
    workout: z.array(z.string()),
    nutrition: z.array(z.string()),
    mindset: z.array(z.string()),
  })
  .passthrough();

export type StreakCredits = z.infer<typeof StreakCreditsSchema>;

export const StreaksPayloadSchema = z
  .object({
    todayKey: z.string(),
    minVisible: z.number().int().min(0),
    overall: StreakOverallSchema,
    pillars: StreakPillarsSchema,
    credits: StreakCreditsSchema,
  })
  .passthrough();

export type StreaksPayload = z.infer<typeof StreaksPayloadSchema>;
export const StreaksResponseSchema = StreaksPayloadSchema;
export type StreaksResponse = z.infer<typeof StreaksResponseSchema>;

// ─── Super-streak freeze (POST /api/streaks/freeze) ──────────────────────────

export const FREEZE_REFUSALS = [
  'not_today',
  'already_used',
  'nothing_to_protect',
  'day_already_complete',
  'already_frozen',
] as const;

export const FreezeRefusalSchema = z.enum(FREEZE_REFUSALS);
export type FreezeRefusal = z.infer<typeof FreezeRefusalSchema>;

export const FreezeRequestSchema = z
  .object({
    tz: z.number().int().optional(),
  })
  .passthrough();

export type FreezeRequest = z.infer<typeof FreezeRequestSchema>;

export const FreezeSuccessResponseSchema = z
  .object({
    frozen: z.string(),
    streaks: StreaksPayloadSchema,
  })
  .passthrough();

export type FreezeSuccessResponse = z.infer<typeof FreezeSuccessResponseSchema>;

export const FreezeRefusalResponseSchema = z
  .object({
    error: z.string(),
    reason: FreezeRefusalSchema,
    streaks: StreaksPayloadSchema,
  })
  .passthrough();

export type FreezeRefusalResponse = z.infer<typeof FreezeRefusalResponseSchema>;

export const FreezeResponseSchema = z.union([
  FreezeSuccessResponseSchema,
  FreezeRefusalResponseSchema,
]);

export type FreezeResponse = z.infer<typeof FreezeResponseSchema>;
