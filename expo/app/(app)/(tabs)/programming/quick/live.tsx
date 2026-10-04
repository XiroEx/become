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
import {
  asyncStorageKeyValueStore,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";
import { localDateKey } from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  fallbackQuickSessionName,
  quickScope,
  shouldPromptForQuickSessionName,
} from "@become/core";
import type { LiveSetState } from "@/components/live/LiveSetRow";
import { useQuickLiveWorkout } from "@/lib/quickSession/useQuickLiveWorkout";

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
    finishing,
    finishedGrid,
    finishedElapsedSeconds,
    onGridChange,
    onFinish,
    finishWithTitle,
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

  const dayKey = initialOriginKey ?? localDateKey(getNow?.() ?? new Date());
  const fallbackName = useMemo(
    () => fallbackQuickSessionName(dayKey),
    [dayKey],
  );

  const handleFinish = (grid: LiveGrid) => {
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
          exerciseHistory={{}}
          streak={null}
          goal={null}
          onDone={() => router.replace("/(tabs)/programming")}
          onViewJourney={() => router.replace("/(tabs)/programming")}
          onViewLog={() => router.replace("/progress" as never)}
        />
      </View>
    );
  }

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
