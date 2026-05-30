import type { ProgramDetailResponse } from "@become/api-client";
import type {
  ProgramDetailViewModel,
  ProgramPhaseOutline,
} from "@/components/programs/ProgramDetail";
import type { WorkoutOverviewViewModel } from "@/components/programs/WorkoutOverview";

const TARGET_USERS: ReadonlyArray<ProgramDetailViewModel["targetUser"]> = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

function narrowTargetUser(
  value: string | undefined,
): ProgramDetailViewModel["targetUser"] {
  return TARGET_USERS.includes(value as ProgramDetailViewModel["targetUser"])
    ? (value as ProgramDetailViewModel["targetUser"])
    : undefined;
}

/**
 * Parse a phase `weeks` string ("1-4", "5", "Weeks 1–4") into a numeric
 * start/end. Falls back to 0/0 when no digits are present.
 */
export function parseWeeks(weeks: string | undefined): {
  start: number;
  end: number;
} {
  if (!weeks) return { start: 0, end: 0 };
  const range = weeks.match(/(\d+)\D+(\d+)/);
  if (range) return { start: Number(range[1]), end: Number(range[2]) };
  const single = weeks.match(/(\d+)/);
  if (single) return { start: Number(single[1]), end: Number(single[1]) };
  return { start: 0, end: 0 };
}

function phaseOutline(
  phase: ProgramDetailResponse["phases"][number],
  phaseIndex: number,
): ProgramPhaseOutline {
  const { start, end } = parseWeeks(phase.weeks);
  return {
    phaseIndex,
    name: phase.phase,
    weekStart: start,
    weekEnd: end,
    workouts: (phase.workouts ?? []).map((w, workoutIndex) => ({
      workoutIndex,
      title: w.title,
      exerciseCount: (w.exercises ?? []).length,
    })),
  };
}

/** Build the program-detail view model (header + phase outlines). */
export function toProgramDetailViewModel(
  program: ProgramDetailResponse,
): ProgramDetailViewModel {
  return {
    id: program.program_id ?? program._id ?? "",
    name: program.name,
    description: program.description ?? "",
    durationWeeks: program.duration_weeks,
    trainingDaysPerWeek: program.training_days_per_week,
    goal: program.goal,
    targetUser: narrowTargetUser(program.target_user),
    phases: (program.phases ?? []).map(phaseOutline),
  };
}

/** Slice a single phase outline; null when the index is out of range. */
export function toPhaseOutline(
  program: ProgramDetailResponse,
  phaseIndex: number,
): ProgramPhaseOutline | null {
  const phase = program.phases?.[phaseIndex];
  if (!phase) return null;
  return phaseOutline(phase, phaseIndex);
}

/** Slice a single workout overview; null when indices are out of range. */
export function toWorkoutOverview(
  program: ProgramDetailResponse,
  phaseIndex: number,
  workoutIndex: number,
): WorkoutOverviewViewModel | null {
  const workout = program.phases?.[phaseIndex]?.workouts?.[workoutIndex];
  if (!workout) return null;
  return {
    programId: program.program_id ?? program._id ?? "",
    phaseIndex,
    workoutIndex,
    title: workout.title,
    exercises: (workout.exercises ?? []).map((ex, i) => ({
      slug: ex.exerciseSlug ?? `exercise-${i}`,
      name: ex.name ?? ex.exerciseSlug ?? "Exercise",
      sets: ex.sets ?? 0,
      repsLabel: ex.reps ?? "",
    })),
  };
}
