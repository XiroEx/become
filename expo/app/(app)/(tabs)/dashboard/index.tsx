import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  MeResponseSchema,
  StreakResponseSchema,
  StreaksResponseSchema,
  ActiveProgramsApiResponseSchema,
  CurrentWorkoutResponseSchema,
  ProgressApiResponseSchema,
  NutritionLogDayResponseSchema,
  DashboardTilesResponseSchema,
  GoalProgressResponseSchema,
  MindSummaryResponseSchema,
  classifyApiError,
} from "@become/api-client";
import {
  DashboardScreen,
  type TodayWorkoutSummary,
} from "@/components/DashboardScreen";
import type { CheckInPayload } from "@/components/CheckInModal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useLocalDay, useOnForeground } from "@/lib/time/localDay";
import { mirrorWeighInToHealth, weighInClientId } from "@/lib/health/sync";
import { useFetch } from "@/lib/hooks/useFetch";
import { getOfflineWrites } from "@/lib/offline/writes";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import {
  LayoutWireSchema,
  LAYOUT_CACHE_KEY,
} from "@/lib/dashboard/tileLayout";
import type {
  DashboardTileContext,
  DashboardNutritionData,
  BecomingWidgetData,
  SuggestionItem,
} from "@/lib/dashboard/types";
import type { StreaksLite } from "@/lib/dashboard/streakTile";

/**
 * Dashboard route — wires the first post-login screen to real data. Fetches the
 * user, streak, and active program in parallel; the active program's id then
 * drives a current-workout fetch for today's session. DashboardScreen stays
 * presentational and just receives the mapped props.
 */
