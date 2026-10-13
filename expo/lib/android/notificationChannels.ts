/**
 * Android notification channels, named after the server's notification types —
 * plus the local-only rest-timer channel (NP-082).
 *
 * The server's notify cron (`webapp/app/api/cron/notify/route.ts`) tags every
 * push it sends — `workout-reminder`, `meal-reminder`, `mind-reminder`,
 * `streak-at-risk`, `super-streak-at-risk`, `goal-nudge`, `checkin-reminder`,
 * `schedule-setup`, `daily-glance`, `re-engagement` — and the channel id IS
 * the tag, so each category the server sends maps to a channel the member can
 * tune (sound / vibrate / importance) in Android settings. `rest-timer` is
 * the one channel the server never sends: it carries the local rest-end
 * alert scheduled on-device when a rest starts, so the member can tune the
 * rest alarm without touching workout reminders.
 *
 * The factory is pure so it can be tested without booting the native module;
 * `ensureAndroidChannels` creates them at app boot via expo-notifications.
 * On iOS it is a no-op (channels are Android-only).
 */

import { Platform } from "react-native";

export type ChannelImportance = "high" | "default" | "low" | "min";

export interface NotificationChannel {
  id: string;
  name: string;
  description: string;
  importance: ChannelImportance;
  sound: boolean;
  vibrate: boolean;
}

/**
 * One channel per server notification tag. `streak-at-risk` and
 * `super-streak-at-risk` share the urgent streak channel — they are the same
 * sentence at different volumes, not two settings.
 */
export const CHANNEL_IDS = {
  workoutReminder: "workout-reminder",
  mealReminder: "meal-reminder",
  mindReminder: "mind-reminder",
  streakAtRisk: "streak-at-risk",
  superStreakAtRisk: "super-streak-at-risk",
  goalNudge: "goal-nudge",
  checkinReminder: "checkin-reminder",
  scheduleSetup: "schedule-setup",
  dailyGlance: "daily-glance",
  reEngagement: "re-engagement",
  /** The rest timer's locked-phone alert (NP-082) — its own channel so the
   * member can tune the rest alarm without touching workout reminders. */
  restTimer: "rest-timer",
} as const;

export function getNotificationChannels(): NotificationChannel[] {
  return [
    {
      id: CHANNEL_IDS.workoutReminder,
      name: "Workout Reminders",
      description: "Reminders to start today's workout. Local-time gated.",
      importance: "high",
      sound: true,
      vibrate: true,
    },
    {
      id: CHANNEL_IDS.mealReminder,
      name: "Meal Reminders",
      description: "Gentle reminders to log your meals.",
      importance: "default",
      sound: true,
      vibrate: false,
    },
    {
      id: CHANNEL_IDS.mindReminder,
      name: "Mind Reminders",
      description: "Reminders for today's Mind session.",
      importance: "default",
      sound: true,
      vibrate: false,
    },
    {
      id: CHANNEL_IDS.streakAtRisk,
      name: "Streak Alerts",
      description: "Heads-up when your streak is about to break.",
      importance: "high",
      sound: true,
      vibrate: true,
    },
    {
      id: CHANNEL_IDS.superStreakAtRisk,
      name: "Streak Alerts",
      description: "Urgent heads-up when your streak is about to break.",
      importance: "high",
      sound: true,
      vibrate: true,
    },
    {
      id: CHANNEL_IDS.goalNudge,
      name: "Goal Nudges",
      description: "Nudges toward the goal you set.",
      importance: "default",
      sound: false,
      vibrate: false,
    },
    {
      id: CHANNEL_IDS.checkinReminder,
      name: "Check-in Reminders",
      description: "Reminders to complete your daily check-in.",
      importance: "default",
      sound: false,
      vibrate: false,
    },
    {
      id: CHANNEL_IDS.scheduleSetup,
      name: "Schedule Setup",
      description: "Reminders to set up your training schedule.",
      importance: "default",
      sound: false,
      vibrate: false,
    },
    {
      id: CHANNEL_IDS.dailyGlance,
      name: "Daily Glance",
      description: "Your morning summary card.",
      importance: "default",
      sound: false,
      vibrate: false,
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
      id: CHANNEL_IDS.restTimer,
      name: "Rest Timer",
      description: "Alerts when your rest between sets is over.",
      importance: "high",
      sound: true,
      vibrate: true,
    },
  ];
}

export interface ChannelCreator {
  setChannel: (
    id: string,
    config: { name: string; importance: number; sound: boolean; vibrate: boolean },
  ) => Promise<unknown>;
}

/**
 * Create every channel on Android, no-op everywhere else. Failures are caught
 * and logged — channels are a nicety, never a launch blocker.
 */
export async function ensureAndroidChannels(
  deps: {
    platform?: string;
    channels?: NotificationChannel[];
    create?: ChannelCreator;
    log?: (message: string, ...args: unknown[]) => void;
  } = {},
): Promise<{ kind: "created" | "skipped" | "failed"; count?: number }> {
  const platform = deps.platform ?? Platform.OS;
  if (platform !== "android") return { kind: "skipped" };
  const channels = deps.channels ?? getNotificationChannels();
  const log = deps.log ?? ((message: string) => console.warn(message));
  try {
    const create: ChannelCreator =
      deps.create ??
      (await import("expo-notifications").then((Notifications) => ({
        setChannel: (id: string, config: { name: string; importance: number; sound: boolean; vibrate: boolean }) =>
          Notifications.setNotificationChannelAsync(id, {
            name: config.name,
            importance: config.importance as never,
            sound: config.sound ? "default" : undefined,
            vibrationPattern: config.vibrate ? [0, 250, 250, 250] : null,
          }),
      })));
    const importanceFor = (importance: ChannelImportance): number => {
      // Mirrors AndroidImportance: MAX 7, HIGH 6, DEFAULT 5, LOW 4, MIN 3.
      switch (importance) {
        case "high":
          return 6;
        case "default":
          return 5;
        case "low":
          return 4;
        case "min":
          return 3;
      }
    };
    for (const channel of channels) {
      await create.setChannel(channel.id, {
        name: channel.name,
        importance: importanceFor(channel.importance),
        sound: channel.sound,
        vibrate: channel.vibrate,
      });
    }
    return { kind: "created", count: channels.length };
  } catch (error) {
    log("[push] android channels failed", error);
    return { kind: "failed" };
  }
}
