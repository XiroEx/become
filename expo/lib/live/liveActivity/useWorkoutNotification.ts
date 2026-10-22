/**
 * React wrapper around `workoutNotification.ts` — shows the Android ongoing
 * notification once the workout screen has something to show, refreshes it
 * on every change the member sees (exercise, set, rest), and dismisses it
 * on unmount: the live workout route renders ONE `LiveWorkoutClient` per
 * session, swapped for the summary on finish and navigated away from on
 * discard (`useLiveBackGuard`) — so unmount of the component holding this
 * hook IS "the workout ended", both ways named in the card.
 *
 * Mirrors `useWorkoutLiveActivity.ts` (NP-188) on purpose: same options
 * shape, same start-once / update-on-change / end-on-inactive-or-unmount
 * lifecycle, same DI arrangement. NEVER loads the real `expo-notifications`
 * wrapper itself. `options.native` is explicit DI, always coerced to `null`
 * when omitted — this hook is used inside `LiveWorkoutClient`, a component
 * dozens of unrelated tests render with no notification DI at all, and the
 * real loader touches the native module, which must only load from a
 * production entry point (the live workout ROUTE, which wires the real
 * native wrapper once and hands it down) — never implicitly from this
 * shared component. If `native` arrives AFTER the session is already
 * active (the route's own load has not resolved yet), the effect below
 * retries the start the moment it does.
 *
 * THE CLOCK: the row's body names the rest remainder as text, so the hook
 * reads the clock itself (`Date.now()`, or `options.now` in tests) at the
 * moment it (re-)schedules — the same instant the render it reacts to
 * committed. Passing the remainder through the render would freeze it at
 * whatever the last render saw; reading it here keeps the row and the
 * in-app timer on the same `endsAt`.
 */
import { useEffect, useRef } from "react";
import {
  createWorkoutNotificationHandle,
  endWorkoutNotification,
  startWorkoutNotification,
  updateWorkoutNotification,
  type WorkoutNotificationHandle,
  type WorkoutNotificationNative,
  type WorkoutNotificationPhase,
  type WorkoutNotificationProps,
} from "@/lib/live/liveActivity/workoutNotification";

export interface UseWorkoutNotificationOptions {
  /** True once there is a real workout on screen to show in the shade. */
  active: boolean;
  workoutTitle: string;
  exerciseName: string;
  setLabel: string;
  phase: WorkoutNotificationPhase;
  /** `rest.endsAt`, verbatim — the rule that travels. */
  restEndsAtMs: number | null;
  restTotalSec: number | null;
  /** DI for tests, and the route's real production native wrapper. Omitted = none. */
  handle?: WorkoutNotificationHandle;
  native?: WorkoutNotificationNative | null;
  /**
   * Clock injection point for tests. Defaults to `Date.now` — the same
   * clock the in-app rest timer reads.
   */
  now?: () => number;
}

/**
 * Shows the row once `active` is true AND a native wrapper is available
 * (retrying if the wrapper arrives later), refreshes it whenever the
 * description changes while it is showing, and dismisses it when `active`
 * turns false or the component unmounts — whichever comes first.
 */
export function useWorkoutNotification(
  options: UseWorkoutNotificationOptions,
): void {
  const handleRef = useRef<WorkoutNotificationHandle>(
    options.handle ?? createWorkoutNotificationHandle(),
  );
  const startedRef = useRef(false);
  const native = options.native ?? null;
  const now = options.now ?? Date.now;

  const snapshot: WorkoutNotificationProps = {
    workoutTitle: options.workoutTitle,
    exerciseName: options.exerciseName,
    setLabel: options.setLabel,
    phase: options.phase,
    restEndsAtMs: options.restEndsAtMs,
    restTotalSec: options.restTotalSec,
  };

  useEffect(() => {
    const handle = handleRef.current;
    if (!options.active) {
      if (startedRef.current) {
        startedRef.current = false;
        void endWorkoutNotification(handle, native);
      }
      return;
    }
    if (!startedRef.current) {
      // No-op (and no later retry scheduled by this call alone) when
      // `native` is null — the effect re-runs on its own the moment
      // `native` changes, which is what actually retries the start.
      void startWorkoutNotification(handle, snapshot, native, now()).then(() => {
        if (handle.showing) startedRef.current = true;
      });
      return;
    }
    void updateWorkoutNotification(handle, snapshot, native, now());
    // Intentionally keyed on the description's own fields (plus `native`),
    // not on `options` or `snapshot` identity: a fresh object literal every
    // render must not churn the native bridge on every tick of the on-screen
    // session timer. `options.now` is deliberately NOT a dep: it is a test
    // clock, stable for the life of the test.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.active,
    options.workoutTitle,
    options.exerciseName,
    options.setLabel,
    options.phase,
    options.restEndsAtMs,
    options.restTotalSec,
    native,
  ]);

  // Belt-and-suspenders end on unmount — covers a discard that never flips
  // `active` to false first (the component is simply gone).
  useEffect(() => {
    const handle = handleRef.current;
    return () => {
      if (startedRef.current) {
        startedRef.current = false;
        void endWorkoutNotification(handle, native);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
