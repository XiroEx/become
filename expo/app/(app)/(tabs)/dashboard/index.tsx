import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  MeResponseSchema,
  StreakResponseSchema,
  ActiveProgramsApiResponseSchema,
  CurrentWorkoutResponseSchema,
  classifyApiError,
  CheckInResponseSchema,
  CheckInActionResponseSchema,
  ProgressApiResponseSchema,
  StreaksResponseSchema,
  NutritionLogDayResponseSchema,
  NutritionSummaryResponseSchema,
  DashboardTilesResponseSchema,
  GoalProgressResponseSchema,
  MindSummaryResponseSchema,
  ScheduleApiResponseSchema,
  SuggestionDismissResponseSchema,
  ProgramNudgeResponseSchema,
  apiFetch,
  type ScheduledWorkout,
} from "@become/api-client";
import {
  DashboardScreen,
  type TodayWorkoutSummary,
} from "@/components/DashboardScreen";
import type { CheckInPayload, MoodLevel } from "@/components/CheckInModal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useLocalDay, useOnForeground, tzOffsetMinutes, withTz } from "@/lib/time/localDay";
import { mirrorWeighInToHealth, weighInClientId } from "@/lib/health/sync";
import { useFetch } from "@/lib/hooks/useFetch";
import { useUnits } from "@/lib/hooks/useUnits";
import type { WeightUnit } from "@become/core";
import { describeNutritionTrend } from "@/lib/dashboard/nutritionTrend";
import { getOfflineWrites } from "@/lib/offline/writes";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import {
  LayoutWireSchema,
  LAYOUT_CACHE_KEY,
} from "@/lib/dashboard/tileLayout";
import type {
  DashboardStatData,
  UpcomingWorkoutSummary,
} from "@/lib/dashboard/types";

/**
 * Dashboard route — wires the first post-login screen to real data. Fetches the
 * user, streak, and active program in parallel; the active program's id then
 * drives a current-workout fetch for today's session. DashboardScreen stays
 * presentational and just receives the mapped props.
 */
interface NutritionTotals {
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
}

