import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import {
  MeResponseSchema,
  StreakResponseSchema,
  ActiveProgramsApiResponseSchema,
  CurrentWorkoutResponseSchema,
} from "@become/api-client";
import {
  DashboardScreen,
  type TodayWorkoutSummary,
} from "@/components/DashboardScreen";
import type { CheckInPayload } from "@/components/CheckInModal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { localDateKey } from "@/lib/nutrition/localDay";
import { mirrorWeighInToHealth, weighInClientId } from "@/lib/health/sync";
import { useFetch } from "@/lib/hooks/useFetch";
import { getOfflineWrites } from "@/lib/offline/writes";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";

/**
 * Dashboard route — wires the first post-login screen to real data. Fetches the
 * user, streak, and active program in parallel; the active program's id then
 * drives a current-workout fetch for today's session. DashboardScreen stays
 * presentational and just receives the mapped props.
 */
export default function DashboardRoute() {
  const { token } = useAuth();
  const router = useRouter();
  const ready = !!token;
  const fetchOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !ready,
  };

  const me = useFetch("/api/auth/me", MeResponseSchema, fetchOpts);
  const streak = useFetch("/api/streak", StreakResponseSchema, fetchOpts);
  const active = useFetch(
    "/api/programs/active",
    ActiveProgramsApiResponseSchema,
    fetchOpts,
  );

  const activeProgram = active.data?.activePrograms?.[0] ?? null;
  const programId = activeProgram?.programId ?? null;

  const workout = useFetch(
    ready && programId
      ? `/api/programs/current-workout?programId=${encodeURIComponent(programId)}`
      : null,
    CurrentWorkoutResponseSchema,
    { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
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

  const initialLoading =
    ready && (me.loading || streak.loading || active.loading) && !me.data;

  const firstError = me.error ?? streak.error ?? active.error ?? workout.error;
  const errorText = firstError
    ? "Couldn't load your dashboard. Pull to refresh."
    : null;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        me.refetch(),
        streak.refetch(),
        active.refetch(),
        workout.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [me.refetch, streak.refetch, active.refetch, workout.refetch]);

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
            clientId: weighInClientId(localDateKey()),
          });
        }
      } finally {
        setSubmittingCheckIn(false);
      }
    },
    [streak.refetch],
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
      // Settings lives in the (app) group, so this gear is the way a member —
      // or an App Store reviewer looking for "Delete account" — can get to it.
      onOpenSettings={() => {
        router.push("/settings");
      }}
    />
  );
}
