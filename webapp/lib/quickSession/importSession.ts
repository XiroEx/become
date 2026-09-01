// Turns the AI's program-shaped extraction (see lib/workout/importProgram.ts —
// the same workoutImportText task, reused here rather than adding a second AI
// task) into a single quick session: every exercise across every phase/workout
// it found, flattened in order and deduped by name. A quick session doesn't
// have days or phases, only "what am I doing" — so unlike a program import,
// there's nothing to preserve structurally.
//
// Resolving those free-text names into real DraftExercises happens in a
// separate step (resolveImportedSession) because it needs the caller's
// exercise-library lookup, which requires a network round trip this module
// stays free of (pure, unit-testable, same convention as importProgram.ts).

import { normalizeImportedProgram } from '@/lib/workout/importProgram'
import type { DraftExercise } from '@/lib/quickSession/types'

export interface ImportedSessionExercise {
  name: string
  sets?: number
  reps?: string
  rest?: string
  details?: string
}

export interface ImportedSession {
  title: string
  exercises: ImportedSessionExercise[]
}

/**
 * Returns null when nothing usable was found — same convention as
 * normalizeImportedProgram, which this delegates all parsing/coercion to.
 */
export function normalizeImportedSession(raw: unknown): ImportedSession | null {
  const program = normalizeImportedProgram(raw)
  if (!program) return null

  const seen = new Set<string>()
  const exercises: ImportedSessionExercise[] = []
  for (const phase of program.phases) {
    for (const workout of phase.workouts) {
      for (const ex of workout.exercises) {
        const key = ex.name.trim().toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        exercises.push({ name: ex.name, sets: ex.sets, reps: ex.reps, rest: ex.rest, details: ex.details })
      }
    }
  }
  if (exercises.length === 0) return null

  // A single pasted workout rarely states a "program name" — the AI tends to
  // invent one (see normalizeImportedProgram's "Imported Program" fallback) or
  // borrow the day's own title ("Push"). Prefer whichever of those looks
  // like it was actually stated rather than defaulted.
  const firstWorkout = program.phases[0].workouts[0]
  const title =
    firstWorkout.title !== 'Workout 1' ? firstWorkout.title
      : program.name !== 'Imported Program' ? program.name
        : 'Imported Session'

  return { title, exercises }
}

/** A library exercise resolvable by exact (case/whitespace-insensitive) name match. */
export interface ResolvableExercise {
  slug: string
  name: string
  trackingType: string
  equipment?: string[]
  laterality?: string
  movementPatterns?: string[]
}

export interface ResolvedImportedSession {
  title: string
  exercises: DraftExercise[]
  /** Parsed names with no exact match in `known` — surfaced so the user can add them by hand. */
  unresolved: string[]
}

/**
 * Resolves each parsed exercise name against a name → exercise index the
 * caller has already built (from /api/exercises/search + /api/exercises/custom
 * results, keyed by the exercise's own name). Exact match only — a fuzzy
 * match risks silently swapping in the wrong movement, and every skipped name
 * is still visible via `unresolved` so the user can add it themselves through
 * the normal search-and-add flow. Pure — does not mutate its inputs.
 */
export function resolveImportedSession(
  session: ImportedSession,
  known: Map<string, ResolvableExercise>,
): ResolvedImportedSession {
  const exercises: DraftExercise[] = []
  const unresolved: string[] = []
  const usedSlugs = new Set<string>()

  for (const parsed of session.exercises) {
    const match = known.get(parsed.name.trim().toLowerCase())
    if (!match || usedSlugs.has(match.slug)) {
      unresolved.push(parsed.name)
      continue
    }
    usedSlugs.add(match.slug)
    const isTimeBased = match.trackingType.startsWith('time')
    exercises.push({
      exerciseSlug: match.slug,
      name: match.name,
      trackingType: match.trackingType,
      sets: parsed.sets ?? 3,
      reps: parsed.reps ?? (isTimeBased ? '' : '8-12'),
      ...(parsed.rest && { rest: parsed.rest }),
      ...(match.equipment && { equipment: match.equipment }),
      ...(match.laterality && { laterality: match.laterality }),
      ...(match.movementPatterns && { movementPatterns: match.movementPatterns }),
    })
  }

  return { title: session.title, exercises, unresolved }
}
