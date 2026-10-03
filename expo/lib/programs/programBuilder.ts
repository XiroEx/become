/**
 * ─── THE PROGRAM BUILDER, AS STATE (NP-168, exercise rows NP-171) ───────────
 *
 * Native counterpart of the frame inside
 * `webapp/app/dashboard/admin/programs/_editors/ProgramCreator.tsx` (plus
 * `PhaseEditor.tsx` and the rows in `WorkoutEditor.tsx` + `ExerciseEditor.tsx`),
 * which members reach through `/dashboard/programs/new` and
 * `/dashboard/programs/[programId]/edit`.
 *
 * EVERYTHING HERE IS PURE. The screen renders it, the draft serialises it and
 * the routes post it; none of that logic lives in a component, because the
 * three rules this card has to keep are rules about DATA:
 *
 *   1. SEND ONLY SCHEMA FIELDS. `POST /api/programs/custom` runs the body
 *      through `pickCustomProgramFields` and then `createStrict`
 *      (`webapp/lib/strictCreate.ts`), which THROWS on a top-level key that is
 *      not a Program schema path. So `toCustomProgramPayload` emits exactly
 *      `CUSTOM_PROGRAM_INPUT_FIELDS` and nothing else — no `program_id`, no
 *      `isCustom`, no `createdBy`, no builder bookkeeping.
 *   2. A DAY LABEL IS AN ADDRESS. Schedules (`models/Schedule.ts`) and workout
 *      logs key on `day` ("Day 1"), and `/api/programs/current-workout` looks
 *      a session up by it. Two workouts in one phase with the same label are
 *      the same session to every reader, so the builder mints unique labels
 *      and `duplicateDayLabels` refuses a save that would create a collision.
 *   3. WHAT THE WEB EDITOR READS, THE PHONE WRITES. `ProgramCreator` computes
 *      `phase.weeks.trim()`, `phase.focus.trim()` and `workout.title.trim()`
 *      DURING RENDER, so a phase saved without `focus` is not a cosmetic gap:
 *      it is a TypeError the moment a member opens that program on the web.
 *      Every phase therefore carries `weeks` and `focus` as strings, every
 *      workout `day`, `title` and an `exercises` array, even when empty.
 *
 * Exercise ROWS are NP-171 and drag-reorder is NP-172: exercises ride through
 * `toCustomProgramPayload` field-for-field (a `BuilderExercise` is the
 * prescription the web editor writes), so editing a program built on the web
 * never drops the prescription inside it.
 */

/**
 * The five `target_user` values the web builder offers
 * (`TARGET_USER_OPTIONS` in `ProgramCreator.tsx`). Display copy, not ids —
 * `__tests__/programBuilderNP168.test.tsx` reads the web list and fails if
 * these two ever drift.
 */
export const BUILDER_TARGET_USER_OPTIONS = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Beginner to Intermediate",
  "Intermediate to Advanced",
] as const;

export type BuilderTargetUser = (typeof BUILDER_TARGET_USER_OPTIONS)[number];

/** The web builder's own defaults, so a blank program is the same program. */
export const DEFAULT_TARGET_USER: BuilderTargetUser = "Intermediate";
export const DEFAULT_DURATION_WEEKS = 4;
export const DEFAULT_TRAINING_DAYS_PER_WEEK = 4;
/** One phase, four sessions — what `ProgramCreator` starts a member with. */
export const MAX_TRAINING_DAYS_PER_WEEK = 7;
export const MAX_DURATION_WEEKS = 52;

/**
 * One exercise row: the prescription the web editor writes
 * (`webapp/models/Program.ts` `IProgramExercise`), as the phone edits it.
 *
 * `exerciseSlug` is the link — the catalogue key hydration, PRs and demos
 * resolve through — so a row without one cannot be saved. `name` rides along
 * as the display copy (and as the dehydrate fallback the server reads when no
 * slug resolves). Grouping fields (`groupId`, `groupType`, …) ride through
 * untouched: drag reorder and grouping are NP-172.
 */
export interface BuilderExercise {
  exerciseSlug?: string;
  name?: string;
  category?: string;
  sets?: number;
  reps?: string;
  rest?: string;
  tempo?: string;
  rpe?: number;
  percentOf1RM?: number;
  duration?: string;
  role?: "compound" | "secondary" | "accessory";
  details?: string;
  groupId?: string;
  groupType?: "superset" | "circuit" | "triset" | "giant_set" | "emom" | "amrap";
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
  [key: string]: unknown;
}

