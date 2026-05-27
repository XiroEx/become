/**
 * Android notification channels. Each push category from the webapp's notify
 * cron maps to a dedicated channel so the user can tune per-category sound /
 * vibrate / importance in Android settings.
 *
 * Channels are created at app boot via expo-notifications. The factory is
 * pure so it can be tested without booting the native module.
 */
export type ChannelImportance = "high" | "default" | "low" | "min";

export interface NotificationChannel {
  id: string;
  name: string;
  description: string;
  importance: ChannelImportance;
  sound: boolean;
  vibrate: boolean;
}

export const CHANNEL_IDS = {
  workoutReminders: "workout-reminders",
  streakAlerts: "streak-alerts",
  reEngagement: "re-engagement",
  streakSaved: "streak-saved",
} as const;

export function getNotificationChannels(): NotificationChannel[] {
  return [
    {
      id: CHANNEL_IDS.workoutReminders,
      name: "Workout Reminders",
      description:
        "Reminders to start today's workout. Local-time gated 7-11am.",
      importance: "high",
      sound: true,
      vibrate: true,
    },
    {
      id: CHANNEL_IDS.streakAlerts,
      name: "Streak Alerts",
      description: "Heads-up when your streak is about to break.",
      importance: "high",
      sound: true,
      vibrate: true,
    },
    {
      id: CHANNEL_IDS.reEngagement,
      name: "Re-engagement",
      description: "Gentle nudges to come back after a few days away.",
      importance: "default",
      sound: false,
      vibrate: false,
    },
    {
      id: CHANNEL_IDS.streakSaved,
      name: "Streak Saved",
      description: "You used a freeze. Tomorrow's still on you.",
      importance: "default",
      sound: true,
      vibrate: false,
    },
  ];
}
