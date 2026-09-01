// Curated exercise-variation data audit for chest, back, shoulders, triceps,
// biceps, quads, hamstrings, calves, glutes.
//
// The variation picker (components/ExerciseVariationPicker.tsx, surfaced in
// the swap modal, quick Add-Exercise sheet, and both program builders) groups
// an exercise with its siblings two ways: algorithmically (exact movement
// pattern + primary muscle superset + body region — see
// app/api/exercises/variations/route.ts) and explicitly, via each
// exercise's `variations[]` field. The algorithm alone misses real-world
// grip/equipment variants whose classification differs just enough to break
// an exact match — e.g. a close-grip press is tagged primaryMuscles
// [triceps, chest] while the flat press it's a grip variant of is tagged
// [chest] only, or a variant carries a second movement pattern (Tricep Dip
// is elbow_extension + horizontal_push, not elbow_extension alone). Those
// need an explicit link. This file is that curation, split in two:
//
//   VARIATION_LINK_FIXES — additive cross-links between exercises already in
//   the catalog, plus alias cleanup where a grip variant graduates from
//   "alias text on the generic exercise" to its own loggable exercise.
//
//   NEW_VARIATION_EXERCISES — grip/equipment variants the catalog was
//   missing outright (there was exactly one generic "Lat Pulldown" covering
//   every grip; there was no plate-loaded chest press alongside the
//   machine and dumbbell versions).
//
// Both are allow-lists, not machine-generated diffs — the run-script
// (scripts/link-exercise-variations.ts) applies them additively and
// idempotently: existing variations/aliases are preserved, only the missing
// entries are appended, so running it twice is the same as running it once.

import type {
  IExerciseDefinition,
  MuscleGroup,
  MovementPattern,
  Equipment,
  ExerciseCategory,
  MechanicsType,
  ExerciseRole,
  Laterality,
  Difficulty,
  TrackingType,
  BodyRegion,
} from '../models/Exercise'

// ─── Cross-link fixes for exercises already in the catalog ─────────────────

export interface VariationLinkFix {
  slug: string
  reason: string
  /** Slugs to append to this exercise's `variations[]` (deduped, additive). */
  addVariations: string[]
  /** Alias strings to drop — e.g. once a grip variant becomes its own exercise. */
  removeAliases?: string[]
}

export const VARIATION_LINK_FIXES: VariationLinkFix[] = [
  // ── Chest press: grip variants weren't linked to the presses they vary ──
  {
    slug: 'close-grip-dumbbell-press',
    reason: 'narrow-grip press variant of the flat dumbbell/barbell bench press',
    addVariations: ['dumbbell-bench-press', 'barbell-bench-press'],
  },
  {
    slug: 'dumbbell-bench-press',
    reason: 'reciprocal link for close-grip-dumbbell-press',
    addVariations: ['close-grip-dumbbell-press'],
  },
  {
    slug: 'barbell-bench-press',
    reason: 'reciprocal link for close-grip-dumbbell-press',
    addVariations: ['close-grip-dumbbell-press'],
  },
  {
    slug: 'incline-close-grip-dumbbell-press',
    reason: 'narrow-grip press variant of the incline bench/dumbbell press',
    addVariations: ['incline-bench-press', 'incline-dumbbell-press'],
  },
  {
    slug: 'incline-bench-press',
    reason: 'reciprocal link for incline-close-grip-dumbbell-press, plus decline push-up as the bodyweight upper-chest equivalent',
    addVariations: ['incline-close-grip-dumbbell-press', 'decline-push-up'],
  },
  {
    slug: 'incline-dumbbell-press',
    reason: 'reciprocal link for incline-close-grip-dumbbell-press, plus decline push-up as the bodyweight upper-chest equivalent',
    addVariations: ['incline-close-grip-dumbbell-press', 'decline-push-up'],
  },
  {
    slug: 'decline-push-up',
    reason: 'bodyweight upper-chest variant belongs alongside the incline press family, not just the push-up family',
    addVariations: ['incline-bench-press', 'incline-dumbbell-press'],
  },
  {
    slug: 'light-dumbbell-floor-press',
    reason: 'lighter-load variant of the dumbbell floor press',
    addVariations: ['dumbbell-floor-press'],
  },
  {
    slug: 'dumbbell-floor-press',
    reason: 'reciprocal link for light-dumbbell-floor-press',
    addVariations: ['light-dumbbell-floor-press'],
  },
  {
    slug: 'machine-chest-press',
    reason: 'link to the new plate-loaded chest press variant',
    addVariations: ['plate-loaded-chest-press'],
  },

  // ── Lat pulldown: grip variants were baked into aliases, not their own exercises ──
  {
    slug: 'lat-pulldown',
    reason: 'link the new grip/equipment variants; the "Close Grip Lat Pulldown" alias now points to its own exercise',
    addVariations: ['wide-grip-lat-pulldown', 'close-grip-lat-pulldown', 'underhand-grip-lat-pulldown', 'cable-lat-pulldown'],
    removeAliases: ['Close Grip Lat Pulldown'],
  },

  // ── Rows: underhand-grip row wasn't linked to the row family ─────────────
  {
    slug: 'dumbbell-underhand-row',
    reason: 'underhand-grip variant of the row family (biceps-emphasis grip, same pattern)',
    addVariations: ['barbell-row', 'dumbbell-row', 'cable-row'],
  },
  {
    slug: 'barbell-row',
    reason: 'reciprocal link for dumbbell-underhand-row',
    addVariations: ['dumbbell-underhand-row'],
  },
  {
    slug: 'dumbbell-row',
    reason: 'reciprocal link for dumbbell-underhand-row',
    addVariations: ['dumbbell-underhand-row'],
  },
  {
    slug: 'cable-row',
    reason: 'reciprocal link for dumbbell-underhand-row',
    addVariations: ['dumbbell-underhand-row'],
  },

  // ── Triceps: dip has a second movement pattern (horizontal_push) so it
  //    doesn't algorithmically match the single-pattern pushdown/extension family ──
  {
    slug: 'tricep-dip',
    reason: 'compound triceps variant of the pushdown/extension family, missed by the pattern-array exact-match',
    addVariations: ['cable-tricep-pushdown', 'overhead-tricep-extension', 'skull-crusher', 'tricep-cable-kickback'],
  },
  {
    slug: 'cable-tricep-pushdown',
    reason: 'reciprocal link for tricep-dip',
    addVariations: ['tricep-dip'],
  },
  {
    slug: 'overhead-tricep-extension',
    reason: 'reciprocal link for tricep-dip',
    addVariations: ['tricep-dip'],
  },
  {
    slug: 'skull-crusher',
    reason: 'reciprocal link for tricep-dip',
    addVariations: ['tricep-dip'],
  },
  {
    slug: 'tricep-cable-kickback',
    reason: 'reciprocal link for tricep-dip',
    addVariations: ['tricep-dip'],
  },
]

