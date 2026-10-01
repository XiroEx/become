import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { z } from "zod";
import {
  MeResponseSchema,
  StreakResponseSchema,
  ActiveProgramsApiResponseSchema,
  CurrentWorkoutResponseSchema,
  GoalProgressResponseSchema,
  CheckInActionResponseSchema,
  apiFetch,
  classifyApiError,
} from "@become/api-client";
import {
  DashboardScreen,
  type TodayWorkoutSummary,
} from "@/components/DashboardScreen";
import type { CheckInPayload } from "@/components/CheckInModal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useUnits } from "@/lib/hooks/useUnits";
import { useLocalDay, useOnForeground } from "@/lib/time/localDay";
import { mirrorWeighInToHealth, weighInClientId } from "@/lib/health/sync";
import { useFetch } from "@/lib/hooks/useFetch";
import { getOfflineWrites } from "@/lib/offline/writes";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import {
  LayoutWireSchema,
  LAYOUT_CACHE_KEY,
} from "@/lib/dashboard/tileLayout";

export const CheckInStatusSchema = z
  .object({
    due: z.boolean(),
    reason: z.string().optional(),
    complete: z.boolean().optional(),
    moodLoggedToday: z.boolean().optional(),
    weightLoggedToday: z.boolean().optional(),
    skippedToday: z.boolean().optional(),
    daysSinceMood: z.number().optional().nullable(),
    daysSinceWeight: z.number().optional().nullable(),
    todaysMood: z.number().optional().nullable(),
    lastWeight: z.number().optional().nullable(),
  })
  .passthrough();

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

  const { unit } = useUnits();
  const tz = new Date().getTimezoneOffset();

  const checkIn = useFetch(
    ready ? `/api/checkin?tz=${tz}` : null,
    CheckInStatusSchema,
    fetchOpts,
  );

  const goals = useFetch(
    ready ? `/api/goals?tz=${tz}` : null,
    GoalProgressResponseSchema,
    fetchOpts,
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
      active.refetch(),
      workout.refetch(),
      layout.refetch(),
      checkIn.refetch(),
      goals.refetch(),
    ]);
  }, [active, checkIn, goals, layout, me, streak, workout]);

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
  const [checkInOpen, setCheckInOpen] = useState(false);
  const shownStampedRef = useRef(false);

  useEffect(() => {
    if (checkIn.data?.due && !shownStampedRef.current) {
      shownStampedRef.current = true;
      setCheckInOpen(true);
      void apiFetch("/api/checkin", CheckInActionResponseSchema, {
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { action: "shown", tz: new Date().getTimezoneOffset() },
      }).catch(() => {});
    }
  }, [checkIn.data?.due, token]);

  const onSkipCheckIn = useCallback(async () => {
    setSubmittingCheckIn(true);
    try {
      await apiFetch("/api/checkin", CheckInActionResponseSchema, {
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { action: "skip", tz: new Date().getTimezoneOffset() },
      });
      await checkIn.refetch();
    } finally {
      setSubmittingCheckIn(false);
    }
  }, [checkIn, token]);

  const onSubmitWeight = useCallback(
    async (weightVal: number) => {
      const writes = getOfflineWrites();
      const status = await writes.logWeight(weightVal);
      if (status === "sent") {
        await Promise.all([streak.refetch(), checkIn.refetch()]);
      }
      void mirrorWeighInToHealth({
        valueLbs: unit === "kg" ? weightVal * 2.20462 : weightVal,
        atISO: new Date().toISOString(),
        clientId: weighInClientId(today),
      });
    },
    [checkIn, streak, today, unit],
  );

  const onSubmitCheckIn = useCallback(
    async (payload: CheckInPayload) => {
      setSubmittingCheckIn(true);
      try {
        const writes = getOfflineWrites();
        let moodStatus: string | null = null;
        let weightStatus: string | null = null;
        if (payload.mood != null) {
          moodStatus = await writes.logMood(payload.mood);
        }
        const weightVal = payload.weight ?? payload.weightLbs;
        if (weightVal != null && weightVal > 0) {
          weightStatus = await writes.logWeight(weightVal);
        }
        // New activity the SERVER has → re-pull the streak. A queued write has
        // not earned a streak day yet; the replay's response will.
        if (moodStatus === "sent" || weightStatus === "sent") {
          await Promise.all([streak.refetch(), checkIn.refetch()]);
        }
        if (weightVal != null && weightVal > 0) {
          // BECOME → HEALTH. Mirrors the weigh-in into Apple Health / Health
          // Connect, and does nothing unless the member left that direction on
          // when the app opened (lib/health/sync.ts). Never awaited and never
          // throws: the check-in is kept either way, sent or queued.
          void mirrorWeighInToHealth({
            valueLbs: unit === "kg" ? weightVal * 2.20462 : weightVal,
            atISO: new Date().toISOString(),
            clientId: weighInClientId(today),
          });
        }
      } finally {
        setSubmittingCheckIn(false);
      }
    },
    [checkIn, streak, today, unit],
  );

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
      submittingCheckIn={submittingCheckIn}
      checkInOpen={checkInOpen}
      onCheckInOpenChange={setCheckInOpen}
      onSkipCheckIn={onSkipCheckIn}
      onSubmitWeight={onSubmitWeight}
      lastWeight={checkIn.data?.lastWeight ?? null}
      targetWeight={goals.data?.nutrition?.target?.weight ?? null}
      unit={unit}
      daysSinceMood={checkIn.data?.daysSinceMood ?? undefined}
      daysSinceWeight={checkIn.data?.daysSinceWeight ?? undefined}
      layout={
        Array.isArray(layout.data)
          ? layout.data
          : (layout.data?.layout ?? null)
      }
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
