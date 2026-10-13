/**
 * QUICK-SESSION HISTORY (NP-228).
 *
 * Native port of the quick-history build in
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
 * (l.528-547): from the session's exercises, build `exerciseHistory` keyed by
 * exercise NAME (`{ weight, reps, duration?, date }`) from `last-performance`
 * by slug, falling back to the slugified name exactly as the web does.
 *
 * Data only: rendering Last / PR / NEW PR is NP-222's job. Blank inputs stay
 * blank: this map is a reference, never prefill.
 */

import type {
  ExerciseHistoryEntry,
  LastPerformanceEntry,
} from "@become/api-client";

/** One exercise as the history builder reads it — slug optional, name required. */
export interface QuickHistoryExercise {
  slug?: string | null;
  name: string;
}

/**
 * The web's slug rule (`LiveWorkoutClient.tsx` l.536): the stored slug when
 * present, else the slugified name — lowercased, non-alphanumerics to `-`,
 * leading/trailing dashes trimmed.
 */
export function quickExerciseSlug(
  exercise: QuickHistoryExercise,
): string {
  const raw = exercise.slug || exercise.name || "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The distinct slugs to ask `GET /api/workouts/last-performance?slugs=` for —
 * the web's `fetchLastPerformance` (l.371-383), verbatim: slug-or-slugified-name
 * per exercise, deduped, empties dropped.
 */
export function quickHistorySlugs(
  exercises: QuickHistoryExercise[],
): string[] {
  return Array.from(
    new Set(
      (exercises ?? [])
        .map((ex) => quickExerciseSlug(ex))
        .filter((s): s is string => Boolean(s)),
    ),
  );
}

/**
 * Build `exerciseHistory` keyed by exercise NAME from the `last-performance`
 * answer — the web's quick-history loop (l.534-547), verbatim: look each
 * exercise's slug up in `performances`; a hit becomes
 * `{ weight, reps, duration?, date }` under the exercise's NAME. A slug-less
 * exercise resolves through its slugified name because that IS its lookup slug
 * (and the server matches the same normalisation of the name).
 */
export function buildQuickHistory(
  exercises: QuickHistoryExercise[],
  performances: Record<string, LastPerformanceEntry | null> | null | undefined,
): Record<string, ExerciseHistoryEntry> {
  const history: Record<string, ExerciseHistoryEntry> = {};
  if (!performances) return history;
  for (const ex of exercises ?? []) {
    const slug = quickExerciseSlug(ex).toLowerCase();
    const prior = slug ? (performances[slug] ?? null) : null;
    if (prior) {
      history[ex.name] = {
        weight: prior.weight ?? 0,
        reps: prior.reps ?? 0,
        ...(prior.duration != null ? { duration: prior.duration } : {}),
        date: prior.date ?? "",
      };
    }
  }
  return history;
}