/** The prescription fields the rows edit (everything but identity/grouping). */
export const BUILDER_EXERCISE_PRESCRIPTION_FIELDS = [
  "sets",
  "reps",
  "rest",
  "tempo",
  "rpe",
  "percentOf1RM",
  "duration",
  "role",
  "details",
] as const;

export type BuilderExercisePrescriptionField =
  (typeof BUILDER_EXERCISE_PRESCRIPTION_FIELDS)[number];

/** RPE is 1–10 and percent of 1RM 0–100, as `webapp/models/Program.ts` enforces. */
export const BUILDER_RPE_MIN = 1;
export const BUILDER_RPE_MAX = 10;
export const BUILDER_PERCENT_1RM_MIN = 0;
export const BUILDER_PERCENT_1RM_MAX = 100;

export const BUILDER_EXERCISE_ROLES = [
  "compound",
  "secondary",
  "accessory",
] as const;

export type BuilderExerciseRole = (typeof BUILDER_EXERCISE_ROLES)[number];

/** A blank row for a picked catalogue/custom exercise: slug saved, name shown. */
export function createBuilderExercise(
  exerciseSlug: string,
  name?: string,
): BuilderExercise {
  return {
    exerciseSlug,
    ...(name !== undefined && name !== "" ? { name } : {}),
    sets: 3,
    reps: "10",
    rest: "60s",
  };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asOptionalRole(value: unknown): BuilderExerciseRole | undefined {
  return value === "compound" || value === "secondary" || value === "accessory"
    ? value
    : undefined;
}

function asOptionalGroupType(
  value: unknown,
): BuilderExercise["groupType"] | undefined {
  return value === "superset" ||
    value === "circuit" ||
    value === "triset" ||
    value === "giant_set" ||
    value === "emom" ||
    value === "amrap"
    ? value
    : undefined;
}

/**
 * A server/hydrated/draft exercise read into a row. Unknown shapes stay rows
 * (an edit must never drop a prescription it cannot render); grouping rides
 * through untouched for NP-172.
 */
export function toBuilderExercise(raw: unknown): BuilderExercise {
  if (!raw || typeof raw !== "object") return { exerciseSlug: "" };
  const source = raw as Record<string, unknown>;
  const row: BuilderExercise = {};
  const slug = asOptionalString(source.exerciseSlug);
  if (slug !== undefined) row.exerciseSlug = slug;
  const name = asOptionalString(source.name);
  if (name !== undefined) row.name = name;
  const category = asOptionalString(source.category ?? source.type);
  if (category !== undefined) row.category = category;
  const sets = asOptionalNumber(source.sets);
  if (sets !== undefined) row.sets = sets;
  const reps = asOptionalString(source.reps);
  if (reps !== undefined) row.reps = reps;
  const rest = asOptionalString(source.rest);
  if (rest !== undefined) row.rest = rest;
  const tempo = asOptionalString(source.tempo);
  if (tempo !== undefined) row.tempo = tempo;
  const rpe = asOptionalNumber(source.rpe);
  if (rpe !== undefined) row.rpe = rpe;
  const percentOf1RM = asOptionalNumber(source.percentOf1RM);
  if (percentOf1RM !== undefined) row.percentOf1RM = percentOf1RM;
  const duration = asOptionalString(source.duration);
  if (duration !== undefined) row.duration = duration;
  const role = asOptionalRole(source.role);
  if (role !== undefined) row.role = role;
  const details = asOptionalString(source.details);
  if (details !== undefined) row.details = details;
  const groupId = asOptionalString(source.groupId);
  if (groupId !== undefined) row.groupId = groupId;
  const groupType = asOptionalGroupType(source.groupType);
  if (groupType !== undefined) row.groupType = groupType;
  const groupLabel = asOptionalString(source.groupLabel);
  if (groupLabel !== undefined) row.groupLabel = groupLabel;
  const groupRest = asOptionalString(source.groupRest);
  if (groupRest !== undefined) row.groupRest = groupRest;
  const groupRounds = asOptionalNumber(source.groupRounds);
  if (groupRounds !== undefined) row.groupRounds = groupRounds;
  // Anything else the server sent (hydrated video fields, `type`, `tip`)
  // rides through so a save never drops what the phone cannot edit.
  for (const [key, value] of Object.entries(source)) {
    if (!(key in row)) row[key] = value;
  }
  return row;
}

/** Display name for a row: the coach's wording, else the slug read as words. */
export function builderExerciseName(exercise: BuilderExercise): string {
  const name = (exercise.name ?? "").trim();
  if (name) return name;
  const slug = (exercise.exerciseSlug ?? "").trim();
  if (!slug) return "New exercise";
  return slug
    .replace(/^__protocol__/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Why this row cannot be saved yet, if anything. A row without an
 * `exerciseSlug` is a typed name hydration, PRs and demos cannot resolve, so
 * it blocks the save; RPE outside 1–10 and percent of 1RM outside 0–100 are
 * refused before saving, as the model enforces.
 */
export function validateBuilderExercise(
  exercise: BuilderExercise,
): string | null {
  if (!exercise.exerciseSlug || !exercise.exerciseSlug.trim()) {
    return "Pick an exercise from the catalogue or your custom exercises.";
  }
  if (exercise.rpe !== undefined && exercise.rpe !== null) {
    const rpe = exercise.rpe;
    if (
      typeof rpe !== "number" ||
      !Number.isFinite(rpe) ||
      rpe < BUILDER_RPE_MIN ||
      rpe > BUILDER_RPE_MAX
    ) {
      return `RPE must be between ${BUILDER_RPE_MIN} and ${BUILDER_RPE_MAX}.`;
    }
  }
  if (exercise.percentOf1RM !== undefined && exercise.percentOf1RM !== null) {
    const percent = exercise.percentOf1RM;
    if (
      typeof percent !== "number" ||
      !Number.isFinite(percent) ||
      percent < BUILDER_PERCENT_1RM_MIN ||
      percent > BUILDER_PERCENT_1RM_MAX
    ) {
      return `Percent of 1RM must be between ${BUILDER_PERCENT_1RM_MIN} and ${BUILDER_PERCENT_1RM_MAX}.`;
    }
  }
  return null;
}

/** Parse an RPE field: empty clears it, anything else must land in 1–10. */
export function parseBuilderRpe(text: string): {
  value?: number;
  error?: string;
} {
  const trimmed = text.trim();
  if (trimmed === "") return {};
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { error: `RPE must be between ${BUILDER_RPE_MIN} and ${BUILDER_RPE_MAX}.` };
  }
  if (parsed < BUILDER_RPE_MIN || parsed > BUILDER_RPE_MAX) {
    return { error: `RPE must be between ${BUILDER_RPE_MIN} and ${BUILDER_RPE_MAX}.` };
  }
  return { value: parsed };
}

/** Parse a percent-of-1RM field: empty clears it, anything else 0–100. */
export function parseBuilderPercentOf1RM(text: string): {
  value?: number;
  error?: string;
} {
  const trimmed = text.trim();
  if (trimmed === "") return {};
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return {
      error: `Percent of 1RM must be between ${BUILDER_PERCENT_1RM_MIN} and ${BUILDER_PERCENT_1RM_MAX}.`,
    };
  }
  if (parsed < BUILDER_PERCENT_1RM_MIN || parsed > BUILDER_PERCENT_1RM_MAX) {
    return {
      error: `Percent of 1RM must be between ${BUILDER_PERCENT_1RM_MIN} and ${BUILDER_PERCENT_1RM_MAX}.`,
    };
  }
  return { value: parsed };
}

/** Parse a sets field: empty clears it, the rest must be a finite number. */
export function parseBuilderSets(text: string): {
  value?: number;
  error?: string;
} {
  const trimmed = text.trim();
  if (trimmed === "") return {};
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { error: "Sets must be a number." };
  }
  return { value: parsed };
}

