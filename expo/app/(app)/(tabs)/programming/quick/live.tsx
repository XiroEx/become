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
  type WorkoutSummaryExercise,
  type WorkoutSummarySet,
} from "@/components/live/WorkoutSummary";
import { QuickSessionNamePrompt } from "@/components/workout/QuickSessionNamePrompt";
import { AddExerciseSheet, type AddExerciseResult } from "@/components/workout/AddExerciseSheet";
import { ThinSessionModal } from "@/components/workout/ThinSessionModal";
import { WorkoutExerciseList } from "@/components/workout/WorkoutExerciseList";
import { ExerciseSwapModal } from "@/components/live/ExerciseSwapModal";
import { quickSessionOverviewHref } from "@/lib/quickSession/store";
import {
  fallbackQuickSessionName,
  quickScope,
  shouldPromptForQuickSessionName,
  shouldWarnBeforeFinish,
} from "@become/core";
import { ProfileResponseSchema, StreakResponseSchema } from "@become/api-client";
import type { LiveSetState } from "@/components/live/LiveSetRow";
import {
  asyncStorageKeyValueStore,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";
import { localDateKey } from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
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
  /**
   * Summary data override for tests — skips the streak/profile fetches and
   * renders the summary immediately with these values (mirrors the program
   * route's same-named prop).
   */
  summaryDataForTests?: {
    streak?: { streakDays: number; nextMilestone: number | null } | null;
    goal?: string | null;
  };
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
 *
 * Opens on LIVE (NP-291 follow-up), with a running elapsed timer — the web's
 * "Start workout" lands on its dedicated live page, never the toggle's Track
 * default, and this route used to open on Track with no timer at all.
 * Swap exercise (`onRequestSwap`) and the manage sheet's "Tap to jump" both
 * work here too: the sheet used to only close itself.
 */
export default function QuickLiveRoute({
  store,
  positionStore,
  fetchImpl,
  autoSaveDelayMs,
  initialOriginKey,
  getNow,
  summaryDataForTests,
}: QuickLiveRouteProps = {}) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { token } = useAuth();
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
    finishedTitle,
    finishedElapsedSeconds,
    activeSeconds,
    onGridChange,
    onFinish,
    swapSlug,
    swapSourceName,
    onRequestSwap,
    onSelectAlternative,
    setSwapSlug,
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
  // A tap on a `WorkoutExerciseList` row says "Tap to jump" — bumping this
  // token is what actually makes it happen (see `LiveWorkoutClient`'s
  // `jumpRequest` prop); the sheet still closes either way.
  const [jumpRequest, setJumpRequest] = useState<
    { exerciseIndex: number; token: number } | null
  >(null);

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

  // The web's quick-session live view is the SAME `LiveWorkoutClient` the
  // program route uses (`programId: 'quick'`), so its summary fetches streak
  // + goal exactly like the program route's — this route is a separate
  // native component and had been hard-coding both to `null`, which is why
  // the streak card and closing line never appeared after a quick session.
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
    void (async () => {
      try {
        const impl = fetchImpl ?? fetch;
        const streakRes = await impl(
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
        const impl = fetchImpl ?? fetch;
        const profileRes = await impl(`${WEBAPP_BASE_URL}/api/profile`, {
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
  }, [showSummary, summaryDataForTests, token, fetchImpl]);

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
      // The summary draws the circuit / superset the session was run in.
      groupId: ex.groupId ?? null,
      groupType: ex.groupType ?? null,
      groupLabel: ex.groupLabel ?? null,
      groupRounds: ex.groupRounds ?? null,
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
    // `finishedTitle` (not `stored?.title`): `finishWithTitle` clears `stored`
    // on success, so by the time this renders the only place the saved name
    // still lives is the title the finish actually went out under.
    const savedTitle = finishedTitle ?? workout.workoutTitle;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <WorkoutSummary
          programCompleted={false}
          completedProgramName=""
          programId="quick"
          workoutDay={savedTitle}
          workoutTitle={savedTitle}
          elapsedSeconds={finishedElapsedSeconds}
          exercises={summaryExercises}
          setsByExercise={summarySets}
          exerciseHistory={summaryHistory}
          streak={summaryStreak}
          goal={summaryGoal}
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
        initialView="live"
        // The skip flow is the web's on EVERY live route (NP-288): a blank
        // set's button reads `Skip Set →` and opens the skip modal. This
        // route used to leave it off, so a quick session's primary button
        // silently logged a blank set and moved on — no modal, no swap
        // offer, nothing to undo.
        enableSkipFlow
        activeSeconds={activeSeconds}
        positionScope={quickScope(sessionId)}
        positionStore={
          positionStore !== undefined ? positionStore : resolvedStore
        }
        restoredGrid={restoredGrid}
        onGridChange={onGridChange}
        onFinish={handleFinish}
        onRequestSwap={onRequestSwap}
        jumpRequest={jumpRequest}
        finishing={finishing || promptFinishing}
        saveError={saveError}
        exerciseHistory={exerciseHistory}
        exerciseHints={quickHints}
        onDismissHint={(slug) => void dismissQuickHint(slug)}
        // The web's `✕`: a quick session returns to its (persisted)
        // overview rather than popping the stack, so closing live never
        // strands the member with no way back into the session.
        onExit={() =>
          router.replace(
            quickSessionOverviewHref(sessionId, {
              saved: true,
              started: true,
            }) as never,
          )
        }
        manageExercises={
          workout
            ? {
                onOpen: () => setShowExerciseList(true),
                label: `Exercises (${workout.exercises.length})`,
                // The web's `Add Exercise` pill on the live step (NP-288).
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
        grid={restoredGrid ?? {}}
        onJump={(exerciseIndex) => {
          setJumpRequest({ exerciseIndex, token: Date.now() });
          setShowExerciseList(false);
        }}
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
      <ExerciseSwapModal
        visible={swapSlug !== null}
        sourceName={swapSourceName}
        exerciseSlug={swapSlug ?? undefined}
        workoutExerciseSlugs={(workout?.exercises ?? [])
          .map((e) => e.slug)
          .filter(Boolean)}
        sessionScopeOnly
        onSwap={(candidate) => onSelectAlternative(candidate)}
        onClose={() => setSwapSlug(null)}
        testID="quick-live-swap"
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
          confirmLabel="Save name & finish"
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
