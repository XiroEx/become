// The "fitness knowledge" half of the variation matcher.
//
// WHY THIS EXISTS
// ---------------
// The variation picker groups an exercise with its siblings from TAGS:
// identical movement-pattern set + shared primary muscle + same body region
// (lib/exerciseVariationMatch.ts). That rule only ever sees what somebody
// typed into the admin form, so it misses the two cases the card is actually
// about:
//
//   1. A variant carrying an extra pattern. Tricep Dip is
//      [elbow_extension, horizontal_push]; the pushdown/extension family is
//      [elbow_extension]. Same movement to any lifter, different set to the
//      matcher, so the dip never lands in the family.
//
//   2. A CUSTOM exercise. `resolveCustomMovementPatterns` defaults to ['n/a']
//      when the member doesn't pick a pattern, and almost nobody does. So a
//      member's own "Dumbbell Chest Press" or "5,5,5 Machine Chest Press" can
//      never match the catalog's "Machine Chest Press" ([horizontal_push]) —
//      which is exactly the screenshot on the card: the customs sit in a
//      separate "MY EXERCISES" bucket while the picker offers 9 variations
//      that don't include them.
//
// Fixing either one by hand means an admin-portal entry per exercise forever,
// which is the question the card ends on. The information needed is already
// in the NAME: gym exercise names are head-final, "[qualifiers] [movement]" —
// Machine Chest Press, Dumbbell Chest Press, Plate-Loaded Chest Press are one
// movement wearing three pieces of equipment. So strip the qualifiers a
// lifter would call "the same thing, different setup" (equipment, grip,
// stance, angle, laterality, tempo) and whatever is left is the movement.
//
// WHAT THIS IS NOT
// ----------------
// This is a *candidate* rule, never a verdict on its own. Every caller pairs
// it with same-body-region AND shared-primary-muscle (see
// isNameFamilyVariation), which is what keeps "Rear Delt Fly" out of the
// chest-fly family and "Lying Leg Curl" out of the biceps-curl family even
// though both reduce to a shared head noun. The guard is load-bearing: read
// any key below as "same movement IF the muscles already agree".

/** Multi-word qualifiers, stripped before single tokens so "close grip" can't
 *  leave a stray "grip" behind. Order matters only in that longer phrases are
 *  listed first where one contains another. */
const QUALIFIER_PHRASES: string[] = [
  // Grip
  'close grip', 'narrow grip', 'wide grip', 'neutral grip', 'reverse grip',
  'mixed grip', 'hook grip', 'false grip', 'shoulder width grip',
  // Laterality
  'single arm', 'one arm', 'two arm', 'single leg', 'one leg', 'two leg',
  'alternating arm', 'alternating leg',
  // Support / stance
  'chest supported', 'bench supported', 'half kneeling', 'tall kneeling',
  'bent over', 'bent knee', 'straight leg', 'stiff leg', 'feet elevated',
  'floor supported',
  // Equipment that is two words
  'plate loaded', 'hammer strength', 'trap bar', 'hex bar', 'ez bar',
  'safety bar', 'smith machine', 'resistance band', 'mini band', 'body weight',
  'cable machine', 'medicine ball', 'stability ball', 'swiss ball', 'bosu ball',
  'landmine attachment',
  // Protocol / tempo
  'drop set', 'rest pause', 'cluster set', 'top set', 'back off',
  'slow eccentric', 'pause rep',
]

/** Single-token qualifiers: equipment, implement, angle, stance, tempo,
 *  loading style. Anything a lifter would answer "same exercise, just on the
 *  X" about. */
const QUALIFIER_TOKENS = new Set<string>([
  // Equipment / implement
  'machine', 'machines', 'dumbbell', 'dumbbells', 'db', 'barbell', 'bb',
  'cable', 'cables', 'kettlebell', 'kb', 'band', 'banded', 'bands', 'smith',
  'plate', 'plates', 'landmine', 'sled', 'pendulum', 'selectorized',
  'bodyweight', 'lever', 'pin', 'weighted', 'loaded', 'freeweight',
  // Stance / support / angle
  // NB: no bare 'bench'. "Bench Press" IS the movement — stripping it leaves
  // "press" and the bench-press/chest-press synonym never fires. The support
  // sense is covered by the 'bench supported' phrase above.
  'seated', 'standing', 'lying', 'prone', 'supine', 'kneeling',
  'flat', 'incline', 'inclined', 'decline', 'declined', 'floor', 'wall',
  'bulgarian', 'staggered', 'split stance', 'supported',
  // Grip (single-word forms)
  'underhand', 'overhand', 'supinated', 'pronated', 'grip',
  // Laterality / tempo / effort
  'unilateral', 'bilateral', 'alternating', 'assisted', 'eccentric',
  'isometric', 'tempo', 'paused', 'pause', 'slow', 'explosive',
  'light', 'heavy', 'strict',
])

