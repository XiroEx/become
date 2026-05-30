import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
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
import { applySetUpdate } from "@/lib/live/liveWorkoutCache";
import { useRestTimer } from "@/lib/live/useRestTimer";
import { RestTimerBar } from "@/components/live/RestTimerBar";

/** exerciseSlug → ordered set states. Exposed for cache persistence. */
export type LiveGrid = Record<string, LiveSetState[]>;

export interface LiveWorkoutExercise {
  slug: string;
  name: string;
  sets: number;
  repsLabel?: string;
  notes?: string;
  /** Canonical Exercise trackingType — selects per-set inputs (reps/weight/duration/distance). */
  trackingType?: string | null;
  /** Grouping metadata — exercises sharing a groupId form a superset/circuit/etc. */
  groupId?: string;
  groupLabel?: string;
  /** Rest between sets in seconds (defaults to 90). */
  restSec?: number;
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
  /** Restore in-flight sets from a persisted snapshot (SecureStore cache). */
  restoredGrid?: LiveGrid | null;
  /** Fires on every set edit with the full new grid, for cache persistence. */
  onGridChange?: (grid: LiveGrid) => void;
  /** Fires when the user taps Finish, with the final grid for the save POST. */
  onFinish?: (grid: LiveGrid) => void;
  /** Disables the finish button while the save is in flight. */
  finishing?: boolean;
  /** Open the swap picker for an exercise (route fetches alternatives). */
  onRequestSwap?: (slug: string) => void;
  /** Injected rest-timer interval impls for deterministic tests. */
  restTimerSetInterval?: typeof setInterval;
  restTimerClearInterval?: typeof clearInterval;
  testID?: string;
}

const DEFAULT_REST_SEC = 90;

function initialGrid(
  exercises: LiveWorkoutExercise[],
  restored?: LiveGrid | null,
): LiveGrid {
  const grid: LiveGrid = {};
  for (const ex of exercises) {
    const saved = restored?.[ex.slug];
    grid[ex.slug] = Array.from({ length: ex.sets }, (_, i) => {
      // Prefer a restored in-flight set, falling back to prefill defaults. The
      // workout structure (set count) always wins, so a stale cache can't add
      // phantom sets.
      const restoredSet = saved?.[i];
      if (restoredSet) return { ...restoredSet };
      return {
        weight: ex.prefill?.[i]?.weight ?? null,
        reps: ex.prefill?.[i]?.reps ?? null,
        durationSec: ex.prefill?.[i]?.durationSec ?? null,
        distance: ex.prefill?.[i]?.distance ?? null,
        completed: false,
      };
    });
  }
  return grid;
}

export function LiveWorkoutClient({
  workout,
  onSetComplete,
  restoredGrid,
  onGridChange,
  onFinish,
  finishing = false,
  onRequestSwap,
  restTimerSetInterval,
  restTimerClearInterval,
  testID = "live-workout",
}: LiveWorkoutClientProps) {
  const [grid, setGrid] = useState<LiveGrid>(() =>
    initialGrid(workout.exercises, restoredGrid),
  );
  // Mirror of the latest grid so that two edits within a single render cycle
  // compose instead of clobbering each other (the closure `grid` would be stale
  // for the second edit).
  const gridRef = useRef<LiveGrid>(grid);
  gridRef.current = grid;
  const [round, setRound] = useState<number>(1);
  const totalRounds = workout.groupRounds ?? 1;

  // Single rest countdown, (re)started whenever a set is completed.
  const rest = useRestTimer({
    setIntervalImpl: restTimerSetInterval,
    clearIntervalImpl: restTimerClearInterval,
  });

  // Re-seed when the workout identity or the restored snapshot changes (e.g. a
  // cache load resolves after mount). Canonical identity-change-driven reset;
  // the lint rule guards against unnecessary cascades, not necessary ones.
  useEffect(() => {
    const seeded = initialGrid(workout.exercises, restoredGrid);
    gridRef.current = seeded;
    /* eslint-disable react-hooks/set-state-in-effect */
    setGrid(seeded);
    setRound(1);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [workout, restoredGrid]);

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

        {workout.exercises.map((ex, exIdx) => {
          const bellStyle = detectBellStyle(ex.name);
          const sets = grid[ex.slug] ?? [];
          // Render a group header the first time a new groupId appears, so
          // superset/circuit/triset members render contiguously under a label.
          const prevGroup = workout.exercises[exIdx - 1]?.groupId;
          const showGroupHeader = !!ex.groupId && ex.groupId !== prevGroup;
          return (
            <View key={ex.slug}>
              {showGroupHeader ? (
                <Text
                  testID={`${testID}-group-${ex.groupId}`}
                  className="text-primary text-sm font-semibold mt-2"
                >
                  {ex.groupLabel ?? ex.groupId}
                </Text>
              ) : null}
              <Card
                testID={`${testID}-exercise-${ex.slug}`}
                title={ex.name}
                subtitle={
                  ex.repsLabel ? `${ex.sets}×${ex.repsLabel}` : `${ex.sets} sets`
                }
              >
                {ex.notes ? (
                  <Text
                    testID={`${testID}-${ex.slug}-notes`}
                    className="text-muted-foreground text-xs mb-2"
                  >
                    {ex.notes}
                  </Text>
                ) : null}
                {sets.map((s, i) => (
                  <LiveSetRow
                    key={i}
                    setIndex={i}
                    bellStyle={bellStyle}
                    state={s}
                    prefill={ex.prefill?.[i] ?? null}
                    trackingType={ex.trackingType}
                    testID={`${testID}-${ex.slug}-set-${i}`}
                    onChange={(next) => {
                      const justCompleted = !s.completed && next.completed;
                      const updated = applySetUpdate(
                        gridRef.current,
                        ex.slug,
                        i,
                        next,
                      );
                      gridRef.current = updated;
                      setGrid(updated);
                      onGridChange?.(updated);
                      if (justCompleted) {
                        rest.start(ex.restSec ?? DEFAULT_REST_SEC);
                        void onSetComplete?.({
                          exerciseSlug: ex.slug,
                          setIndex: i,
                          state: next,
                        });
                      }
                    }}
                  />
                ))}
                <Pressable
                  testID={`${testID}-${ex.slug}-swap`}
                  onPress={() => onRequestSwap?.(ex.slug)}
                  accessibilityRole="button"
                  accessibilityLabel={`Swap ${ex.name}`}
                  className="mt-2"
                >
                  <Text className="text-primary text-sm">Swap exercise</Text>
                </Pressable>
              </Card>
            </View>
          );
        })}

        {rest.active && rest.remainingSec > 0 ? (
          <RestTimerBar
            testID={`${testID}-rest`}
            remainingSec={rest.remainingSec}
            totalSec={rest.totalSec}
            running={rest.running}
            onPause={rest.pause}
            onResume={rest.resume}
            onSkip={rest.skip}
          />
        ) : null}
        <View style={{ height: 24 }} />
        <Button
          testID={`${testID}-finish`}
          variant="primary"
          disabled={finishing}
          onPress={() => onFinish?.(gridRef.current)}
        >
          {finishing ? "Saving…" : "Finish workout"}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
