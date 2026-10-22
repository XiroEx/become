/**
 * The locked-phone rest alert (NP-082).
 *
 * When a rest starts, the app schedules a LOCAL notification for `endsAt`
 * so the member's locked phone still tells them the rest is over. The
 * notification is scheduled ONLY when the OS permission is already granted —
 * this module never asks for permission itself (NP-028 owns the ask; until
 * Jon answers, the timer stays in-app for members who skipped the onboarding
 * prompt, where the in-app alert at zero — sound AND vibration, see
 * `lib/live/restEndAlert.ts` — is the whole alert).
 *
 * Everything that touches the native module lives behind `RestAlertDeps` so
 * unit tests never import `expo-notifications` (which needs a device). The
 * production deps (`defaultRestAlertDeps`) are the thin wrappers at the
 * bottom.
 *
 * Cancel on skip, finish, or a new set: starting a rest cancels the previous
 * alert first, and `cancelRestAlert` is called from the skip/finish paths.
 */

import { recordRestAlertResult } from "@/lib/diagnostics/deviceDiagnostics";
import type { AsyncStorageLike } from "@/lib/query/persistor";

export const REST_ALERT_CHANNEL_ID = "rest-timer";

export interface RestAlertDeps {
  /** True when the OS permission is already granted (never prompts). */
  isGranted: () => Promise<boolean>;
  /** Schedule a local notification for `endsAtMs`; resolves to its id. */
  schedule: (endsAtMs: number) => Promise<string>;
  /** Cancel a previously scheduled notification by id. */
  cancel: (id: string) => Promise<void>;
  log?: (message: string, ...args: unknown[]) => void;
  /**
   * Where the scheduling outcome is recorded for the Settings Diagnostics
   * block. Defaults to AsyncStorage; pass an in-memory store in tests, or
   * explicit null to skip recording.
   */
  diagnosticsStorage?: AsyncStorageLike | null;
}

export interface RestAlertHandle {
  /** The scheduled notification id, or null when nothing is scheduled. */
  id: string | null;
}

/**
 * expo-notifications, resolved ONCE at import inside a try/catch — a `require`
 * rather than the dynamic `import()` this file used to do, for two reasons:
 *
 *  - a dynamic `import()` throws "without --experimental-vm-modules" under
 *    jest, which silently made the production deps below UNTESTABLE — so
 *    nothing could assert that the locked-phone alert asks for sound;
 *  - resolving at import rather than inside the alert means nothing loads a
 *    module while a rest is ending, which under jest could land after the
 *    environment is torn down.
 *
 * It is still safe for the unit suite, which picks up
 * `__mocks__/expo-notifications.js` instead of a native module, and a build
 * without the module answers null instead of crashing (same shape as
 * `lib/auth/localAuthentication.ts`).
 */
const notificationsModule: typeof import("expo-notifications") | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as typeof import("expo-notifications");
  } catch {
    return null;
  }
})();

function loadNotifications(): typeof import("expo-notifications") | null {
  return notificationsModule;
}

async function defaultIsGranted(): Promise<boolean> {
  try {
    const Notifications = loadNotifications();
    if (!Notifications) return false;
    const res = await Notifications.getPermissionsAsync();
    return res.granted;
  } catch {
    return false;
  }
}

async function defaultSchedule(endsAtMs: number): Promise<string> {
  const Notifications = loadNotifications();
  if (!Notifications) throw new Error("expo-notifications is unavailable");
  const seconds = Math.max(1, Math.ceil((endsAtMs - Date.now()) / 1000));
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Rest over — next set",
      body: "Your rest timer finished. Time to lift.",
      // SOUND, not only a banner (NP-082, Jon on NP-028: both sound and
      // vibration when the rest ends). Android already had it — the
      // `rest-timer` channel declares `sound: true, vibrate: true` — but iOS
      // plays nothing unless the content asks, so a locked iPhone showed a
      // silent banner. `true` is the OS default alert tone, which also
      // carries iOS's own notification haptic, and the member's Do Not
      // Disturb / notification settings still decide: we ask for sound, the
      // OS decides whether to make it.
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: REST_ALERT_CHANNEL_ID,
    },
  });
}

async function defaultCancel(id: string): Promise<void> {
  try {
    const Notifications = loadNotifications();
    if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* cancelling is best-effort: a missing id may not keep a stale alert */
  }
}

export const defaultRestAlertDeps: RestAlertDeps = {
  isGranted: defaultIsGranted,
  schedule: defaultSchedule,
  cancel: defaultCancel,
};

/**
 * Schedule the locked-phone alert for `endsAtMs`, cancelling whatever the
 * previous rest scheduled. Resolves to the notification id, or null when
 * permission is not already granted (in-app timer only) or scheduling
 * failed. Never throws, never prompts.
 *
 * The outcome is recorded for the Settings Diagnostics block (`ok: true` =
 * the OS accepted it; `no-permission` = in-app timer only; anything else =
 * the schedule throw's message) — the same shape as the Live Activity's
 * `lastFailure`.
 */
export async function scheduleRestAlert(
  handle: RestAlertHandle,
  endsAtMs: number,
  deps: RestAlertDeps = defaultRestAlertDeps,
): Promise<string | null> {
  await cancelRestAlert(handle, deps);
  const storage = deps.diagnosticsStorage;
  try {
    if (!(await deps.isGranted())) {
      void recordRestAlertResult(false, "no-permission", Date.now(), storage);
      return null;
    }
    const id = await deps.schedule(endsAtMs);
    handle.id = id;
    void recordRestAlertResult(true, "scheduled", Date.now(), storage);
    return id;
  } catch (error) {
    deps.log?.("[rest] alert schedule failed", error);
    const message = error instanceof Error ? error.message : String(error);
    void recordRestAlertResult(
      false,
      message || "schedule-failed",
      Date.now(),
      storage,
    );
    return null;
  }
}

/** Cancel a pending rest alert. Never throws. */
export async function cancelRestAlert(
  handle: RestAlertHandle,
  deps: RestAlertDeps = defaultRestAlertDeps,
): Promise<void> {
  if (!handle.id) return;
  const id = handle.id;
  handle.id = null;
  try {
    await deps.cancel(id);
  } catch (error) {
    deps.log?.("[rest] alert cancel failed", error);
  }
}

/** A fresh handle per rest countdown (one rest at a time per screen). */
export function createRestAlertHandle(): RestAlertHandle {
  return { id: null };
}