export interface BuilderWorkout {
  /** The address (rule 2). Unique within its phase. */
  day: string;
  title: string;
  exercises: BuilderExercise[];
}

export interface BuilderPhase {
  /** "Phase 1" — renumbered on add/remove, exactly as the web does. */
  phase: string;
  /** Free text: "1-4". Always a string (rule 3). */
  weeks: string;
  /** Free text: "Build a base". Always a string (rule 3). */
  focus: string;
  workouts: BuilderWorkout[];
}

export interface ProgramBuilderState {
  name: string;
  description: string;
  goal: string;
  duration_weeks: number;
  training_days_per_week: number;
  target_user: string;
  /**
   * Not edited natively in this card. Carried so an edit of a program built on
   * the web cannot silently blank what the web picker set.
   */
  equipment: string[];
  /** Same: carried through, never edited here. */
  tags: string[];
  phases: BuilderPhase[];
}

/** `Phase 1`, `Phase 2`, … from a zero-based index. */
export function phaseLabel(index: number): string {
  return `Phase ${index + 1}`;
}

/** `Day 1`, `Day 2`, … from a one-based number. */
export function dayLabel(dayNumber: number): string {
  return `Day ${dayNumber}`;
}

/**
 * The first `Day N` this phase is not already using. Rule 2: a label is an
 * address, so adding a session after deleting Day 2 gives back Day 2 rather
 * than a second Day 3.
 */
