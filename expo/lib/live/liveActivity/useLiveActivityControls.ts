/**
 * THE LOCK SCREEN BUTTONS, APP SIDE (NP-188, interactive Live Activity).
 *
 * A press on the activity's − / + / Log set buttons runs the extension's
 * `LiveActivityUserInteraction` intent (an `AppIntent` in the APP's process,
 * iOS 17+), which does NOT change the activity's props itself — it only
 * emits `{ source, target, timestamp, type: 'ExpoWidgetsUserInteraction' }`
 * to JS. This hook subscribes to those events (`addUserInteractionListener`
 * from `expo-widgets`) and mirrors them into the live workout's own state:
 * the steppers edit the current set's weight input in the live grid, and
 * Log runs the on-screen Complete path — so the rest timer, the rest alert,
 * the autosave and the activity's rest phase all follow from the normal
 * path, and the next activity update redraws the number.
 *
 * EVERYTHING HERE IS BEST-EFFORT, like `workoutLiveActivity.ts`: a live
 * workout must never fail because ActivityKit is unavailable — the loader
 * below swallows and no-ops off iOS / without the native module.
 */
import { useEffect } from "react";
import { Platform } from "react-native";

/** The `target` identifiers the Lock Screen layout stamps on its buttons. */
export const LIVE_ACTIVITY_WEIGHT_UP = "weight-up";
export const LIVE_ACTIVITY_WEIGHT_DOWN = "weight-down";
export const LIVE_ACTIVITY_LOG_SET = "log-set";
/** The reps − / + beside the weight ones (Jon, 2026-10-29). */
export const LIVE_ACTIVITY_REPS_UP = "reps-up";
export const LIVE_ACTIVITY_REPS_DOWN = "reps-down";
/** Pause / resume the rest, one button that flips with the state. */
export const LIVE_ACTIVITY_REST_TOGGLE = "rest-toggle";
export const LIVE_ACTIVITY_REST_SKIP = "rest-skip";

/** The slice of `expo-widgets`' `UserInteractionEvent` this hook reads. */
export interface LiveActivityUserInteraction {
  source?: string | null;
  target?: string | null;
}

export interface LiveActivityInteractionSubscription {
  remove(): void;
}

export type AddUserInteractionListener = (
  listener: (event: LiveActivityUserInteraction) => void,
) => LiveActivityInteractionSubscription;

/**
 * The real `expo-widgets` listener, or null off iOS / without the native
 * module. `require`d inside the loader — never at the top of this file — for
 * the same reason `loadWorkoutLiveActivityFactory` does it: the native
 * module only exists in a dev / store build.
 *
 * DI for tests: pass `subscribe` to drive this without `expo-widgets`.
 */
export function loadUserInteractionListener(
  subscribe?: AddUserInteractionListener,
): AddUserInteractionListener | null {
  if (Platform.OS !== "ios") return null;
  try {
    return (
      subscribe ??
      (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("expo-widgets") as {
          addUserInteractionListener: AddUserInteractionListener;
        }
      ).addUserInteractionListener
    );
  } catch {
    return null;
  }
}

export interface UseLiveActivityControlsOptions {
  /** The stepper size in the member's unit — 5 for lb, 2.5 for kg. */
  weightStep: number;
  /** Write `delta` into the current set's weight input (clamped at 0). */
  onAdjustWeight: (delta: number) => void;
  /** The on-screen Complete path (`handleCompleteStep`), verbatim. */
  onLogSet: () => void;
  /** While resting the steppers adjust the next set and Log is ignored. */
  resting: boolean;
  /** Reps − / +: called with -1 or +1. Omitted, the reps buttons do nothing. */
  onAdjustReps?: (delta: number) => void;
  /** Pause a running rest, or resume a paused one. Only while resting. */
  onToggleRest?: () => void;
  /** End the rest now. Only while resting. */
  onSkipRest?: () => void;
  /** DI for tests. Omitted, the real `expo-widgets` listener loads. */
  subscribe?: AddUserInteractionListener;
}

/**
 * Mirror the Lock Screen buttons into the live workout. The layout shows no
 * Log button while resting, but a stale activity could still deliver one —
 * so `log-set` is ignored while resting here too, never only in the layout.
 */
export function useLiveActivityControls(
  options: UseLiveActivityControlsOptions,
): void {
  const {
    weightStep,
    onAdjustWeight,
    onLogSet,
    resting,
    subscribe,
    onAdjustReps,
    onToggleRest,
    onSkipRest,
  } = options;
  useEffect(() => {
    const add = loadUserInteractionListener(subscribe);
    if (!add) return;
    let subscription: LiveActivityInteractionSubscription | null = null;
    try {
      subscription = add((event) => {
        // `source` is the name passed to `createLiveActivity`; anything else
        // is another widget's button. An absent source is accepted — the
        // targets below are this activity's own.
        // Not filtered on `source`: what expo-widgets reports there for a
        // Live Activity is its own naming, and a mismatch would drop every
        // press silently. The three targets are unique to this activity.
        const target = event?.target;
        if (target === LIVE_ACTIVITY_WEIGHT_UP) {
          onAdjustWeight(weightStep);
        } else if (target === LIVE_ACTIVITY_WEIGHT_DOWN) {
          onAdjustWeight(-weightStep);
        } else if (target === LIVE_ACTIVITY_LOG_SET && !resting) {
          onLogSet();
        } else if (target === LIVE_ACTIVITY_REPS_UP) {
          onAdjustReps?.(1);
        } else if (target === LIVE_ACTIVITY_REPS_DOWN) {
          onAdjustReps?.(-1);
        } else if (target === LIVE_ACTIVITY_REST_TOGGLE && resting) {
          onToggleRest?.();
        } else if (target === LIVE_ACTIVITY_REST_SKIP && resting) {
          onSkipRest?.();
        }
      });
    } catch {
      return;
    }
    return () => {
      try {
        subscription?.remove();
      } catch {
        /* unmount must never break a workout */
      }
    };
  }, [
    weightStep,
    onAdjustWeight,
    onLogSet,
    resting,
    subscribe,
    onAdjustReps,
    onToggleRest,
    onSkipRest,
  ]);
}
