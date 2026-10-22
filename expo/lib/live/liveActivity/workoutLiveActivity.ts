/**
 * THE LOCK-SCREEN LIVE WORKOUT (NP-188, ActivityKit via `expo-widgets`).
 *
 * A member between sets should see the exercise and the rest countdown
 * without unlocking. `expo-widgets` (already mounted for the Home/Lock
 * Screen widgets, NP-181) ships its own ActivityKit extension and native
 * module — `createLiveActivity` / `LiveActivityFactory` / `LiveActivity` in
 * `node_modules/expo-widgets/build/Widgets.d.ts` — so this card needs no new
 * native module of its own: one JS registration
 * (`ios/WorkoutLiveActivityLayout.tsx`, the config-plugin-built extension's
 * layout) and this control module, which starts / updates / ends the one
 * instance a live workout owns.
 *
 * `NSSupportsLiveActivities` is already set: `app.json`'s `expo-widgets`
 * plugin block (NP-181) turns it on unconditionally for every Info.plist the
 * plugin touches (see `withAppInfoPlist.ts` in the package) — there is
 * nothing more to flip for this card.
 *
 * THE RULE THAT TRAVELS: `restEndsAtMs` is always `rest.endsAt` from
 * `useRestTimer` — the SAME wall-clock instant the in-app countdown uses,
 * never a value this module recomputes. The layout
 * (`WorkoutLiveActivityLayout.tsx`) renders it through `@expo/ui`'s
 * `Text timerInterval`, which is SwiftUI's `Text(timerInterval:)` — a
 * date-based countdown the OS keeps ticking on the Lock Screen with no
 * further JS wake-up, exactly as the card asks.
 *
 * EVERYTHING HERE IS BEST-EFFORT. A live workout must never fail, stall or
 * show an error because ActivityKit is unavailable (iOS < 16.2, Live
 * Activities turned off in Settings, Android, Expo Go, the extension not
 * built into this binary) — every function below swallows and no-ops.
 */
import { Platform } from "react-native";
import { recordLiveActivityFailure } from "@/lib/diagnostics/deviceDiagnostics";
import type { AsyncStorageLike } from "@/lib/query/persistor";

export type WorkoutLiveActivityPhase = "exercise" | "rest";

export interface WorkoutLiveActivityProps {
  /** The workout's title, e.g. "Upper Body". */
  workoutTitle: string;
  /** The exercise the member is currently standing on. */
  exerciseName: string;
  /** "Set 2 of 4" — the member's position within that exercise. */
  setLabel: string;
  /** Lifting, or resting between sets. */
  phase: WorkoutLiveActivityPhase;
  /**
   * The instant the rest ends, in epoch ms — `rest.endsAt` from
   * `useRestTimer`, verbatim. Null when not resting.
   */
  restEndsAtMs: number | null;
  /** The rest's total length in seconds, for a progress read-out. Null when not resting. */
  restTotalSec: number | null;
  /**
   * The current set's load, e.g. `"135 lbs"` — drawn beside the Lock Screen
   * − / + controls and adjusted by them. Omitted when the set has no load
   * (timed / bodyweight-only work shows no controls). Always omitted, never
   * null: ActivityKit refuses to persist a dictionary containing null (see
   * PR #2159).
   */
  weightLabel?: string;
}

/** The name `createLiveActivity` registers under, and the one this module starts. */
export const WORKOUT_LIVE_ACTIVITY_NAME = "WorkoutLiveActivity";

/** The thin shape this module needs from a started Live Activity instance. */
export interface WorkoutLiveActivityInstance {
  update: (props: WorkoutLiveActivityProps) => Promise<void>;
  end: (props?: WorkoutLiveActivityProps) => Promise<void>;
}

/** The thin shape this module needs from the Live Activity factory. */
export interface WorkoutLiveActivityFactory {
  start: (props: WorkoutLiveActivityProps) => WorkoutLiveActivityInstance | null;
}

/** One live workout, one activity: the handle a session's start/update/end calls share. */
export interface WorkoutLiveActivityHandle {
  instance: WorkoutLiveActivityInstance | null;
  /**
   * Why the last start/update/end did nothing — readable on-device for
   * debugging the sim-works-phone-silent case. Null after a clean start.
   * Never throws, never shown to the member.
   */
  lastFailure?: WorkoutLiveActivityFailureReason | null;
}

/** Machine-readable reason a start/update/end became a silent no-op. */
export type WorkoutLiveActivityFailureReason =
  | "factory-null"
  | "already-running"
  | "start-threw"
  | "start-null"
  | "update-failed"
  | "end-failed";

function reportFailure(
  handle: WorkoutLiveActivityHandle,
  reason: WorkoutLiveActivityFailureReason | null,
  storage?: AsyncStorageLike | null,
): void {
  handle.lastFailure = reason;
  // Persisted for the Settings Diagnostics block: the in-memory handle is
  // gone with the workout, and a TestFlight console cannot be read. `null`
  // (a clean start) clears the row, so a stale reason never outlives a fix.
  void recordLiveActivityFailure(reason, Date.now(), storage);
}

function warnFailure(
  reason: WorkoutLiveActivityFailureReason,
  detail?: unknown,
): void {
  try {
    // Prefix is the grep hook: device logs (Xcode/TestFlight) can filter it
    // while the workout itself stays best-effort and silent to the member.
    if (detail !== undefined) {
      console.warn(`[WorkoutLiveActivity] ${reason}`, detail);
    } else {
      console.warn(`[WorkoutLiveActivity] ${reason}`);
    }
  } catch {
    /* logging must never break a workout */
  }
}

/** A fresh handle per live workout session. */
export function createWorkoutLiveActivityHandle(): WorkoutLiveActivityHandle {
  return { instance: null };
}

