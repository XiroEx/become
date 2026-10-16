/**
 * Notification preferences keys and defaults.
 *
 * All nudge categories default ON (undefined means never touched the switch).
 * `dailyGlance` is the one exception and defaults OFF (opt-in): it is a standing
 * daily lock-screen card rather than a nudge.
 *
 * Rules:
 * - Fresh enable shows per-type prefs on by default (except dailyGlance).
 * - Server default and client default agree across web, expo, and server.
 * - Existing explicit off choices are not overwritten when enabling notifications.
 */

export type NotificationPrefKey =
  | 'streakAtRisk'
  | 'workoutReminder'
  | 'mealReminder'
  | 'reEngagement'
  | 'chatMessage'
  | 'mindReminder'
  | 'goalNudge'
  | 'superStreakAtRisk'
  | 'checkInReminder'
  | 'dailyGlance'

export const NOTIFICATION_PREF_KEYS: readonly NotificationPrefKey[] = [
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
] as const

/** Every nudge defaults ON, dailyGlance is opt-in (defaults OFF). */
export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationPrefKey, boolean> = {
  streakAtRisk: true,
  workoutReminder: true,
  mealReminder: true,
  reEngagement: true,
  chatMessage: true,
  mindReminder: true,
  goalNudge: true,
  superStreakAtRisk: true,
  checkInReminder: true,
  dailyGlance: false,
}

/**
 * Given stored preferences from the database, computes the updates needed on fresh enable.
 * Any key whose value is already an explicit boolean is preserved (never overwritten).
 * Any missing/undefined key receives its default value.
 */
export function computeFreshEnablePrefUpdates(
  existingPrefs?: Record<string, unknown> | null,
): Record<string, boolean> {
  const updates: Record<string, boolean> = {}
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof existingPrefs?.[key] !== 'boolean') {
      updates[`notificationPrefs.${key}`] = DEFAULT_NOTIFICATION_PREFS[key]
    }
  }
  return updates
}

/**
 * Merges stored preferences over server defaults safely.
 * Only explicit boolean values in `existingPrefs` override the default;
 * undefined/null values never overwrite defaults with undefined.
 */
export function mergeWithNotificationDefaults(
  existingPrefs?: Record<string, unknown> | null,
): Record<NotificationPrefKey, boolean> {
  const result: Record<NotificationPrefKey, boolean> = { ...DEFAULT_NOTIFICATION_PREFS }
  if (existingPrefs) {
    for (const key of NOTIFICATION_PREF_KEYS) {
      const val = existingPrefs[key]
      if (typeof val === 'boolean') {
        result[key] = val
      }
    }
  }
  return result
}
