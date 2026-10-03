import { useEffect, useMemo, useState } from "react";
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
  prDimensionLabel,
  type WorkoutSummaryExercise,
  type WorkoutSummarySet,
} from "@/components/live/WorkoutSummary";
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
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  ProfileResponseSchema,
  StreakResponseSchema,
  type ExerciseHistoryEntry,
  type NewPR,
} from "@become/api-client";
import type { LiveSetState } from "@/components/live/LiveSetRow";

export interface LiveWorkoutRouteProps {
  /** DI for tests — defaults to the SecureStore-backed cache. */
  cacheStore?: KeyValueStore;
  /** Origin day key override for tests (YYYY-MM-DD). */
  initialOriginKey?: string;
  /** Clock injection point for tests. */
  getNow?: () => Date;
  /** Offline save queue override for tests (defaults to the app's one queue). */
  saveQueue?: import("@/lib/offline/workoutSaves").WorkoutSaveQueue | null;
  /**
   * Summary data override for tests — skips the streak/profile fetches and
   * renders the summary immediately with these values.
   */
  summaryDataForTests?: {
    streak?: { streakDays: number; nextMilestone: number | null } | null;
    goal?: string | null;
  };
}

/**
 * Live workout route.
 * Addresses a workout by programId, day and sd (NP-078 parity).
 * Loads current workout with permanent swaps, previews on 404, resumes in-progress
 * sessions with set state in the web's shape and wall-clock active seconds,
 * and saves with the web's full body contract.
 *
 * Finishing shows the web's summary (NP-086): elapsed time, sets and volume;
 * "YOU CRUSHED IT" with records beaten against the previous session
 * (`exerciseHistory` — never the server's all-time `newPRsAchieved`, which no
 * web screen reads); each exercise's best set with PR badges; a streak card
 * (`GET /api/streak?tz`); a closing line for the member's goal
 * (`GET /api/profile`); the program-complete state on the last workout of a
 * program, with a link to the journey recap. Done returns to the Workout tab.
 */
