// Shared validation + mapping for the fields a custom exercise is created (and
// now edited) with. Used by both POST and PATCH /api/exercises/custom[/slug]
// so create and edit can never drift into accepting different shapes.

import type {
  BodyRegion,
  Difficulty,
  Equipment,
  ExerciseCategory,
  ExerciseRole,
  Laterality,
  MechanicsType,
  MovementPattern,
  MuscleGroup,
} from '@/models/Exercise'

export const VALID_CUSTOM_TRACKING_TYPES = [
  'reps_weight', 'reps_bodyweight', 'reps_only', 'time', 'time_distance', 'intervals', 'none',
] as const

export type CustomExerciseTrackingType = (typeof VALID_CUSTOM_TRACKING_TYPES)[number]

// Role uses the model's own enum directly — no create-form vocabulary
// translation needed, unlike muscleGroup/category below.
export const VALID_CUSTOM_EXERCISE_ROLES = ['compound', 'secondary', 'accessory'] as const

export type CustomExerciseRole = (typeof VALID_CUSTOM_EXERCISE_ROLES)[number]

// Runtime allowlists for the optional Advanced form. Keeping them here (rather
// than trusting the browser's select options) gives POST and PATCH one source
// of truth and prevents arbitrary strings from reaching Mongoose enum fields.
export const VALID_CUSTOM_MUSCLES: readonly MuscleGroup[] = [
  'chest', 'upper_chest', 'lower_chest',
  'lats', 'upper_back', 'mid_back', 'lower_back', 'rhomboids', 'traps', 'teres_major',
  'front_delts', 'side_delts', 'rear_delts', 'rotator_cuff',
  'biceps', 'triceps', 'forearms', 'brachialis', 'grip',
  'abs', 'obliques', 'transverse_abdominis', 'hip_flexors', 'erector_spinae',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'full_body',
]

export const VALID_CUSTOM_EQUIPMENT: readonly Equipment[] = [
  'barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'trap_bar', 'safety_squat_bar', 'cable',
  'leg_press', 'leg_extension', 'leg_curl', 'hack_squat', 'chest_press_machine',
  'shoulder_press_machine', 'lat_pulldown', 'seated_row_machine', 'low_row_machine',
  'pec_deck', 'hip_abduction_machine', 'hip_adduction_machine', 'calf_raise_machine',
  'preacher_curl_machine', 'belt_squat_machine', 'lateral_raise_machine',
  'rear_delt_machine', 'smith_machine', 'glute_ham_raise', 'back_extension', 'sled',
  'flat_bench', 'incline_bench', 'decline_bench', 'squat_rack', 'pull_up_bar',
  'dip_station', 'resistance_band', 'foam_roller', 'exercise_mat', 'box', 'chair',
  'ab_wheel', 'medicine_ball', 'treadmill', 'stationary_bike', 'rowing_machine',
  'assault_bike', 'elliptical', 'stair_climber', 'jump_rope', 'backpack', 'towel',
  'bodyweight', 'none',
]

export const VALID_CUSTOM_MOVEMENT_PATTERNS: readonly MovementPattern[] = [
  'squat', 'hinge', 'lunge', 'horizontal_push', 'horizontal_pull', 'vertical_push',
  'vertical_pull', 'carry', 'rotation', 'anti_rotation', 'anti_extension',
  'anti_lateral_flexion', 'knee_extension', 'knee_flexion', 'hip_extension',
  'horizontal_adduction', 'shoulder_abduction', 'shoulder_flexion', 'elbow_flexion',
  'elbow_extension', 'ankle_flexion', 'scapular_retraction', 'triple_extension', 'gait', 'n/a',
]

export const VALID_CUSTOM_MECHANICS: readonly MechanicsType[] = ['compound', 'isolation', 'n/a']
export const VALID_CUSTOM_LATERALITY: readonly Laterality[] = ['bilateral', 'unilateral', 'alternating', 'n/a']
export const VALID_CUSTOM_DIFFICULTIES: readonly Difficulty[] = ['beginner', 'intermediate', 'advanced', 'expert']

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
  power:        "power",
  cardio:       "cardio",
  bodyweight:   "calisthenics",
  plyometric:   "plyometric",
  olympic:      "olympic",
  strongman:    "strongman",
  flexibility:  "flexibility",
  mobility:     "mobility",
  warmup:       "warmup",
  cooldown:     "cooldown",
  conditioning: "conditioning",
  protocol:     "protocol",
}

