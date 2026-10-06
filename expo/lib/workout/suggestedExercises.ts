// Suggested exercises for the "Add an exercise" sheet's empty state — before
// a member types anything, live sessions show a short list drawn from the
// exercise they are standing in (via /api/exercises/alternatives), instead
// of a bare search box.
//
// Native port of `webapp/lib/workout/suggestedExercises.ts` (NP-289): the
// sheet fetches the candidates, this just shapes them for display — same
// source, same order, same dedupe/limit rules as the web, so the two apps
// never show a different suggestion list for the same anchor exercise.

export interface SuggestedCandidate {
  slug: string;
  name: string;
  /** Optional here (unlike the web's `SearchExercise`): the alternatives
   *  candidate the native sheet feeds in types it as optional too. Dedup and
   *  the limit only ever look at `slug`. */
  trackingType?: string;
}

const DEFAULT_LIMIT = 6;

/**
 * Drop anything already in the workout and cap the list.
 *
 * The alternatives endpoint only deprioritizes duplicates (a score penalty),
 * it does not exclude them, so a low-scoring near-duplicate can still slip
 * through — re-suggesting an exercise the member already has in this session
 * reads as broken, not helpful.
 */
export function buildSuggestedExercises<T extends SuggestedCandidate>(
  candidates: T[],
  workoutExerciseSlugs: string[],
  limit: number = DEFAULT_LIMIT,
): T[] {
  const inWorkout = new Set(workoutExerciseSlugs.map((s) => s.toLowerCase()));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const candidate of candidates) {
    const slug = candidate.slug.toLowerCase();
    if (inWorkout.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(candidate);
    if (out.length >= limit) break;
  }
  return out;
}
