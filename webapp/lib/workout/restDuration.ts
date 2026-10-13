// NP-210: the ONE rest-duration rule for both the Live and Track workout
// views. It used to live only inside LiveWorkoutClient.tsx — Track had no
// rest timer at all, so there was nothing to share it with. Track now reuses
// this module rather than inventing its own rest-duration maths (Jon's
// decision on NP-028: the same rest alert, and by extension the same rest
// length, applies "for both live and track").
//
// Pure, no React/DOM — safe to unit test directly and to import from either
// client component.

export interface RestExercise {
  trackingType?: string;
  type?: string;
  rest?: string;
  groupRest?: string;
}

/** Any exercise shape that carries the groupId both views key superset
 *  membership off of. */
export interface GroupableExercise {
  groupId?: string | null;
}

export interface RestGroupContext {
  /** This exercise is part of a superset/circuit group. */
  inGroup: boolean;
  /** This exercise is the last one in its group's round (so the group's
   *  rest — not mid-round silence — applies once the round completes). */
  isLastInRound: boolean;
}

/** No group context: a plain, ungrouped exercise always rests on its own. */
const UNGROUPED: RestGroupContext = { inGroup: false, isLastInRound: true };

/** Turn a rest string ("90s", "3min", "2 minutes") into whole seconds. */
export function parseRestTime(rest: string): number {
  const match = rest.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1]);
    if (rest.includes("min")) return num * 60;
    return num;
  }
  return 60;
}

// Smart rest default based on tracking type: heavy compound → 3min,
// bodyweight/isolation → 90s, else 60s.
export function getSmartRestDefault(exercise?: RestExercise): string {
  const t = exercise?.trackingType || exercise?.type || "";
  if (t === "reps_weight") return "3min";
  if (t === "reps_bodyweight" || t === "reps_only") return "90s";
  return "60s";
}

/**
 * Rest duration, in seconds, for one exercise.
 *
 * - Ungrouped (or no context passed): the exercise's own `rest` field, or the
 *   smart default for its tracking type.
 * - Mid-round inside a superset/circuit (not the last exercise in the
 *   group): no rest between exercises — 0.
 * - Last exercise in a superset/circuit round: the group's `groupRest`, or
 *   the exercise's own `rest`, or the smart default.
 */
export function getRestDuration(
  exercise: RestExercise | undefined,
  context: RestGroupContext = UNGROUPED,
): number {
  if (context.inGroup && !context.isLastInRound) {
    return 0;
  }
  if (context.inGroup && context.isLastInRound) {
    return parseRestTime(exercise?.groupRest || exercise?.rest || getSmartRestDefault(exercise));
  }
  return parseRestTime(exercise?.rest || getSmartRestDefault(exercise));
}

/**
 * Derives the same `{ inGroup, isLastInRound }` context Live's
 * `buildWorkoutFlow` attaches to each step, but from a flat exercises array —
 * Track has no step flow, just the exercises themselves. Matches
 * `groupExercises` in `lib/workoutUtils.ts`: a group is the maximal run of
 * consecutive exercises sharing the same `groupId`.
 */
export function restGroupContext<T extends GroupableExercise>(
  exercises: T[],
  exerciseIndex: number,
): RestGroupContext {
  const groupId = exercises[exerciseIndex]?.groupId;
  if (!groupId) return UNGROUPED;
  let lastInGroup = exerciseIndex;
  while (lastInGroup + 1 < exercises.length && exercises[lastInGroup + 1]?.groupId === groupId) {
    lastInGroup++;
  }
  return { inGroup: true, isLastInRound: exerciseIndex === lastInGroup };
}