export function isValidCustomTrackingType(value: unknown): value is CustomExerciseTrackingType {
  return typeof value === 'string' && (VALID_CUSTOM_TRACKING_TYPES as readonly string[]).includes(value)
}

export function resolveCustomExerciseRole(value: unknown): ExerciseRole {
  return (VALID_CUSTOM_EXERCISE_ROLES as readonly string[]).includes(value as string)
    ? (value as ExerciseRole)
    : 'accessory'
}

export function resolveCustomExerciseMuscleData(muscleGroup: unknown): { primaryMuscles: MuscleGroup[]; bodyRegion: BodyRegion } {
  return CUSTOM_EXERCISE_MUSCLE_MAP[muscleGroup as string] ?? { primaryMuscles: [], bodyRegion: "full_body" }
}

export function resolveCustomExerciseCategory(category: unknown): ExerciseCategory {
  return CUSTOM_EXERCISE_CATEGORY_MAP[category as string] ?? "strength"
}

function uniqueAllowed<T extends string>(value: unknown, allowed: readonly T[], max = 20): T[] {
  if (!Array.isArray(value)) return []
  const allowedSet = new Set<string>(allowed)
  return Array.from(new Set(value.filter((item): item is T => typeof item === 'string' && allowedSet.has(item)))).slice(0, max)
}

export function resolveCustomExerciseMuscles(
  exactPrimary: unknown,
  muscleGroup: unknown,
): { primaryMuscles: MuscleGroup[]; bodyRegion: BodyRegion } {
  const primaryMuscles = uniqueAllowed(exactPrimary, VALID_CUSTOM_MUSCLES, 12)
  if (primaryMuscles.length === 0) return resolveCustomExerciseMuscleData(muscleGroup)
  return { primaryMuscles, bodyRegion: inferBodyRegion(primaryMuscles) }
}

export function resolveCustomMuscleList(value: unknown): MuscleGroup[] {
  return uniqueAllowed(value, VALID_CUSTOM_MUSCLES, 20)
}

export function resolveCustomEquipment(value: unknown): Equipment[] {
  const equipment = uniqueAllowed(value, VALID_CUSTOM_EQUIPMENT, 12)
  if (equipment.length === 0) return ['none']
  return equipment.length > 1 ? equipment.filter((item) => item !== 'none') : equipment
}

export function resolveCustomMovementPatterns(value: unknown): MovementPattern[] {
  const patterns = uniqueAllowed(value, VALID_CUSTOM_MOVEMENT_PATTERNS, 8)
  if (patterns.length === 0) return ['n/a']
  return patterns.length > 1 ? patterns.filter((item) => item !== 'n/a') : patterns
}

export function resolveCustomMechanics(value: unknown): MechanicsType {
  return (VALID_CUSTOM_MECHANICS as readonly unknown[]).includes(value) ? value as MechanicsType : 'n/a'
}

export function resolveCustomLaterality(value: unknown): Laterality {
  return (VALID_CUSTOM_LATERALITY as readonly unknown[]).includes(value) ? value as Laterality : 'bilateral'
}

export function resolveCustomDifficulty(value: unknown): Difficulty {
  return (VALID_CUSTOM_DIFFICULTIES as readonly unknown[]).includes(value) ? value as Difficulty : 'intermediate'
}

const UPPER_MUSCLES = new Set<MuscleGroup>([
  'chest', 'upper_chest', 'lower_chest', 'lats', 'upper_back', 'mid_back', 'lower_back',
  'rhomboids', 'traps', 'teres_major', 'front_delts', 'side_delts', 'rear_delts',
  'rotator_cuff', 'biceps', 'triceps', 'forearms', 'brachialis', 'grip',
])
const CORE_MUSCLES = new Set<MuscleGroup>([
  'abs', 'obliques', 'transverse_abdominis', 'hip_flexors', 'erector_spinae',
])
const LOWER_MUSCLES = new Set<MuscleGroup>([
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
])

export function inferBodyRegion(muscles: readonly MuscleGroup[]): BodyRegion {
  if (muscles.includes('full_body')) return 'full_body'
  const regions = new Set<BodyRegion>()
  for (const muscle of muscles) {
    if (UPPER_MUSCLES.has(muscle)) regions.add('upper_body')
    if (CORE_MUSCLES.has(muscle)) regions.add('core')
    if (LOWER_MUSCLES.has(muscle)) regions.add('lower_body')
  }
  return regions.size === 1 ? Array.from(regions)[0] : 'full_body'
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