export default function DashboardRoute() {
  const { token, user } = useAuth();
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
  const checkin = useFetch(
    ready ? `/api/checkin?tz=${tzOffsetMinutes()}` : null,
    CheckInResponseSchema,
    { ...fetchOpts, useCache: false },
  );
  const progress = useFetch(
    ready ? "/api/progress" : null,
    ProgressApiResponseSchema,
    fetchOpts,
  );
  const streaks = useFetch(
    ready ? withTz("/api/streaks") : null,
    StreaksResponseSchema,
    fetchOpts,
  );
  const nutrition = useFetch(
    ready ? withTz("/api/nutrition/log") : null,
    NutritionLogDayResponseSchema,
    fetchOpts,
  );
  const nutritionSummary = useFetch(
    ready ? withTz("/api/nutrition/summary?period=week") : null,
    NutritionSummaryResponseSchema,
    fetchOpts,
  );
  const tiles = useFetch(
    ready ? "/api/dashboard/tiles" : null,
    DashboardTilesResponseSchema,
    fetchOpts,
  );
  const goals = useFetch(
    ready ? "/api/goals" : null,
    GoalProgressResponseSchema,
    fetchOpts,
  );
  const mind = useFetch(
    ready ? "/api/mind/summary" : null,
    MindSummaryResponseSchema,
    fetchOpts,
  );
  const schedule = useFetch(
    ready ? "/api/schedule" : null,
    ScheduleApiResponseSchema,
    fetchOpts,
  );
  const programNudge = useFetch(
    ready ? "/api/program-nudge" : null,
    ProgramNudgeResponseSchema,
    { ...fetchOpts, useCache: false },
  );

  // ONE weight unit for the whole screen: the check-in and weigh-in writes
  // (NP-105) and the stat tiles (NP-210). The member's explicit profile setting
  // wins; otherwise the goal's unit from /api/progress or /api/goals; else lbs.
  const { weightUnit: hookWeightUnit } = useUnits();
  const profileWeightUnit = user?.profile?.weightUnit ?? hookWeightUnit;
  const weightUnit: WeightUnit =
    profileWeightUnit === "kg" || profileWeightUnit === "lbs"
      ? profileWeightUnit
      : ((progress.data?.goal?.weightUnit as WeightUnit | undefined) ??
        (goals.data?.nutrition?.unit as WeightUnit | undefined) ??
        hookWeightUnit ??
        "lbs");

  const activeProgram = active.data?.activePrograms?.[0] ?? null;
  const programId = activeProgram?.programId ?? null;

  const [nudgeOpen, setNudgeOpen] = useState(false);
  const nudgeShownRef = useRef(false);

  const onExploreNudge = useCallback(() => {
    setNudgeOpen(false);
    void apiFetch("/api/program-nudge", ProgramNudgeResponseSchema, {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      method: "POST",
      body: { action: "dismiss" },
    }).catch(() => {});
  }, [token]);

  const onFindProgram = useCallback(() => {
    setNudgeOpen(false);
    router.push("/(tabs)/programming");
    void apiFetch("/api/program-nudge", ProgramNudgeResponseSchema, {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      method: "POST",
      body: { action: "dismiss" },
    }).catch(() => {});
  }, [router, token]);

  const onDismissNudgeForever = useCallback(() => {
    setNudgeOpen(false);
    void apiFetch("/api/program-nudge", ProgramNudgeResponseSchema, {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      method: "POST",
      body: { action: "dismiss_forever" },
    }).catch(() => {});
  }, [token]);

  // Program nudge is due if member has no active program, the server reports
  // due: true, and it has not yet been shown this session.
  const isNudgeDue = ready && !activeProgram && !!programNudge.data?.due;

  useEffect(() => {
    if (isNudgeDue && !nudgeOpen && !nudgeShownRef.current) {
      nudgeShownRef.current = true;
      setNudgeOpen(true);
      void apiFetch("/api/program-nudge", ProgramNudgeResponseSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        method: "POST",
        body: { action: "shown" },
      }).catch(() => {});
    }
  }, [isNudgeDue, nudgeOpen, token]);

  const [checkInOpen, setCheckInOpen] = useState(false);
  const checkinShownRef = useRef(false);

  // The nudge opens before the check-in and never on top of it.
  useEffect(() => {
    const nudgeBusy =
      nudgeOpen ||
      (ready &&
        !activeProgram &&
        (programNudge.loading ||
          (!!programNudge.data?.due && !nudgeShownRef.current)));

    if (
      ready &&
      checkin.data?.due &&
      !checkInOpen &&
      !checkinShownRef.current &&
      !nudgeBusy
    ) {
      checkinShownRef.current = true;
      setCheckInOpen(true);
      void apiFetch("/api/checkin", CheckInActionResponseSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        method: "POST",
        body: { action: "shown", tz: tzOffsetMinutes() },
      }).catch(() => {});
    }
  }, [
    ready,
    checkin.data?.due,
    checkInOpen,
    nudgeOpen,
    activeProgram,
    programNudge.loading,
    programNudge.data?.due,
    token,
  ]);

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

  const onQuickAdd = useCallback(() => {
    router.push("/(tabs)/nutrition?quickAdd=true" as never);
  }, [router]);

  const onViewProgram = useCallback(
    (progId: string) => {
      router.push(`/(tabs)/programming/${progId}` as never);
    },
    [router],
  );

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
      active.refetch(),
      workout.refetch(),
      layout.refetch(),
      checkin.refetch(),
      progress.refetch(),
      streaks.refetch(),
      nutrition.refetch(),
      nutritionSummary.refetch(),
      tiles.refetch(),
      goals.refetch(),
      mind.refetch(),
      schedule.refetch(),
      programNudge.refetch(),
    ]);
  }, [
    active,
    checkin,
    goals,
    layout,
    me,
    mind,
    nutrition,
    nutritionSummary,
    programNudge,
    progress,
    schedule,
    streak,
    streaks,
    tiles,
    workout,
  ]);

  const onDismissSuggestion = useCallback(
    async (id: string) => {
      try {
        await apiFetch(
          "/api/suggestions/dismiss",
          SuggestionDismissResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            method: "POST",
            body: { id },
          },
        );
        await tiles.refetch();
      } catch (err) {
        console.error("Failed to dismiss suggestion:", err);
      }
    },
    [tiles, token],
  );

  const initialTodayRef = useRef(today);
  // Refetch when the local day rolls over
  useEffect(() => {
    if (initialTodayRef.current !== today) {
      initialTodayRef.current = today;
      void refetchAll();
    }
  }, [today, refetchAll]);

  // Refetch when returning to the foreground (NP-035)
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
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const onSubmitCheckIn = useCallback(
    async (payload: CheckInPayload) => {
      setSubmittingCheckIn(true);
      try {
        const writes = getOfflineWrites();
        let moodStatus: string | null = null;
        if (payload.mood) {
          moodStatus = await writes.logMood(payload.mood);
        }
        const weightVal = payload.weight ?? payload.weightLbs;
        let weightStatus: string | null = null;
        if (weightVal != null) {
          weightStatus = await writes.logWeight(weightVal);
          void mirrorWeighInToHealth({
            valueLbs: weightUnit === "kg" ? weightVal * 2.20462 : weightVal,
            atISO: new Date().toISOString(),
            clientId: weighInClientId(today),
          });
        }
        if (moodStatus === "sent" || weightStatus === "sent") {
          await streak.refetch();
          await checkin.refetch();
          await goals.refetch();
          // The mood and weight tiles (NP-210) read /api/progress.
          await progress.refetch();
        }
      } finally {
        setSubmittingCheckIn(false);
      }
    },
    [checkin, goals, progress, streak, today, weightUnit],
  );

  const onSkipCheckIn = useCallback(async () => {
    try {
      await apiFetch("/api/checkin", CheckInActionResponseSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        method: "POST",
        body: { action: "skip", tz: tzOffsetMinutes() },
      });
      await checkin.refetch();
    } catch {
      // fail soft
    }
  }, [checkin, token]);

  const onSubmitWeight = useCallback(
    async (weightVal: number) => {
      const writes = getOfflineWrites();
      const status = await writes.logWeight(weightVal);
      if (status === "sent") {
        await streak.refetch();
        await checkin.refetch();
        await goals.refetch();
        await progress.refetch();
      }
      void mirrorWeighInToHealth({
        valueLbs: weightUnit === "kg" ? weightVal * 2.20462 : weightVal,
        atISO: new Date().toISOString(),
        clientId: weighInClientId(today),
      });
    },
    [checkin, goals, progress, streak, today, weightUnit],
  );

  const onSubmitMood = useCallback(
    async (moodVal: MoodLevel) => {
      const writes = getOfflineWrites();
      const status = await writes.logMood(moodVal);
      if (status === "sent") {
        await streak.refetch();
        await checkin.refetch();
        await goals.refetch();
        await progress.refetch();
      }
    },
    [checkin, goals, progress, streak],
  );

  const targetWeight = goals.data?.nutrition?.target?.weight ?? null;
  const checkInInfo = {
    daysSinceMood: checkin.data?.daysSinceMood ?? 0,
    daysSinceWeight: checkin.data?.daysSinceWeight ?? 0,
    lastWeight: checkin.data?.lastWeight ?? null,
    targetWeight,
  };

  const streakDays =
    streaks.data?.overall?.current ??
    streak.data?.streakDays ??
    progress.data?.stats?.streakDays ??
    0;

  const longestStreak =
    streaks.data?.overall?.best ??
    progress.data?.longestStreak ??
    0;

  const nextMilestone = streaks.data?.overall?.nextMilestone ?? null;
  const activityToday = streaks.data?.overall?.activeToday ?? false;

  // Only today's mood counts (NP-211). When today is unset, web shows "Set"
  // rather than falling back to historical entries in progress.data.moodData.
  const todaysMood: MoodLevel | null =
    (checkin.data?.todaysMood as MoodLevel | null | undefined) ??
    (mind.data?.todayMood as MoodLevel | null | undefined) ??
    null;
  const recentMoods = progress.data?.moodData?.map((m) => m.value) ?? [];

  const thisWeekWorkouts =
    goals.data?.training?.thisWeek?.done ??
    progress.data?.stats?.thisWeekWorkouts ??
    0;
  const weeklyTarget =
    progress.data?.goal?.weeklyAvailability ??
    progress.data?.weeklyAvailability ??
    goals.data?.training?.target?.daysPerWeek ??
    null;

  const weightPoints = progress.data?.weightData ?? [];
  const latestWeight =
    weightPoints.length > 0
      ? (weightPoints[weightPoints.length - 1]?.value ?? null)
      : null;
  const earliestWeight =
    weightPoints.length > 0
      ? (weightPoints[0]?.value ?? null)
      : null;

  const fitnessGoal =
    user?.profile?.fitnessGoal ??
    me.data?.user?.profile?.fitnessGoal ??
    progress.data?.goal?.fitnessGoal ??
    null;
  const nutritionDirection =
    goals.data?.nutrition?.direction ??
    progress.data?.goal?.nutritionDirection ??
    null;
  const targetWeightKg =
    progress.data?.goal?.targetWeightKg ?? null;
  const startWeightKg =
    progress.data?.goal?.startWeightKg ?? null;
  const pace = progress.data?.goal?.pace
    ? {
        status: progress.data.goal.pace.status,
        eta: progress.data.goal.pace.eta,
        behindByKg: progress.data.goal.pace.behindByKg,
      }
    : null;
  const programProgress = progress.data?.currentProgram
    ? {
        name: progress.data.currentProgram.name,
        completedWorkouts:
          progress.data.currentProgram.completedWorkouts ?? null,
        totalWorkouts: progress.data.currentProgram.totalWorkouts ?? null,
        currentWeek: progress.data.currentProgram.currentWeek,
        totalWeeks: progress.data.currentProgram.totalWeeks,
        programId: progress.data.currentProgram.programId,
      }
    : null;

  const caloriesConsumed =
    nutrition.data?.dailyTotals?.calories ?? 0;
  const caloriesGoal = nutrition.data?.goals?.calories ?? 2000;
  const waterCurrent =
    typeof nutrition.data?.water === "object"
      ? nutrition.data.water?.current ?? 0
      : typeof nutrition.data?.water === "number"
        ? nutrition.data.water
        : 0;
  const waterGoal =
    typeof nutrition.data?.water === "object"
      ? nutrition.data.water?.goal ?? 64
      : 64;

  const totalWorkouts = progress.data?.stats?.totalWorkouts ?? 0;
  const weightEntries = progress.data?.weightData ?? [];

  const statData: DashboardStatData = {
    streakDays,
    longestStreak,
    nextMilestone,
    activityToday,
    streaksLite: streaks.data ?? null,
    todaysMood,
    recentMoods,
    thisWeekWorkouts,
    weeklyTarget,
    fitnessGoal,
    nutritionDirection,
    targetWeightKg,
    startWeightKg,
    latestWeight,
    earliestWeight,
    weightUnit,
    pace,
    programProgress,
    caloriesConsumed,
    caloriesGoal,
    waterCurrent,
    waterGoal,
    totalWorkouts,
    weightEntries,
  };

  const nutritionData = useMemo(() => {
    if (!nutrition.data) return null;
    const totals: NutritionTotals = nutrition.data.dailyTotals || {};
    const goalsData = nutrition.data.goals || {};
    const waterFallback =
      typeof nutrition.data.water === "object"
        ? nutrition.data.water?.goal ?? goalsData.waterGoal ?? 96
        : (goalsData.waterGoal ?? 96);
    return {
      calories: {
        consumed: totals.calories ?? caloriesConsumed,
        goal: goalsData.calories ?? caloriesGoal,
      },
      protein: {
        current: totals.protein ?? 0,
        goal: goalsData.protein ?? 150,
      },
      carbs: {
        current: totals.carbs ?? 0,
        goal: goalsData.carbs ?? 250,
      },
      fats: {
        current: totals.fats ?? 0,
        goal: goalsData.fats ?? 65,
      },
      water: {
        current: waterCurrent,
        goal: waterFallback,
      },
    };
  }, [nutrition.data, caloriesConsumed, caloriesGoal, waterCurrent]);

  const nutritionTrend = useMemo(() => {
    if (!nutritionSummary.data?.days) return null;
    return describeNutritionTrend(nutritionSummary.data.days, {
      calories: nutrition.data?.goals?.calories ?? 0,
      protein: nutrition.data?.goals?.protein ?? 0,
    });
  }, [nutritionSummary.data, nutrition.data]);

  const currentProgram = progress.data?.currentProgram ?? null;

  const upcomingWorkout: UpcomingWorkoutSummary | null = (() => {
    const schedules = schedule.data?.schedules ?? [];
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const tom = new Date(now);
    tom.setDate(tom.getDate() + 1);
    const tomorrowKey = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, "0")}-${String(tom.getDate()).padStart(2, "0")}`;

    let earliest: {
      workout: ScheduledWorkout;
      programName: string;
      programId: string;
    } | null = null;
    let earliestKey = "";

    for (const sched of schedules) {
      if (
        sched.programStatus !== "in-progress" &&
        sched.programStatus !== "active"
      ) {
        continue;
      }
      for (const w of sched.scheduledWorkouts) {
        const wKey =
          typeof w.date === "string"
            ? w.date.split("T")[0]
            : new Date(w.date).toISOString().split("T")[0];
        if (w.status === "scheduled" && wKey && wKey >= todayKey) {
          if (!earliest || wKey < earliestKey) {
            earliest = {
              workout: w,
              programName: sched.programName ?? "",
              programId: sched.programId ?? "",
            };
            earliestKey = wKey;
          }
        }
      }
    }

    if (!earliest) {
      if (todayWorkout && programId) {
        return {
          dateLabel: "Today",
          dayLabel: currentDayLabel || "",
          workoutTitle: todayWorkout.workoutTitle,
          programName: todayWorkout.programName,
          programId,
          workoutIndex,
          phase: workoutPhaseIndex + 1,
        };
      }
      return null;
    }

    let dateLabel = "";
    if (earliestKey === todayKey) dateLabel = "Today";
    else if (earliestKey === tomorrowKey) dateLabel = "Tomorrow";
    else {
      const parsedDate = new Date(`${earliestKey}T12:00:00`);
      dateLabel = parsedDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }

    return {
      dateLabel,
      dayLabel: earliest.workout.dayLabel || "",
      workoutTitle: earliest.workout.workoutTitle || "",
      programName: earliest.programName || "",
      programId: earliest.programId || "",
      date:
        typeof earliest.workout.date === "string"
          ? earliest.workout.date
          : new Date(earliest.workout.date).toISOString(),
    };
  })();

  return (
    <DashboardScreen
      userName={me.data?.user?.name ?? null}
      streakDays={streakDays}
      freezeAvailable={(streak.data?.streakFreezes ?? 0) > 0}
      todayWorkout={todayWorkout}
      onStartWorkout={onStartWorkout}
      onOpenCalendar={onOpenCalendar}
      loading={initialLoading}
      errorText={errorText}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onSubmitCheckIn={onSubmitCheckIn}
      onSkipCheckIn={onSkipCheckIn}
      submittingCheckIn={submittingCheckIn}
      checkInOpen={checkInOpen}
      onCheckInOpenChange={setCheckInOpen}
      nudgeOpen={nudgeOpen}
      onNudgeOpenChange={setNudgeOpen}
      priorShowings={programNudge.data?.showings ?? 0}
      onExploreNudge={onExploreNudge}
      onFindProgram={onFindProgram}
      onDismissNudgeForever={onDismissNudgeForever}
      checkInInfo={checkInInfo}
      weightUnit={weightUnit}
      onSubmitWeight={onSubmitWeight}
      onSubmitMood={onSubmitMood}
      layout={layout.data?.layout ?? null}
      statData={statData}
      tilesData={tiles.data ?? null}
      onDismissSuggestion={onDismissSuggestion}
      goals={goals.data ?? null}
      mind={mind.data ?? null}
      upcomingWorkout={upcomingWorkout}
      onOpenMind={onOpenMind}
      onOpenNutrition={onOpenNutrition}
      onOpenWorkoutNow={onOpenWorkoutNow}
      workoutNowOpen={workoutNowOpen}
      onWorkoutNowOpenChange={setWorkoutNowOpen}
      progressData={progress.data ?? null}
      fitnessGoal={fitnessGoal}
      targetWeight={targetWeight}
      onOpenCustomizeTiles={() => {
        // TODO: NP-157 owns native dashboard tile customizer
      }}
      onOpenSettings={() => {
        router.push("/settings");
      }}
      onOpenProfile={() => {
        router.push("/(tabs)/profile" as never);
      }}
      userIcon={typeof user?.profileIcon === "string" ? user.profileIcon : null}
      userAvatarUrl={typeof user?.avatarUrl === "string" ? user.avatarUrl : null}
      onOpenStreaks={() => {
        router.push("/(tabs)/dashboard/streaks" as never);
      }}
      nutritionData={nutritionData}
      nutritionTrend={nutritionTrend}
      onQuickAdd={onQuickAdd}
      currentProgram={currentProgram}
      onViewProgram={onViewProgram}
    />
  );
}
