// Free text → a slug in the exercise catalog.
//
// Card: "Exercise do not exist in our data base. Some program exercises don't
// exist in our data base or are not in our admin portal which means we can't
// upload videos or edit them."
//
// A program stores each exercise as `exerciseSlug`. When a program is saved
// with a name the catalog has never heard of, dehydrateProgram falls back to
// slugifying the name — which mints a reference to a document that does not
// exist. The entry then renders with no video, no instructions and no row in
// the admin portal to upload one to, and nothing anywhere reports it. That is
// what the four screenshots on the card show ("No demo video yet" under
// Rowing Sprints, Russian Deadlift, Rest).
//
// Most of those names were never new: "DB Hammer Curl" is the catalog's
// "Hammer Curl", "Incline DB Press (15-30°)" is "Incline Dumbbell Press".
// They missed because the old lookup was a single exact, case-insensitive
// string compare against name and aliases. So matching happens in three
// layers, strongest first, and stops at the first one that answers:
//
//   1. EXACT       the lowercased string, as before. Unchanged behaviour.
//   2. NORMALIZED  tokenized (punctuation gone, rep-scheme noise dropped,
//                  plurals folded) and with gym shorthand expanded. This is
//                  what makes "DB Hammer Curl" meet the alias "DB Hammer
//                  Curls" and "RDL" meet "Romanian Deadlift".
//   3. STRIPPED    equipment/grip/stance/tempo qualifiers removed as well,
//                  so "Preacher Curl (Plate-Loaded)" finds "Preacher Curl".
//
// Layer 3 is lossy — "Dumbbell Bench Press" and "Barbell Bench Press" both
// reduce to "bench press" — so an ambiguous key is DROPPED rather than
// guessed at. A key only resolves if exactly one exercise in the catalog
// claims it. Silence is the correct answer when two lifts are equally good
// candidates; the caller then creates a new catalog entry, which is visible
// and editable, instead of quietly pointing a program at the wrong video.
//
// Owner-private custom exercises take part in layer 1 only. They are visible
// to one member, and a fuzzy layer that could land an admin program on
// someone's private "Squat Press" would be worse than not matching at all.

import { expandAbbreviations } from './exerciseAbbreviations'
import { stripExerciseQualifiers, tokenizeExerciseName } from './exerciseMovementFamily'

export interface IndexableExercise {
  slug: string
  name: string
  aliases?: string[]
  isCustom?: boolean
  isUniversal?: boolean
}

export type ExerciseNameMatchLayer = 'exact' | 'normalized' | 'stripped'

export interface ExerciseNameMatch {
  slug: string
  /** Which layer answered — useful for reporting, never for behaviour. */
  via: ExerciseNameMatchLayer
}

export interface ExerciseNameIndex {
  exact: Map<string, string>
  /** `null` = two or more different exercises claim this key: ambiguous. */
  normalized: Map<string, string | null>
  stripped: Map<string, string | null>
}

/** The lowercased, trimmed string — layer 1's key, and the only key that
 *  keeps the pre-existing exact-match behaviour byte for byte. */
export function exactNameKey(name: string): string {
  return name.trim().toLowerCase()
}

/** Tokenized + shorthand expanded — layer 2's key. '' when nothing survives
 *  (a name made only of rep-scheme noise), which never matches. */
export function normalizedNameKey(name: string): string {
  return expandAbbreviations(tokenizeExerciseName(name)).join(' ')
}

/** Layer 2's key with equipment/grip/stance/tempo qualifiers removed too. */
export function strippedNameKey(name: string): string {
  return stripExerciseQualifiers(expandAbbreviations(tokenizeExerciseName(name))).join(' ')
}

/** Records `slug` under `key`, marking the key ambiguous if a different
 *  exercise already claimed it. */
function claim(map: Map<string, string | null>, key: string, slug: string): void {
  if (!key) return
  if (!map.has(key)) {
    map.set(key, slug)
    return
  }
  const held = map.get(key)
  if (held !== slug) map.set(key, null)
}

/**
 * Builds the three lookup layers from the catalog. Pass every exercise; the
 * owner-private rule is applied here so no caller has to remember it.
 *
 * Entries are indexed in the order given. For layer 1 the first claim wins
 * (a genuinely duplicated name is an admin data problem, not something to
 * resolve differently on each request), so callers should pass a stably
 * sorted list.
 */
export function buildExerciseNameIndex(exercises: IndexableExercise[]): ExerciseNameIndex {
  const index: ExerciseNameIndex = {
    exact: new Map(),
    normalized: new Map(),
    stripped: new Map(),
  }

  for (const ex of exercises) {
    if (!ex?.slug || !ex.name) continue
    const names = [ex.name, ...(ex.aliases ?? [])]
    const fuzzyAllowed = !ex.isCustom || ex.isUniversal === true

    for (const raw of names) {
      if (typeof raw !== 'string' || !raw.trim()) continue
      const exact = exactNameKey(raw)
      if (!index.exact.has(exact)) index.exact.set(exact, ex.slug)
      if (!fuzzyAllowed) continue
      claim(index.normalized, normalizedNameKey(raw), ex.slug)
      claim(index.stripped, strippedNameKey(raw), ex.slug)
    }
  }

  return index
}

/**
 * The catalog slug `name` refers to, or `null` when nothing in the catalog
 * claims it unambiguously.
 */
export function matchExerciseName(name: string, index: ExerciseNameIndex): ExerciseNameMatch | null {
  if (typeof name !== 'string' || !name.trim()) return null

  const exact = index.exact.get(exactNameKey(name))
  if (exact) return { slug: exact, via: 'exact' }

  const normalized = index.normalized.get(normalizedNameKey(name))
  if (normalized) return { slug: normalized, via: 'normalized' }

  const stripped = index.stripped.get(strippedNameKey(name))
  if (stripped) return { slug: stripped, via: 'stripped' }

  return null
}

/** `matchExerciseName` when only the slug matters. */
export function resolveExerciseSlug(name: string, index: ExerciseNameIndex): string | null {
  return matchExerciseName(name, index)?.slug ?? null
}
