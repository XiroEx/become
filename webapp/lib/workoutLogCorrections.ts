// Validation for member-initiated corrections to completed workout logs.
// Kept pure so the API can remain small and the safety rules can be exercised
// without a database: exercises cannot be inserted/removed here, and only set
// measurements plus a few log-level display fields are mutable.

export interface WorkoutLogCorrectionSet {
  setNumber: number
  reps?: number
  weight?: number
  duration?: number
  distance?: number
  speed?: number
  completed: boolean
}

export interface WorkoutLogCorrectionExercise {
  name: string
  exerciseSlug?: string
  sets: WorkoutLogCorrectionSet[]
}

export interface WorkoutLogCorrectionInput {
  title?: string
  duration?: number
  notes?: string
  exercises: WorkoutLogCorrectionExercise[]
}

export type CorrectionResult =
  | { ok: true; value: WorkoutLogCorrectionInput }
  | { ok: false; error: string }

const LIMITS = {
  exercises: 100,
  setsPerExercise: 50,
  name: 120,
  title: 80,
  notes: 2_000,
  durationMinutes: 1_440,
  reps: 100_000,
  weight: 100_000,
  seconds: 604_800,
  distance: 10_000_000,
  speed: 10_000,
} as const

function optionalNumber(
  value: unknown,
  label: string,
  max: number,
  integer = false,
): { ok: true; value?: number } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') return { ok: true }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    return { ok: false, error: `${label} must be between 0 and ${max}` }
  }
  if (integer && !Number.isInteger(value)) return { ok: false, error: `${label} must be a whole number` }
  return { ok: true, value }
}

export function normalizeWorkoutLogCorrection(input: unknown): CorrectionResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Correction body is required' }
  const raw = input as Record<string, unknown>
  if (!Array.isArray(raw.exercises) || raw.exercises.length === 0 || raw.exercises.length > LIMITS.exercises) {
    return { ok: false, error: `Exercises must contain between 1 and ${LIMITS.exercises} entries` }
  }

  const normalized: WorkoutLogCorrectionInput = { exercises: [] }

  if (raw.title !== undefined) {
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.trim().length > LIMITS.title) {
      return { ok: false, error: `Title must contain between 1 and ${LIMITS.title} characters` }
    }
    normalized.title = raw.title.trim()
  }
  if (raw.notes !== undefined) {
    if (typeof raw.notes !== 'string' || raw.notes.length > LIMITS.notes) {
      return { ok: false, error: `Notes cannot exceed ${LIMITS.notes} characters` }
    }
    normalized.notes = raw.notes.trim()
  }
  if (raw.duration !== undefined) {
    const duration = optionalNumber(raw.duration, 'Duration', LIMITS.durationMinutes, true)
    if (!duration.ok) return duration
    normalized.duration = duration.value
  }

  for (let exerciseIndex = 0; exerciseIndex < raw.exercises.length; exerciseIndex += 1) {
    const rawExercise = raw.exercises[exerciseIndex]
    if (!rawExercise || typeof rawExercise !== 'object') {
      return { ok: false, error: `Exercise ${exerciseIndex + 1} is invalid` }
    }
    const exercise = rawExercise as Record<string, unknown>
    if (typeof exercise.name !== 'string' || !exercise.name.trim() || exercise.name.trim().length > LIMITS.name) {
      return { ok: false, error: `Exercise ${exerciseIndex + 1} needs a valid name` }
    }
    if (!Array.isArray(exercise.sets) || exercise.sets.length > LIMITS.setsPerExercise) {
      return { ok: false, error: `Exercise ${exerciseIndex + 1} has too many sets` }
    }

    const sets: WorkoutLogCorrectionSet[] = []
    for (let setIndex = 0; setIndex < exercise.sets.length; setIndex += 1) {
      const rawSet = exercise.sets[setIndex]
      if (!rawSet || typeof rawSet !== 'object') {
        return { ok: false, error: `Set ${setIndex + 1} for ${exercise.name} is invalid` }
      }
      const set = rawSet as Record<string, unknown>
      const reps = optionalNumber(set.reps, 'Reps', LIMITS.reps, true)
      if (!reps.ok) return reps
      const weight = optionalNumber(set.weight, 'Weight', LIMITS.weight)
      if (!weight.ok) return weight
      const duration = optionalNumber(set.duration, 'Set duration', LIMITS.seconds)
      if (!duration.ok) return duration
      const distance = optionalNumber(set.distance, 'Distance', LIMITS.distance)
      if (!distance.ok) return distance
      const speed = optionalNumber(set.speed, 'Speed', LIMITS.speed)
      if (!speed.ok) return speed
      if (set.completed !== undefined && typeof set.completed !== 'boolean') {
        return { ok: false, error: `Completed state for set ${setIndex + 1} is invalid` }
      }
      sets.push({
        setNumber: setIndex + 1,
        ...(reps.value !== undefined ? { reps: reps.value } : {}),
        ...(weight.value !== undefined ? { weight: weight.value } : {}),
        ...(duration.value !== undefined ? { duration: duration.value } : {}),
        ...(distance.value !== undefined ? { distance: distance.value } : {}),
        ...(speed.value !== undefined ? { speed: speed.value } : {}),
        completed: set.completed !== false,
      })
    }

    normalized.exercises.push({
      name: exercise.name.trim(),
      ...(typeof exercise.exerciseSlug === 'string' && exercise.exerciseSlug.trim()
        ? { exerciseSlug: exercise.exerciseSlug.trim() }
        : {}),
      sets,
    })
  }

  return { ok: true, value: normalized }
}
