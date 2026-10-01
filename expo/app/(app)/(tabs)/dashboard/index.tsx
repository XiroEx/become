import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  MeResponseSchema,
  StreakResponseSchema,
  ActiveProgramsApiResponseSchema,
  CurrentWorkoutResponseSchema,
  classifyApiError,
  CheckInResponseSchema,
  CheckInActionResponseSchema,
  GoalProgressResponseSchema,
  apiFetch,
} from "@become/api-client";
import {
  DashboardScreen,
  type TodayWorkoutSummary,
} from "@/components/DashboardScreen";
import type { CheckInPayload } from "@/components/CheckInModal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useLocalDay, useOnForeground, tzOffsetMinutes } from "@/lib/time/localDay";
import { mirrorWeighInToHealth, weighInClientId } from "@/lib/health/sync";
import { useFetch } from "@/lib/hooks/useFetch";
import { useUnits } from "@/lib/hooks/useUnits";
import { getOfflineWrites } from "@/lib/offline/writes";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import {
  LayoutWireSchema,
  LAYOUT_CACHE_KEY,
} from "@/lib/dashboard/tileLayout";

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
  const { unit: weightUnit } = useUnits();
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
  const goals = useFetch(
    ready ? "/api/goals" : null,
    GoalProgressResponseSchema,
    fetchOpts,
  );

  const [checkInOpen, setCheckInOpen] = useState(false);
  const checkinShownRef = useRef(false);

  useEffect(() => {
    if (ready && checkin.data?.due && !checkInOpen && !checkinShownRef.current) {
      checkinShownRef.current = true;
      setCheckInOpen(true);
      void apiFetch("/api/checkin", CheckInActionResponseSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        method: "POST",
        body: { action: "shown", tz: tzOffsetMinutes() },
      }).catch(() => {});
    }
  }, [ready, checkin.data?.due, checkInOpen, token]);

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
      active.refetch(),
      workout.refetch(),
      layout.refetch(),
      checkin.refetch(),
      goals.refetch(),
    ]);
  }, [active, checkin, goals, layout, me, streak, workout]);

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
    void checkin.refetch();
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
        }
      } finally {
        setSubmittingCheckIn(false);
      }
    },
    [checkin, goals, streak, today, weightUnit],
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
      }
      void mirrorWeighInToHealth({
        valueLbs: weightUnit === "kg" ? weightVal * 2.20462 : weightVal,
        atISO: new Date().toISOString(),
        clientId: weighInClientId(today),
      });
    },
    [checkin, goals, streak, today, weightUnit],
  );

  const targetWeight = goals.data?.nutrition?.target?.weight ?? null;
  const checkInInfo = {
    daysSinceMood: checkin.data?.daysSinceMood ?? 0,
    daysSinceWeight: checkin.data?.daysSinceWeight ?? 0,
    lastWeight: checkin.data?.lastWeight ?? null,
    targetWeight,
  };

  return (
    <DashboardScreen
      userName={me.data?.user?.name ?? null}
      streakDays={streak.data?.streakDays ?? 0}
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
      checkInInfo={checkInInfo}
      weightUnit={weightUnit}
      onSubmitWeight={onSubmitWeight}
      layout={layout.data?.layout ?? null}
      onOpenMind={onOpenMind}
      onOpenNutrition={onOpenNutrition}
      onOpenWorkoutNow={onOpenWorkoutNow}
      workoutNowOpen={workoutNowOpen}
      onWorkoutNowOpenChange={setWorkoutNowOpen}
      onOpenSettings={() => {
        router.push("/settings");
      }}
    />
  );
}