export function nextDayLabel(workouts: readonly BuilderWorkout[]): string {
  const taken = new Set(workouts.map((w) => w.day.trim().toLowerCase()));
  for (let n = 1; n <= 366; n += 1) {
    const candidate = dayLabel(n);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return dayLabel(workouts.length + 1);
}

export function createEmptyWorkout(dayNumber: number): BuilderWorkout {
  return { day: dayLabel(dayNumber), title: "", exercises: [] };
}

export function createEmptyPhase(
  index: number,
  daysPerWeek: number,
): BuilderPhase {
  const days = clampTrainingDays(daysPerWeek);
  return {
    phase: phaseLabel(index),
    weeks: "",
    focus: "",
    workouts: Array.from({ length: days }, (_, i) => createEmptyWorkout(i + 1)),
  };
}

export function clampTrainingDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_TRAINING_DAYS_PER_WEEK;
  return Math.min(MAX_TRAINING_DAYS_PER_WEEK, Math.max(1, Math.round(days)));
}

export function clampDurationWeeks(weeks: number): number {
  if (!Number.isFinite(weeks)) return DEFAULT_DURATION_WEEKS;
  return Math.min(MAX_DURATION_WEEKS, Math.max(1, Math.round(weeks)));
}

/** A blank program: the web builder's defaults, one phase, four sessions. */
export function emptyProgramBuilderState(
  overrides: Partial<ProgramBuilderState> = {},
): ProgramBuilderState {
  const days = clampTrainingDays(
    overrides.training_days_per_week ?? DEFAULT_TRAINING_DAYS_PER_WEEK,
  );
  return {
    name: "",
    description: "",
    goal: "",
    duration_weeks: clampDurationWeeks(
      overrides.duration_weeks ?? DEFAULT_DURATION_WEEKS,
    ),
    training_days_per_week: days,
    target_user: DEFAULT_TARGET_USER,
    equipment: [],
    tags: [],
    phases: [createEmptyPhase(0, days)],
    ...overrides,
  };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * A program off the wire (`GET /api/programs/custom/[programId]`, hydrated)
 * read into builder state. Missing labels are MINTED rather than left blank,
 * because rule 2 means a nameless session is an unreachable one.
 */
export function fromCustomProgram(raw: unknown): ProgramBuilderState {
  if (!raw || typeof raw !== "object") return emptyProgramBuilderState();
  const source = raw as Record<string, unknown>;

  const phasesRaw = Array.isArray(source.phases) ? source.phases : [];
  const phases: BuilderPhase[] = phasesRaw.map((p, phaseIndex) => {
    const phase = (p ?? {}) as Record<string, unknown>;
    const workoutsRaw = Array.isArray(phase.workouts) ? phase.workouts : [];
    const workouts: BuilderWorkout[] = workoutsRaw.map((w, workoutIndex) => {
      const workout = (w ?? {}) as Record<string, unknown>;
      const day = asString(workout.day).trim();
      return {
        day: day || dayLabel(workoutIndex + 1),
        title: asString(workout.title),
        exercises: Array.isArray(workout.exercises)
          ? (workout.exercises as unknown[]).map(toBuilderExercise)
          : [],
      };
    });
    const label = asString(phase.phase).trim();
    return {
      phase: label || phaseLabel(phaseIndex),
      weeks: asString(phase.weeks),
      focus: asString(phase.focus),
      workouts,
    };
  });

  const trainingDays =
    typeof source.training_days_per_week === "number"
      ? clampTrainingDays(source.training_days_per_week)
      : clampTrainingDays(phases[0]?.workouts.length ?? DEFAULT_TRAINING_DAYS_PER_WEEK);

  return {
    name: asString(source.name),
    description: asString(source.description),
    goal: asString(source.goal),
    duration_weeks:
      typeof source.duration_weeks === "number"
        ? clampDurationWeeks(source.duration_weeks)
        : DEFAULT_DURATION_WEEKS,
    training_days_per_week: trainingDays,
    target_user: asString(source.target_user, DEFAULT_TARGET_USER) || DEFAULT_TARGET_USER,
    equipment: asStringArray(source.equipment),
    tags: asStringArray(source.tags),
    phases: phases.length > 0 ? phases : [createEmptyPhase(0, trainingDays)],
  };
}

/** Is a draft worth restoring / worth writing at all? */
export function hasBuilderContent(state: ProgramBuilderState): boolean {
  if (state.name.trim() || state.description.trim() || state.goal.trim()) {
    return true;
  }
  return state.phases.some(
    (phase) =>
      phase.weeks.trim() !== "" ||
      phase.focus.trim() !== "" ||
      phase.workouts.some(
        (w) => w.title.trim() !== "" || w.exercises.length > 0,
      ),
  );
}

// ─── Phase and workout edits ────────────────────────────────────────────────
// Every one of these returns a NEW state. They are what the screen's handlers
// call, so the invariants (labels renumbered, at least one phase, at least one
// workout, unique day labels) hold in one place rather than per button.

/** Renumber `Phase N` after an add or a remove, as `ProgramCreator` does. */
function renumberPhases(phases: readonly BuilderPhase[]): BuilderPhase[] {
  return phases.map((phase, index) => ({ ...phase, phase: phaseLabel(index) }));
}

export function addPhase(state: ProgramBuilderState): ProgramBuilderState {
  return {
    ...state,
    phases: renumberPhases([
      ...state.phases,
      createEmptyPhase(state.phases.length, state.training_days_per_week),
    ]),
  };
}

/** A program with no phases has nothing to follow, so the last one stays. */
export function removePhase(
  state: ProgramBuilderState,
  phaseIndex: number,
): ProgramBuilderState {
  if (state.phases.length <= 1) return state;
  if (phaseIndex < 0 || phaseIndex >= state.phases.length) return state;
  return {
    ...state,
    phases: renumberPhases(state.phases.filter((_, i) => i !== phaseIndex)),
  };
}

export function updatePhase(
  state: ProgramBuilderState,
  phaseIndex: number,
  patch: Partial<Pick<BuilderPhase, "weeks" | "focus">>,
): ProgramBuilderState {
  if (phaseIndex < 0 || phaseIndex >= state.phases.length) return state;
  return {
    ...state,
    phases: state.phases.map((phase, i) =>
      i === phaseIndex ? { ...phase, ...patch } : phase,
    ),
  };
}

export function addWorkout(
  state: ProgramBuilderState,
  phaseIndex: number,
): ProgramBuilderState {
  const phase = state.phases[phaseIndex];
  if (!phase) return state;
  const workout: BuilderWorkout = {
    day: nextDayLabel(phase.workouts),
    title: "",
    exercises: [],
  };
  return {
    ...state,
    phases: state.phases.map((p, i) =>
      i === phaseIndex ? { ...p, workouts: [...p.workouts, workout] } : p,
    ),
  };
}

/** A phase with no sessions is a phase nothing can be scheduled in. */
export function removeWorkout(
  state: ProgramBuilderState,
  phaseIndex: number,
  workoutIndex: number,
): ProgramBuilderState {
  const phase = state.phases[phaseIndex];
  if (!phase || phase.workouts.length <= 1) return state;
  if (workoutIndex < 0 || workoutIndex >= phase.workouts.length) return state;
  return {
    ...state,
    phases: state.phases.map((p, i) =>
      i === phaseIndex
        ? { ...p, workouts: p.workouts.filter((_, j) => j !== workoutIndex) }
        : p,
    ),
  };
}

export function updateWorkout(
  state: ProgramBuilderState,
  phaseIndex: number,
  workoutIndex: number,
  patch: Partial<Pick<BuilderWorkout, "day" | "title">>,
): ProgramBuilderState {
  const phase = state.phases[phaseIndex];
  if (!phase || !phase.workouts[workoutIndex]) return state;
  return {
    ...state,
    phases: state.phases.map((p, i) =>
      i === phaseIndex
        ? {
            ...p,
            workouts: p.workouts.map((w, j) =>
              j === workoutIndex ? { ...w, ...patch } : w,
            ),
          }
        : p,
    ),
  };
}

/** A session nobody has put anything in yet. */
export function isEmptyWorkout(workout: BuilderWorkout): boolean {
  return workout.title.trim() === "" && workout.exercises.length === 0;
}

/**
 * Change the sessions-per-week and resize every phase to match — the web's
 * `handleTrainingDaysChange`, with two deliberate differences:
 *
 *   • new sessions get the next FREE label (rule 2) rather than
 *     `Day ${index + 1}`, which collides with a label the member renamed;
 *   • SHRINKING only drops trailing sessions that are still BLANK. The web
 *     slices unconditionally, which is survivable behind a `<select>` and a
 *     mouse; on a stepper that a thumb can hit twice it would delete a
 *     session's prescription with no confirm and no undo. A session with
 *     anything in it is removed with its own Remove button, which asks.
 */
export function withTrainingDays(
  state: ProgramBuilderState,
  days: number,
): ProgramBuilderState {
  const target = clampTrainingDays(days);
  return {
    ...state,
    training_days_per_week: target,
    phases: state.phases.map((phase) => {
      if (phase.workouts.length === target) return phase;
      if (phase.workouts.length > target) {
        const workouts = [...phase.workouts];
        while (
          workouts.length > target &&
          workouts.length > 1 &&
          isEmptyWorkout(workouts[workouts.length - 1] as BuilderWorkout)
        ) {
          workouts.pop();
        }
        return { ...phase, workouts };
      }
      const workouts = [...phase.workouts];
      while (workouts.length < target) {
        workouts.push({
          day: nextDayLabel(workouts),
          title: "",
          exercises: [],
        });
      }
      return { ...phase, workouts };
    }),
  };
}

// ─── Exercise-row edits (NP-171) ────────────────────────────────────────────
// Every one of these returns a NEW state, like the phase/workout edits above.
// Drag reorder and grouping are NP-172: rows are only added, edited and
// removed here, never reordered.

/** Append a picked catalogue/custom exercise to a workout. Slug saved, name shown. */
export function addBuilderExercise(
  state: ProgramBuilderState,
  phaseIndex: number,
  workoutIndex: number,
  exerciseSlug: string,
  name?: string,
): ProgramBuilderState {
  const phase = state.phases[phaseIndex];
  if (!phase || !phase.workouts[workoutIndex]) return state;
  const slug = exerciseSlug.trim();
  if (!slug) return state;
  return {
    ...state,
    phases: state.phases.map((p, i) =>
      i === phaseIndex
        ? {
            ...p,
            workouts: p.workouts.map((w, j) =>
              j === workoutIndex
                ? {
                    ...w,
                    exercises: [
                      ...w.exercises,
                      createBuilderExercise(slug, name),
                    ],
                  }
                : w,
            ),
          }
        : p,
    ),
  };
}

/** Patch one row's prescription fields. */
export function updateBuilderExercise(
  state: ProgramBuilderState,
  phaseIndex: number,
  workoutIndex: number,
  exerciseIndex: number,
  patch: Partial<BuilderExercise>,
): ProgramBuilderState {
  const phase = state.phases[phaseIndex];
  const workout = phase?.workouts[workoutIndex];
  if (!phase || !workout || !workout.exercises[exerciseIndex]) return state;
  return {
    ...state,
    phases: state.phases.map((p, i) =>
      i === phaseIndex
        ? {
            ...p,
            workouts: p.workouts.map((w, j) =>
              j === workoutIndex
                ? {
                    ...w,
                    exercises: w.exercises.map((exercise, k) =>
                      k === exerciseIndex ? { ...exercise, ...patch } : exercise,
                    ),
                  }
                : w,
            ),
          }
        : p,
    ),
  };
}

/**
 * Remove one row. The last row of a workout stays removable — an empty session
 * is what the web editor saves when every row is deleted, and a row the
 * member cannot remove is a row they are stuck with.
 */
export function removeBuilderExercise(
  state: ProgramBuilderState,
  phaseIndex: number,
  workoutIndex: number,
  exerciseIndex: number,
): ProgramBuilderState {
  const phase = state.phases[phaseIndex];
  const workout = phase?.workouts[workoutIndex];
  if (!phase || !workout) return state;
  if (exerciseIndex < 0 || exerciseIndex >= workout.exercises.length) {
    return state;
  }
  return {
    ...state,
    phases: state.phases.map((p, i) =>
      i === phaseIndex
        ? {
            ...p,
            workouts: p.workouts.map((w, j) =>
              j === workoutIndex
                ? {
                    ...w,
                    exercises: w.exercises.filter((_, k) => k !== exerciseIndex),
                  }
                : w,
            ),
          }
        : p,
    ),
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface BuilderValidation {
  /** Step 1 is answerable: the route can let the member move on. */
  detailsComplete: boolean;
  /** Step 2 is answerable: every phase and session carries what it must. */
  phasesComplete: boolean;
  /** Member-facing lines, in the order they should be read. */
  errors: string[];
  /** phase index → the labels used more than once in it. */
  duplicateDays: Record<number, string[]>;
  /** May this be sent to the server at all? */
  canSave: boolean;
}

/** The labels this phase uses more than once, lower-cased for comparison. */
export function duplicateDayLabels(phase: BuilderPhase): string[] {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const workout of phase.workouts) {
    const key = workout.day.trim().toLowerCase();
    if (key === "") continue;
    if (seen.has(key)) {
      const label = seen.get(key) as string;
      if (!dupes.includes(label)) dupes.push(label);
    } else {
      seen.set(key, workout.day.trim());
    }
  }
  return dupes;
}

/**
 * What the builder will and will not send.
 *
 * It asks for exactly what the WEB builder asks for — a name, a goal, a
 * duration, weeks and a focus per phase, a title per session, and per exercise
 * a picked catalogue/custom row (`workout.exercises.every((ex) =>
 * ex.name.trim() !== "")` in `ProgramCreator`) — because a program that fails
 * the web's own step validation is a program a member cannot then finish
 * there. Out-of-range RPE (1–10) and percent of 1RM (0–100) refuse the save
 * before it, as `webapp/models/Program.ts` enforces.
 */
export function validateProgram(state: ProgramBuilderState): BuilderValidation {
  const errors: string[] = [];
  const duplicateDays: Record<number, string[]> = {};

  if (state.name.trim() === "") errors.push("Give your program a name.");
  if (state.goal.trim() === "") errors.push("Say what the goal is.");
  const detailsComplete =
    state.name.trim() !== "" &&
    state.goal.trim() !== "" &&
    state.duration_weeks > 0 &&
    state.training_days_per_week > 0;

  let phasesComplete = state.phases.length > 0;
  state.phases.forEach((phase, index) => {
    const label = phase.phase || phaseLabel(index);
    if (phase.weeks.trim() === "") {
      errors.push(`${label}: set which weeks it covers.`);
      phasesComplete = false;
    }
    if (phase.focus.trim() === "") {
      errors.push(`${label}: set its focus.`);
      phasesComplete = false;
    }
    if (phase.workouts.length === 0) {
      errors.push(`${label}: add at least one workout.`);
      phasesComplete = false;
    }
    phase.workouts.forEach((workout, workoutIndex) => {
      if (workout.day.trim() === "") {
        errors.push(
          `${label}, workout ${workoutIndex + 1}: give the day a label.`,
        );
        phasesComplete = false;
      }
      if (workout.title.trim() === "") {
        errors.push(
          `${label}, ${workout.day.trim() || `workout ${workoutIndex + 1}`}: give it a title.`,
        );
        phasesComplete = false;
      }
      workout.exercises.forEach((exercise) => {
        const problem = validateBuilderExercise(exercise);
        if (problem) {
          errors.push(
            `${label}, ${workout.day.trim() || `workout ${workoutIndex + 1}`}, ${builderExerciseName(exercise)}: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`,
          );
          phasesComplete = false;
        }
      });
    });
    const dupes = duplicateDayLabels(phase);
    if (dupes.length > 0) {
      duplicateDays[index] = dupes;
      phasesComplete = false;
      for (const dupe of dupes) {
        errors.push(
          `${label}: “${dupe}” is used twice. Day labels are what your schedule and your logs are keyed on, so each one has to be unique in a phase.`,
        );
      }
    }
  });

  return {
    detailsComplete,
    phasesComplete,
    errors,
    duplicateDays,
    canSave: detailsComplete && phasesComplete,
  };
}

// ─── The payload ────────────────────────────────────────────────────────────

/**
 * The ONLY keys that leave the phone, mirroring `CUSTOM_PROGRAM_INPUT_FIELDS`
 * in `webapp/lib/programFields.ts`. `createStrict` throws on anything that is
 * not a schema path, so this list is checked against the web's in
 * `__tests__/programBuilderNP168.test.tsx` rather than trusted.
 */
export const BUILDER_PAYLOAD_FIELDS = [
  "name",
  "description",
  "duration_weeks",
  "training_days_per_week",
  "goal",
  "target_user",
  "equipment",
  "tags",
  "phases",
] as const;

export interface BuilderPayloadWorkout {
  day: string;
  title: string;
  exercises: BuilderExercise[];
}

export interface BuilderPayloadPhase {
  phase: string;
  weeks: string;
  focus: string;
  workouts: BuilderPayloadWorkout[];
}

/**
 * The request body itself, typed here rather than taken from
 * `CustomProgramInput` for one reason: the wire schema types an exercise as the
 * HYDRATED shape, and the builder types the row as the phone edits it. The
 * body is still checked against `CustomProgramInputSchema` — in the test, by
 * parsing a real payload, which is a stronger statement than a type alias.
 */
export interface CustomProgramBuilderPayload {
  name: string;
  description: string;
  duration_weeks: number;
  training_days_per_week: number;
  goal: string;
  target_user: string;
  equipment: string[];
  tags?: string[];
  phases: BuilderPayloadPhase[];
}

/**
 * Builder state as the body of `POST /api/programs/custom` or
 * `PUT /api/programs/custom/[programId]`.
 *
 * Strings are trimmed; `weeks`, `focus`, `day`, `title` and `exercises` are
 * ALWAYS present (rule 3 — the web editor calls `.trim()` on them during
 * render). Each row is written field-for-field — `exerciseSlug` first, so
 * hydration, PRs and demos resolve — with grouping riding through untouched
 * for NP-172. `tags` rides along only when the program actually has some, so
 * a native save never writes an empty array over a list the phone cannot edit.
 */
export function toCustomProgramPayload(
  state: ProgramBuilderState,
): CustomProgramBuilderPayload {
  const payload: CustomProgramBuilderPayload = {
    name: state.name.trim(),
    description: state.description.trim(),
    duration_weeks: clampDurationWeeks(state.duration_weeks),
    training_days_per_week: clampTrainingDays(state.training_days_per_week),
    goal: state.goal.trim(),
    target_user: state.target_user.trim() || DEFAULT_TARGET_USER,
    equipment: [...state.equipment],
    phases: state.phases.map((phase, phaseIndex) => ({
      phase: phase.phase.trim() || phaseLabel(phaseIndex),
      weeks: phase.weeks.trim(),
      focus: phase.focus.trim(),
      workouts: phase.workouts.map((workout, workoutIndex) => ({
        day: workout.day.trim() || dayLabel(workoutIndex + 1),
        title: workout.title.trim(),
        exercises: workout.exercises.map(toPayloadExercise),
      })),
    })),
  };
  if (state.tags.length > 0) payload.tags = [...state.tags];
  return payload;
}

/**
 * One row as the server stores it (`dehydrateProgram` in
 * `webapp/lib/hydrateExercises.ts` reads exactly these keys): the slug link,
 * the display name, the prescription, the coach notes and the grouping. Empty
 * strings and undefined clear a field rather than persisting a blank; hydrated
 * extras the phone cannot edit (`videoUrl`, `type`, `tip`) never leave it.
 */
function toPayloadExercise(exercise: BuilderExercise): BuilderExercise {
  const row: BuilderExercise = {};
  const slug = (exercise.exerciseSlug ?? "").trim();
  if (slug) row.exerciseSlug = slug;
  const name = (exercise.name ?? "").trim();
  if (name) row.name = name;
  const category = (exercise.category ?? "").trim();
  if (category) row.category = category;
  if (exercise.sets !== undefined) row.sets = exercise.sets;
  const reps = (exercise.reps ?? "").trim();
  if (reps) row.reps = reps;
  const rest = (exercise.rest ?? "").trim();
  if (rest) row.rest = rest;
  const tempo = (exercise.tempo ?? "").trim();
  if (tempo) row.tempo = tempo;
  if (exercise.rpe !== undefined) row.rpe = exercise.rpe;
  if (exercise.percentOf1RM !== undefined) row.percentOf1RM = exercise.percentOf1RM;
  const duration = (exercise.duration ?? "").trim();
  if (duration) row.duration = duration;
  if (exercise.role !== undefined) row.role = exercise.role;
  const details = (exercise.details ?? "").trim();
  if (details) row.details = details;
  if (exercise.groupId !== undefined) row.groupId = exercise.groupId;
  if (exercise.groupType !== undefined) row.groupType = exercise.groupType;
  if (exercise.groupLabel !== undefined) row.groupLabel = exercise.groupLabel;
  if (exercise.groupRest !== undefined) row.groupRest = exercise.groupRest;
  if (exercise.groupRounds !== undefined) row.groupRounds = exercise.groupRounds;
  return row;
}

/** How many sessions this program describes, across every phase. */
export function totalWorkouts(state: ProgramBuilderState): number {
  return state.phases.reduce((sum, phase) => sum + phase.workouts.length, 0);
}
