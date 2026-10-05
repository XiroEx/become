import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  LiveWorkoutClient,
  type LiveGrid,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import {
  WorkoutSummary,
  type WorkoutSummaryExercise,
  type WorkoutSummarySet,
} from "@/components/live/WorkoutSummary";
import { QuickSessionNamePrompt } from "@/components/workout/QuickSessionNamePrompt";
import { AddExerciseSheet, type AddExerciseResult } from "@/components/workout/AddExerciseSheet";
import { ThinSessionModal } from "@/components/workout/ThinSessionModal";
import { WorkoutExerciseList } from "@/components/workout/WorkoutExerciseList";
import {
  fallbackQuickSessionName,
  quickScope,
  shouldPromptForQuickSessionName,
  shouldWarnBeforeFinish,
} from "@become/core";
import type { LiveSetState } from "@/components/live/LiveSetRow";
import {
  asyncStorageKeyValueStore,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";
import { localDateKey } from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useQuickLiveWorkout } from "@/lib/quickSession/useQuickLiveWorkout";
import { useExerciseHints } from "@/lib/live/useExerciseHints";

export interface QuickLiveRouteProps {
  /** DI for tests — defaults to the AsyncStorage-backed store. */
  store?: KeyValueStore;
  /**
   * Where the remembered Track/Live position is kept. Defaults to `store`
   * when a test injects one (so a test's position is as isolated as its
   * draft), and to AsyncStorage in the app.
   */
  positionStore?: KeyValueStore | null;
  /** Fetch implementation override for tests. */
  fetchImpl?: typeof fetch;
  /** Debounce for the grid-change autosave (tests set it to 0). */
  autoSaveDelayMs?: number;
  /** Origin day key override for tests (YYYY-MM-DD). */
  initialOriginKey?: string;
  /** Clock injection point for tests. */
  getNow?: () => Date;
}

/**
 * The quick-session live route — `/(tabs)/programming/quick/live?session=`.
 *
 * Runs a stashed quick session live: the draft loads from the stash (or is
 * rebuilt from its server log on another device), demo videos hydrate by
 * index, the grid restores from progress, and the session saves as
 * `kind: 'quick'` with `started: true` from the moment it opens. Finishing an
 * unnamed session asks for a name first (`QuickSessionNamePrompt`), then
 * shows `WorkoutSummary`.
 */
