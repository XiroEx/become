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
}

function wrapNativeFactory(
  native: NativeLiveActivityFactoryLike,
): WorkoutLiveActivityFactory {
  return {
    start(props) {
      try {
        const activity = native.start(props);
        return {
          update: (next) => activity.update(next),
          end: (next) => activity.end("default", next),
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
): void {
  if (!factory || handle.instance) return;
  try {
    handle.instance = factory.start(props);
  } catch {
    handle.instance = null;
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
): Promise<void> {
  const instance = handle.instance;
  if (!instance) return;
  try {
    await instance.update(props);
  } catch {
    /* best-effort: the in-app screen is still the source of truth */
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
): Promise<void> {
  const instance = handle.instance;
  if (!instance) return;
  handle.instance = null;
  try {
    await instance.end(props);
  } catch {
    /* best-effort: ending is cleanup, not a step the member is waiting on */
  }
}