// ─── New exercises: grip/equipment variants the catalog was missing ────────

type NewExercise = Pick<
  IExerciseDefinition,
  | 'slug' | 'name' | 'aliases' | 'description'
  | 'category' | 'mechanics' | 'role' | 'laterality' | 'difficulty'
  | 'trackingType' | 'tags' | 'bodyRegion' | 'isActive' | 'isCustom'
  | 'defaultSets' | 'defaultReps' | 'defaultRest'
> & {
  movementPatterns: MovementPattern[]
  primaryMuscles: MuscleGroup[]
  secondaryMuscles: MuscleGroup[]
  stabilizers: MuscleGroup[]
  equipment: Equipment[]
  optionalEquipment: Equipment[]
  instructions: string[]
  cues: string[]
  commonMistakes: string[]
  prerequisites: string[]
  variations: string[]
  alternatives: string[]
}

const baseDefaults: Pick<
  NewExercise,
  | 'description' | 'instructions' | 'cues' | 'commonMistakes' | 'prerequisites'
  | 'alternatives' | 'optionalEquipment' | 'stabilizers' | 'isActive' | 'isCustom'
  | 'category' | 'defaultRest'
> = {
  description: '',
  instructions: [],
  cues: [],
  commonMistakes: [],
  prerequisites: [],
  alternatives: [],
  optionalEquipment: [],
  stabilizers: [],
  isActive: true,
  isCustom: false,
  category: 'strength' as ExerciseCategory,
  defaultRest: '90 sec',
}

