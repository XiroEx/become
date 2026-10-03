import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { ExerciseSwapModal } from "@/components/live/ExerciseSwapModal";
import { StreakMilestoneModal } from "@/components/StreakMilestoneModal";
import { DayChoiceModal } from "@/components/workout/DayChoiceModal";
import {
  IncompleteWorkoutModal,
  type ResolveIncompleteAction,
} from "@/components/workout/IncompleteWorkoutModal";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import type { KeyValueStore } from "@/lib/live/liveWorkoutCache";
import { useLiveWorkout } from "@/lib/live/useLiveWorkout";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface LiveWorkoutRouteProps {
  /** DI for tests — defaults to the SecureStore-backed cache. */
  cacheStore?: KeyValueStore;
  /** Origin day key override for tests (YYYY-MM-DD). */
  initialOriginKey?: string;
  /** Clock injection point for tests. */
  getNow?: () => Date;
  /** Offline save queue override for tests (defaults to the app's one queue). */
  saveQueue?: import("@/lib/offline/workoutSaves").WorkoutSaveQueue | null;
}

/**
 * Live workout route.
 * Addresses a workout by programId, day and sd (NP-078 parity).
 * Loads current workout with permanent swaps, previews on 404, resumes in-progress
 * sessions with set state in the web's shape and wall-clock active seconds,
 * and saves with the web's full body contract.
 */