export default function QuickLiveRoute({
  store,
  positionStore,
  fetchImpl,
  autoSaveDelayMs,
  initialOriginKey,
  getNow,
}: QuickLiveRouteProps = {}) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const params = useLocalSearchParams<{ session?: string }>();
  const sessionId =
    typeof params.session === "string" ? params.session : "";

  const resolvedStore = store ?? asyncStorageKeyValueStore;
  const {
    loading,
    error,
    saveError,
    workout,
    stored,
    restoredGrid,
    exerciseHistory,
    finishing,
    finishedGrid,
    finishedElapsedSeconds,
    onGridChange,
    onFinish,
    finishWithTitle,
    applyExerciseChange,
    addExercise,
  } = useQuickLiveWorkout(sessionId, {
    store: resolvedStore,
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(autoSaveDelayMs !== undefined ? { autoSaveDelayMs } : {}),
    ...(initialOriginKey ? { initialOriginKey } : {}),
    ...(getNow ? { getNow } : {}),
  });

  // The naming prompt opens when the finished session still needs a name —
  // the web's `requestQuickNameBeforeCompletion`. Held here (not in the
  // hook) because it is UI state: the grid to complete with is frozen at
  // finish time.
  const [pendingCompletion, setPendingCompletion] =
    useState<LiveGrid | null>(null);
  const [promptFinishing, setPromptFinishing] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  // "Finish with two exercises?" — asked once, on the way out of a thin
  // session the member assembled themselves (web's `showThinFinish`).
  const [pendingThinFinish, setPendingThinFinish] = useState<LiveGrid | null>(null);
  const [thinFinishAcked, setThinFinishAcked] = useState(false);
  // Build as you go: the manage list + the add sheet (web's exercise-list
  // panel + `AddExerciseSheet` in `LiveWorkoutClient`).
  const [showExerciseList, setShowExerciseList] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [addAnchorIndex, setAddAnchorIndex] = useState(0);

  const dayKey = initialOriginKey ?? localDateKey(getNow?.() ?? new Date());
  const fallbackName = useMemo(
    () => fallbackQuickSessionName(dayKey),
    [dayKey],
  );

  const handleFinish = (grid: LiveGrid) => {
    // A session the member assembled themselves, thinner than a session
    // usually is: ask once on the way out (the web's `shouldAskBeforeFinish`
    // in `LiveWorkoutClient` — `selfBuilt` is always true here, and never
    // for a program workout).
    if (
      shouldWarnBeforeFinish({
        selfBuilt: true,
        exerciseCount: workout?.exercises.length ?? 0,
        alreadyAsked: thinFinishAcked,
      })
    ) {
      setPromptError(null);
      setPendingThinFinish(grid);
      return;
    }
    if (shouldPromptForQuickSessionName(stored)) {
      setPromptError(null);
      setPendingCompletion(grid);
      return;
    }
    onFinish(grid);
  };

  const handleNamedFinish = async (title: string) => {
    setPromptFinishing(true);
    setPromptError(null);
    try {
      const ok = await finishWithTitle(title);
      if (!ok) throw new Error("Could not finish the workout. Try again.");
      setPendingCompletion(null);
    } catch (cause) {
      setPromptError(
        cause instanceof Error ? cause.message : "Could not save the workout",
      );
      throw cause;
    } finally {
      setPromptFinishing(false);
    }
  };

  const showSummary = finishedGrid !== null;

  const summaryHistory: Record<string, (typeof exerciseHistory)[string]> =
    exerciseHistory ?? {};

  // In-workout hints (NP-173): one fetch per session load, dismissed on the
  // account — the same `useExerciseHints` the program live route uses.
  const quickSlugs = useMemo(
    () =>
      Array.from(
        new Set(
          (workout?.exercises ?? [])
            .map((e) => (e.slug || "").toLowerCase())
            .filter(Boolean),
        ),
      ),
    [workout?.exercises],
  );
  const { hints: quickHints, dismissHint: dismissQuickHint } =
    useExerciseHints(quickSlugs);

  if (!sessionId) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Invalid workout</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }} testID="quick-live-loading">
          <Text className="text-muted-foreground">Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !workout) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }} testID="quick-live-missing">
          <Text className="text-foreground font-semibold">
            This session is no longer available
          </Text>
          <Text className="text-muted-foreground text-sm mt-2">
            It may have been deleted on another device.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const vm: LiveWorkoutViewModel = workout;

  if (showSummary) {
    const summaryExercises: WorkoutSummaryExercise[] = (
      workout.exercises ?? []
    ).map((ex) => ({
      name: ex.name,
      trackingType: ex.trackingType ?? null,
    }));
    const summarySets: WorkoutSummarySet[][] = (workout.exercises ?? []).map(
      (ex) =>
        ((finishedGrid ?? {})[ex.slug] ?? []).map(
          (s: LiveSetState): WorkoutSummarySet => ({
            reps: s.reps,
            weight: s.weight,
            completed: s.completed,
            durationSec: s.durationSec ?? null,
            distance: s.distance ?? null,
          }),
        ),
    );
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <WorkoutSummary
          programCompleted={false}
          completedProgramName=""
          programId="quick"
          workoutDay={stored?.title ?? workout.workoutTitle}
          workoutTitle={stored?.title ?? workout.workoutTitle}
          elapsedSeconds={finishedElapsedSeconds}
          exercises={summaryExercises}
          setsByExercise={summarySets}
          exerciseHistory={summaryHistory}
          streak={null}
          goal={null}
          onDone={() => router.replace("/(tabs)/programming")}
          onViewJourney={() => router.replace("/(tabs)/programming")}
          onViewLog={() => router.replace("/progress" as never)}
        />
      </View>
    );
  }

  const handleAddExercise = (r: AddExerciseResult) => {
    addExercise({
      exercise: r.exercise,
      placement: r.placement,
      groupKind: r.groupKind,
      anchorIndex: addAnchorIndex,
    });
  };

  const handleThinFinishAnyway = () => {
    // Asked and answered — this session will not ask again.
    setThinFinishAcked(true);
    const grid = pendingThinFinish;
    setPendingThinFinish(null);
    if (!grid) return;
    if (shouldPromptForQuickSessionName(stored)) {
      setPromptError(null);
      setPendingCompletion(grid);
      return;
    }
    onFinish(grid);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LiveWorkoutClient
        workout={vm}
        positionScope={quickScope(sessionId)}
        positionStore={
          positionStore !== undefined ? positionStore : resolvedStore
        }
        restoredGrid={restoredGrid}
        onGridChange={onGridChange}
        onFinish={handleFinish}
        finishing={finishing || promptFinishing}
        saveError={saveError}
        exerciseHistory={exerciseHistory}
        exerciseHints={quickHints}
        onDismissHint={(slug) => void dismissQuickHint(slug)}
        manageExercises={
          workout
            ? {
                onOpen: () => setShowExerciseList(true),
                label: `Exercises (${workout.exercises.length})`,
              }
            : undefined
        }
      />
      <WorkoutExerciseList
        visible={showExerciseList}
        onClose={() => setShowExerciseList(false)}
        exercises={workout?.exercises ?? []}
        grid={restoredGrid ?? {}}
        onJump={() => setShowExerciseList(false)}
        onChange={(change) => applyExerciseChange(change)}
        onAddExercise={() => {
          setAddAnchorIndex(
            Math.max(0, (workout?.exercises.length ?? 1) - 1),
          );
          setShowExerciseList(false);
          setShowAddExercise(true);
        }}
        testID="quick-live-manage"
      />
      <AddExerciseSheet
        visible={showAddExercise}
        onClose={() => setShowAddExercise(false)}
        onAdd={handleAddExercise}
        anchorName={workout && workout.exercises[addAnchorIndex]?.name}
        anchorSlug={workout && workout.exercises[addAnchorIndex]?.slug}
        anchorInGroup={!!(workout && workout.exercises[addAnchorIndex]?.groupId)}
        anchorSets={workout && workout.exercises[addAnchorIndex]?.sets}
        anchorGroupType={workout && workout.exercises[addAnchorIndex]?.groupType}
        workoutExerciseSlugs={(workout?.exercises ?? [])
          .map((e) => e.slug)
          .filter(Boolean)}
        testID="quick-live-add"
      />
      <ThinSessionModal
        visible={pendingThinFinish !== null}
        exerciseCount={workout?.exercises.length ?? 0}
        onAddExercise={() => {
          setPendingThinFinish(null);
          setAddAnchorIndex(
            Math.max(0, (workout?.exercises.length ?? 1) - 1),
          );
          setShowAddExercise(true);
        }}
        onFinishAnyway={handleThinFinishAnyway}
        onClose={() => setPendingThinFinish(null)}
        testID="quick-live-thin-session"
      />
      {pendingCompletion ? (
        <QuickSessionNamePrompt
          initialName={stored?.title ?? ""}
          confirmLabel="Save workout"
          fallbackName={fallbackName}
          onConfirm={handleNamedFinish}
          onSkip={handleNamedFinish}
          onCancel={() => {
            if (!promptFinishing) setPendingCompletion(null);
          }}
        />
      ) : null}
      {promptError && !pendingCompletion ? (
        <View testID="quick-live-finish-error" style={{ padding: 12 }}>
          <Text className="text-destructive text-sm">{promptError}</Text>
        </View>
      ) : null}
    </View>
  );
}
