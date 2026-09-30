// The algorithmic half of /api/exercises/variations — pulled out of the route
// so its matching rule is unit-testable without a live Mongo connection (see
// tests/unit/exerciseVariationMatch.test.ts).
//
// ── The muscle bug (fixed earlier, still pinned below) ──────────────────────
// The original query required a candidate's primaryMuscles to be a SUPERSET
// of the source's (`$all`), which is containment, not overlap — and
// containment is not symmetric. Confirmed live 2026-09-09: `?slug=dumbbell-curl`
// returned all 7 curls in the family, but `?slug=hammer-curl` (primaryMuscles
// [brachialis, biceps]) returned only itself + dumbbell-curl. `$in` (overlap)
// is symmetric by construction, so the matcher agrees regardless of which
// exercise in a family you start from.
//
// ── Why the pattern rule moved out of Mongo ────────────────────────────────
// Matching used to be a single Mongo filter that also demanded an IDENTICAL
// movement-pattern set. That is where the card's remaining complaint lived:
//
//   * Every CUSTOM exercise defaults to movementPatterns ['n/a']
//     (resolveCustomMovementPatterns), because the create form doesn't make
//     anyone pick one. 'n/a' is a catch-all meaning "not tagged", but an
//     exact-set match reads it as a pattern like any other, which broke the
//     picker in BOTH directions at once: a member's "Dumbbell Chest Press"
//     could never join the catalog's "Machine Chest Press" ([horizontal_push]),
//     while an untagged "Pendulum Squat Machine" matched "Hip Abduction
//     Machine" and "Hip Circle" — every other untagged exercise sharing a
//     muscle — and was offered as a variation of them.
//
//   * A variant carrying one extra pattern silently dropped out of its own
//     family, which the curated allow-list in lib/exerciseVariationLinks.ts
//     had to keep patching by hand, one exercise at a time.
//
// So the pool is now narrowed in Mongo (same body region + shared primary
// muscle + visible to this member) and the decision is made here, in code
// that can weigh two kinds of evidence:
//
//   TAGS  — identical real movement-pattern set, as before.
//   NAME  — the movement families in lib/exerciseMovementFamily.ts, which is
//           what lets an untagged custom find its family without an admin
//           ever opening the portal.
//
// Names FILL GAPS IN TAGS; they never overrule them. When both sides carry
// real pattern tags and those tags share nothing, the tags win and the name
// match is refused — that is what keeps a Bulgarian Split Squat ([lunge])
// out of the Back Squat ([squat]) family even though both names end in
// "squat".
import type { BodyRegion, MovementPattern, MuscleGroup } from '../models/Exercise'
import { sharesMovementFamily } from './exerciseMovementFamily'
import { visibleExerciseFilter } from './exerciseVisibility'

export interface VariationMatchSource {
  name: string
  movementPatterns: MovementPattern[]
  primaryMuscles: MuscleGroup[]
  bodyRegion: BodyRegion
}

export interface VariationCandidateQuery {
  slug: { $ne: string }
  isActive: true
  bodyRegion: BodyRegion
  primaryMuscles: { $in: MuscleGroup[] }
  $or: Record<string, unknown>[]
}

/**
 * Mongo filter for the candidate POOL: active, visible to this member, same
 * body region, at least one shared primary muscle, and not the source itself.
 * Deliberately says nothing about movement patterns — that judgement belongs
 * to `isVariationOf`, which can tell a real tag from the 'n/a' placeholder.
 *
 * `viewerId` is threaded through to visibleExerciseFilter so the pool can
 * never contain another member's private custom exercise. The route used to
 * omit this entirely, which leaked private customs into everyone's picker as
 * soon as they shared a region, a muscle and the 'n/a' pattern — i.e.
 * constantly.
 */
export function buildVariationCandidateQuery(
  slug: string,
  source: Pick<VariationMatchSource, 'primaryMuscles' | 'bodyRegion'>,
  viewerId?: string | null,
): VariationCandidateQuery {
  // visibleExerciseFilter is typed as an opaque Record for its other callers,
  // which compose it under $and. Here it is the query's only $or, so it is
  // narrowed to the branch list it has always returned.
  const { $or } = visibleExerciseFilter(viewerId) as { $or: Record<string, unknown>[] }
  return {
    slug: { $ne: slug },
    isActive: true,
    bodyRegion: source.bodyRegion,
    primaryMuscles: { $in: source.primaryMuscles },
    $or,
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

/**
 * Movement patterns that actually say something. 'n/a' is the schema's
 * catch-all and the default every untagged custom exercise carries, so it is
 * absence of information, not a pattern two exercises can share.
 */
export function realMovementPatterns(patterns: MovementPattern[] | undefined): MovementPattern[] {
  return (patterns ?? []).filter((p) => p && p !== 'n/a')
}

/** Identical real-pattern sets — the original tag-based rule. */
export function hasSamePatternSet(a: MovementPattern[], b: MovementPattern[]): boolean {
  const left = realMovementPatterns(a)
  const right = realMovementPatterns(b)
  if (left.length === 0 || right.length === 0) return false
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((p) => rightSet.has(p))
}

/**
 * May a NAME match stand, given what the tags say?
 *
 * Yes when either side is untagged (no real patterns) — there is nothing for
 * the name to contradict, which is the custom-exercise case. Yes when the two
 * share at least one real pattern (Renegade Row is [horizontal_pull,
 * anti_rotation]; it is still a row). No when both are tagged and share
 * nothing: Back Squat [squat] vs Split Squat [lunge] are different movements
 * and the tags are the better evidence.
 */
export function patternsAllowNameMatch(a: MovementPattern[], b: MovementPattern[]): boolean {
  const left = realMovementPatterns(a)
  const right = realMovementPatterns(b)
  if (left.length === 0 || right.length === 0) return true
  const rightSet = new Set(right)
  return left.some((p) => rightSet.has(p))
}

/**
 * Is `candidate` a variation of `source`?
 *
 * Assumes the candidate came from `buildVariationCandidateQuery`, so same
 * body region and shared primary muscle are already established — both are
 * re-checked here anyway so the predicate is honest on its own and safe to
 * unit-test with hand-built pairs. Those two guards are what make the coarse
 * name families safe: "leg curl" and "hammer curl" share the head noun
 * "curl", and only the muscles keep hamstrings out of the biceps family.
 */
export function isVariationOf(source: VariationMatchSource, candidate: VariationMatchSource): boolean {
  if (source.bodyRegion !== candidate.bodyRegion) return false
  if (!hasSharedPrimaryMuscle(source.primaryMuscles, candidate.primaryMuscles)) return false

  if (hasSamePatternSet(source.movementPatterns, candidate.movementPatterns)) return true

  return (
    sharesMovementFamily(source.name, candidate.name)
    && patternsAllowNameMatch(source.movementPatterns, candidate.movementPatterns)
  )
}
