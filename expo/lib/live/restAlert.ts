/**
 * The locked-phone rest alert (NP-082).
 *
 * When a rest starts, the app schedules a LOCAL notification for `endsAt`
 * so the member's locked phone still tells them the rest is over. The
 * notification is scheduled ONLY when the OS permission is already granted —
 * this module never asks for permission itself (NP-028 owns the ask; until
 * Jon answers, the timer stays in-app for members who skipped the onboarding
 * prompt, with a haptic at zero exactly as the web vibrates).
 *
 * Everything that touches the native module lives behind `RestAlertDeps` so
 * unit tests never import `expo-notifications` (which needs a device). The
 * production deps (`defaultRestAlertDeps`) are the thin wrappers at the
 * bottom.
 *
 * Cancel on skip, finish, or a new set: starting a rest cancels the previous
 * alert first, and `cancelRestAlert` is called from the skip/finish paths.
 */

export const REST_ALERT_CHANNEL_ID = "rest-timer";

export interface RestAlertDeps {
  /** True when the OS permission is already granted (never prompts). */
  isGranted: () => Promise<boolean>;
  /** Schedule a local notification for `endsAtMs`; resolves to its id. */
  schedule: (endsAtMs: number) => Promise<string>;
  /** Cancel a previously scheduled notification by id. */
  cancel: (id: string) => Promise<void>;
  log?: (message: string, ...args: unknown[]) => void;
}

export interface RestAlertHandle {
  /** The scheduled notification id, or null when nothing is scheduled. */
  id: string | null;
}

async function defaultIsGranted(): Promise<boolean> {
  try {
    const Notifications = await import("expo-notifications");
    const res = await Notifications.getPermissionsAsync();
    return res.granted;
  } catch {
    return false;
  }
}

async function defaultSchedule(endsAtMs: number): Promise<string> {
  const Notifications = await import("expo-notifications");
  const seconds = Math.max(1, Math.ceil((endsAtMs - Date.now()) / 1000));
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Rest over — next set",
      body: "Your rest timer finished. Time to lift.",
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
    const Notifications = await import("expo-notifications");
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
 */
export async function scheduleRestAlert(
  handle: RestAlertHandle,
  endsAtMs: number,
  deps: RestAlertDeps = defaultRestAlertDeps,
): Promise<string | null> {
  await cancelRestAlert(handle, deps);
  try {
    if (!(await deps.isGranted())) return null;
    const id = await deps.schedule(endsAtMs);
    handle.id = id;
    return id;
  } catch (error) {
    deps.log?.("[rest] alert schedule failed", error);
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
