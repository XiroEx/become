/**
 * THE ANDROID ONGOING WORKOUT NOTIFICATION (NP-200, the Android twin of the
 * NP-188 Lock Screen Live Activity).
 *
 * A member between sets should see the exercise and the rest countdown
 * without unlocking — on Android that is an ongoing notification on its own
 * channel, updated on set completion and rest start, dismissed on finish.
 *
 * HOW IT WORKS: `expo-notifications` has no `presentNotificationAsync` — the
 * only way to put a notification in the shade from JS is
 * `scheduleNotificationAsync`, and the only way to remove one is
 * `dismissNotificationAsync`. So the ongoing notification is a SCHEDULED
 * notification with a fixed identifier (`WORKOUT_NOTIFICATION_ID`):
 * re-scheduling the same identifier replaces the previous one in place
 * (same tag + same id = one row, updated, never a stack), and dismissing
 * that identifier removes it. `sticky: true` maps to Android's
 * `setOngoing(true)` — the notification cannot be swiped away, exactly like
 * the iOS activity cannot be swiped away.
 *
 * THE FOREGROUND CATCH: while the app is foregrounded, a triggered
 * notification is routed through the JS `handleNotification` handler — and
 * this app installs a QUIET handler (`lib/push/tapRouter.ts`: no banner, no
 * list) so reminders never cover the screen. A quiet handler means
 * `shouldPresentAlert == false`, and the native presenter then SKIPS the
 * notification entirely. So the ongoing notification is scheduled with a
 * channel-only trigger (`{ channelId }`, no `type`): the native scheduler
 * presents channel-triggered notifications DIRECTLY, bypassing the
 * foreground handler — the row appears in the shade even mid-workout.
 * (Push-remote and time-interval triggers go through the handler; the
 * channel-only trigger does not. Verified against the expo-notifications
 * 57 native sources: `ExpoSchedulingDelegate.scheduleNotification` calls
 * `NotificationsService.receive` immediately for `ChannelAwareTrigger`, and
 * `ExpoHandlingDelegate.handleNotification` only consults JS listeners when
 * the app is foregrounded — but `receive` for a channel trigger presents
 * without asking. The rest-end alert on `rest-timer` relies on the same
 * path.)
 *
 * THE REST COUNTDOWN: Android notifications are static — there is no
 * SwiftUI `Text(timerInterval:)` equivalent. The body therefore names the
 * remaining seconds as text ("Rest 1:30 left"), recomputed from
 * `restEndsAtMs` on every update. The row refreshes on every change the
 * member sees (exercise, set, rest start) because `useWorkoutNotification`
 * re-schedules on each of those — the same cadence as the iOS activity's
 * updates. Between updates the number goes stale rather than ticking; that
 * is the platform limit, and the in-app timer stays the live one.
 *
 * PERMISSION: `POST_NOTIFICATIONS` is already declared in `app.json`
 * (NP-206). This module never asks for it — like the locked-phone rest
 * alert (`lib/live/restAlert.ts`), it only posts when the permission is
 * already granted, and stays silent otherwise. The workout still runs, just
 * without the shade companion.
 *
 * EVERYTHING HERE IS BEST-EFFORT. A live workout must never fail, stall or
 * show an error because notifications are unavailable (permission denied,
 * Expo Go, Jest) — every function below swallows and no-ops.
 */
import { Platform } from "react-native";

export type WorkoutNotificationPhase = "exercise" | "rest";

export interface WorkoutNotificationProps {
  /** The workout's title, e.g. "Upper Body". */
  workoutTitle: string;
  /** The exercise the member is currently standing on. */
  exerciseName: string;
  /** "Set 2 of 4" — the member's position within that exercise. */
  setLabel: string;
  /** Lifting, or resting between sets. */
  phase: WorkoutNotificationPhase;
  /**
   * The instant the rest ends, in epoch ms — `rest.endsAt` from
   * `useRestTimer`, verbatim. Null when not resting.
   */
  restEndsAtMs: number | null;
  /** The rest's total length in seconds, for a progress read-out. Null when not resting. */
  restTotalSec: number | null;
}

/**
 * The notification's fixed identifier. Re-scheduling this identifier
 * replaces the row in place; dismissing it removes the row. It is also the
 * `data.notificationId` on the content, so a tap can be told apart from the
 * rest-end alert's tap (which carries no such id).
 */
export const WORKOUT_NOTIFICATION_ID = "become-live-workout";

/** The notification's own channel — separate from the rest-end alert's `rest-timer`. */
export const WORKOUT_NOTIFICATION_CHANNEL_ID = "live-workout";

