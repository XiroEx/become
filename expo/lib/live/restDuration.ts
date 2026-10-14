/**
 * THE ONE NATIVE REST-DURATION RULE (NP-082, porting the web's NP-210).
 *
 * It used to live inside `components/live/LiveWorkoutClient.tsx` next to the
 * JSX, with a flat `DEFAULT_REST_SEC = 90` standing in wherever a completed
 * set could not be found in the workout flow — so a set logged off-flow in
 * Track rested 90 s while the identical set in Live rested the program's
 * time. The web hit the same problem from the other side (Track had no rest
 * timer at all) and answered it by pulling the rule out of its live client
 * into `webapp/lib/workout/restDuration.ts`; this module is the native twin
 * of that file, function for function:
 *
 *   web `parseRestTime`        → `parseRestSeconds` (plus a null guard, since
 *                                native parses the program's string once on
 *                                load into `restSec`)
 *   web `getSmartRestDefault`  → `getSmartRestDefault`
 *   web `getRestDuration`      → `getRestDuration`
 *   web `restGroupContext`     → `restGroupContext`
 *
 * `restAfterStep` is the only addition: Live walks `buildWorkoutFlow` steps,
 * which already carry `{ groupId, isLastInRound }`, so it adapts a step into
 * the shared `RestGroupContext` rather than re-deriving it. Track has no flow
 * — it edits a flat grid — so it derives the same context from the exercises
 * array with `restGroupContext`, exactly as the web's Track view does.
 *
 * Pure, no React and no native modules: unit-testable on its own, and the
 * ONLY place either view may get a rest length from.
 */
import { normalizeTracking } from "@become/core";

/** The fields the rule reads off an exercise (a subset of `LiveWorkoutExercise`). */
export interface RestExercise {
  trackingType?: string | null;
  /**
   * Rest between sets in seconds — the web's `rest` string, parsed once when
   * the workout loads. Undefined means the program set none, so the smart
   * default for the tracking type applies.
   */
  restSec?: number | null;
  /** Group-level rest between rounds (the web's `groupRest`, e.g. "60s"). */
  groupRest?: string | null;
}

/** Any exercise shape carrying the groupId both views key membership off. */
export interface GroupableExercise {
  groupId?: string | null;
}

export interface RestGroupContext {
  /** This exercise is part of a superset/circuit group. */
  inGroup: boolean;
  /**
   * This exercise is the last one in its group's round, so the group's rest —
   * not mid-round silence — applies once the round completes.
   */
  isLastInRound: boolean;
}

/** No group context: a plain, ungrouped exercise always rests on its own. */
const UNGROUPED: RestGroupContext = { inGroup: false, isLastInRound: true };

/**
 * Parse a web-style rest string ("90s", "3min", "2 minutes", "120") into whole
 * seconds — the web's `parseRestTime`, verbatim, with null/empty answering the
 * web's own fallback of 60.
 */
export function parseRestSeconds(rest: string | null | undefined): number {
  if (!rest) return 60;
  const match = rest.match(/(\d+)/);
  if (!match) return 60;
  const num = parseInt(match[1]!, 10);
  if (rest.includes("min")) return num * 60;
  return num;
}

/**
 * Smart rest default by tracking type — heavy compound → 3 min,
 * bodyweight/isolation → 90 s, anything else → 60 s. The web's
 * `getSmartRestDefault`.
 *
 * One deliberate difference from the web's copy, kept from the native code
 * this module replaces: the type goes through `normalizeTracking`, so the
 * catalog's aliases (and a MISSING type, which normalises to the app's
 * default `reps_weight`) answer the same here as they do everywhere else in
 * native — the inputs, the set labels, the PR rules. The web reads
 * `trackingType || type || ""` raw, so an aliased type falls to its 60 s
 * bucket there. Normalising is the narrower bug, and it keeps native
 * self-consistent: an exercise that draws weight-and-reps boxes rests like
 * weight-and-reps work.
 */
export function getSmartRestDefault(exercise?: RestExercise): string {
  const t = normalizeTracking(exercise?.trackingType ?? null);
  if (t === "reps_weight") return "3min";
  if (t === "reps_bodyweight" || t === "reps_only") return "90s";
  return "60s";
}

/**
 * Rest duration, in seconds, for one exercise.
 *
 * - Ungrouped (or no context passed): the exercise's own rest, or the smart
 *   default for its tracking type.
 * - Mid-round inside a superset/circuit: no rest between exercises — 0.
 * - Last exercise in a superset/circuit round: the group's `groupRest`, or the
 *   exercise's own rest, or the smart default.
 */
export function getRestDuration(
  exercise: RestExercise | undefined,
  context: RestGroupContext = UNGROUPED,
): number {
  if (context.inGroup && !context.isLastInRound) return 0;
  // `|| undefined` rather than `??`: an empty `groupRest` falls through to the
  // exercise's own rest, which is what the web's `||` chain does.
  const groupRest = exercise?.groupRest || undefined;
  const ownRest =
    exercise?.restSec != null ? `${exercise.restSec}s` : undefined;
  if (context.inGroup && context.isLastInRound) {
    return parseRestSeconds(
      groupRest ?? ownRest ?? getSmartRestDefault(exercise),
    );
  }
  return parseRestSeconds(ownRest ?? getSmartRestDefault(exercise));
}

/**
 * The `{ inGroup, isLastInRound }` context for one exercise in a FLAT list —
 * what Track has, where there is no step flow to read it off. Matches
 * `buildWorkoutFlow`/`groupExercises`: a group is the maximal run of
 * consecutive exercises sharing one `groupId`.
 */
export function restGroupContext<T extends GroupableExercise>(
  exercises: T[],
  exerciseIndex: number,
): RestGroupContext {
  const groupId = exercises[exerciseIndex]?.groupId;
  if (!groupId) return UNGROUPED;
  let lastInGroup = exerciseIndex;
  while (
    lastInGroup + 1 < exercises.length &&
    exercises[lastInGroup + 1]?.groupId === groupId
  ) {
    lastInGroup++;
  }
  return { inGroup: true, isLastInRound: exerciseIndex === lastInGroup };
}

/**
 * Rest AFTER a Live step, in seconds: the same `getRestDuration`, fed the
 * group context the flow step already carries.
 */
export function restAfterStep(
  step: { groupId: string | null; isLastInRound: boolean },
  exercise?: RestExercise,
): number {
  return getRestDuration(
    exercise,
    step.groupId
      ? { inGroup: true, isLastInRound: step.isLastInRound }
      : UNGROUPED,
  );
}
