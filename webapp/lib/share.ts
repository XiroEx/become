import { randomBytes } from 'crypto'
import type { Exercise, Workout } from '@/lib/data/programs'

/** Short, url-safe, hard-to-guess public share token. */
export function genShareId(): string {
  return randomBytes(9).toString('base64url') // 12 chars
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const numOpt = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined)

const GROUP_TYPES = new Set(['superset', 'circuit', 'triset', 'giant_set', 'emom', 'amrap'])

/** Sanitize a loose client exercise into the canonical Exercise display shape. */
export function sanitizeExercise(raw: Record<string, unknown>): Exercise | null {
  const name = str(raw.name) || str(raw.exerciseSlug)
  if (!name) return null
  const gt = str(raw.groupType)
  return {
    exerciseSlug: str(raw.exerciseSlug),
    name,
    sets: numOpt(raw.sets),
    reps: str(raw.reps),
    rest: str(raw.rest),
    details: str(raw.details),
    videoUrl: str(raw.videoUrl),
    thumbnailUrl: str(raw.thumbnailUrl),
    groupId: str(raw.groupId),
    groupType: gt && GROUP_TYPES.has(gt) ? (gt as Exercise['groupType']) : undefined,
    groupLabel: str(raw.groupLabel),
    groupRest: str(raw.groupRest),
    groupRounds: numOpt(raw.groupRounds),
  }
}

/** Sanitize a loose client session/workout into a Workout snapshot. */
export function sanitizeWorkout(raw: Record<string, unknown>): Workout | null {
  const exraw = Array.isArray(raw.exercises) ? raw.exercises : []
  const exercises = exraw.map((e) => sanitizeExercise(e as Record<string, unknown>)).filter(Boolean) as Exercise[]
  if (exercises.length === 0) return null
  return {
    day: str(raw.day) || 'Session',
    title: str(raw.title) || 'Workout',
    exercises,
  }
}
