import type { LiveSetState } from "@/components/live/LiveSetRow";

/**
 * THE SKIPPED-SET SHAPE (NP-081).
 *
 * Web equivalent: `skipSet` / `skipExercise` in
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
 * (`{ reps: "0", weight: "0", speed: "", completed: true }`) and the Track
 * client's twin in `WorkoutFormClient.tsx`.
 *
 * The rule that travels: a skipped set is saved as COMPLETED with reps 0
 * and weight 0 — which is how history, PR detection and the calendar tell
 * it apart from an unfinished set. Natively the grid holds numbers, so the
 * translation is `reps: 0, weight: 0` with every optional channel cleared
 * (a skipped cardio round is not 30 seconds of cardio) and `completed:
 * true`. The save builder already writes `reps ?? 0` / `weight ?? 0`, so a
 * skipped set arrives at the server as `reps: 0, weight: 0, completed:
 * true` — exactly what the web saves, which is what the web's Track view
 * reads back.
 */

/** A completed-but-skipped set: zeros, not blanks. */
export function skippedSetState(): LiveSetState {
  return {
    reps: 0,
    weight: 0,
    durationSec: null,
    distance: null,
    speed: null,
    completed: true,
  };
}
