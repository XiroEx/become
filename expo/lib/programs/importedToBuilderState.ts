/**
 * ─── IMPORT FROM TEXT 4/4: THE IMPORTED PROGRAM, AS BUILDER STATE (NP-244) ───
 *
 * Pure mapper from `ImportedProgram` (NP-242's `importProgramFromText` —
 * the AI run plus the library-match flagging) to `ProgramBuilderState`, the
 * shape `ProgramBuilder`'s `initialState` prop already accepts. No fetch, no
 * React — same convention as `importWorkoutText.ts`, which this sits next to
 * in spirit but downstream of (it reads the AI's run output, this reads that
 * output's normalized shape).
 *
 * WHAT RIDES THROUGH, AND WHAT DOES NOT:
 *
 *   • name / description / goal / duration_weeks / training_days_per_week /
 *     target_user — straight across; `normalizeImportedProgram` already
 *     guarantees non-empty strings and in-range numbers, so nothing here
 *     re-mints a default for them.
 *   • phases / workouts — straight across too: `phase`, `weeks`, `focus`,
 *     `day`, `title` are already-defaulted strings for the same reason (rule
 *     2 in `programBuilder.ts` — a day label is an address — is therefore
 *     already satisfied by the parser, not re-enforced here).
 *   • exercises — `sets`/`reps`/`rest`/`details` are kept AS TEXT, exactly
 *     what the card asks: no unit parsing, no coercion beyond what
 *     `normalizeImportedProgram` already did. A row with no `sets` (or no
 *     `reps`/`rest`) gets the BUILDER's own blank-row defaults
 *     (`createBuilderExercise`'s `sets: 3, reps: "10", rest: "60s"`) rather
 *     than a value invented here — one source of truth for what "blank"
 *     means in this builder.
 *   • `exerciseSlug` is always `""`. An imported exercise is a NAME, not a
 *     catalogue pick — `importProgramFromText` flags names against the
 *     library (`new`/`broken`/`grouped`) but never resolves them to a slug
 *     the way `resolveImportedSession` does for sessions, because a wrong
 *     silent match in a multi-week program is a worse failure than asking
 *     the member to pick. `validateBuilderExercise` already refuses a save
 *     without one, so the review step the card calls for is exactly what
 *     stops this from reaching the server unslugged.
 *   • `importFlags` are DROPPED. The card says to carry them "if the builder
 *     already has a field for it, otherwise dropped" — `BuilderExercise` has
 *     no such field and nothing in `ProgramBuilder`/`BuilderExerciseRow`
 *     renders a new/broken/grouped hint today, so carrying the flags would
 *     only be inert JSON riding along on every autosave and every eventual
 *     save until a later card adds that surface.
 *   • `equipment` / `tags` are not something an import produces — they come
 *     back empty, same as a scratch-built program (`emptyProgramBuilderState`).
 */

import {
  type BuilderExercise,
  type BuilderPhase,
  type BuilderWorkout,
  type ProgramBuilderState,
  clampDurationWeeks,
  clampTrainingDays,
  createBuilderExercise,
} from "@/lib/programs/programBuilder";
import type { ImportedProgram, Exercise as ImportedExercise } from "@/lib/workout/importWorkoutText";

/** One imported exercise, read into a builder row with the builder's own defaults. */
function toBuilderExercise(exercise: ImportedExercise): BuilderExercise {
  // `createBuilderExercise` is the ONE place "a blank row" is defined
  // (sets: 3, reps: "10", rest: "60s") — reused here rather than retyped so
  // the two never drift. An imported field overrides its own default only;
  // a program with sets but no rest still gets the builder's rest default.
  const base = createBuilderExercise("", exercise.name);
  return {
    ...base,
    ...(exercise.sets !== undefined ? { sets: exercise.sets } : {}),
    ...(exercise.reps !== undefined ? { reps: exercise.reps } : {}),
    ...(exercise.rest !== undefined ? { rest: exercise.rest } : {}),
    ...(exercise.details !== undefined ? { details: exercise.details } : {}),
  };
}

function toBuilderWorkout(workout: ImportedProgram["phases"][number]["workouts"][number]): BuilderWorkout {
  return {
    day: workout.day,
    title: workout.title,
    exercises: workout.exercises.map(toBuilderExercise),
  };
}

function toBuilderPhase(phase: ImportedProgram["phases"][number]): BuilderPhase {
  return {
    phase: phase.phase,
    weeks: phase.weeks,
    focus: phase.focus,
    workouts: phase.workouts.map(toBuilderWorkout),
  };
}

/**
 * Maps a normalized/flagged `ImportedProgram` into `ProgramBuilderState` —
 * what `ProgramBuilder`'s `initialState` expects. `normalizeImportedProgram`
 * guarantees at least one phase with at least one workout with at least one
 * exercise, so this never has to invent a phase the way
 * `emptyProgramBuilderState` does for a blank program.
 */
export function importedToBuilderState(
  program: ImportedProgram,
): ProgramBuilderState {
  return {
    name: program.name,
    description: program.description,
    goal: program.goal,
    duration_weeks: clampDurationWeeks(program.duration_weeks),
    training_days_per_week: clampTrainingDays(program.training_days_per_week),
    target_user: program.target_user,
    equipment: [],
    tags: [],
    phases: program.phases.map(toBuilderPhase),
  };
}

export default importedToBuilderState;
