/**
 * Tags for user-created exercises.
 *
 * Catalog exercises carry hand-curated tags (`['squat', 'machine',
 * 'beginner_friendly']`) that drive search, filtering and the chips shown in
 * the exercise list. Custom exercises used to get a bare `['custom']`, so they
 * showed up in those surfaces looking like a different kind of object.
 *
 * We cannot hand-curate a movement family for something the user just typed
 * in, but we can derive the parts we DO know from what the create form asks
 * for — category, muscle group, equipment — using the same vocabulary the
 * catalog uses. The result is close enough that a custom exercise reads like a
 * first-class entry in the list.
 *
 * `custom` stays first so the badge and any filter can key off it cheaply.
 */

export const CUSTOM_TAG = 'custom'

/** Muscle group (as the create form asks it) → the catalog's tag for it. */
const MUSCLE_GROUP_TAGS: Record<string, string[]> = {
  chest: ['push', 'upper_body'],
  back: ['pull', 'upper_body'],
  shoulders: ['push', 'upper_body'],
  arms: ['isolation', 'upper_body'],
  core: ['core'],
  legs: ['lower_body'],
  full_body: ['full_body'],
}

/** Category (create-form vocabulary) → catalog tags. */
const CATEGORY_TAGS: Record<string, string[]> = {
  strength: ['strength'],
  power: ['power'],
  cardio: ['cardio', 'conditioning'],
  bodyweight: ['bodyweight', 'calisthenics'],
  plyometric: ['plyometric', 'power'],
  olympic: ['olympic', 'power'],
  strongman: ['strongman', 'strength'],
  flexibility: ['flexibility'],
  mobility: ['mobility'],
  warmup: ['warmup'],
  cooldown: ['cooldown'],
  conditioning: ['conditioning'],
  protocol: ['protocol', 'conditioning'],
}

/** Tracking type → the tags that describe how it is measured. */
const TRACKING_TAGS: Record<string, string[]> = {
  reps_weight: ['loaded'],
  reps_bodyweight: ['bodyweight'],
  reps_only: [],
  time: ['isometric'],
  time_distance: ['cardio'],
  intervals: ['conditioning', 'intervals'],
  none: [],
}

export interface CustomExerciseTagInput {
  category?: string
  muscleGroup?: string
  trackingType?: string
  equipment?: string[]
  /** Anything the caller wants to add on top. Normalized alongside the rest. */
  extra?: string[]
}

/**
 * Build the tag list for a custom exercise. Always includes `custom`; the rest
 * is derived and de-duplicated, order-stable so two identical inputs produce
 * identical arrays (keeps diffs and tests boring).
 */
export function buildCustomExerciseTags(input: CustomExerciseTagInput): string[] {
  const out: string[] = [CUSTOM_TAG]

  const push = (tags: string[] | undefined) => {
    for (const tag of tags ?? []) {
      const normalized = normalizeTag(tag)
      if (normalized && !out.includes(normalized)) out.push(normalized)
    }
  }

  push(CATEGORY_TAGS[input.category ?? ''])
  push(MUSCLE_GROUP_TAGS[input.muscleGroup ?? ''])
  push(TRACKING_TAGS[input.trackingType ?? ''])
  // `none` is the schema's "no equipment" sentinel, not a piece of kit.
  push((input.equipment ?? []).filter((e) => e && e !== 'none'))
  push(input.extra)

  return out
}

/** Catalog tags are lower_snake_case; keep custom ones in the same shape. */
function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}