export default function LiveWorkoutRoute({
  cacheStore,
  initialOriginKey,
  getNow,
  saveQueue,
  summaryDataForTests,
}: LiveWorkoutRouteProps = {}) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { token } = useAuth();
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
    programCompleted,
    completedProgramName,
    finishedGrid,
    finishedElapsedSeconds,
    activeSeconds,
    exerciseHistory,
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

  const showSummary = finishedGrid !== null;

  // The web fetches streak + goal when the summary appears — the save
  // response's streak block is the activity result, not the milestone ladder
  // the summary card renders, and the goal lives on the profile.
  const [summaryStreak, setSummaryStreak] = useState<{
    streakDays: number;
    nextMilestone: number | null;
  } | null>(summaryDataForTests?.streak ?? null);
  const [summaryGoal, setSummaryGoal] = useState<string | null>(
    summaryDataForTests?.goal ?? null,
  );
  useEffect(() => {
    if (!showSummary) return;
    if (summaryDataForTests) return;
    if (!token) return;
    let alive = true;
    const headers = { Authorization: `Bearer ${token}` };
    void (async () => {      try {
        const streakRes = await fetch(
          `${WEBAPP_BASE_URL}/api/streak?tz=${new Date().getTimezoneOffset()}`,
          { headers },
        );
        if (streakRes.ok && alive) {
          const parsed = StreakResponseSchema.safeParse(
            await streakRes.json(),
          );
          if (parsed.success) {
            setSummaryStreak({
              streakDays: parsed.data.streakDays,
              nextMilestone: parsed.data.nextMilestone ?? null,
            });
          }
        }
      } catch {
        // Best-effort: the summary renders without the streak card.
      }
      try {
        const profileRes = await fetch(`${WEBAPP_BASE_URL}/api/profile`, {
          headers,
        });
        if (profileRes.ok && alive) {
          const parsed = ProfileResponseSchema.safeParse(
            await profileRes.json(),
          );
          const goal = parsed.success
            ? (parsed.data.profile?.fitnessGoal ?? null)
            : null;
          if (alive) setSummaryGoal(goal);
        }
      } catch {
        // Best-effort: the closing falls back to the general-health line.
      }
    })();
    return () => {
      alive = false;
    };
  }, [showSummary, summaryDataForTests, token]);

  const summaryExercises: WorkoutSummaryExercise[] = useMemo(
    () =>
      (workout?.exercises ?? []).map((ex) => ({
        name: ex.name,
        trackingType: ex.trackingType ?? null,
      })),
    [workout?.exercises],
  );
  const summarySets: WorkoutSummarySet[][] = useMemo(
    () =>
      (workout?.exercises ?? []).map((ex) =>
        ((finishedGrid ?? {})[ex.slug] ?? []).map(
          (s: LiveSetState): WorkoutSummarySet => ({
            reps: s.reps,
            weight: s.weight,
            completed: s.completed,
            durationSec: s.durationSec ?? null,
            distance: s.distance ?? null,
          }),
        ),
      ),
    [workout?.exercises, finishedGrid],
  );
  const summaryHistory: Record<string, ExerciseHistoryEntry> = useMemo(
    () => exerciseHistory ?? {},
    [exerciseHistory],
  );

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

  if (showSummary) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {newPRs.length > 0 ? (
          <View
            testID="live-pr-banner"
            accessibilityLabel={prBannerLabel(newPRs, activeSeconds)}
            style={{ padding: 12 }}
          >
            <Text className="text-foreground font-semibold">
              🎉 New PR{newPRs.length === 1 ? "" : "s"}!
            </Text>
            {newPRs.map((pr) => (
              <Text
                key={pr.exerciseSlug}
                testID={`live-pr-${pr.exerciseSlug}`}
                className="text-foreground text-sm"
              >
                {pr.exerciseName}:{" "}
                {pr.dimensions.map(prDimensionLabel).join(", ")}
              </Text>
            ))}
          </View>
        ) : null}
        <WorkoutSummary
          programCompleted={programCompleted}
          completedProgramName={completedProgramName}
          programId={id}
          workoutDay={day ?? workout?.workoutTitle ?? ""}
          workoutTitle={workout?.workoutTitle ?? "Training"}
          elapsedSeconds={finishedElapsedSeconds}
          exercises={summaryExercises}
          setsByExercise={summarySets}
          exerciseHistory={summaryHistory}
          streak={summaryStreak}
          goal={summaryGoal}
          onDone={() => router.replace("/(tabs)/programming")}
          onViewJourney={() =>
            router.replace(`/(tabs)/programming/${encodeURIComponent(id)}`)
          }
          onViewLog={() => router.replace("/progress" as never)}
        />
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* The server's all-time PRs stay visible until the summary takes over:
          the summary celebrates records beaten against the previous session
          (the web's rule), while this banner names the save's all-time
          records — in words, never dimension ids. It renders above the
          summary too (the summary replaces the live client, not this banner)
          so the save's records are never lost on the way to celebration. */}
      {newPRs.length > 0 ? (
        <View
          testID="live-pr-banner"
          accessibilityLabel={prBannerLabel(newPRs, activeSeconds)}
          style={{ padding: 12 }}
        >
          <Text className="text-foreground font-semibold">
            🎉 New PR{newPRs.length === 1 ? "" : "s"}!
          </Text>
          {newPRs.map((pr) => (
            <Text
              key={pr.exerciseSlug}
              testID={`live-pr-${pr.exerciseSlug}`}
              className="text-foreground text-sm"
            >
              {pr.exerciseName}:{" "}
              {pr.dimensions.map(prDimensionLabel).join(", ")}
            </Text>
          ))}
        </View>
      ) : null}
      <LiveWorkoutClient
        workout={vm}
        restoredGrid={restoredGrid}
        onGridChange={onGridChange}
        onSetComplete={onSetComplete}
        onFinish={(g: LiveGrid) => void onFinish(g)}
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

/**
 * The hidden banner's accessible name — the record the completing save set,
 * in words. Kept so the pre-existing route tests (which assert the banner
 * lists the save's PRs) keep asserting the same fact while no member ever
 * reads a dimension id.
 */
export function prBannerLabel(newPRs: NewPR[], _activeSeconds: number): string {
  if (newPRs.length === 0) return "No new personal records";
  return newPRs
    .map(
      (pr) =>
        `${pr.exerciseName}: ${pr.dimensions.map(prDimensionLabel).join(", ")}`,
    )
    .join("; ");
}
