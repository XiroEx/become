// Pure port of webapp/lib/workout/importProgram.ts (normalizeImportedProgram,
// flagImportedProgram) and webapp/lib/quickSession/importSession.ts
// (normalizeImportedSession, resolveImportedSession) for the native
// pasted-text import flow. No fetch, no React — pure functions only.
//
// The web's Phase/Workout/Exercise/ImportFlag/TargetUserLevel types come from
// webapp/lib/data/programs, which native cannot import; the minimal
// equivalents are defined locally below and kept field-compatible with the
// web shapes the normalizers produce.
import type { DraftExercise } from "@become/core";

export type TargetUserLevel =
  | "Beginner"
  | "Intermediate"
  | "Advanced"
  | "Beginner to Intermediate"
  | "Intermediate to Advanced";

export type ImportFlag = "new" | "broken" | "grouped";

export interface Exercise {
  exerciseSlug?: string;
  name: string;
  sets?: number;
  reps?: string;
  rest?: string;
  details?: string;
  importFlags?: ImportFlag[];
}

export interface Workout {
  day: string;
  title: string;
  exercises: Exercise[];
}

export interface Phase {
  phase: string;
  weeks: string;
  focus: string;
  workouts: Workout[];
}

export interface ImportedProgram {
  name: string;
  description: string;
  goal: string;
  duration_weeks: number;
  training_days_per_week: number;
  target_user: TargetUserLevel;
  phases: Phase[];
}

export interface ImportedSessionExercise {
  name: string;
  sets?: number;
  reps?: string;
  rest?: string;
  details?: string;
}

export interface ImportedSession {
  title: string;
  exercises: ImportedSessionExercise[];
}

/** A library exercise resolvable by exact (case/whitespace-insensitive) name match. */
export interface ResolvableExercise {
  slug: string;
  name: string;
  trackingType: string;
  equipment?: string[];
  laterality?: string;
  movementPatterns?: string[];
}

export interface ResolvedImportedSession {
  title: string;
  exercises: DraftExercise[];
  /** Parsed names with no exact match in `known` — surfaced so the user can add them by hand. */
  unresolved: string[];
}

const TARGET_USER_VALUES: TargetUserLevel[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Beginner to Intermediate",
  "Intermediate to Advanced",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function cleanExercise(raw: unknown): Exercise | null {
  if (!isRecord(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  return {
    name,
    sets: typeof raw.sets === "number" && isFinite(raw.sets) ? raw.sets : undefined,
    reps: typeof raw.reps === "string" && raw.reps.trim() ? raw.reps.trim() : undefined,
    rest: typeof raw.rest === "string" && raw.rest.trim() ? raw.rest.trim() : undefined,
    details: typeof raw.details === "string" && raw.details.trim() ? raw.details.trim() : undefined,
  };
}

function cleanWorkout(raw: unknown, index: number): Workout | null {
  if (!isRecord(raw)) return null;
  const exercisesRaw = Array.isArray(raw.exercises) ? raw.exercises : [];
  const exercises = exercisesRaw.map(cleanExercise).filter((e): e is Exercise => e !== null);
  if (exercises.length === 0) return null;
  return {
    day: typeof raw.day === "string" && raw.day.trim() ? raw.day.trim() : `Day ${index + 1}`,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : `Workout ${index + 1}`,
    exercises,
  };
}

function cleanPhase(raw: unknown, index: number): Phase | null {
  if (!isRecord(raw)) return null;
  const workoutsRaw = Array.isArray(raw.workouts) ? raw.workouts : [];
  const workouts = workoutsRaw
    .map((w, i) => cleanWorkout(w, i))
    .filter((w): w is Workout => w !== null);
  if (workouts.length === 0) return null;
  return {
    phase: typeof raw.phase === "string" && raw.phase.trim() ? raw.phase.trim() : `Phase ${index + 1}`,
    weeks: typeof raw.weeks === "string" && raw.weeks.trim() ? raw.weeks.trim() : "1",
    focus: typeof raw.focus === "string" && raw.focus.trim() ? raw.focus.trim() : "General",
    workouts,
  };
}

/**
 * Returns null when the AI found nothing usable (empty/illegible input, or a
 * response with no real exercises) — callers treat that as a failed import,
 * same convention as SnapPlateModal treating `items: []` as "couldn't read it".
 */
export function normalizeImportedProgram(raw: unknown): ImportedProgram | null {
  if (!isRecord(raw)) return null;
  const phasesRaw = Array.isArray(raw.phases) ? raw.phases : [];
  const phases = phasesRaw.map((p, i) => cleanPhase(p, i)).filter((p): p is Phase => p !== null);
  if (phases.length === 0) return null;

  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Imported Program";
  const daysPerWeek =
    typeof raw.training_days_per_week === "number" && raw.training_days_per_week > 0
      ? Math.round(raw.training_days_per_week)
      : phases[0]!.workouts.length;
  const weeks =
    typeof raw.duration_weeks === "number" && raw.duration_weeks > 0
      ? Math.round(raw.duration_weeks)
      : 4;
  const target_user = TARGET_USER_VALUES.includes(raw.target_user as TargetUserLevel)
    ? (raw.target_user as TargetUserLevel)
    : "Intermediate";

  return {
    name,
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    goal: typeof raw.goal === "string" && raw.goal.trim() ? raw.goal.trim() : "Follow my own program",
    duration_weeks: weeks,
    training_days_per_week: daysPerWeek,
    target_user,
    phases,
  };
}

// A leading label like "A1.", "1a)", "B2:" — the shorthand programs commonly use
// to mark exercises that alternate together (a superset/circuit), e.g.
// "A1. Bench Press" / "A2. Bent-Over Row".
const GROUP_LABEL_RE = /^\s*(?:[A-Za-z]\d{1,2}[a-z]?|\d{1,2}[a-zA-Z])\s*[.):\-]/;
const GROUP_WORD_RE = /\b(superset|circuit|tri-?set|giant\s?set)\b/i;

function looksGrouped(exercise: Exercise): boolean {
  const name = exercise.name || "";
  const details = exercise.details || "";
  return (
    GROUP_LABEL_RE.test(name) ||
    GROUP_WORD_RE.test(name) ||
    GROUP_WORD_RE.test(details)
  );
}

function looksBroken(exercise: Exercise): boolean {
  const name = (exercise.name || "").trim();
  if (name.length < 3) return true;
  return exercise.sets == null && !exercise.reps && !exercise.rest && !exercise.details;
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
          const flags: ImportFlag[] = [];
          if (!knownExerciseNames.has(exercise.name.trim().toLowerCase())) flags.push("new");
          if (looksBroken(exercise)) flags.push("broken");
          if (looksGrouped(exercise)) flags.push("grouped");
          return flags.length ? { ...exercise, importFlags: flags } : exercise;
        }),
      })),
    })),
  };
}

