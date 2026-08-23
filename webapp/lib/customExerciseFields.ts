// Shared validation + mapping for the fields a custom exercise is created (and
// now edited) with. Used by both POST and PATCH /api/exercises/custom[/slug]
// so create and edit can never drift into accepting different shapes.

import type { BodyRegion, ExerciseCategory, MuscleGroup } from '@/models/Exercise'

export const VALID_CUSTOM_TRACKING_TYPES = [
  'reps_weight', 'reps_bodyweight', 'reps_only', 'time', 'time_distance', 'intervals', 'none',
] as const

export type CustomExerciseTrackingType = (typeof VALID_CUSTOM_TRACKING_TYPES)[number]

// Muscle group (create-form vocabulary) → Exercise model fields.
export const CUSTOM_EXERCISE_MUSCLE_MAP: Record<string, { primaryMuscles: MuscleGroup[]; bodyRegion: BodyRegion }> = {
  chest:      { primaryMuscles: ["chest"],                          bodyRegion: "upper_body" },
  back:       { primaryMuscles: ["lats", "upper_back"],             bodyRegion: "upper_body" },
  shoulders:  { primaryMuscles: ["front_delts", "side_delts"],      bodyRegion: "upper_body" },
  arms:       { primaryMuscles: ["biceps", "triceps"],              bodyRegion: "upper_body" },
  core:       { primaryMuscles: ["abs", "obliques"],                bodyRegion: "core"       },
  legs:       { primaryMuscles: ["quads", "hamstrings", "glutes"],  bodyRegion: "lower_body" },
  full_body:  { primaryMuscles: ["full_body"],                      bodyRegion: "full_body"  },
  // Surfaces that create an exercise inline (no muscle-group picker in view)
  // send `muscleGroup: 'other'`. Unmapped, it produced an exercise with no
  // muscles at all, which then read as a blank subtitle everywhere the list
  // shows "tracking · muscles".
  other:      { primaryMuscles: ["full_body"],                      bodyRegion: "full_body"  },
}

export const CUSTOM_EXERCISE_CATEGORY_MAP: Record<string, ExerciseCategory> = {
  strength:     "strength",
  cardio:       "cardio",
  bodyweight:   "calisthenics",
  conditioning: "conditioning",
}

export function isValidCustomTrackingType(value: unknown): value is CustomExerciseTrackingType {
  return typeof value === 'string' && (VALID_CUSTOM_TRACKING_TYPES as readonly string[]).includes(value)
}

export function resolveCustomExerciseMuscleData(muscleGroup: unknown): { primaryMuscles: MuscleGroup[]; bodyRegion: BodyRegion } {
  return CUSTOM_EXERCISE_MUSCLE_MAP[muscleGroup as string] ?? { primaryMuscles: [], bodyRegion: "full_body" }
}

export function resolveCustomExerciseCategory(category: unknown): ExerciseCategory {
  return CUSTOM_EXERCISE_CATEGORY_MAP[category as string] ?? "strength"
}

// ─── Reverse lookups, for pre-filling the edit form from a saved exercise ────
//
// The stored document only has `category` (an ExerciseCategory) and
// `primaryMuscles` (a MuscleGroup[]) — the create-form's own vocabulary
// ("bodyweight", "shoulders") is never persisted. Editing has to infer it back
// or the form would open with nothing selected, or worse, silently select the
// wrong chip.

export function inferCustomExerciseMuscleGroup(primaryMuscles: readonly string[]): string {
  const stored = new Set(primaryMuscles)
  for (const [group, data] of Object.entries(CUSTOM_EXERCISE_MUSCLE_MAP)) {
    if (group === 'other') continue // never a selectable chip — 'full_body' is its equivalent
    if (data.primaryMuscles.length === stored.size && data.primaryMuscles.every((m) => stored.has(m))) {
      return group
    }
  }
  return 'chest'
}

export function inferCustomExerciseCategory(category: unknown): string {
  const match = Object.entries(CUSTOM_EXERCISE_CATEGORY_MAP).find(([, resolved]) => resolved === category)
  return match ? match[0] : 'strength'
}
