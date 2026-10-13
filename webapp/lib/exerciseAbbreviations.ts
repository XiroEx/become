// Gym shorthand → the words a catalog entry is actually spelled with.
//
// Card: "Exercise do not exist in our data base." Jon's second comment is the
// whole of this file: "Some exercises already exist but are for different
// names. There needs to be some type of fitness intelligence. For example if
// I type in RDL I should get that or it should know that I'm talking about
// Romanian deadlift."
//
// Coaches write programs in shorthand — DB, BB, KB, RDL, OHP, BSS — and the
// catalog is spelled out. Nothing in the app knew the two were the same, so
// "DB Hammer Curl" in a program and "Hammer Curl" in the catalog were two
// unrelated strings: the program kept a slug no exercise had, which is why
// those entries had no video and never appeared in the admin portal.
//
// Expansion is applied to BOTH sides — the catalog index and whatever the
// member types — so the two meet in the middle and there is only one rule to
// reason about. It runs on TOKENS (after lib/exerciseMovementFamily's
// tokenizer has lowercased, dropped rep-scheme noise and folded plurals), so
// "DB Curls", "db curl" and "Dumbbell Curl" all arrive at the same place.
//
// WHAT BELONGS HERE: shorthand with ONE unambiguous reading in a gym. "PU"
// (push-up? pull-up?) and "GM" (good morning? anything else?) are deliberately
// absent — a wrong expansion silently resolves a program entry onto the wrong
// exercise, which is worse than not resolving it at all. That is also why
// this is a hand-kept list and not a fuzzy-distance match.
//
// An expansion must also contain no shorthand of its own, so expanding twice
// is the same as expanding once ("ez" → "ez bar" would grow a "bar" per pass).
// The test file pins that.

/**
 * Token → the tokens it stands for. Keys are single tokens as the tokenizer
 * produces them (lowercase, already singularized).
 */
export const EXERCISE_ABBREVIATIONS: Readonly<Record<string, readonly string[]>> = {
  // Implements
  db: ['dumbbell'],
  bb: ['barbell'],
  kb: ['kettlebell'],
  bw: ['bodyweight'],
  // Lifts
  rdl: ['romanian', 'deadlift'],
  sldl: ['stiff', 'leg', 'deadlift'],
  dl: ['deadlift'],
  ohp: ['overhead', 'press'],
  bss: ['bulgarian', 'split', 'squat'],
  rfess: ['rear', 'foot', 'elevated', 'split', 'squat'],
  ghr: ['glute', 'ham', 'raise'],
  hspu: ['handstand', 'push', 'up'],
  cgbp: ['close', 'grip', 'bench', 'press'],
  // Laterality
  sa: ['single', 'arm'],
  sl: ['single', 'leg'],
}

/**
 * Every token replaced by its expansion, in place. A token with no entry is
 * kept as-is, so this is safe to run over any name.
 */
export function expandAbbreviations(tokens: string[]): string[] {
  const out: string[] = []
  for (const token of tokens) {
    const expansion = EXERCISE_ABBREVIATIONS[token]
    if (expansion) out.push(...expansion)
    else out.push(token)
  }
  return out
}

/** True if any token in `tokens` is shorthand this module can expand. */
export function hasAbbreviation(tokens: string[]): boolean {
  return tokens.some((t) => t in EXERCISE_ABBREVIATIONS)
}

/**
 * The search strings to look for when a member typed `q`: the literal query
 * first, then its expanded form if expansion changed anything.
 *
 * Callers must keep the order — lib/exerciseSearchRanking ranks a hit on
 * variant 0 (what was actually typed) above a hit on an expansion, so an
 * exercise literally named "RDL" would still beat "Romanian Deadlift".
 */
export function expandQueryVariants(q: string): string[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const tokens = query.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return [query]
  if (!hasAbbreviation(tokens)) return [query]
  const expanded = expandAbbreviations(tokens).join(' ')
  return expanded === query ? [query] : [query, expanded]
}