export default function DashboardRoute() {
  const { token } = useAuth();
  const router = useRouter();
  const { day: today } = useLocalDay();
  const ready = !!token;
  const fetchOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !ready,
    useCache: true,
  };

  const me = useFetch("/api/auth/me", MeResponseSchema, fetchOpts);
  const streak = useFetch("/api/streak", StreakResponseSchema, fetchOpts);
  const active = useFetch(
    "/api/programs/active",
    ActiveProgramsApiResponseSchema,
    fetchOpts,
  );
  const layout = useFetch(
    ready ? "/api/dashboard/layout" : null,
    LayoutWireSchema,
    {
      ...fetchOpts,
      cacheKey: LAYOUT_CACHE_KEY,
    },
  );
  const progress = useFetch(
    ready ? "/api/progress" : null,
    ProgressApiResponseSchema,
    {
      ...fetchOpts,
      cacheKey: "dashboard.progress",
    },
  );
  const streaks = useFetch(
    ready ? "/api/streaks" : null,
    StreaksResponseSchema,
    {
      ...fetchOpts,
      cacheKey: "dashboard.streaks",
    },
  );
  const nutritionLog = useFetch(
    ready ? "/api/nutrition/log" : null,
    NutritionLogDayResponseSchema,
    {
      ...fetchOpts,
      cacheKey: "dashboard.nutrition.log",
    },
  );
  const dashboardTiles = useFetch(
    ready ? "/api/dashboard/tiles" : null,
    DashboardTilesResponseSchema,
    {
      ...fetchOpts,
      cacheKey: "dashboard.tiles",
    },
  );
  const goals = useFetch(
    ready ? "/api/goals" : null,
    GoalProgressResponseSchema,
    {
      ...fetchOpts,
      cacheKey: "dashboard.goals",
    },
  );
  const mindSummary = useFetch(
    ready ? "/api/mind/summary" : null,
    MindSummaryResponseSchema,
    {
      ...fetchOpts,
      cacheKey: "dashboard.mind.summary",
    },
  );

  const activeProgram = active.data?.activePrograms?.[0] ?? null;
  const programId = activeProgram?.programId ?? null;

  const workout = useFetch(
    ready && programId
      ? `/api/programs/current-workout?programId=${encodeURIComponent(programId)}`
      : null,
    CurrentWorkoutResponseSchema,
    { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined, useCache: true },
  );

  const todayWorkout: TodayWorkoutSummary | null =
    activeProgram && workout.data
      ? {
          programName: activeProgram.programName,
          workoutTitle: workout.data.workout.title,
          phaseLabel:
            workout.data.phaseInfo?.name ??
            (workout.data.phase ? `Phase ${workout.data.phase}` : ""),
          exerciseCount: workout.data.workout.exercises.length,
        }
      : null;

  // WHERE "Start workout" GOES.
  //
  // The web's Continue link is
  // `/dashboard/workout/[programId]/workout?day=<day label>` — the session is
  // addressed by the DAY LABEL current-workout answers with. The native routes
  // address a workout by its index inside the phase, so the label is mapped to
  // an index exactly as the calendar's slots are, and `phase` (1-based on the
  // wire) becomes the 0-based `?phase=` the workout routes read. NP-078 is
  // what teaches the native routes about day labels; until then this mapping
  // is the one both screens use, so they cannot disagree.
  const currentDayLabel = workout.data?.day ?? workout.data?.workout?.day;
  const workoutPhaseIndex = Math.max(0, (workout.data?.phase ?? 1) - 1);
  const workoutIndex = workoutIndexFromDayLabel(currentDayLabel);

  const onStartWorkout = useCallback(() => {
    // No active program → no workout to open. The button is only rendered
    // alongside a `todayWorkout`, which needs both.
    if (!programId) return;
    router.push(
      `/(tabs)/programming/${programId}/workout/${workoutIndex}?phase=${workoutPhaseIndex}`,
    );
  }, [router, programId, workoutIndex, workoutPhaseIndex]);

  const onOpenCalendar = useCallback(() => {
    router.push("/(tabs)/calendar");
  }, [router]);

  const [workoutNowOpen, setWorkoutNowOpen] = useState(false);

  const onOpenMind = useCallback(() => {
    router.push("/(tabs)/mind?start=1" as never);
  }, [router]);

  const onOpenNutrition = useCallback(() => {
    router.push("/(tabs)/nutrition" as never);
  }, [router]);

  const onOpenWorkoutNow = useCallback(() => {
    setWorkoutNowOpen(true);
  }, []);

  const initialLoading =
    ready && (me.loading || streak.loading || active.loading) && !me.data;

  const firstError = me.error ?? streak.error ?? active.error ?? workout.error;
  const isOffline = firstError
    ? classifyApiError(firstError).kind === "offline"
    : false;
  const errorText = firstError
    ? isOffline && me.data
      ? "You're offline — showing last-known data."
      : "Couldn't load your dashboard. Pull to refresh."
    : null;

  const [refreshing, setRefreshing] = useState(false);
  const refetchAll = useCallback(() => {
    return Promise.all([
      me.refetch(),
      streak.refetch(),
      streaks.refetch(),
      progress.refetch(),
      nutritionLog.refetch(),
      dashboardTiles.refetch(),
      goals.refetch(),
      mindSummary.refetch(),
      active.refetch(),
      workout.refetch(),
      layout.refetch(),
    ]);
  }, [
    active,
    dashboardTiles,
    goals,
    layout,
    me,
    mindSummary,
    nutritionLog,
    progress,
    streak,
    streaks,
    workout,
  ]);

  const statContext = useMemo<DashboardTileContext>(() => {
    const rawProgress = progress.data;
    const rawStreaks = streaks.data;
    const rawNutrition = nutritionLog.data;
    const rawStreak = streak.data;

    const streaksLite: StreaksLite | null = rawStreaks
      ? {
          overall: rawStreaks.overall,
          pillars: rawStreaks.pillars,
        }
      : rawStreak
        ? {
            overall: {
              current: rawStreak.streakDays,
              best: rawStreak.longestStreak,
              nextMilestone: rawStreak.nextMilestone,
              activeToday: rawStreak.activityToday,
              freezes: rawStreak.streakFreezes,
            },
            pillars: {
              workout: {
                unit: "days",
                current: 0,
                best: 0,
                thisWeek: 0,
                target: null,
                remainingThisWeek: 0,
                weekLost: false,
              },
              nutrition: { current: 0, best: 0, activeToday: false },
              mindset: { current: 0, best: 0, activeToday: false },
              super: {
                current: 0,
                best: 0,
                activeToday: false,
                today: {
                  nutrition: false,
                  mindset: false,
                  trained: false,
                  restDay: false,
                  weekOnTrack: true,
                },
              },
            },
          }
        : null;

    const streakData = rawStreak
      ? {
          streakDays: rawStreak.streakDays,
          longestStreak: rawStreak.longestStreak,
          nextMilestone: rawStreak.nextMilestone,
          activityToday: rawStreak.activityToday,
          streakFreezes: rawStreak.streakFreezes,
        }
      : rawStreaks
        ? {
            streakDays: rawStreaks.overall.current,
            longestStreak: rawStreaks.overall.best,
            nextMilestone: rawStreaks.overall.nextMilestone,
            activityToday: rawStreaks.overall.activeToday,
            streakFreezes: rawStreaks.overall.freezes,
          }
        : null;

    const caloriesConsumed = rawNutrition?.dailyTotals?.calories ?? null;
    const caloriesGoal = rawNutrition?.goals?.calories ?? null;

    const nutritionData: DashboardNutritionData | null =
      caloriesGoal != null || caloriesConsumed != null
        ? {
            calories: {
              consumed: caloriesConsumed ?? 0,
              goal: caloriesGoal ?? 2000,
            },
            water: rawNutrition?.water
              ? {
                  consumed: rawNutrition.water.amount,
                  goal: rawNutrition.water.dailyGoal,
                }
              : null,
          }
        : null;

    const weightData = (rawProgress?.weightData ?? []).map((pt: { date: string; value: number }) => ({
      date: pt.date,
      value: pt.value,
    }));
    const bmiData = (rawProgress?.bmiData ?? []).map((pt: { date: string; value: number }) => ({
      date: pt.date,
      value: pt.value,
    }));
    const moodData = (rawProgress?.moodData ?? []).map((pt: { date: string; value: number }) => ({
      date: pt.date,
      value: pt.value,
    }));

    return {
      data: {
        weightData,
        bmiData,
        moodData,
        currentProgram: rawProgress?.currentProgram
          ? {
              programId: rawProgress.currentProgram.programId,
              name: rawProgress.currentProgram.name,
              currentPhase: rawProgress.currentProgram.currentPhase,
              currentWeek: rawProgress.currentProgram.currentWeek,
              totalWeeks: rawProgress.currentProgram.totalWeeks,
              completedWorkouts: rawProgress.currentProgram.completedWorkouts,
              totalWorkouts: rawProgress.currentProgram.totalWorkouts,
              nextWorkout: rawProgress.currentProgram.nextWorkout,
            }
          : null,
        stats: {
          totalWorkouts: rawProgress?.stats?.totalWorkouts ?? 0,
          thisWeekWorkouts: rawProgress?.stats?.thisWeekWorkouts ?? 0,
          longestStreak:
            rawProgress?.stats?.longestStreak ?? rawStreak?.longestStreak ?? 0,
        },
        goal: rawProgress?.goal
          ? {
              fitnessGoal: rawProgress.goal.fitnessGoal,
              nutritionDirection: rawProgress.goal.nutritionDirection,
              targetWeightKg: rawProgress.goal.targetWeightKg,
              startWeightKg: rawProgress.goal.startWeightKg,
              weightUnit: rawProgress.goal.weightUnit as "lbs" | "kg",
              pace: rawProgress.goal.pace
                ? {
                    status: rawProgress.goal.pace.status,
                    eta: rawProgress.goal.pace.eta,
                    behindByKg: rawProgress.goal.pace.behindByKg,
                  }
                : null,
              weeklyAvailability: rawProgress.goal.weeklyAvailability,
            }
          : null,
      },
      streakData,
      nutritionData,
      streaks: streaksLite,
      weeklyAvailability:
        rawProgress?.goal?.weeklyAvailability ??
        rawProgress?.weeklyAvailability ??
        3,
      weightUnit: (rawProgress?.goal?.weightUnit ?? "lbs") as "lbs" | "kg",
      todaysMood: null,
      onOpenCheckIn: () => {},
    };
  }, [progress.data, streaks.data, nutritionLog.data, streak.data]);

  const becoming = useMemo<BecomingWidgetData | null>(() => {
    const mind = mindSummary.data;
    const g = goals.data;
    const prog = progress.data;

    const mindLevel = mind?.level ?? 1;
    const mindChapter = mind?.chapter ?? 1;
    const mindChapterName = mind?.chapterName ?? null;

    let nutritionPace = "On pace";
    if (g?.nutrition?.pace?.status === "behind") {
      nutritionPace = "Behind pace";
    } else if (g?.nutrition?.pace?.status === "ahead") {
      nutritionPace = "Ahead";
    }

    const nutritionTargetWeight = g?.nutrition?.target?.weight ?? null;
    const nutritionUnit = g?.nutrition?.unit ?? "lbs";

    const trainingDone =
      g?.training?.thisWeek?.done ?? prog?.stats?.thisWeekWorkouts ?? 0;
    const trainingTarget =
      g?.training?.target?.daysPerWeek ??
      prog?.goal?.weeklyAvailability ??
      3;

    const averagePacePct =
      trainingTarget > 0
        ? Math.min(100, Math.round((trainingDone / trainingTarget) * 100))
        : 67;

    return {
      mindLevel,
      mindChapter,
      mindChapterName,
      nutritionPace,
      nutritionTargetWeight,
      nutritionUnit,
      trainingDone,
      trainingTarget,
      averagePacePct,
    };
  }, [mindSummary.data, goals.data, progress.data]);

  const suggestions: SuggestionItem[] = useMemo(() => {
    const rawSuggestions = dashboardTiles.data?.suggestions ?? [];
    return rawSuggestions.map((s: any) => ({
      id: s.id,
      severity: s.severity as "info" | "nudge" | "warning" | "celebration",
      title: s.title,
      body: s.body,
      primaryAction: s.primaryAction
        ? {
            label: s.primaryAction.label,
            href: s.primaryAction.href,
          }
        : undefined,
      dismissible: s.dismissible ?? true,
    }));
  }, [dashboardTiles.data]);

  const initialTodayRef = useRef(today);
  // Refetch when the local day rolls over
  useEffect(() => {
    if (initialTodayRef.current !== today) {
      initialTodayRef.current = today;
      void refetchAll();
    }
  }, [today, refetchAll]);

  // Refetch when returning to the foreground
  useOnForeground(() => {
    void refetchAll();
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setRefreshing(false);
    }
  }, [refetchAll]);

  // Daily check-in writes — mirrors the webapp DailyCheckInModal flow: log mood
  // (always) + weight (when provided), then refresh the streak so the new
  // activity is reflected immediately.
  //
  // BOTH GO THROUGH THE OFFLINE QUEUE (`lib/offline/writes.ts`). When there is
  // a connection that is a POST and nothing changes. When there is not, the
  // check-in is kept on the device WITH the local day it was made on and
  // replayed on reconnect, so a check-in made at 11:50pm in airplane mode does
  // not become tomorrow's when it is delivered at 12:05am. A queued write is
  // not an error: the banner at the root says what happened. A REFUSAL still
  // is, and CheckInModal shows it inline.
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const onSubmitCheckIn = useCallback(
    async (payload: CheckInPayload) => {
      setSubmittingCheckIn(true);
      try {
        const writes = getOfflineWrites();
        const moodStatus = await writes.logMood(payload.mood);
        const weightStatus =
          payload.weightLbs != null
            ? await writes.logWeight(payload.weightLbs)
            : null;
        // New activity the SERVER has → re-pull the streak. A queued write has
        // not earned a streak day yet; the replay's response will.
        if (moodStatus === "sent" || weightStatus === "sent") {
          await streak.refetch();
        }
        if (payload.weightLbs != null) {
          // BECOME → HEALTH. Mirrors the weigh-in into Apple Health / Health
          // Connect, and does nothing unless the member left that direction on
          // when the app opened (lib/health/sync.ts). Never awaited and never
          // throws: the check-in is kept either way, sent or queued.
          void mirrorWeighInToHealth({
            valueLbs: payload.weightLbs,
            atISO: new Date().toISOString(),
            clientId: weighInClientId(today),
          });
        }
      } finally {
        setSubmittingCheckIn(false);
      }
    },
    [streak, today],
  );

  return (
    <DashboardScreen
      userName={me.data?.user?.name ?? null}
      streakDays={streak.data?.streakDays ?? streaks.data?.overall?.current ?? 0}
      freezeAvailable={(streak.data?.streakFreezes ?? streaks.data?.overall?.freezes ?? 0) > 0}
      todayWorkout={todayWorkout}
      onStartWorkout={onStartWorkout}
      onOpenCalendar={onOpenCalendar}
      loading={initialLoading}
      errorText={errorText}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onSubmitCheckIn={onSubmitCheckIn}
      submittingCheckIn={submittingCheckIn}
      layout={layout.data?.layout ?? null}
      statContext={statContext}
      suggestions={suggestions}
      becoming={becoming}
      onOpenBecoming={() => {
        router.push("/(tabs)/mind" as never);
      }}
      onOpenMind={onOpenMind}
      onOpenNutrition={onOpenNutrition}
      onOpenWorkoutNow={onOpenWorkoutNow}
      workoutNowOpen={workoutNowOpen}
      onWorkoutNowOpenChange={setWorkoutNowOpen}
      // Settings lives in the (app) group, so this gear is the way a member —
      // or an App Store reviewer looking for "Delete account" — can get to it.
      onOpenSettings={() => {
        router.push("/settings");
      }}
    />
  );
}
