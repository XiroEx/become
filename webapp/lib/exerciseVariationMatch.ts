// The algorithmic half of /api/exercises/variations — pulled out of the route
// so its matching rule is unit-testable without a live Mongo connection (see
// tests/unit/exerciseVariationMatch.test.ts).
//
// The bug this exists to fix: the original query required a candidate's
// primaryMuscles to be a SUPERSET of the source's (`$all`), which is
// containment, not overlap — and containment is not symmetric. A close-grip
// press tagged [triceps, chest] satisfies "contains chest" when the source is
// the flat press ([chest]), so the flat press's variation list included it —
// but the flat press does NOT contain triceps, so querying FROM the close-grip
// press back to the flat press failed. Confirmed live 2026-09-09:
// `?slug=dumbbell-curl` returned all 7 curls in the family, but
// `?slug=hammer-curl` (primaryMuscles [brachialis, biceps]) returned only
// itself + dumbbell-curl — preacher/ez-bar/barbell/cable curl all silently
// dropped depending which exercise in the family you searched from.
//
// The fix is `$in` (overlap: at least one shared primary muscle) in place of
// `$all` (containment). Overlap is symmetric by construction, so the matcher
// now agrees regardless of which exercise in a family you start from.
import type { BodyRegion, MovementPattern, MuscleGroup } from '../models/Exercise'

export interface VariationMatchSource {
  movementPatterns: MovementPattern[]
  primaryMuscles: MuscleGroup[]
  bodyRegion: BodyRegion
}

/**
 * Mongo filter for "algorithmic" variations of `source`: same exact
 * movement-pattern set, same body region, and at least one shared primary
 * muscle. Caller is still responsible for checking
 * `source.movementPatterns.length > 0` before running this (an exercise with
 * no patterns tagged has nothing to key the match on).
 */
export function buildAlgorithmicVariationQuery(slug: string, source: VariationMatchSource) {
  return {
    slug: { $ne: slug },
    isActive: true,
    bodyRegion: source.bodyRegion,
    movementPatterns: { $size: source.movementPatterns.length, $all: source.movementPatterns },
    primaryMuscles: { $in: source.primaryMuscles },
  }
}

/**
 * Pure restatement of the primaryMuscles half of the query above, so the
 * symmetry property itself — not just the shape of the Mongo filter — has a
 * direct test: `hasSharedPrimaryMuscle(a, b) === hasSharedPrimaryMuscle(b, a)`
 * for every pair, which containment (`$all`) never guaranteed.
 */
export function hasSharedPrimaryMuscle(a: MuscleGroup[], b: MuscleGroup[]): boolean {
  const bSet = new Set(b)
  return a.some((m) => bSet.has(m))
}