/** The slice of the real `LiveActivity` this module calls, keyed to ActivityKit's own argument order. */
interface NativeLiveActivityLike {
  update: (props: unknown, staleDate?: Date) => Promise<void>;
  end: (
    dismissalPolicy?: unknown,
    props?: unknown,
    contentDate?: Date,
  ) => Promise<void>;
}

interface NativeLiveActivityFactoryLike {
  start: (props: unknown, url?: string, staleDate?: Date) => NativeLiveActivityLike;
  /** Every activity of this type the OS is still showing. */
  getInstances?: () => NativeLiveActivityLike[];
}

/**
 * End every activity of this type the OS still shows, immediately. A live
 * workout owns exactly ONE Lock Screen activity, but the handle that tracks it
 * lives in JS memory: an app reload, a crash or a kill mid-workout loses it,
 * and the activity it started stays on the Lock Screen with nothing left to
 * end it (device review 2026-10-22: two copies of the workout, and the stray
 * outliving the workout). So a start clears strays first, and an end clears
 * any that remain. Best-effort, never throws.
 */
function endStrayActivities(native: NativeLiveActivityFactoryLike): void {
  let strays: NativeLiveActivityLike[] = [];
  try {
    strays = native.getInstances?.() ?? [];
  } catch {
    return;
  }
  for (const stray of strays) {
    void stray.end("immediate").catch(() => {});
  }
}

function wrapNativeFactory(
  native: NativeLiveActivityFactoryLike,
): WorkoutLiveActivityFactory {
  return {
    start(props) {
      try {
        endStrayActivities(native);
        const activity = native.start(props);
        return {
          update: (next) => activity.update(next),
          // "immediate", not "default": iOS keeps a "default"-ended activity
          // on the Lock Screen for up to four hours, so leaving the workout
          // left it there.
          end: async (next) => {
            await activity.end("immediate", next);
            endStrayActivities(native);
          },
        };
      } catch {
        return null;
      }
    },
  };
}

/**
 * The real `expo-widgets` factory, or null off iOS / without the native
 * module (Expo Go, Jest). `require`d inside the loader — never at the top of
 * this file — for the same reason `lib/widgets/update.ts` does it: the
 * native module only exists in a dev / store build, and the package's own
 * proxy throws on first property access where it is absent.
 *
 * DI for tests: pass `createLiveActivityFn` / `layout` to drive this with a
 * fake instead of `expo-widgets`.
 */
export function loadWorkoutLiveActivityFactory(
  createLiveActivityFn?: (
    name: string,
    layout: unknown,
  ) => NativeLiveActivityFactoryLike,
  layout?: unknown,
): WorkoutLiveActivityFactory | null {
  if (Platform.OS !== "ios") return null;
  try {
    const create =
      createLiveActivityFn ??
      (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("expo-widgets") as {
          createLiveActivity: (
            name: string,
            layout: unknown,
          ) => NativeLiveActivityFactoryLike;
        }
      ).createLiveActivity;
    const activityLayout =
      layout ??
      (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@/lib/live/liveActivity/ios/WorkoutLiveActivityLayout") as {
          WorkoutLiveActivityLayout: unknown;
        }
      ).WorkoutLiveActivityLayout;
    const native = create(WORKOUT_LIVE_ACTIVITY_NAME, activityLayout);
    return wrapNativeFactory(native);
  } catch {
    return null;
  }
}

/**
 * Start the Lock Screen activity for a freshly opened live workout. No-op
 * (never throws) when there is no ActivityKit surface, when one is already
 * running on this handle, or when the member has Live Activities turned
 * off — the workout still runs, just without the Lock Screen companion.
 */
export function startWorkoutLiveActivity(
  handle: WorkoutLiveActivityHandle,
  props: WorkoutLiveActivityProps,
  factory: WorkoutLiveActivityFactory | null = loadWorkoutLiveActivityFactory(),
  storage?: AsyncStorageLike | null,
): void {
  if (!factory) {
    reportFailure(handle, "factory-null", storage);
    warnFailure("factory-null");
    return;
  }
  if (handle.instance) {
    reportFailure(handle, "already-running", storage);
    return;
  }
  try {
    handle.instance = factory.start(props);
    if (handle.instance) {
      reportFailure(handle, null, storage);
    } else {
      reportFailure(handle, "start-null", storage);
      warnFailure("start-null");
    }
  } catch (err) {
    handle.instance = null;
    reportFailure(handle, "start-threw", storage);
    warnFailure("start-threw", err);
  }
}

/**
 * Update the running activity's content — a set completed, a rest started,
 * or the countdown's duration changed. The rest end time carried here must
 * be `rest.endsAt`, not a value recomputed here (the rule that travels).
 * No-op when nothing is running.
 */
export async function updateWorkoutLiveActivity(
  handle: WorkoutLiveActivityHandle,
  props: WorkoutLiveActivityProps,
  storage?: AsyncStorageLike | null,
): Promise<void> {
  const instance = handle.instance;
  if (!instance) return;
  try {
    await instance.update(props);
  } catch (err) {
    reportFailure(handle, "update-failed", storage);
    warnFailure("update-failed", err);
  }
}

/**
 * End the activity — the workout finished or was discarded. Clears the
 * handle FIRST so a concurrent call never double-ends. No-op when nothing
 * is running.
 */
export async function endWorkoutLiveActivity(
  handle: WorkoutLiveActivityHandle,
  props?: WorkoutLiveActivityProps,
  storage?: AsyncStorageLike | null,
): Promise<void> {
  const instance = handle.instance;
  if (!instance) return;
  handle.instance = null;
  try {
    await instance.end(props);
  } catch (err) {
    reportFailure(handle, "end-failed", storage);
    warnFailure("end-failed", err);
  }
}
