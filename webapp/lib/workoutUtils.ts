// Shared workout exercise grouping and flow utilities

export interface WorkoutExercise {
  exerciseSlug?: string;
  name: string;
  type?: string;
  sets?: number;
  reps?: string;
  rest?: string;
  details?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  groupId?: string;
  groupType?: string;
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
}

export interface ExerciseGroup {
  groupId: string | null;
  groupType?: string;
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
  exercises: { exercise: WorkoutExercise; originalIndex: number }[];
}

/**
 * Group consecutive exercises that share the same groupId.
 * Ungrouped exercises each get their own single-exercise group.
 */
export function groupExercises(exercises: WorkoutExercise[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  let i = 0;

  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.groupId) {
      const group: ExerciseGroup = {
        groupId: ex.groupId,
        groupType: ex.groupType,
        groupLabel: ex.groupLabel,
        groupRest: ex.groupRest,
        groupRounds: ex.groupRounds,
        exercises: [],
      };
      while (i < exercises.length && exercises[i].groupId === ex.groupId) {
        group.exercises.push({ exercise: exercises[i], originalIndex: i });
        i++;
      }
      groups.push(group);
    } else {
      groups.push({
        groupId: null,
        exercises: [{ exercise: ex, originalIndex: i }],
      });
      i++;
    }
  }
  return groups;
}

/**
 * A single step in the live workout flow.
 */
export interface WorkoutStep {
  exerciseIndex: number;   // index into the flat exercises array
  setIndex: number;        // which set (0-based)
  groupId: string | null;  // null for ungrouped
  isLastInRound: boolean;  // true if last exercise in a superset round
  isFirstInRound: boolean; // true if first exercise in a superset round
  roundNumber: number;     // which round (0-based)
}

/**
 * Build a step-based flow for the live workout.
 * - Ungrouped exercises: sequential steps through all sets
 * - Grouped exercises (supersets/circuits): interleaved
 *   A-set1 → B-set1 → A-set2 → B-set2 → ...
 */
export function buildWorkoutFlow(exercises: WorkoutExercise[]): WorkoutStep[] {
  const groups = groupExercises(exercises);
  const steps: WorkoutStep[] = [];

  for (const group of groups) {
    if (group.groupId === null || group.exercises.length <= 1) {
      // Ungrouped: sequential sets
      const { exercise, originalIndex } = group.exercises[0];
      const numSets = exercise.sets || 3;
      for (let s = 0; s < numSets; s++) {
        steps.push({
          exerciseIndex: originalIndex,
          setIndex: s,
          groupId: null,
          isLastInRound: true,
          isFirstInRound: true,
          roundNumber: s,
        });
      }
    } else {
      // Grouped: interleave exercises per round
      const maxSets = Math.max(
        group.groupRounds || 0,
        ...group.exercises.map(({ exercise }) => exercise.sets || 3)
      );
      for (let round = 0; round < maxSets; round++) {
        for (let exI = 0; exI < group.exercises.length; exI++) {
          const { exercise, originalIndex } = group.exercises[exI];
          const numSets = exercise.sets || 3;
          if (round < numSets) {
            steps.push({
              exerciseIndex: originalIndex,
              setIndex: round,
              groupId: group.groupId,
              isFirstInRound: exI === 0,
              isLastInRound: exI === group.exercises.length - 1,
              roundNumber: round,
            });
          }
        }
      }
    }
  }

  return steps;
}
