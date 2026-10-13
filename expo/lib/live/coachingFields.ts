import type { LiveWorkoutExercise } from "@/components/live/LiveWorkoutClient";

/**
 * LIVE EXERCISE COACHING FIELDS (NP-235).
 *
 * The web hydrates these onto every program exercise (`ProgramExerciseSchema`
 * → `LiveWorkoutClient`): the coaching `tip` (green), the `tempo`
 * prescription (e.g. "3-1-1"), the `rpe` prescription, the timed `duration`
 * prescription (e.g. "30s", shown as `durationLabel`), the target
 * `primaryMuscles` (up to 3 shown as pills by `LiveExerciseDetails`, NP-234)
 * and the program's `difficulty` label (the Track accordion's "sets ·
 * Beginner" line, NP-287).
 * Pure on purpose: `useLiveWorkout` spreads it at hydration and carries the
 * hydrated values through the saved-log merge, and jest pins the mapping
 * here without mounting anything.
 */

export type LiveCoachingFields = Pick<
  LiveWorkoutExercise,
  "tip" | "tempo" | "rpe" | "durationLabel" | "primaryMuscles" | "difficulty"
>;

/**
 * Pick the coaching fields off a program exercise, omitting anything absent
 * (or wrongly typed: `rpe` is a number only, `duration` a string only, and
 * `primaryMuscles` an array — non-string entries inside it are dropped).
 */
export function coachingFieldsFrom(ex: any): LiveCoachingFields {
  const out: LiveCoachingFields = {};
  if (typeof ex?.tip === "string" && ex.tip.trim().length > 0) {
    out.tip = ex.tip;
  }
  if (typeof ex?.tempo === "string" && ex.tempo.trim().length > 0) {
    out.tempo = ex.tempo;
  }
  if (typeof ex?.rpe === "number" && Number.isFinite(ex.rpe)) {
    out.rpe = ex.rpe;
  }
  if (typeof ex?.duration === "string" && ex.duration.trim().length > 0) {
    out.durationLabel = ex.duration;
  }
  if (typeof ex?.difficulty === "string" && ex.difficulty.trim().length > 0) {
    out.difficulty = ex.difficulty;
  }
  if (Array.isArray(ex?.primaryMuscles)) {
    const muscles = ex.primaryMuscles.filter(
      (m: unknown): m is string =>
        typeof m === "string" && m.trim().length > 0,
    );
    if (muscles.length > 0) {
      out.primaryMuscles = muscles;
    }
  }
  return out;
}
