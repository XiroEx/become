// Ranking for GET /api/exercises/search.
//
// The old query was a bare `$regex` substring match with no ranking at all —
// results came back in whatever order Mongo's cursor happened to produce.
// That let a query like "back" surface "Glute Cable Kickback" (the letters
// "back" sitting inside "Kickback", with no word boundary) ahead of, or mixed
// in with, exercises that actually start with or contain "back" as a word —
// and "Ches" surfaced "Bicycle Crunch"/"Toe Touch" purely because their
// aliases ("Crunches"/"Touches") happen to END in "ches". Reported on the
// "Add an exercise needs work" card: the ranking "should focus on the actual
// name then exercises that is being done" (i.e. the body part), not on the
// query matching some arbitrary fragment of a word.
//
// Fix: a match only counts if `q` lines up with the START of a word (or is
// the whole word/name), and name beats alias beats a body-part-only hit.
//
// Later, on the "Exercise do not exist in our data base" card: "if I type in
// RDL I should get that or it should know that I'm talking about Romanian
// deadlift." So the query is also tried in its expanded form
// (lib/exerciseAbbreviations.ts), one whole tier block below the literal one
// — an inference never outranks the letters the member actually typed.

import { escapeRegExp } from '@/lib/exerciseAudit'
import { VALID_CUSTOM_MUSCLES } from '@/lib/customExerciseFields'
import { expandQueryVariants } from '@/lib/exerciseAbbreviations'

export interface RankableExercise {
  name: string
  aliases?: string[]
  primaryMuscles?: string[]
  secondaryMuscles?: string[]
}

// Lower wins. Name always outranks alias, and both outrank a match that only
// comes from the body part the exercise trains.
export const MATCH_TIER = {
  NAME_EXACT: 0,
  NAME_PREFIX: 1,
  NAME_WORD: 2,
  ALIAS_EXACT: 3,
  ALIAS_PREFIX: 4,
  ALIAS_WORD: 5,
  BODY_PART: 12,
} as const

/**
 * Added to every tier reached through an EXPANDED query rather than the
 * letters the member actually typed ("RDL" → "romanian deadlift"). Six is
 * exactly the width of the literal block, so the whole expanded block sits
 * below every literal name/alias match and above a body-part-only hit:
 * what they typed wins, what we inferred they meant comes next, and "this
 * exercise happens to train that muscle" is still last.
 */
export const SYNONYM_TIER_OFFSET = 6

/**
 * Regex *string* (not a compiled RegExp) matching `q` at the start of `value`
 * or right after a space/hyphen/slash — never mid-word. Returned as a string
 * so the same pattern can be handed straight to Mongo as `$regex` alongside
 * `$options: 'i'`, and wrapped in `new RegExp(..., 'i')` for the in-app tier
 * check below — one pattern, not two definitions to keep in sync.
 */
export function nameBoundaryPattern(q: string): string {
  return `(?:^|[\\s\\-/])${escapeRegExp(q.trim())}`
}

function stringTier(
  value: string,
  q: string,
  boundary: RegExp,
  exact: number,
  prefix: number,
  word: number,
): number | null {
  const v = value.trim().toLowerCase()
  if (!v) return null
  if (v === q) return exact
  if (v.startsWith(q)) return prefix
  if (boundary.test(value)) return word
  return null
}

/** True if `q` lines up with the start of `token` or one of its `_`-joined
 *  segments — e.g. "back" matches the muscle group "upper_back". */
function muscleMatches(token: string, q: string): boolean {
  const t = token.toLowerCase()
  return t === q || t.startsWith(q) || t.includes(`_${q}`)
}

/** Muscle-group enum values whose token matches `q` — the "part of the body
 *  being done" candidates whose name may not mention the query at all (e.g.
 *  "back" pulling in a lat pulldown). Used to widen the DB query. */
export function matchingMuscleGroups(q: string): string[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  return VALID_CUSTOM_MUSCLES.filter(m => muscleMatches(m, query))
}

/** Best (lowest) tier `ex` reaches against one already-normalized query
 *  string, ignoring body parts. `offset` is 0 for the literal query and
 *  SYNONYM_TIER_OFFSET for an expansion of it. */
function tierForVariant(ex: RankableExercise, query: string, offset: number): number | null {
  const boundary = new RegExp(nameBoundaryPattern(query), 'i')

  let best = stringTier(
    ex.name, query, boundary,
    MATCH_TIER.NAME_EXACT + offset, MATCH_TIER.NAME_PREFIX + offset, MATCH_TIER.NAME_WORD + offset,
  )

  for (const alias of ex.aliases ?? []) {
    const t = stringTier(
      alias, query, boundary,
      MATCH_TIER.ALIAS_EXACT + offset, MATCH_TIER.ALIAS_PREFIX + offset, MATCH_TIER.ALIAS_WORD + offset,
    )
    if (t !== null && (best === null || t < best)) best = t
  }

  return best
}

/** Best (lowest) match tier for `ex` against `q`, or `null` if it doesn't
 *  match at all. `q` must already be trimmed.
 *
 *  `q` is tried literally and then as its shorthand expansion — typing "RDL"
 *  has to find "Romanian Deadlift" whether or not anybody remembered to add
 *  "RDL" as an alias (lib/exerciseAbbreviations.ts). */
export function matchExerciseTier(ex: RankableExercise, q: string): number | null {
  const query = q.trim().toLowerCase()
  if (!query) return null

  let best: number | null = null
  const variants = expandQueryVariants(query)
  for (let i = 0; i < variants.length; i++) {
    const t = tierForVariant(ex, variants[i], i === 0 ? 0 : SYNONYM_TIER_OFFSET)
    if (t !== null && (best === null || t < best)) best = t
  }

  if (best === null) {
    // Body parts are matched on the literal query only: muscle groups are
    // anatomy, not shorthand, so expanding first could only add noise.
    const bodyPartHit = [...(ex.primaryMuscles ?? []), ...(ex.secondaryMuscles ?? [])]
      .some(m => muscleMatches(m, query))
    if (bodyPartHit) best = MATCH_TIER.BODY_PART
  }

  return best
}

/** Drops non-matches, ranks the rest by tier, breaks ties alphabetically. */
export function sortByMatchTier<T extends RankableExercise>(exercises: T[], q: string): T[] {
  return exercises
    .map(ex => ({ ex, tier: matchExerciseTier(ex, q) }))
    .filter((r): r is { ex: T; tier: number } => r.tier !== null)
    .sort((a, b) => a.tier - b.tier || a.ex.name.localeCompare(b.ex.name))
    .map(r => r.ex)
}