/**
 * Canonical name for a movement whose common names differ. This is the
 * deliberate, reviewable list of "these two words mean the same lift" — the
 * fitness knowledge proper. Keys are already normalized and qualifier-stripped.
 */
const FAMILY_SYNONYMS: Record<string, string> = {
  // Chest press: "bench press" and "chest press" are one movement.
  'bench press': 'chest press',
  // Lat pulldown: every spelling Jon listed on the card, including the
  // "lateral pulldown" mishearing that is extremely common in the wild.
  'pulldown': 'lat pulldown',
  'pull down': 'lat pulldown',
  'lat pull down': 'lat pulldown',
  'lateral pulldown': 'lat pulldown',
  'lateral pull down': 'lat pulldown',
  'lat pull': 'lat pulldown',
  // Overhead / shoulder press
  'overhead press': 'shoulder press',
  'military press': 'shoulder press',
  'ohp': 'shoulder press',
  // Hinge
  'rdl': 'romanian deadlift',
  'romanian dead lift': 'romanian deadlift',
  'dead lift': 'deadlift',
  // Curls
  'bicep curl': 'curl',
  'biceps curl': 'curl',
  'arm curl': 'curl',
  // Hamstring curl
  'hamstring curl': 'leg curl',
  // Knee extension
  'knee extension': 'leg extension',
  'quad extension': 'leg extension',
  // Triceps
  'pushdown': 'tricep pushdown',
  'press down': 'tricep pushdown',
  'pressdown': 'tricep pushdown',
  'tricep press down': 'tricep pushdown',
  'triceps pushdown': 'tricep pushdown',
  'triceps extension': 'tricep extension',
  // Calves
  'heel raise': 'calf raise',
  // Raises
  'side raise': 'lateral raise',
  'side lateral raise': 'lateral raise',
  // Rows
  'seated row': 'row',
  'low row': 'row',
  'high row': 'row',
  // Chin-up is an underhand pull-up.
  'chin up': 'pull up',
  'chinup': 'pull up',
  'pullup': 'pull up',
  'pushup': 'push up',
  // Flyes
  'flye': 'fly',
  'flies': 'fly',
  'flyes': 'fly',
  'pec deck': 'chest fly',
  'pec fly': 'chest fly',
}

/**
 * Head nouns that genuinely name a movement. Only a key ending in one of
 * these may take part in the suffix rule below — so "Low Row" can join "Row",
 * but "Skull Crusher" never collapses to "crusher" and drags something in.
 */
const MOVEMENT_HEAD_NOUNS = new Set<string>([
  'press', 'pulldown', 'row', 'curl', 'squat', 'deadlift', 'raise', 'fly',
  'pullover', 'extension', 'pushdown', 'thrust', 'bridge', 'dip', 'lunge',
  'shrug', 'crunch', 'swing', 'carry', 'kickback', 'pull', 'abduction',
  'adduction', 'twist',
  // 'up' is the head of the hyphenated compounds — push-up, pull-up,
  // step-up. Linguistically it is a particle, but it is the token every
  // variation of those lifts ends in, and the muscle guard is what keeps a
  // push-up (chest) apart from a pull-up (lats) apart from a step-up (quads).
  'up',
])

/** Tokens that are pure noise in a name: rep schemes, tempo digits, set
 *  counts, "x", ordinals. "5,5,5 Machine Chest Press" is a chest press. */
function isNoiseToken(token: string): boolean {
  if (!token) return true
  if (/^\d+$/.test(token)) return true          // 5, 21, 100
  if (/^\d+s$/.test(token)) return true         // 21s
  if (/^\d+x\d*$/.test(token)) return true      // 3x, 3x10
  if (/^x\d+$/.test(token)) return true         // x10
  return false
}