export const NEW_VARIATION_EXERCISES: NewExercise[] = [
  {
    ...baseDefaults,
    slug: 'plate-loaded-chest-press',
    name: 'Plate-Loaded Chest Press',
    aliases: ['Hammer Strength Chest Press', 'Plate-Loaded Machine Chest Press'],
    mechanics: 'compound' as MechanicsType,
    role: 'secondary' as ExerciseRole,
    laterality: 'bilateral' as Laterality,
    difficulty: 'intermediate' as Difficulty,
    movementPatterns: ['horizontal_push'],
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front_delts'],
    equipment: ['chest_press_machine'],
    trackingType: 'reps_weight' as TrackingType,
    tags: ['push', 'machine', 'plate_loaded'],
    bodyRegion: 'upper_body' as BodyRegion,
    defaultSets: 3,
    defaultReps: '8-12',
    variations: ['machine-chest-press', 'dumbbell-bench-press', 'barbell-bench-press'],
  },
  {
    ...baseDefaults,
    slug: 'wide-grip-lat-pulldown',
    name: 'Wide-Grip Lat Pulldown',
    aliases: ['Wide Grip Lat Pull Down'],
    mechanics: 'compound' as MechanicsType,
    role: 'secondary' as ExerciseRole,
    laterality: 'bilateral' as Laterality,
    difficulty: 'intermediate' as Difficulty,
    movementPatterns: ['vertical_pull'],
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'rear_delts', 'mid_back'],
    equipment: ['lat_pulldown'],
    trackingType: 'reps_weight' as TrackingType,
    tags: ['pull', 'vertical', 'machine', 'wide_grip'],
    bodyRegion: 'upper_body' as BodyRegion,
    defaultSets: 3,
    defaultReps: '10-12',
    variations: ['lat-pulldown', 'close-grip-lat-pulldown', 'underhand-grip-lat-pulldown', 'cable-lat-pulldown', 'pull-up'],
  },
  {
    ...baseDefaults,
    slug: 'close-grip-lat-pulldown',
    name: 'Close-Grip Lat Pulldown',
    aliases: ['Close Grip Lat Pulldown', 'V-Bar Lat Pulldown'],
    mechanics: 'compound' as MechanicsType,
    role: 'secondary' as ExerciseRole,
    laterality: 'bilateral' as Laterality,
    difficulty: 'intermediate' as Difficulty,
    movementPatterns: ['vertical_pull'],
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'rear_delts', 'mid_back'],
    equipment: ['lat_pulldown'],
    trackingType: 'reps_weight' as TrackingType,
    tags: ['pull', 'vertical', 'machine', 'close_grip'],
    bodyRegion: 'upper_body' as BodyRegion,
    defaultSets: 3,
    defaultReps: '10-12',
    variations: ['lat-pulldown', 'wide-grip-lat-pulldown', 'underhand-grip-lat-pulldown', 'cable-lat-pulldown', 'pull-up'],
  },
  {
    ...baseDefaults,
    slug: 'underhand-grip-lat-pulldown',
    name: 'Underhand-Grip Lat Pulldown',
    aliases: ['Underhand Lat Pulldown', 'Reverse-Grip Lat Pulldown', 'Supinated Lat Pulldown'],
    mechanics: 'compound' as MechanicsType,
    role: 'secondary' as ExerciseRole,
    laterality: 'bilateral' as Laterality,
    difficulty: 'intermediate' as Difficulty,
    movementPatterns: ['vertical_pull'],
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'rear_delts', 'mid_back'],
    equipment: ['lat_pulldown'],
    trackingType: 'reps_weight' as TrackingType,
    tags: ['pull', 'vertical', 'machine', 'underhand_grip'],
    bodyRegion: 'upper_body' as BodyRegion,
    defaultSets: 3,
    defaultReps: '10-12',
    variations: ['lat-pulldown', 'wide-grip-lat-pulldown', 'close-grip-lat-pulldown', 'cable-lat-pulldown', 'pull-up'],
  },
  {
    ...baseDefaults,
    slug: 'cable-lat-pulldown',
    name: 'Cable Lat Pulldown',
    aliases: ['Cable Pulldown', 'Straight-Bar Cable Pulldown'],
    mechanics: 'compound' as MechanicsType,
    role: 'secondary' as ExerciseRole,
    laterality: 'bilateral' as Laterality,
    difficulty: 'intermediate' as Difficulty,
    movementPatterns: ['vertical_pull'],
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'rear_delts', 'mid_back'],
    equipment: ['cable'],
    trackingType: 'reps_weight' as TrackingType,
    tags: ['pull', 'vertical', 'cable'],
    bodyRegion: 'upper_body' as BodyRegion,
    defaultSets: 3,
    defaultReps: '10-12',
    variations: ['lat-pulldown', 'wide-grip-lat-pulldown', 'close-grip-lat-pulldown', 'underhand-grip-lat-pulldown', 'pull-up'],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the additive diff for one fix vs. an exercise's current state.
 * `changed: false` when every slug in `addVariations` is already present and
 * every alias in `removeAliases` is already absent — the idempotency property.
 * Never removes an existing variation link, only appends missing ones.
 */
export interface VariationLinkDiff {
  slug: string
  changed: boolean
  variationsChanged: boolean
  aliasesChanged: boolean
  nextVariations: string[]
  nextAliases: string[]
  reason: string
}

export function computeVariationLinkDiff(
  current: { variations: string[]; aliases: string[] },
  fix: VariationLinkFix,
): VariationLinkDiff {
  const variationSet = new Set(current.variations)
  const missing = fix.addVariations.filter((slug) => !variationSet.has(slug))
  const nextVariations = missing.length > 0 ? [...current.variations, ...missing] : current.variations

  const aliasesToRemove = new Set(fix.removeAliases ?? [])
  const hasAliasToRemove = current.aliases.some((a) => aliasesToRemove.has(a))
  const nextAliases = hasAliasToRemove
    ? current.aliases.filter((a) => !aliasesToRemove.has(a))
    : current.aliases

  return {
    slug: fix.slug,
    changed: missing.length > 0 || hasAliasToRemove,
    variationsChanged: missing.length > 0,
    aliasesChanged: hasAliasToRemove,
    nextVariations,
    nextAliases,
    reason: fix.reason,
  }
}

export function formatVariationLinkDiff(diff: VariationLinkDiff): string {
  if (!diff.changed) return `✓ ${diff.slug} (already linked)`
  const lines = [`✎ ${diff.slug} — ${diff.reason}`]
  if (diff.variationsChanged) lines.push(`    variations: → [${diff.nextVariations.join(', ')}]`)
  if (diff.aliasesChanged) lines.push(`    aliases:    → [${diff.nextAliases.join(', ')}]`)
  return lines.join('\n')
}
