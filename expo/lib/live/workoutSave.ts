import type { WorkoutSaveRequest } from "@become/api-client";
import type { LiveWorkoutExercise } from "@/components/live/LiveWorkoutClient";
import type { LiveGrid } from "@/components/live/LiveWorkoutClient";

export interface BuildWorkoutSaveInput {
  programId: string;
  /** 1-based phase number, matching the webapp save contract. */
  phase: number;
  /** Workout day label, e.g. "Day 1". */
  day: string;
  exercises: LiveWorkoutExercise[];
  grid: LiveGrid;
  completed: boolean;
  activeSeconds?: number;
  notes?: string;
}

/**
 * Build the POST /api/workouts payload from the live grid. Mirrors the webapp
 * live client: exercises keyed by name (+ slug), sets numbered from 1, with
 * reps/weight defaulting to 0 (server treats those as bodyweight/time-only).
 */
export function buildWorkoutSaveRequest(
  input: BuildWorkoutSaveInput,
): WorkoutSaveRequest {
  const exercises = input.exercises.map((ex) => {
    const sets = (input.grid[ex.slug] ?? []).map((s, i) => {
      const set: {
        setNumber: number;
        reps: number;
        weight: number;
        completed: boolean;
        duration?: number;
        distance?: number;
      } = {
        setNumber: i + 1,
        reps: s.reps ?? 0,
        weight: s.weight ?? 0,
        completed: s.completed,
      };
      // Time/distance tracking types log these instead of (or alongside)
      // reps/weight — only attach when present so strength sets stay clean.
      if (s.durationSec != null) set.duration = s.durationSec;
      if (s.distance != null) set.distance = s.distance;
      return set;
    });
    return {
      name: ex.name,
      exerciseSlug: ex.slug,
      sets,
    };
  });

  const req: WorkoutSaveRequest = {
    programId: input.programId,
    phase: input.phase,
    day: input.day,
    exercises,
    completed: input.completed,
  };
  if (input.activeSeconds !== undefined) req.activeSeconds = input.activeSeconds;
  if (input.completed) {
    req.duration = Math.max(
      1,
      Math.round((input.activeSeconds ?? 0) / 60) || 1,
    );
  }
  if (input.notes !== undefined) req.notes = input.notes;
  return req;
}