/** The thin shape this module needs from `expo-notifications`. */
export interface WorkoutNotificationNative {
  schedule: (request: {
    identifier: string;
    content: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
      sticky?: boolean;
      autoDismiss?: boolean;
      sound?: boolean;
    };
    trigger: { channelId: string };
  }) => Promise<string>;
  dismiss: (identifier: string) => Promise<void>;
  isGranted: () => Promise<boolean>;
  ensureChannel: () => Promise<void>;
}

/** One live workout, one notification: the handle a session's start/update/end calls share. */
export interface WorkoutNotificationHandle {
  /** True while the row is (believed to be) in the shade. */
  showing: boolean;
  /**
   * Why the last start/update/end did nothing — readable on-device for
   * debugging. Null after a clean start. Never throws, never shown to the
   * member.
   */
  lastFailure?: WorkoutNotificationFailureReason | null;
}

/** Machine-readable reason a start/update/end became a silent no-op. */
export type WorkoutNotificationFailureReason =
  | "not-android"
  | "no-permission"
  | "already-showing"
  | "start-threw"
  | "update-failed"
  | "end-failed";

function reportFailure(
  handle: WorkoutNotificationHandle,
  reason: WorkoutNotificationFailureReason | null,
): void {
  handle.lastFailure = reason;
}

function warnFailure(
  reason: WorkoutNotificationFailureReason,
  detail?: unknown,
): void {
  try {
    // Prefix is the grep hook: device logs (adb logcat) can filter it
    // while the workout itself stays best-effort and silent to the member.
    if (detail !== undefined) {
      console.warn(`[WorkoutNotification] ${reason}`, detail);
    } else {
      console.warn(`[WorkoutNotification] ${reason}`);
    }
  } catch {
    /* logging must never break a workout */
  }
}

/** A fresh handle per live workout session. */
export function createWorkoutNotificationHandle(): WorkoutNotificationHandle {
  return { showing: false };
}

/**
 * `m:ss` — the same shape as the in-app rest timer (`lib/live/liveProgress.ts`
 * `formatElapsed`): `90` → `1:30`. Minutes are unbounded, never hours.
 */
