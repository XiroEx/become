import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  LiveWorkoutClient,
  type LiveGrid,
  type LiveWorkoutViewModel,
  type WorkoutView,
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
import { AddExerciseSheet, type AddExerciseResult } from "@/components/workout/AddExerciseSheet";
import { WorkoutExerciseList } from "@/components/workout/WorkoutExerciseList";
import {
  IncompleteWorkoutModal,
  type ResolveIncompleteAction,
} from "@/components/workout/IncompleteWorkoutModal";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import {
  asyncStorageKeyValueStore,
  hasWorkoutProgress,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";
import { useLiveWorkout } from "@/lib/live/useLiveWorkout";
import { useExerciseHints } from "@/lib/live/useExerciseHints";
import { programScope } from "@become/core";
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
import { useLiveBackGuard } from "@/lib/live/useLiveBackGuard";
import { NativeShareButton } from "@/components/share/NativeShareButton";

export interface LiveWorkoutRouteProps {
  /** DI for tests — defaults to the SecureStore-backed cache. */
  cacheStore?: KeyValueStore;
  /**
   * Where the remembered Track/Live position is kept. Defaults to
   * `cacheStore` when a test injects one (so a test's position is as isolated
   * as its draft), and to AsyncStorage in the app.
   */
  positionStore?: KeyValueStore | null;
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
  /** Navigator override for tests. */
  navigation?: import("@/lib/live/useLiveBackGuard").BackGuardNavigator | null;
  /** BackHandler override for tests. */
  backHandler?: import("@/lib/android/backHandler").BackHandlerLike | null;
}

/**
 * The workout route — TRACK and LIVE, one workout seen two ways (NP-087).
 *
 * Opening a workout lands on Track (every exercise and every set on one
 * screen), with a Track | Live toggle at the top, exactly as on the web where
 * `/dashboard/workout/[programId]/workout?day=` is the Track page and
 * `…/workout/live` is Live. Both views edit one grid, share one rest timer,
 * one set of session notes and one remembered position, and finish through
 * the same save — so a workout completed from Track and the same workout
 * completed from Live leave identical state on the server and show the same
 * summary. `?view=live` opens on Live.
 *
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
  positionStore,
  initialOriginKey,
  getNow,
  saveQueue,
  summaryDataForTests,
  navigation,
  backHandler,
}: LiveWorkoutRouteProps = {}) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  // The screen must not dim mid-set (NP-082): keep the display awake while
  // the live view is open. Released automatically on unmount.
  useKeepAwake("live-workout");
  const params = useLocalSearchParams<{
    id?: string;
    programId?: string;
    day?: string;
    sd?: string;
    idx?: string;
    phase?: string;
    view?: string;
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
  // Opening a workout lands on TRACK, as on the web; `?view=live` is how a
  // deep link or a resume asks for the set-by-set view instead.
  const initialView: WorkoutView = params.view === "live" ? "live" : "track";

  const valid = !!id && (Boolean(day) || (Number.isFinite(idx) && idx >= 0));

  const {
    loading,
    workout,
    day: resolvedDay,
    grid,
    notes,
    setNotes,
    restoredGrid,
    isResuming,
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
    exercisePRs,
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
    applyExerciseChange,
    addExercise,
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

  // ── Build as you go (NP-138) ─────────────────────────────────────────────
  //
  // The workout is not fixed at the door: the exercise list opens the manage
  // sheet (jump / remove / group / long-press reorder), which reports
  // structural changes the hook applies (grid + swap trail permuted, saved
  // immediately with `addedAdHoc` and the group fields). The add sheet hands
  // back a plain exercise plus a placement; the anchor is the exercise the
  // member is standing in. A program workout is the coach's call, so it never
  // asks the thin-session question — that prompt is quick-session-only (the
  // route below wires it through `shouldWarnBeforeFinish` with
  // `selfBuilt: true`).
  const [showExerciseList, setShowExerciseList] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [addAnchorIndex, setAddAnchorIndex] = useState(0);

  const handleAddExercise = (r: AddExerciseResult) => {
    addExercise({
      exercise: r.exercise,
      placement: r.placement,
      groupKind: r.groupKind,
      anchorIndex: addAnchorIndex,
    });
  };

  // Share (NP-165): the web's Track header shares `{ kind: 'workout',
  // programId, day }` — no phase NAME travels (the route matches `ph.phase`
  // verbatim and skips the filter when absent, so day alone resolves the
  // workout). The day prefers the resolved server day, then the param.
  const shareDay = resolvedDay || day;
  const workoutShareBody =
    valid && shareDay ? { kind: "workout" as const, programId: id, day: shareDay } : null;

  // In-workout hints (NP-173): one fetch per workout load, rendered under
  // the exercise header in Live and Track, dismissed on the account — the
  // web's `exerciseNudges` / `dismissNudge` pair.
  const workoutSlugs = useMemo(
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
  const { hints: exerciseHints, dismissHint } = useExerciseHints(workoutSlugs);

  // Leaving with unsaved sets loses the workout (NP-082, NP-331): confirm first.
  // Android hardware back is intercepted through the shared hook; the iOS
  // swipe-back is disabled on this route while there is unsaved work.
  // Only guard when there is actual entered work (typed values or completed sets)
  // so exiting a fresh untouched workout doesn't prompt.
  const hasEnteredWork = useMemo(() => hasWorkoutProgress(grid), [grid]);

  useLiveBackGuard({
    enabled: !showSummary && !loading && workout !== null && hasEnteredWork,
    ...(navigation !== undefined ? { navigation } : {}),
    ...(backHandler !== undefined ? { backHandler } : {}),
  });

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
        // The summary draws the circuit / superset the session was run in.
        groupId: ex.groupId ?? null,
        groupType: ex.groupType ?? null,
        groupLabel: ex.groupLabel ?? null,
        groupRounds: ex.groupRounds ?? null,
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
            router.push(
              `/(tabs)/programming/${encodeURIComponent(id)}/journey`,
            )
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
        initialView={initialView}
        notes={notes}
        onNotesChange={setNotes}
        headerAction={
          workoutShareBody ? (
            <NativeShareButton
              body={workoutShareBody}
              getToken={() => token ?? undefined}
              testID="live-workout-share"
            />
          ) : undefined
        }
        positionScope={programScope(id, resolvedDay)}
        positionStore={
          positionStore !== undefined
            ? positionStore
            : (cacheStore ?? asyncStorageKeyValueStore)
        }
        restoredGrid={restoredGrid}
        resumed={isResuming}
        enableSkipFlow
        activeSeconds={activeSeconds}
        onGridChange={onGridChange}
        onSetComplete={onSetComplete}
        onFinish={(g: LiveGrid) => void onFinish(g)}
        finishing={finishing}
        saveError={saveError}
        pendingSync={pendingSync}
        onRequestSwap={onRequestSwap}
        exerciseHistory={exerciseHistory}
        exercisePRs={exercisePRs}
        exerciseHints={exerciseHints}
        onDismissHint={(slug) => void dismissHint(slug)}
        onExit={() => router.back()}
        manageExercises={
          workout
            ? {
                onOpen: () => setShowExerciseList(true),
                label: `Exercises (${workout.exercises.length})`,
                // The web's `Add Exercise` pill on the live step opens the
                // add sheet straight away (NP-288); the manage panel's own
                // Add still works too.
                onAdd: () => {
                  setAddAnchorIndex(
                    Math.max(0, (workout.exercises.length ?? 1) - 1),
                  );
                  setShowAddExercise(true);
                },
              }
            : undefined
        }
      />
      <WorkoutExerciseList
        visible={showExerciseList}
        onClose={() => setShowExerciseList(false)}
        exercises={workout?.exercises ?? []}
        grid={grid}
        onJump={() => setShowExerciseList(false)}
        onChange={(change) => applyExerciseChange(change)}
        onAddExercise={() => {
          setAddAnchorIndex(
            Math.max(0, (workout?.exercises.length ?? 1) - 1),
          );
          setShowExerciseList(false);
          setShowAddExercise(true);
        }}
        testID="live-workout-manage"
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
        testID="live-workout-add"
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
