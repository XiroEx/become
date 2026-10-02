import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
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
import { getBellWeightInfo } from "@become/core";
import { applySetUpdate } from "@/lib/live/liveWorkoutCache";
import { FramedVideo } from "@/components/FramedVideo";
import type { VideoFramingOverride } from "@/lib/videoFraming";
import type { VideoTrimOverride } from "@/lib/videoTrim";
import { useRestTimer } from "@/lib/live/useRestTimer";
import { RestTimerBar } from "@/components/live/RestTimerBar";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

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
  /**
   * Catalog metadata, hydrated by the web onto every program exercise
   * (`ProgramExerciseSchema`). It — not the name — decides whether the weight
   * box says "Weight per DB (lbs)" and whether a doubled total is claimed:
   * a Chest-Supported Row is dumbbell work and says so nowhere in its name,
   * while a Barbell Bench Press is aliased "Bench Press (DB/bar)" and is not.
   * See `getBellWeightInfo` in `@become/core`.
   */
  equipment?: string[];
  laterality?: string;
  movementPatterns?: string[];
  /** Grouping metadata — exercises sharing a groupId form a superset/circuit/etc. */
  groupId?: string;
  groupLabel?: string;
  groupType?: string;
  groupRounds?: number;
  /** Rest between sets in seconds (defaults to 90). */
  restSec?: number;
  /** Last completed performance per set, used as prefill. */
  prefill?: (LiveSetState | null)[];
  addedAdHoc?: boolean;
  originalExerciseSlug?: string;
  swappedFromName?: string;
  category?: string;
  type?: string;
  role?: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: VideoFramingOverride | null;
  videoTrim?: VideoTrimOverride | null;
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
  /** Save error to surface offline / failure state and offer Retry. */
  saveError?: Error | string | null;
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
      // Sets start blank; last time's numbers are a reference and are never
      // written into the inputs (the web stopped pre-filling because members
      // logged numbers they never lifted).
      return {
        weight: null,
        reps: null,
        durationSec: null,
        distance: null,
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
  saveError,
  onRequestSwap,
  restTimerSetInterval,
  restTimerClearInterval,
  testID = "live-workout",
}: LiveWorkoutClientProps) {
  const { colors, tint } = useThemeTokens();
  const [grid, setGrid] = useState<LiveGrid>(() =>
    initialGrid(workout.exercises, restoredGrid),
  );
  // Mirror of the latest grid so that two edits within a single render cycle
  // compose instead of clobbering each other (the closure `grid` would be stale
  // for the second edit).
  const gridRef = useRef<LiveGrid>(grid);
  // The mirror is maintained AFTER commit, never during render: writing a ref
  // while rendering is what `react-hooks/refs` reports, and under a re-render
  // that React throws away it leaves the ref holding a grid the UI never
  // showed. Every edit below assigns `gridRef.current` itself before calling
  // setGrid, so two edits inside one render cycle still compose; this effect
  // only has to cover the grid changes that do not come from an edit (mount and
  // the re-seed below).
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);
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
      style={{ flex: 1, backgroundColor: colors.background }}
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
          const bell = getBellWeightInfo(ex);
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
                <FramedVideo
                  src={ex.videoUrl}
                  surface="live"
                  exerciseName={ex.name}
                  videoWidth={ex.videoWidth}
                  videoHeight={ex.videoHeight}
                  videoFraming={ex.videoFraming}
                  videoTrim={ex.videoTrim}
                  testID={`${testID}-${ex.slug}-video`}
                  className="mb-3"
                />
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
                    bell={bell}
                    exerciseName={ex.name}
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
        {saveError ? (
          <View
            testID={`${testID}-error-banner`}
            style={{
              padding: 12,
              borderRadius: 8,
              backgroundColor: tint("destructive", 0.15),
              gap: 8,
              marginTop: 12,
            }}
          >
            <Text
              testID={`${testID}-error-message`}
              className="text-destructive font-medium text-sm"
            >
              {typeof saveError === "string"
                ? saveError
                : "Couldn’t save workout. You appear to be offline."}
            </Text>
            <Button
              testID={`${testID}-retry`}
              variant="secondary"
              size="sm"
              onPress={() => onFinish?.(gridRef.current)}
            >
              Retry
            </Button>
          </View>
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
