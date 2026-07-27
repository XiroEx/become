import type {
  CompleteSessionExerciseInput,
  CompleteSessionMode,
  CompleteSessionOptions,
} from './types'

export interface CompleteSessionBodyParseResult {
  ok: true
  value: CompleteSessionOptions
}

export interface CompleteSessionBodyParseError {
  ok: false
  error: string
}

export type CompleteSessionBodyParse =
  | CompleteSessionBodyParseResult
  | CompleteSessionBodyParseError

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
): string | undefined | CompleteSessionBodyParseError {
  if (value[key] === undefined) return undefined
  if (typeof value[key] !== 'string') return { ok: false, error: `${key} must be a string` }
  return value[key]
}

function optionalNumber(
  value: Record<string, unknown>,
  key: string,
): number | undefined | CompleteSessionBodyParseError {
  if (value[key] === undefined) return undefined
  if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
    return { ok: false, error: `${key} must be a finite number` }
  }
  return value[key]
}

function parseExercise(value: unknown, index: number): CompleteSessionExerciseInput | CompleteSessionBodyParseError {
  if (!isRecord(value)) return { ok: false, error: `exercises[${index}] must be an object` }

  const exerciseSlug = value.exerciseSlug
  if (typeof exerciseSlug !== 'string' || exerciseSlug.trim().length === 0) {
    return { ok: false, error: `exercises[${index}].exerciseSlug is required` }
  }

  const name = optionalString(value, 'name')
  if (typeof name === 'object') return name
  const trackingType = optionalString(value, 'trackingType')
  if (typeof trackingType === 'object') return trackingType
  const sets = optionalNumber(value, 'sets')
  if (typeof sets === 'object') return sets
  const reps = optionalString(value, 'reps')
  if (typeof reps === 'object') return reps
  const rest = optionalString(value, 'rest')
  if (typeof rest === 'object') return rest
  const duration = optionalString(value, 'duration')
  if (typeof duration === 'object') return duration

  return {
    exerciseSlug: exerciseSlug.trim(),
    ...(name !== undefined && { name }),
    ...(trackingType !== undefined && { trackingType }),
    ...(sets !== undefined && { sets }),
    ...(reps !== undefined && { reps }),
    ...(rest !== undefined && { rest }),
    ...(duration !== undefined && { duration }),
  }
}

function clampSuggestionCount(value: number | undefined): number {
  return Math.max(1, Math.min(6, Math.trunc(value ?? 3)))
}

/** Purely validate and normalize the complete-session request body. */
export function parseCompleteSessionBody(body: unknown): CompleteSessionBodyParse {
  if (!isRecord(body) || !Array.isArray(body.exercises) || body.exercises.length === 0) {
    return { ok: false, error: 'A non-empty exercises array is required' }
  }

  const exercises: CompleteSessionExerciseInput[] = []
  for (const [index, value] of body.exercises.entries()) {
    const parsed = parseExercise(value, index)
    if ('error' in parsed) return parsed
    exercises.push(parsed)
  }

  const mode = body.mode === undefined ? 'finish' : body.mode
  if (mode !== 'finish' && mode !== 'suggest') {
    return { ok: false, error: 'mode must be finish or suggest' }
  }

  const exerciseCount = optionalNumber(body, 'exerciseCount')
  if (typeof exerciseCount === 'object') return exerciseCount
  const suggestionCount = optionalNumber(body, 'suggestionCount')
  if (typeof suggestionCount === 'object') return suggestionCount
  const seed = optionalNumber(body, 'seed')
  if (typeof seed === 'object') return seed

  if (body.equipment !== undefined && (!Array.isArray(body.equipment) || !body.equipment.every((item) => typeof item === 'string'))) {
    return { ok: false, error: 'equipment must be an array of strings' }
  }

  const difficulty = optionalString(body, 'difficulty')
  if (typeof difficulty === 'object') return difficulty

  return {
    ok: true,
    value: {
      exercises,
      mode: mode as CompleteSessionMode,
      ...(exerciseCount !== undefined && { exerciseCount }),
      suggestionCount: clampSuggestionCount(suggestionCount),
      ...(difficulty !== undefined && { difficulty }),
      ...(body.equipment !== undefined && { equipment: body.equipment as string[] }),
      ...(seed !== undefined && { seed }),
    },
  }
}
