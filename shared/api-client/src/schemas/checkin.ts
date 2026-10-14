import { z } from 'zod';

export const CHECKIN_REASONS = [
  'complete',
  'skipped',
  'throttled',
  'due',
  'unauthenticated',
  'error',
] as const;

export const CheckInReasonSchema = z.enum(CHECKIN_REASONS);
export type CheckInReason = z.infer<typeof CheckInReasonSchema>;

/**
 * GET /api/checkin response (mirrors webapp/app/api/checkin/route.ts GET).
 * Resolves the daily check-in prompt state and facts.
 */
export const CheckInResponseSchema = z
  .object({
    due: z.boolean(),
    reason: CheckInReasonSchema,
    complete: z.boolean().optional(),
    moodLoggedToday: z.boolean().optional(),
    weightLoggedToday: z.boolean().optional(),
    skippedToday: z.boolean().optional(),
    daysSinceMood: z.number().int().optional(),
    daysSinceWeight: z.number().int().optional(),
    todaysMood: z.number().nullable().optional(),
    /** The RAW number on the newest weigh-in — see `lastWeightUnit`. */
    lastWeight: z.number().nullable().optional(),
    /**
     * The unit `lastWeight` was STORED in (`IWeightEntry.unit`), or null when
     * that entry predates the field — in which case read it as the member's
     * `profile.weightUnit ?? 'lbs'`, the same grandfather rule NP-209 gave
     * lifting loads. A client prefilling a weight field has to know this: the
     * dashboard was dropping an 82 kg weigh-in into a field labelled "lbs".
     */
    lastWeightUnit: z.enum(['lbs', 'kg']).nullable().optional(),
  })
  .passthrough();

export type CheckInResponse = z.infer<typeof CheckInResponseSchema>;
export const CheckInStatusResponseSchema = CheckInResponseSchema;
export type CheckInStatusResponse = CheckInResponse;

// ─── POST /api/checkin ───────────────────────────────────────────────────────

export const CHECKIN_ACTIONS = ['shown', 'skip'] as const;
export const CheckInActionSchema = z.enum(CHECKIN_ACTIONS);
export type CheckInAction = z.infer<typeof CheckInActionSchema>;

export const CheckInActionRequestSchema = z
  .object({
    action: CheckInActionSchema,
    tz: z.number().int().optional(),
  })
  .passthrough();

export type CheckInActionRequest = z.infer<typeof CheckInActionRequestSchema>;
export const CheckInRequestSchema = CheckInActionRequestSchema;
export type CheckInRequest = CheckInActionRequest;

export const CheckInActionResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough();

export type CheckInActionResponse = z.infer<typeof CheckInActionResponseSchema>;
export const CheckInPostResponseSchema = CheckInActionResponseSchema;
export type CheckInPostResponse = CheckInActionResponse;