export function formatRestRemaining(totalMs: number): string {
  const totalSec = Math.max(0, Math.ceil(totalMs / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** The row's title: the workout, always. */
/** The local wall-clock time of an instant, as the phone's locale writes it. */
export function formatClockTime(atMs: number): string {
  return new Date(atMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function workoutNotificationTitle(props: WorkoutNotificationProps): string {
  return props.workoutTitle;
}

/**
 * The row's body: the exercise + position while lifting, the countdown
 * while resting. The countdown is `restEndsAtMs - nowMs` as text — a
 * snapshot, not a ticking clock (Android notifications are static).
 *
 * `nowMs` defaults to `Date.now()` in production. Tests that freeze the
 * clock (a stub interval + a fixed `now`) pass the frozen instant here —
 * but note the row is refreshed asynchronously (a promise hop after the
 * state change), so a test asserting the countdown must advance its frozen
 * clock past the scheduling hop, exactly like the in-app timer's own tick
 * does.
 */
export function workoutNotificationBody(
  props: WorkoutNotificationProps,
  nowMs: number = Date.now(),
): string {
  if (props.phase === "rest" && props.restEndsAtMs !== null) {
    // The row is re-posted only when the workout CHANGES, never per second, so
    // a countdown in it would freeze at its first value. Show the rest length
    // and the wall-clock time it ends instead: both stay true until the next
    // update.
    const length = formatRestRemaining(
      (props.restTotalSec ?? Math.max(0, props.restEndsAtMs - nowMs) / 1000) * 1000,
    );
    return `${props.exerciseName} · ${props.setLabel} · Rest ${length}, back at ${formatClockTime(props.restEndsAtMs)}`;
  }
  return `${props.exerciseName} · ${props.setLabel}`;
}

/**
 * The real `expo-notifications` wrapper, or null off Android / without the
 * native module (Expo Go, Jest). `require`d inside the loader — never at the
 * top of this file — for the same reason `lib/live/restAlert.ts` does it:
 * the native module only exists in a dev / store build, and the package's
 * own proxy throws on first property access where it is absent.
 *
 * DI for tests: pass `native` to drive this with a fake instead of
 * `expo-notifications`, and `platform` to pretend to be Android under Jest.
 */
export function loadWorkoutNotificationNative(
  native?: WorkoutNotificationNative,
  platform?: string,
): WorkoutNotificationNative | null {
  if ((platform ?? Platform.OS) !== "android") return null;
  if (native) return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications") as {
      scheduleNotificationAsync: (request: {
        identifier: string;
        content: Record<string, unknown>;
        trigger: { channelId: string };
      }) => Promise<string>;
      dismissNotificationAsync: (identifier: string) => Promise<void>;
      getPermissionsAsync: () => Promise<{ granted: boolean }>;
      setNotificationChannelAsync: (
        id: string,
        channel: Record<string, unknown>,
      ) => Promise<unknown>;
    };
    return {
      schedule: (request) =>
        Notifications.scheduleNotificationAsync({
          identifier: request.identifier,
          content: {
            title: request.content.title,
            body: request.content.body,
            data: {
              ...(request.content.data ?? {}),
              notificationId: WORKOUT_NOTIFICATION_ID,
            },
            // Ongoing: cannot be swiped away (Android `setOngoing(true)`).
            // `autoDismiss: false` keeps a tap from clearing it either — the
            // row lives until the workout ends it.
            sticky: true,
            autoDismiss: false,
            // Silent: the rest-end alert (sound + vibration) is the alarm;
            // this row is a glance, not a second alarm on every set.
            sound: false,
          },
          trigger: request.trigger,
        }),
      dismiss: (identifier) => Notifications.dismissNotificationAsync(identifier),
      isGranted: async () => {
        try {
          return (await Notifications.getPermissionsAsync()).granted;
        } catch {
          return false;
        }
      },
      ensureChannel: async () => {
        try {
          await Notifications.setNotificationChannelAsync(
            WORKOUT_NOTIFICATION_CHANNEL_ID,
            {
              name: "Live Workout",
              description:
                "Shows the current exercise and rest countdown during a live workout.",
              importance: 4 /* AndroidImportance.LOW: no sound, no heads-up on every re-post */,
              sound: null,
              vibrationPattern: null,
            },
          );
        } catch {
          /* channels are a nicety, never a launch blocker */
        }
      },
    };
  } catch {
    return null;
  }
}

/**
 * Show the ongoing row for a freshly opened live workout. No-op (never
 * throws) when there is no Android surface, when the permission is not
 * already granted (never prompts — NP-206 owns the ask), or when a row is
 * already showing on this handle. The workout still runs, just without the
 * shade companion.
 */
export async function startWorkoutNotification(
  handle: WorkoutNotificationHandle,
  props: WorkoutNotificationProps,
  native: WorkoutNotificationNative | null = loadWorkoutNotificationNative(),
  nowMs: number = Date.now(),
): Promise<void> {
  if (!native) {
    reportFailure(handle, "not-android");
    return;
  }
  if (handle.showing) {
    reportFailure(handle, "already-showing");
    return;
  }
  try {
    if (!(await native.isGranted())) {
      reportFailure(handle, "no-permission");
      warnFailure("no-permission");
      return;
    }
    await native.ensureChannel();
    await native.schedule({
      identifier: WORKOUT_NOTIFICATION_ID,
      content: {
        title: workoutNotificationTitle(props),
        body: workoutNotificationBody(props, nowMs),
        data: { notificationId: WORKOUT_NOTIFICATION_ID },
        sticky: true,
        autoDismiss: false,
        sound: false,
      },
      trigger: { channelId: WORKOUT_NOTIFICATION_CHANNEL_ID },
    });
    handle.showing = true;
    reportFailure(handle, null);
  } catch (err) {
    handle.showing = false;
    reportFailure(handle, "start-threw");
    warnFailure("start-threw", err);
  }
}

/**
 * Refresh the row's content — a set completed, a rest started, or the
 * countdown's duration changed. Re-schedules the SAME identifier, which
 * replaces the row in place (never a stack). No-op when nothing is showing.
 */
export async function updateWorkoutNotification(
  handle: WorkoutNotificationHandle,
  props: WorkoutNotificationProps,
  native: WorkoutNotificationNative | null = loadWorkoutNotificationNative(),
  nowMs: number = Date.now(),
): Promise<void> {
  if (!native || !handle.showing) return;
  try {
    await native.schedule({
      identifier: WORKOUT_NOTIFICATION_ID,
      content: {
        title: workoutNotificationTitle(props),
        body: workoutNotificationBody(props, nowMs),
        data: { notificationId: WORKOUT_NOTIFICATION_ID },
        sticky: true,
        autoDismiss: false,
        sound: false,
      },
      trigger: { channelId: WORKOUT_NOTIFICATION_CHANNEL_ID },
    });
  } catch (err) {
    reportFailure(handle, "update-failed");
    warnFailure("update-failed", err);
  }
}

/**
 * Remove the row — the workout finished or was discarded. Clears the
 * handle FIRST so a concurrent call never double-dismisses. No-op when
 * nothing is showing.
 */
export async function endWorkoutNotification(
  handle: WorkoutNotificationHandle,
  native: WorkoutNotificationNative | null = loadWorkoutNotificationNative(),
): Promise<void> {
  if (!native || !handle.showing) return;
  handle.showing = false;
  try {
    await native.dismiss(WORKOUT_NOTIFICATION_ID);
  } catch (err) {
    reportFailure(handle, "end-failed");
    warnFailure("end-failed", err);
  }
}