/**
 * Crude, deliberate singularizer. Members type plurals — "Leg Raises",
 * "Lat Pull Downs", "Weighted Dips" — and a plural that doesn't fold back to
 * its singular is a whole family missed: "Weighted Leg Raises" keyed as
 * "leg raises" matches neither "Leg Raise" nor "Hanging Knee Raise".
 *
 * Only the endings that actually occur in exercise names are handled, and
 * words already ending in "ss" (press, cross) are left alone — the point is
 * to fold "raises"→"raise", not to be a general English stemmer.
 */
function singularize(token: string): string {
  if (token.length <= 3) return token
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`     // flies → fly
  // "-es" only drops as a pair after a sibilant, which is what makes
  // "presses" → "press" without also turning "raises" into "rais".
  if (/(?:ch|sh|x|z|ss)es$/.test(token)) return token.slice(0, -2)
  if (token.endsWith('ss')) return token                         // press, cross
  if (token.endsWith('s')) return token.slice(0, -1)             // raises → raise
  return token
}

/**
 * Lowercase, split on anything that isn't a letter or digit, drop noise,
 * fold plurals. Hyphens and slashes are separators, not characters:
 * "Close-Grip", "Push-Up" and "Pull/Chin Up" all have to tokenize the same
 * way as their spaced spellings.
 */
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => !isNoiseToken(t))
    .map(singularize)
}

/** Remove every occurrence of each multi-word qualifier from a token list. */
function stripQualifierPhrases(tokens: string[]): string[] {
  let phrase = tokens.join(' ')
  for (const q of QUALIFIER_PHRASES) {
    // Word-boundary replace, repeated until the phrase stops changing so
    // "single arm single leg …" loses both.
    const re = new RegExp(`(?:^|\\s)${q.replace(/\s+/g, '\\s+')}(?=\\s|$)`, 'g')
    let next = phrase.replace(re, ' ')
    while (next !== phrase) {
      phrase = next
      next = phrase.replace(re, ' ')
    }
  }
  return phrase.trim().split(/\s+/).filter(Boolean)
}

/**
 * The movement family an exercise name belongs to: the name with equipment,
 * grip, stance, angle, laterality and tempo qualifiers removed, then run
 * through the synonym table.
 *
 * Returns '' when nothing survives stripping (a name that is *only*
 * qualifiers, e.g. "Dumbbell"). An empty key never matches anything —
 * see sharesMovementFamily.
 */
export function movementFamilyKey(name: string): string {
  const stripped = stripQualifierPhrases(tokenize(name))
  const kept = stripped.filter((t) => !QUALIFIER_TOKENS.has(t))
  // If stripping removed everything, back off to the un-stripped tokens
  // rather than returning nothing: "Machine Fly" must not become ''.
  const tokens = kept.length > 0 ? kept : stripped
  const phrase = tokens.join(' ')
  if (!phrase) return ''
  return FAMILY_SYNONYMS[phrase] ?? phrase
}

/** The last word of a key, when that word actually names a movement. */
function headNoun(key: string): string | null {
  const last = key.split(' ').pop() ?? ''
  return MOVEMENT_HEAD_NOUNS.has(last) ? last : null
}

/**
 * Do two exercise names describe the same movement?
 *
 * Two ways to qualify:
 *   - identical family keys ("Machine Chest Press" and "Dumbbell Chest Press"
 *     both reduce to "chest press"), or
 *   - the same movement head noun, which is what makes a Front Squat, a
 *     Goblet Squat and a Hack Squat one family, and a Diagonal Cable Pulldown
 *     a kind of Lat Pulldown. Names are head-final, so the last word is the
 *     movement and everything before it is the variation.
 *
 * NOT sufficient on its own — callers must also require the same body region
 * and a shared primary muscle. Head nouns are deliberately coarse ("press"
 * covers chest, shoulder and leg press) and the muscle guard is what
 * separates them; see isNameFamilyVariation in lib/exerciseVariationMatch.ts,
 * which is the only thing that should ever call this.
 */
export function sharesMovementFamily(nameA: string, nameB: string): boolean {
  const a = movementFamilyKey(nameA)
  const b = movementFamilyKey(nameB)
  if (!a || !b) return false
  if (a === b) return true
  const headA = headNoun(a)
  return headA !== null && headA === headNoun(b)
}
