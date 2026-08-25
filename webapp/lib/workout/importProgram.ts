// Normalizes the AI's raw JSON extraction (workoutImportText / workoutImportPhoto,
// see lib/ai/becomeGraph.ts) into the exact shape ProgramCreator's `initialProgram`
// prop expects (Partial<ProgramFormData>, see app/dashboard/admin/programs/_editors/
// ProgramCreator.tsx). The model is small and best-effort, so this defensively
// coerces every field and drops anything that doesn't parse into a usable
// exercise/workout/phase rather than letting a malformed value reach the editor.
import type { TargetUserLevel, Phase, Workout, Exercise, ImportFlag } from '@/lib/data/programs'

export interface ImportedProgram {
  name: string
  description: string
  goal: string
  duration_weeks: number
  training_days_per_week: number
  target_user: TargetUserLevel
  phases: Phase[]
}

const TARGET_USER_VALUES: TargetUserLevel[] = [
  'Beginner',
  'Intermediate',
  'Advanced',
  'Beginner to Intermediate',
  'Intermediate to Advanced',
]

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object'
}

function cleanExercise(raw: unknown): Exercise | null {
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  return {
    name,
    sets: typeof raw.sets === 'number' && isFinite(raw.sets) ? raw.sets : undefined,
    reps: typeof raw.reps === 'string' && raw.reps.trim() ? raw.reps.trim() : undefined,
    rest: typeof raw.rest === 'string' && raw.rest.trim() ? raw.rest.trim() : undefined,
    details: typeof raw.details === 'string' && raw.details.trim() ? raw.details.trim() : undefined,
  }
}

function cleanWorkout(raw: unknown, index: number): Workout | null {
  if (!isRecord(raw)) return null
  const exercisesRaw = Array.isArray(raw.exercises) ? raw.exercises : []
  const exercises = exercisesRaw.map(cleanExercise).filter((e): e is Exercise => e !== null)
  if (exercises.length === 0) return null
  return {
    day: typeof raw.day === 'string' && raw.day.trim() ? raw.day.trim() : `Day ${index + 1}`,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `Workout ${index + 1}`,
    exercises,
  }
}

function cleanPhase(raw: unknown, index: number): Phase | null {
  if (!isRecord(raw)) return null
  const workoutsRaw = Array.isArray(raw.workouts) ? raw.workouts : []
  const workouts = workoutsRaw
    .map((w, i) => cleanWorkout(w, i))
    .filter((w): w is Workout => w !== null)
  if (workouts.length === 0) return null
  return {
    phase: typeof raw.phase === 'string' && raw.phase.trim() ? raw.phase.trim() : `Phase ${index + 1}`,
    weeks: typeof raw.weeks === 'string' && raw.weeks.trim() ? raw.weeks.trim() : '1',
    focus: typeof raw.focus === 'string' && raw.focus.trim() ? raw.focus.trim() : 'General',
    workouts,
  }
}

/**
 * Returns null when the AI found nothing usable (empty/illegible input, or a
 * response with no real exercises) — callers treat that as a failed import,
 * same convention as SnapPlateModal treating `items: []` as "couldn't read it".
 */
export function normalizeImportedProgram(raw: unknown): ImportedProgram | null {
  if (!isRecord(raw)) return null
  const phasesRaw = Array.isArray(raw.phases) ? raw.phases : []
  const phases = phasesRaw.map((p, i) => cleanPhase(p, i)).filter((p): p is Phase => p !== null)
  if (phases.length === 0) return null

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Imported Program'
  const daysPerWeek =
    typeof raw.training_days_per_week === 'number' && raw.training_days_per_week > 0
      ? Math.round(raw.training_days_per_week)
      : phases[0].workouts.length
  const weeks =
    typeof raw.duration_weeks === 'number' && raw.duration_weeks > 0
      ? Math.round(raw.duration_weeks)
      : 4
  const target_user = TARGET_USER_VALUES.includes(raw.target_user as TargetUserLevel)
    ? (raw.target_user as TargetUserLevel)
    : 'Intermediate'

  return {
    name,
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    goal: typeof raw.goal === 'string' && raw.goal.trim() ? raw.goal.trim() : 'Follow my own program',
    duration_weeks: weeks,
    training_days_per_week: daysPerWeek,
    target_user,
    phases,
  }
}

// A leading label like "A1.", "1a)", "B2:" — the shorthand programs commonly use
// to mark exercises that alternate together (a superset/circuit), e.g.
// "A1. Bench Press" / "A2. Bent-Over Row".
const GROUP_LABEL_RE = /^\s*(?:[A-Za-z]\d{1,2}[a-z]?|\d{1,2}[a-zA-Z])\s*[.):\-]/
const GROUP_WORD_RE = /\b(superset|circuit|tri-?set|giant\s?set)\b/i

function looksGrouped(exercise: Exercise): boolean {
  const name = exercise.name || ''
  const details = exercise.details || ''
  return (
    GROUP_LABEL_RE.test(name) ||
    GROUP_WORD_RE.test(name) ||
    GROUP_WORD_RE.test(details)
  )
}

function looksBroken(exercise: Exercise): boolean {
  const name = (exercise.name || '').trim()
  if (name.length < 3) return true
  return exercise.sets == null && !exercise.reps && !exercise.rest && !exercise.details
}

/**
 * Annotates each exercise in an already-normalized imported program with
 * review flags, so the editor can surface them before the user saves:
 *   - 'new'     the name doesn't match anything in the exercise library —
 *               saving will create a brand-new custom exercise.
 *   - 'broken'  the AI extracted a name but nothing else usable (no
 *               sets/reps/rest/details) — likely a parsing miss.
 *   - 'grouped' the name/details carry a superset/circuit marker (e.g.
 *               "A1. Bench Press") — likely meant to be linked with a
 *               neighboring exercise via the group controls.
 * Pure — returns a new object, does not mutate `program`. `knownExerciseNames`
 * must already be lowercased/trimmed (see /api/exercises/match).
 */
export function flagImportedProgram(
  program: ImportedProgram,
  knownExerciseNames: Set<string>,
): ImportedProgram {
  return {
    ...program,
    phases: program.phases.map((phase) => ({
      ...phase,
      workouts: phase.workouts.map((workout) => ({
        ...workout,
        exercises: workout.exercises.map((exercise) => {
          const flags: ImportFlag[] = []
          if (!knownExerciseNames.has(exercise.name.trim().toLowerCase())) flags.push('new')
          if (looksBroken(exercise)) flags.push('broken')
          if (looksGrouped(exercise)) flags.push('grouped')
          return flags.length ? { ...exercise, importFlags: flags } : exercise
        }),
      })),
    })),
  }
}
