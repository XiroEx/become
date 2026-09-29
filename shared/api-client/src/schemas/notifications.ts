import { z } from 'zod';

/**
 * Push and email preferences, and the push registration itself:
 * GET | PATCH /api/notifications/preferences,
 * POST /api/notifications/subscribe, POST /api/notifications/unsubscribe.
 *
 * Mirrors webapp/app/api/notifications/*. One endpoint answers for both push
 * and email so the settings screen makes one request; push preferences live on
 * UserProgress and the email one on User, which is why `emailEngagement` sits
 * beside `preferences` rather than inside it.
 */

/** The ten switches, in the server's own order. */
export const NOTIFICATION_PREFERENCE_KEYS = [
  'streakAtRisk',
  'workoutReminder',
  'mealReminder',
  'reEngagement',
  'chatMessage',
  'mindReminder',
  'goalNudge',
  'superStreakAtRisk',
  'checkInReminder',
  'dailyGlance',
] as const;

export const NotificationPreferenceKeySchema = z.enum(NOTIFICATION_PREFERENCE_KEYS);

const preferenceShape = {
  streakAtRisk: z.boolean().optional(),
  workoutReminder: z.boolean().optional(),
  mealReminder: z.boolean().optional(),
  reEngagement: z.boolean().optional(),
  chatMessage: z.boolean().optional(),
  mindReminder: z.boolean().optional(),
  goalNudge: z.boolean().optional(),
  superStreakAtRisk: z.boolean().optional(),
  checkInReminder: z.boolean().optional(),
  /** The one that defaults OFF: a standing daily card rather than a nudge. */
  dailyGlance: z.boolean().optional(),
};

/** The preference block. The server merges a member's stored switches over its
 *  own defaults, so every key is normally present — but none is required, so a
 *  server that adds or drops one cannot break a shipped build. */
export const NotificationPreferencesSchema = z.object(preferenceShape).passthrough();

/** GET /api/notifications/preferences. */
export const NotificationPreferencesResponseSchema = z
  .object({
    preferences: NotificationPreferencesSchema.default({}),
    /** The master push switch. Absent on the row means ON. */
    notificationsEnabled: z.boolean().optional(),
    /** Engagement email opt-in, stored on the user. Absent means ON. */
    emailEngagement: z.boolean().optional(),
  })
  .passthrough();

/**
 * PATCH /api/notifications/preferences body — FLAT, not nested under
 * `preferences`: the server reads `body[key]` for each of the ten keys plus
 * `emailEngagement`, ignores everything else, and 400s a body that carries
 * none of them.
 */
export const NotificationPreferencesUpdateRequestSchema = z.object({
  ...preferenceShape,
  emailEngagement: z.boolean().optional(),
});

/** Which kind of registration this is. 'web' is a push endpoint URL; 'ios' and
 *  'android' carry an Expo push token in the same `endpoint` field. */
export const PushPlatformSchema = z.enum(['web', 'ios', 'android']);

/** Web Push encryption keys. REQUIRED for `platform: 'web'` (the server 400s
 *  without them) and absent for a native token. */
export const PushSubscriptionKeysSchema = z.object({
  p256dh: z.string(),
  auth: z.string(),
});

/**
 * POST /api/notifications/subscribe body.
 *
 * `reenable: true` is the only thing allowed to flip the master switch back
 * on: a background resync must never silently undo an opt-out, and without it
 * this route answers 409 'notifications_disabled' while the switch is off.
 */
export const PushSubscribeRequestSchema = z.object({
  /** Web: the push endpoint URL. Native: the Expo push token. */
  endpoint: z.string(),
  keys: PushSubscriptionKeysSchema.optional(),
  /** Defaults to 'web' server-side. */
  platform: PushPlatformSchema.optional(),
  reenable: z.boolean().optional(),
});

/** POST /api/notifications/unsubscribe body. No `endpoint` means "turn
 *  notifications off entirely": every device's registration is dropped and the
 *  master switch is latched off. */
export const PushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().optional(),
});

/** What the three mutating routes answer with: `{ success: true }`. */
export const NotificationsMutationResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough();

export type NotificationPreferenceKey = z.infer<typeof NotificationPreferenceKeySchema>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export type NotificationPreferencesResponse = z.infer<
  typeof NotificationPreferencesResponseSchema
>;
export type NotificationPreferencesUpdateRequest = z.infer<
  typeof NotificationPreferencesUpdateRequestSchema
>;
export type PushPlatform = z.infer<typeof PushPlatformSchema>;
export type PushSubscriptionKeys = z.infer<typeof PushSubscriptionKeysSchema>;
export type PushSubscribeRequest = z.infer<typeof PushSubscribeRequestSchema>;
export type PushUnsubscribeRequest = z.infer<typeof PushUnsubscribeRequestSchema>;
export type NotificationsMutationResponse = z.infer<
  typeof NotificationsMutationResponseSchema
>;
