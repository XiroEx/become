/**
 * ONE DUMBBELL OR TWO, NATIVELY (the native half of #1986).
 *
 * Jon, 2026-09-18: *"there are some exercises that I can do single if I wanted
 * to and just keep it as one 1 dumbbell"*. The web shipped the answer first:
 * `ISetLog.bells` (1 | 2) is OPTIONAL and carries NO default, so an absent
 * value still means `getBellWeightInfo`'s automatic per-exercise answer and no
 * existing set is migrated. Volume and PR maths do not read it.
 *
 * The RULE itself is not re-implemented here. It lives in `@become/core`
 * (`shared/core/src/training/workout/bellCount.ts` ← the web's
 * `webapp/lib/workout/bellCount.ts`, held in lockstep by
 * `webapp/tests/unit/nativeParity/trainingModules.test.ts`), exactly as
 * `getBellWeightInfo` does — this module only re-exports it and adapts the two
 * NATIVE shapes to it:
 *
 *  - a `LiveWorkoutExercise` names its slug `slug`, where the web's `Exercise`
 *    says `exerciseSlug` — so {@link bellMemoryKeyFor} translates;
 *  - the save builders need the web live client's `bellsForExercise`: the
 *    count to send with every set of an exercise, or `undefined` for anything
 *    that is not dumbbell/kettlebell work with a weight box.
 *
 * NOTHING HERE DECIDES ANYTHING. Same field, same name, same absent-means-
 * automatic rule as the web.
 */

import {
  bellMemoryKey,
  getBellWeightInfo,
  normalizeTracking,
  resolveBellCount,
  type BellCount,
} from "@become/core";
import type { LiveWorkoutExercise } from "@/components/live/LiveWorkoutClient";

export {
  bellCountLabel,
  bellMemoryKey,
  bellsFromPerformances,
  defaultBellCount,
  readBellCount,
  resolveBellCount,
  showsBellTotal,
  type BellCount,
} from "@become/core";

/** The member's pick this session, keyed by {@link bellMemoryKeyFor}. */
export type BellChoices = Record<string, BellCount>;

/**
 * The key an exercise's answer is remembered under — its catalogue slug, else
 * a normalisation of its name. The same key
 * `GET /api/workouts/last-performance` answers with, which is where the
 * remembered choice is read from: no preferences collection anywhere.
 */
export function bellMemoryKeyFor(
  exercise: { slug?: string; name?: string } | null | undefined,
): string {
  if (!exercise) return "";
  return bellMemoryKey({
    exerciseSlug: exercise.slug ?? "",
    name: exercise.name ?? "",
  });
}

/**
 * The count to SHOW for an exercise: the member's pick this session, else what
 * they logged last time, else the automatic answer — so a member who never
 * touches the control sees (and saves) the behaviour they had yesterday.
 */
export function bellCountFor(
  exercise: LiveWorkoutExercise | null | undefined,
  choices?: BellChoices,
  remembered?: BellChoices,
): BellCount {
  const info = getBellWeightInfo(exercise ?? null);
  const key = bellMemoryKeyFor(exercise);
  return resolveBellCount(info, choices?.[key], remembered?.[key]);
}

/**
 * What goes out with every set of this exercise — the web live client's
 * `bellsForExercise`. `undefined` for anything that is not dumbbell/kettlebell
 * work with a weight box, so no set ever carries a count the member was never
 * shown; absent on the wire keeps reading as the automatic answer.
 */
export function bellsForExercise(
  exercise: LiveWorkoutExercise | null | undefined,
  choices?: BellChoices,
  remembered?: BellChoices,
): BellCount | undefined {
  if (!exercise) return undefined;
  if (normalizeTracking(exercise.trackingType ?? null) !== "reps_weight") {
    return undefined;
  }
  if (!getBellWeightInfo(exercise).style) return undefined;
  return bellCountFor(exercise, choices, remembered);
}
