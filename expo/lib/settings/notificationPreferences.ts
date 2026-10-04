/**
 * Notification preferences — the pure rules behind the native Notifications
 * settings (NP-068), mirroring `webapp/app/dashboard/settings/page.tsx` and
 * `webapp/app/api/notifications/preferences/route.ts`.
 *
 * The web's Notifications section is written around browser permission states
 * (`default` | `granted` | `denied`) plus the master switch and whether this
 * device's subscription is registered. Natively the same controls drive the
 * OS permission (`expo-notifications` reports `granted` | `denied` |
 * `undetermined`) and send a member who denied it to iOS Settings.
 *
 * RULES THAT TRAVEL (from the web):
 * - Same keys and defaults: every type ON by default EXCEPT `dailyGlance`
 *   (a standing daily card, not a nudge — opt-in).
 * - The master switch (`notificationsEnabled`) is account-wide: turning it
 *   off drops every device's subscription and latches the switch off.
 * - `chatMessage` stays hidden while NP-032's flag keeps chat out of the
 *   native v1 build.
 * - The email switch (`emailEngagement`) rides the same preferences request
 *   but is NOT gated by the OS permission.
 * - A member who denied permission is reminded on the web's cadence: first
 *   7 days after the denial, then monthly (`lib/push/reprompt.ts`).
 */

import type { NotificationPreferenceKey } from "@become/api-client";

/** The ten switches, in the web's own order (`NOTIFICATION_TOGGLES`). */
export interface NotificationToggleDef {
  key: NotificationPreferenceKey;
  label: string;
  sublabel: string;
}

export const NOTIFICATION_TOGGLES: readonly NotificationToggleDef[] = [
  {
    key: "dailyGlance",
    label: "Daily glance (lock screen)",
    sublabel:
      "One morning card with your streak, calories left and today's session. Off by default.",
  },
  {
    key: "checkInReminder",
    label: "Daily check-in",
    sublabel: "Early afternoon nudge to log today's mood + weight if you haven't yet",
  },
  {
    key: "mindReminder",
    label: "Daily mindset session",
    sublabel: "Morning nudge when your session is ready",
  },
  {
    key: "goalNudge",
    label: "Goal nudges",
    sublabel:
      "Behind pace, protein floor missed, tight training week — evenings, at most one a day",
  },
  {
    key: "superStreakAtRisk",
    label: "Super streak at risk",
    sublabel:
      "Late afternoon, when one pillar is still missing and the streak would break tonight",
  },
  {
    key: "streakAtRisk",
    label: "Streak at risk",
    sublabel: "When your streak is about to expire",
  },
  {
    key: "workoutReminder",
    label: "Workout reminder",
    sublabel: "When you have a session scheduled today",
  },
  {
    key: "mealReminder",
    label: "Meal log reminder",
    sublabel: "Evening nudge when you haven't logged any food",
  },
  {
    key: "reEngagement",
    label: "Re-engagement",
    sublabel: "When you've been inactive for a few days",
  },
  {
    key: "chatMessage",
    label: "Chat messages",
    sublabel: "When someone sends you a message",
  },
];

/** Every type ON except `dailyGlance` — the server's own defaults. */
export const NOTIFICATION_PREF_DEFAULTS: Record<NotificationPreferenceKey, boolean> = {
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
};

/**
 * Merge a member's stored switches over the defaults. `undefined` means
 * "never touched the switch" — the web's `fetchNotifPrefs` reads it the same
 * way, so a native change reads back identically in the web's Settings.
 */
export function applyNotificationPrefDefaults(
  stored: Partial<Record<NotificationPreferenceKey, boolean>> | undefined | null,
): Record<NotificationPreferenceKey, boolean> {
  const merged: Record<NotificationPreferenceKey, boolean> = {
    ...NOTIFICATION_PREF_DEFAULTS,
  };
  if (stored) {
    for (const toggle of NOTIFICATION_TOGGLES) {
      const value = stored[toggle.key];
      if (typeof value === "boolean") merged[toggle.key] = value;
    }
  }
  return merged;
}

/**
 * The switches the member actually sees. `chatMessage` is hidden while
 * NP-032's flag keeps chat out of the native v1 build — the key still PATCHes
 * and reads back on the web, it just has no row here.
 */
export function visibleNotificationToggles(
  options: { communityEnabled?: boolean } = {},
): readonly NotificationToggleDef[] {
  if (options.communityEnabled === true) return NOTIFICATION_TOGGLES;
  return NOTIFICATION_TOGGLES.filter((toggle) => toggle.key !== "chatMessage");
}

/** The OS permission, in the web's `Notification.permission` vocabulary. */
export type NativeNotifPermission = "granted" | "denied" | "undetermined";

/** The status line, ported from the web's Notifications section. */
export type NativeNotifStatus = "Active" | "Off" | "Blocked" | "Not reaching this device" | "Not enabled";

export interface NativeNotifStatusInput {
  permission: NativeNotifPermission;
  notificationsEnabled: boolean;
  /** Whether THIS device's token is registered. `null` = not yet checked. */
  deviceRegistered: boolean | null;
}

export function resolveNativeNotifStatus(input: NativeNotifStatusInput): NativeNotifStatus {
  if (input.permission === "granted") {
    if (!input.notificationsEnabled) return "Off";
    if (input.deviceRegistered === false) return "Not reaching this device";
    return "Active";
  }
  if (input.permission === "denied") return "Blocked";
  return "Not enabled";
}

export function nativeNotifStatusDescription(input: NativeNotifStatusInput): string {
  if (input.permission === "granted") {
    if (!input.notificationsEnabled) {
      return "You turned off notifications for Become. Turn them back on anytime.";
    }
    if (input.deviceRegistered === false) {
      return "Permission is on, but this device has no working subscription. Tap Repair.";
    }
    return "You'll receive push notifications";
  }
  if (input.permission === "denied") {
    return "Enable in Settings to receive notifications";
  }
  return "Turn on notifications to stay on your streak";
}

/**
 * The primary action for the status row, mirroring the web's buttons:
 * - undetermined → "Enable" (runs NP-065's explicit flow);
 * - granted but master off → "Turn on" (same flow, with `reenable: true`);
 * - granted + on + unreachable → "Repair" (re-register this device);
 * - denied → no in-app enable is possible; the member goes to iOS Settings.
 */
export type NativeNotifAction = "enable" | "turn-on" | "repair" | "open-settings" | "none";

export function resolveNativeNotifAction(input: NativeNotifStatusInput): NativeNotifAction {
  if (input.permission === "denied") return "open-settings";
  if (input.permission === "undetermined") return "enable";
  if (!input.notificationsEnabled) return "turn-on";
  if (input.deviceRegistered === false) return "repair";
  return "none";
}

/** The PATCH body for one per-type switch — flat, like the server reads it. */
export function buildNotifPrefPatch(
  key: NotificationPreferenceKey,
  value: boolean,
): Record<string, boolean> {
  return { [key]: value };
}
