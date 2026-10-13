// What a native push carries, and the small rules shared by both transports.

export interface NativePushMessage {
  title: string
  body: string
  /** Where a tap lands (the app's path resolver reads it). */
  url: string
  /** Same tag = the newer notification replaces the older one. */
  tag?: string
  /** Icon badge count. Absent = leave the badge alone; 0 clears it. */
  badgeCount?: number
}

/**
 * The Android channels the app creates (`expo/lib/android/notificationChannels.ts`).
 * The channel id IS the cron's tag. A tag with no channel of its own (chat,
 * streak-freeze-used, admin-test) gets none, and Android files it under the
 * FCM default channel.
 */
export const ANDROID_CHANNEL_IDS: ReadonlySet<string> = new Set([
  'workout-reminder',
  'meal-reminder',
  'mind-reminder',
  'streak-at-risk',
  'super-streak-at-risk',
  'goal-nudge',
  'checkin-reminder',
  'schedule-setup',
  'daily-glance',
  're-engagement',
  'rest-timer',
])

export function androidChannelFor(tag: string | undefined): string | undefined {
  return tag && ANDROID_CHANNEL_IDS.has(tag) ? tag : undefined
}

/** An Expo push token from the pre-2026-09-30 design. Never valid for APNs/FCM. */
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[/.test(token)
}

/**
 * Chat is hidden in the native build (NP-032, `EXPO_PUBLIC_COMMUNITY_ENABLED`),
 * so a chat push to a phone would open a screen the app does not have. The
 * flag is build-time on the phone; the server's switch is `push.nativeChat`,
 * off by default, to be flipped in the same release that turns chat on.
 */
export function isChatTag(tag: string | undefined): boolean {
  return typeof tag === 'string' && tag.startsWith('chat-')
}
