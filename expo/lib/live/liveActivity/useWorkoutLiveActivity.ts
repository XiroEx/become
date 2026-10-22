/**
 * React wrapper around `workoutLiveActivity.ts` — starts the Lock Screen
 * activity once the workout screen has something to show, updates it on
 * every change the member sees (exercise, set, rest), and ends it on
 * unmount: the live workout route renders ONE `LiveWorkoutClient` (or
 * `LiveStepView`'s owner) per session, swapped for the summary on finish
 * and navigated away from on discard (`useLiveBackGuard`) — so unmount of
 * the component holding this hook IS "the workout ended", both ways named
 * in the card.
 *
 * NEVER loads the real `expo-widgets` factory itself. `options.factory` is
 * explicit DI, always coerced to `null` when omitted — this hook is used
 * inside `LiveWorkoutClient`, a component dozens of unrelated tests render
 * with no Live Activity DI at all, and the real factory's default loader
 * touches `@expo/ui/swift-ui` (`WorkoutLiveActivityLayout.tsx`'s imports),
 * which must only load from a production entry point (the live workout
 * ROUTE, which wires the real factory once and hands it down) — never
 * implicitly from this shared component. If `factory` arrives AFTER the
 * session is already active (the route's own load has not resolved yet),
 * the effect below retries the start the moment it does.
 */
import { useEffect, useRef } from "react";
import {
  createWorkoutLiveActivityHandle,
  endWorkoutLiveActivity,
  startWorkoutLiveActivity,
  updateWorkoutLiveActivity,
  type WorkoutLiveActivityFactory,
  type WorkoutLiveActivityHandle,
  type WorkoutLiveActivityPhase,
  type WorkoutLiveActivityProps,
} from "@/lib/live/liveActivity/workoutLiveActivity";

export interface UseWorkoutLiveActivityOptions {
  /** True once there is a real workout on screen to show on the Lock Screen. */
  active: boolean;
  workoutTitle: string;
  exerciseName: string;
  setLabel: string;
  phase: WorkoutLiveActivityPhase;
  /** `rest.endsAt`, verbatim — the rule that travels. */
  restEndsAtMs: number | null;
  restTotalSec: number | null;
  /**
   * The current set's load for the Lock Screen − / + controls
   * (`weightLabel` on the props). Omitted when the set has no load.
   * DI for tests, and the route's real value. Omitted = no controls.
   */
  weightLabel?: string;
  /** DI for tests, and the route's real production factory. Omitted = none. */
  handle?: WorkoutLiveActivityHandle;
  factory?: WorkoutLiveActivityFactory | null;
}

/**
 * Starts the activity once `active` is true AND a factory is available
 * (retrying if the factory arrives later), pushes an update whenever the
 * description changes while it is running, and ends it when `active` turns
 * false or the component unmounts — whichever comes first.
 */
export function useWorkoutLiveActivity(
  options: UseWorkoutLiveActivityOptions,
): void {
  const handleRef = useRef<WorkoutLiveActivityHandle>(
    options.handle ?? createWorkoutLiveActivityHandle(),
  );
  const startedRef = useRef(false);
  const factory = options.factory ?? null;

  const snapshot: WorkoutLiveActivityProps = {
    workoutTitle: options.workoutTitle,
    exerciseName: options.exerciseName,
    setLabel: options.setLabel,
    phase: options.phase,
    restEndsAtMs: options.restEndsAtMs,
    restTotalSec: options.restTotalSec,
    // Omitted, never null — ActivityKit refuses a dictionary with null (PR #2159).
    ...(options.weightLabel !== undefined
      ? { weightLabel: options.weightLabel }
      : {}),
  };

  useEffect(() => {
    const handle = handleRef.current;
    if (!options.active) {
      if (startedRef.current) {
        startedRef.current = false;
        void endWorkoutLiveActivity(handle);
      }
      return;
    }
    if (!startedRef.current) {
      // No-op (and no later retry scheduled by this call alone) when
      // `factory` is null — the effect re-runs on its own the moment
      // `factory` changes, which is what actually retries the start.
      startWorkoutLiveActivity(handle, snapshot, factory);
      if (handle.instance) startedRef.current = true;
      return;
    }
    void updateWorkoutLiveActivity(handle, snapshot);
    // Intentionally keyed on the description's own fields (plus `factory`),
    // not on `options` or `snapshot` identity: a fresh object literal every
    // render must not churn the native bridge on every tick of the on-screen
    // session timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.active,
    options.workoutTitle,
    options.exerciseName,
    options.setLabel,
    options.phase,
    options.restEndsAtMs,
    options.restTotalSec,
    options.weightLabel,
    factory,
  ]);

  // Belt-and-suspenders end on unmount — covers a discard that never flips
  // `active` to false first (the component is simply gone).
  useEffect(() => {
    const handle = handleRef.current;
    return () => {
      if (startedRef.current) {
        startedRef.current = false;
        void endWorkoutLiveActivity(handle);
      }
    };
  }, []);
}
