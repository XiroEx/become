/**
 * The rest-timer alert seam (NP-082).
 *
 * The rest timer is wall-clock based: `createRestTimer` stores `endsAt` and
 * derives what is left from the clock, so locking the phone between sets
 * cannot freeze it. The same `endsAt` feeds the Lock Screen Live Activity
 * (NP-188) and this module's local notification, which is the alert that
 * arrives while the phone is locked.
 *
 * RULES THAT TRAVEL:
 * - The timer NEVER asks for notification permission itself (NP-028, 10/3):
 *   it schedules the locked-phone alert only when permission is already
 *   granted, and otherwise stays in-app (haptic at zero, as the web
 *   vibrates). NP-065 asks after onboarding.
 * - Every failure here is caught and swallowed: a missing buzz or a missing
 *   banner may never take a workout down.
 *
 * Everything that touches the native module lives behind the `RestAlertDeps`
 * interface so unit tests never import `expo-notifications` (which needs a
 * device). The production deps (`defaultRestAlertDeps`) are the thin wrappers
 * at the bottom, imported lazily for the same reason.
 */

export const REST_ALERT_CHANNEL_ID = "rest-timer";

export interface RestAlertDeps {
  /** True when the OS will show a local notification right now. */
  isPermissionGranted: () => Promise<boolean>;
  /** Schedule the "rest over" alert for `endsAt`; resolves to its id. */
  schedule: (endsAt: number) => Promise<string | null>;
  /** Cancel a previously scheduled alert. Never throws. */
  cancel: (identifier: string) => Promise<void>;
}

export interface RestAlertController {
  /** Schedule the alert for `endsAt` when permission is already granted. */
  scheduleFor: (endsAt: number) => Promise<void>;
  /** Cancel the pending alert, if any. */
  cancel: () => Promise<void>;
  /** The pending alert's identifier, for tests. */
  pendingId: () => string | null;
}

export function createRestAlertController(
  deps: RestAlertDeps,
): RestAlertController {
  let pendingId: string | null = null;

  return {
    async scheduleFor(endsAt: number): Promise<void> {
      try {
        await this.cancel();
      } catch {
        /* cancel is best-effort */
      }
      let granted = false;
      try {
        granted = await deps.isPermissionGranted();
      } catch {
        granted = false;
      }
      // NP-028 (10/3): never prompt from the rest timer. No permission yet
      // means the alert stays in-app (haptic at zero, as the web vibrates).
      if (!granted) return;
      try {
        const id = await deps.schedule(endsAt);
        pendingId = id;
      } catch {
        pendingId = null;
      }
    },
    async cancel(): Promise<void> {
      if (!pendingId) return;
      const id = pendingId;
      pendingId = null;
      try {
        await deps.cancel(id);
      } catch {
        /* a cancel may never take the workout with it */
      }
    },
    pendingId: () => pendingId,
  };
}

/**
 * Production deps: the only place `expo-notifications` is imported for the
 * rest alert. Required lazily so Jest (no native module) can import this file
 * freely — tests inject their own `RestAlertDeps` and never touch these.
 */
export function defaultRestAlertDeps(): RestAlertDeps {
  return {
    async isPermissionGranted(): Promise<boolean> {
      const Notifications = await import("expo-notifications");
      const res = await Notifications.getPermissionsAsync();
      return res.granted === true;
    },
    async schedule(endsAt: number): Promise<string | null> {
      const Notifications = await import("expo-notifications");
      const seconds = Math.max(
        1,
        Math.ceil((endsAt - Date.now()) / 1000),
      );
      return Notifications.scheduleNotificationAsync({
        content: {
          title: "Rest over — next set",
          body: "Your rest is done. Time for the next set.",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds,
          channelId: REST_ALERT_CHANNEL_ID,
        },
      });
    },
    async cancel(identifier: string): Promise<void> {
      const Notifications = await import("expo-notifications");
      await Notifications.cancelScheduledNotificationAsync(identifier);
    },
  };
}