/**
 * Returns null when nothing usable was found — same convention as
 * normalizeImportedProgram, which this delegates all parsing/coercion to.
 */
export function normalizeImportedSession(raw: unknown): ImportedSession | null {
  const program = normalizeImportedProgram(raw);
  if (!program) return null;

  const seen = new Set<string>();
  const exercises: ImportedSessionExercise[] = [];
  for (const phase of program.phases) {
    for (const workout of phase.workouts) {
      for (const ex of workout.exercises) {
        const key = ex.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        exercises.push({ name: ex.name, sets: ex.sets, reps: ex.reps, rest: ex.rest, details: ex.details });
      }
    }
  }
  if (exercises.length === 0) return null;

  // A single pasted workout rarely states a "program name" — the AI tends to
  // invent one (see normalizeImportedProgram's "Imported Program" fallback) or
  // borrow the day's own title ("Push"). Prefer whichever of those looks
  // like it was actually stated rather than defaulted.
  const firstWorkout = program.phases[0]!.workouts[0]!;
  const title =
    firstWorkout.title !== "Workout 1" ? firstWorkout.title
      : program.name !== "Imported Program" ? program.name
        : "Imported Session";

  return { title, exercises };
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
  const exercises: DraftExercise[] = [];
  const unresolved: string[] = [];
  const usedSlugs = new Set<string>();

  for (const parsed of session.exercises) {
    const match = known.get(parsed.name.trim().toLowerCase());
    if (!match || usedSlugs.has(match.slug)) {
      unresolved.push(parsed.name);
      continue;
    }
    usedSlugs.add(match.slug);
    const isTimeBased = match.trackingType.startsWith("time");
    exercises.push({
      exerciseSlug: match.slug,
      name: match.name,
      trackingType: match.trackingType,
      sets: parsed.sets ?? 3,
      reps: parsed.reps ?? (isTimeBased ? "" : "8-12"),
      ...(parsed.rest && { rest: parsed.rest }),
      ...(match.equipment && { equipment: match.equipment }),
      ...(match.laterality && { laterality: match.laterality }),
      ...(match.movementPatterns && { movementPatterns: match.movementPatterns }),
    });
  }

  return { title: session.title, exercises, unresolved };
}
