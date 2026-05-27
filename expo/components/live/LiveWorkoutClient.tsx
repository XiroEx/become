import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import {
  LiveSetRow,
  type LiveSetState,
} from "@/components/live/LiveSetRow";
import {
  ExerciseGroupNav,
  type ExerciseGroupType,
} from "@/components/live/ExerciseGroupNav";
import { detectBellStyle } from "@/lib/live/bellStyle";

export interface LiveWorkoutExercise {
  slug: string;
  name: string;
  sets: number;
  repsLabel?: string;
  notes?: string;
  /** Last completed performance per set, used as prefill. */
  prefill?: (LiveSetState | null)[];
}

export interface LiveWorkoutViewModel {
  programId: string;
  workoutTitle: string;
  exercises: LiveWorkoutExercise[];
  groupType?: ExerciseGroupType | null;
  groupRounds?: number;
}

export interface LiveWorkoutClientProps {
  workout: LiveWorkoutViewModel;
  /** Called any time a set transitions to completed=true. */
  onSetComplete?: (input: {
    exerciseSlug: string;
    setIndex: number;
    state: LiveSetState;
  }) => Promise<void> | void;
  testID?: string;
}

type GridState = Record<string, LiveSetState[]>; // exerciseSlug → sets

function initialGrid(exercises: LiveWorkoutExercise[]): GridState {
  const grid: GridState = {};
  for (const ex of exercises) {
    grid[ex.slug] = Array.from({ length: ex.sets }, (_, i) => ({
      weight: ex.prefill?.[i]?.weight ?? null,
      reps: ex.prefill?.[i]?.reps ?? null,
      completed: false,
    }));
  }
  return grid;
}

export function LiveWorkoutClient({
  workout,
  onSetComplete,
  testID = "live-workout",
}: LiveWorkoutClientProps) {
  const [grid, setGrid] = useState<GridState>(() => initialGrid(workout.exercises));
  const [round, setRound] = useState<number>(1);
  const totalRounds = workout.groupRounds ?? 1;

  // Sync grid when workout changes (different IDs). Canonical
  // identity-change-driven state reset; the lint rule guards against
  // unnecessary cascades, not necessary ones.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setGrid(initialGrid(workout.exercises));
    setRound(1);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [workout]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID={testID}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text testID={`${testID}-title`} className="text-foreground text-2xl font-bold">
          {workout.workoutTitle}
        </Text>

        {workout.groupType ? (
          <ExerciseGroupNav
            testID={`${testID}-group-nav`}
            groupType={workout.groupType}
            currentRound={round}
            totalRounds={totalRounds}
            onPrev={() => setRound((r) => Math.max(1, r - 1))}
            onNext={() => setRound((r) => Math.min(totalRounds, r + 1))}
          />
        ) : null}

        {workout.exercises.map((ex) => {
          const bellStyle = detectBellStyle(ex.name);
          const sets = grid[ex.slug] ?? [];
          return (
            <Card
              key={ex.slug}
              testID={`${testID}-exercise-${ex.slug}`}
              title={ex.name}
              subtitle={
                ex.repsLabel
                  ? `${ex.sets}×${ex.repsLabel}`
                  : `${ex.sets} sets`
              }
            >
              {sets.map((s, i) => (
                <LiveSetRow
                  key={i}
                  setIndex={i}
                  bellStyle={bellStyle}
                  state={s}
                  prefill={ex.prefill?.[i] ?? null}
                  testID={`${testID}-${ex.slug}-set-${i}`}
                  onChange={(next) => {
                    const justCompleted = !s.completed && next.completed;
                    setGrid((g) => {
                      const cur = g[ex.slug] ? [...g[ex.slug]!] : [];
                      cur[i] = next;
                      return { ...g, [ex.slug]: cur };
                    });
                    if (justCompleted) {
                      void onSetComplete?.({
                        exerciseSlug: ex.slug,
                        setIndex: i,
                        state: next,
                      });
                    }
                  }}
                />
              ))}
            </Card>
          );
        })}
        <View style={{ height: 24 }} />
        <Button
          testID={`${testID}-finish`}
          variant="primary"
        >
          Finish workout
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
