import type { TrackingType } from '@/models/Exercise'

export interface RawSet {
  reps?: number | null
  weight?: number | null
  duration?: number | null
  completed?: boolean
}

export interface RawEx {
  name: string
  exerciseSlug?: string
  sets?: RawSet[]
}

export interface RawLog {
  kind?: string
  sessionId?: string
  title?: string
  focus?: string
  date: Date | string
  completed: boolean
  exercises?: RawEx[]
}

export interface PlannedExercise {
  exerciseSlug: string
  name: string
  trackingType: TrackingType
  sets: number
  reps: string
  weight?: string
  duration?: string
}

export interface PlannedSession {
  sessionId: string
  title: string
  focus?: string
  date: string
  exerciseCount: number
  exercises: PlannedExercise[]
}

const TRACKING_TYPES: readonly TrackingType[] = [
  'reps_weight',
  'reps_bodyweight',
  'time',
  'time_distance',
  'intervals',
  'reps_only',
  'none',
]

function isTrackingType(value: unknown): value is TrackingType {
  return typeof value === 'string' && TRACKING_TYPES.includes(value as TrackingType)
}

function fallbackTrackingType(first: RawSet | undefined): TrackingType {
  return first?.duration != null && first.reps == null ? 'time' : 'reps_weight'
}

export function mapPlannedLog(
  log: RawLog,
  trackingTypesBySlug: ReadonlyMap<string, unknown> = new Map(),
): PlannedSession {
  return {
    sessionId: log.sessionId!,
    title: log.title || 'Planned session',
    focus: log.focus,
    date: new Date(log.date).toISOString(),
    exerciseCount: log.exercises?.length ?? 0,
    exercises: (log.exercises ?? []).map((exercise) => {
      const first = exercise.sets?.[0]
      const catalogTrackingType = exercise.exerciseSlug
        ? trackingTypesBySlug.get(exercise.exerciseSlug)
        : undefined
      const trackingType = isTrackingType(catalogTrackingType)
        ? catalogTrackingType
        : fallbackTrackingType(first)

      return {
        exerciseSlug: exercise.exerciseSlug || '',
        name: exercise.name,
        trackingType,
        sets: exercise.sets?.length || 1,
        reps: first?.reps != null ? String(first.reps) : '',
        ...(first?.weight != null ? { weight: String(first.weight) } : {}),
        ...(first?.duration != null ? { duration: String(first.duration) } : {}),
      }
    }),
  }
}
