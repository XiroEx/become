// Suggested exercises for the native "Add an exercise" sheet's empty state —
// before a member types anything, live sessions show a short list drawn from
// the exercise they are standing in (via /api/exercises/alternatives),
// instead of a bare search box.
//
// Port of webapp/lib/workout/suggestedExercises.ts (NP-289): same source,
// same order, same dedupe/limit rules, so the native suggestion list matches
// the web's rather than being an ad-hoc filter+slice.
//
// Pure in, pure out: the sheet fetches the candidates, this just shapes them
// for display.

export interface SuggestedCandidate {
  slug: string;
  name: string;
  trackingType: string;
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
  limit = DEFAULT_LIMIT,
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