export default function LiveWorkoutRoute({
  cacheStore,
  initialOriginKey,
  getNow,
  saveQueue,
}: LiveWorkoutRouteProps = {}) {
  const router = useRouter();
  const { colors, tint } = useThemeTokens();
  const params = useLocalSearchParams<{
    id?: string;
    programId?: string;
    day?: string;
    sd?: string;
    idx?: string;
    phase?: string;
  }>();

  const id =
    typeof params.programId === "string" && params.programId
      ? params.programId
      : typeof params.id === "string"
        ? params.id
        : "";
  const idx = Number(params.idx ?? -1);
  const phaseIndex = Number(params.phase ?? 0);
  const day =
    typeof params.day === "string" && params.day
      ? params.day
      : params.idx && isNaN(Number(params.idx))
        ? params.idx
        : undefined;
  const sd = typeof params.sd === "string" && params.sd ? params.sd : null;

  const valid = !!id && (Boolean(day) || (Number.isFinite(idx) && idx >= 0));

  const {
    loading,
    workout,
    restoredGrid,
    onGridChange,
    onSetComplete,
    onFinish,
    finishing,
    saveError,
    pendingSync,
    newPRs,
    onRequestSwap,
    swapSlug,
    swapSourceName,
    alternatives,
    onSelectAlternative,
    setSwapSlug,
    staleIncomplete,
    setStaleIncomplete,
    resolveIncomplete,
    resolvingIncomplete,
    pendingDayChoice,
    resolveDayChoice,
    dismissDayChoice,
    reload,
    streakMilestone,
    workoutStreakDays,
    clearStreakMilestone,
  } = useLiveWorkout(valid ? id : "", day, sd, {
    cacheStore,
    initialPhase:
      Number.isFinite(phaseIndex) && phaseIndex >= 0 ? phaseIndex : 0,
    fallbackWorkoutIndex: Number.isFinite(idx) && idx >= 0 ? idx : 0,
    initialOriginKey,
    getNow,
    ...(saveQueue !== undefined ? { saveQueue } : {}),
  });

  const handleResolveIncomplete = async (action: ResolveIncompleteAction) => {
    const staleDay = staleIncomplete?.day;
    const res = await resolveIncomplete(action);
    if (!res) return;

    if (action === "continue") {
      if (staleDay && staleDay !== day) {
        const targetIdx = workoutIndexFromDayLabel(staleDay);
        router.replace(
          `/(tabs)/programming/${encodeURIComponent(id)}/workout/${targetIdx}/live?phase=${phaseIndex}&day=${encodeURIComponent(staleDay)}`,
        );
      } else {
        await reload();
      }
    } else if (action === "restart") {
      if (staleDay && staleDay !== day) {
        const targetIdx = workoutIndexFromDayLabel(staleDay);
        router.replace(
          `/(tabs)/programming/${encodeURIComponent(id)}/workout/${targetIdx}/live?phase=${phaseIndex}&day=${encodeURIComponent(staleDay)}`,
        );
      }
    } else {
      if (res.nextDay) {
        const nextIdx = workoutIndexFromDayLabel(res.nextDay);
        const nextP = (res.nextPhase ?? (phaseIndex + 1)) - 1;
        router.replace(
          `/(tabs)/programming/${encodeURIComponent(id)}/workout/${nextIdx}?phase=${Math.max(0, nextP)}&day=${encodeURIComponent(res.nextDay)}`,
        );
      } else {
        router.replace(`/(tabs)/programming/${encodeURIComponent(id)}`);
      }
    }
  };

  if (!valid) {
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

  const vm: LiveWorkoutViewModel = workout ?? {
    programId: id,
    workoutTitle: loading ? "Loading…" : "Training",
    exercises: [],
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {newPRs.length > 0 ? (
        <View
          testID="live-pr-banner"
          style={{ padding: 12, backgroundColor: tint("success", 0.18) }}
        >
          {/* `text-foreground`, not `text-primary`: brand red on the light
              mode's pale green wash is 3:1 and fails AA — the 🎉 does the
              celebrating (NP-123). */}
          <Text className="text-foreground font-semibold">
            🎉 New PR{newPRs.length === 1 ? "" : "s"}!
          </Text>
          {newPRs.map((pr) => (
            <Text
              key={pr.exerciseSlug}
              testID={`live-pr-${pr.exerciseSlug}`}
              className="text-foreground text-sm"
            >
              {pr.exerciseName}: {pr.dimensions.join(", ")}
            </Text>
          ))}
        </View>
      ) : null}
      <LiveWorkoutClient
        workout={vm}
        restoredGrid={restoredGrid}
        onGridChange={onGridChange}
        onSetComplete={onSetComplete}
        onFinish={(g) => void onFinish(g)}
        finishing={finishing}
        saveError={saveError}
        pendingSync={pendingSync}
        onRequestSwap={onRequestSwap}
      />
      <ExerciseSwapModal
        visible={swapSlug !== null}
        sourceName={swapSourceName}
        exerciseSlug={swapSlug ?? undefined}
        workoutExerciseSlugs={workout?.exercises
          .map((e) => e.slug)
          .filter(Boolean)}
        programRole={workout?.exercises.find((e) => e.slug === swapSlug)?.role}
        alternatives={alternatives.data?.alternatives}
        loading={alternatives.loading}
        onSwap={onSelectAlternative}
        onSelect={onSelectAlternative}
        onClose={() => setSwapSlug(null)}
      />
      {staleIncomplete ? (
        <IncompleteWorkoutModal
          visible={staleIncomplete !== null}
          stale={staleIncomplete}
          loadingAction={resolvingIncomplete}
          onResolve={handleResolveIncomplete}
          onDismiss={() => setStaleIncomplete(null)}
        />
      ) : null}
      {pendingDayChoice ? (
        <DayChoiceModal
          visible={pendingDayChoice !== null}
          originalKey={pendingDayChoice.originalKey}
          todayKey={pendingDayChoice.todayKey}
          onChoose={(k) => void resolveDayChoice(k)}
          onClose={dismissDayChoice}
        />
      ) : null}
      <StreakMilestoneModal
        testID="live-streak-milestone-modal"
        visible={streakMilestone !== null}
        milestone={streakMilestone}
        streakDays={workoutStreakDays}
        onClose={clearStreakMilestone}
      />
    </View>
  );
}
