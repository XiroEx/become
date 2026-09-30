import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProgramDetailResponseSchema,
  ActiveProgramsApiResponseSchema,
  ProgramWorkoutLogsResponseSchema,
  WorkoutResumeResponseSchema,
  ProgramStartDateResponseSchema,
  ProgramAbandonResponseSchema,
  SavedProgramsResponseSchema,
  SaveToggleResponseSchema,
  ScheduleApiResponseSchema,
  type ProgramAbandonRequest,
  type ProgramAbandonResponse,
  type ProgramStartDateRequest,
  type ProgramStartDateResponse,
  type SaveProgramRequest,
  type SaveToggleResponse,
} from "@become/api-client";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import { EnrollmentModal } from "@/components/programs/EnrollmentModal";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useMutation } from "@/lib/hooks/useMutation";
import { toProgramDetailViewModel } from "@/lib/programs/programDetail";
import { enrollProgram, suggestStartDate } from "@/lib/programs/enrollment";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import { localDateKey, withTz } from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/** Local YYYY-MM-DD for the start-date mutation default. */
function todayIso(): string {
  return localDateKey();
}

export default function ProgramDetailRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  const { data, error } = useFetch(
    id ? `/api/programs/${encodeURIComponent(id)}` : null,
    ProgramDetailResponseSchema,
    fetchOpts,
  );

  // Active-programs read kept here so the enroll/start-date/abandon mutations
  // can re-pull it on success (no shared query cache yet).
  const active = useFetch(
    "/api/programs/active",
    ActiveProgramsApiResponseSchema,
    { ...fetchOpts, skip: !token },
  );

  const schedulesFetch = useFetch(
    token ? withTz("/api/schedule?view=all") : null,
    ScheduleApiResponseSchema,
    { ...fetchOpts, skip: !token },
  );

  const suggestedStartDate = useMemo(() => {
    return suggestStartDate(schedulesFetch.data?.schedules);
  }, [schedulesFetch.data?.schedules]);

  const [showEnrollModal, setShowEnrollModal] = useState(false);

  const activeProgram = useMemo(() => {
    return (
      active.data?.activePrograms?.find((p) => p.programId === id) ?? null
    );
  }, [active.data?.activePrograms, id]);

  const isEnrolled = Boolean(
    activeProgram && activeProgram.status !== "completed",
  );

  // Fetch completed workout logs for this program (completed: true only)
  const logs = useFetch(
    id && isEnrolled
      ? `/api/workouts/logs?programId=${encodeURIComponent(id)}`
      : null,
    ProgramWorkoutLogsResponseSchema,
    { ...fetchOpts, skip: !token || !isEnrolled },
  );

  const completedDays = useMemo(() => {
    const set = new Set<string>();
    const logsList = logs.data?.logs;
    if (Array.isArray(logsList)) {
      for (const log of logsList) {
        if (log.completed && log.day) {
          set.add(log.day);
        }
      }
    }
    return set;
  }, [logs.data?.logs]);

  // Check for in-progress workout using actual current day & device timezone
  const currentDay = activeProgram?.currentDay || "Day 1";
  const tz = new Date().getTimezoneOffset();

  const progress = useFetch(
    id && isEnrolled
      ? `/api/workouts?programId=${encodeURIComponent(id)}&day=${encodeURIComponent(currentDay)}&tz=${tz}`
      : null,
    WorkoutResumeResponseSchema,
    { ...fetchOpts, skip: !token || !isEnrolled },
  );

  const hasInProgressWorkout = Boolean(
    progress.data?.isResume ||
      (progress.data === null && activeProgram?.status === "in-progress"),
  );

  const saved = useFetch(
    "/api/programs/saved",
    SavedProgramsResponseSchema,
    { ...fetchOpts, skip: !token },
  );

  const [optimisticSaved, setOptimisticSaved] = useState<boolean | null>(null);

  const isSaved =
    optimisticSaved !== null
      ? optimisticSaved
      : Boolean(
          saved.data?.savedPrograms?.some(
            (p) => (p.program_id ?? p._id) === id,
          ),
        );

  const mutOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    onSuccess: () => {
      void active.refetch();
    },
  };


  const startDateMut = useMutation<
    ProgramStartDateRequest,
    ProgramStartDateResponse
  >("/api/programs/start-date", ProgramStartDateResponseSchema, {
    method: "PUT",
    ...mutOpts,
  });
  const abandonMut = useMutation<ProgramAbandonRequest, ProgramAbandonResponse>(
    "/api/programs/abandon",
    ProgramAbandonResponseSchema,
    { method: "POST", ...mutOpts },
  );

  const saveMut = useMutation<SaveProgramRequest, SaveToggleResponse>(
    "/api/programs/saved",
    SaveToggleResponseSchema,
    {
      method: "POST",
      ...mutOpts,
      onSuccess: () => {
        void saved.refetch();
      },
    },
  );
  const unsaveMut = useMutation<SaveProgramRequest, SaveToggleResponse>(
    "/api/programs/saved",
    SaveToggleResponseSchema,
    {
      method: "DELETE",
      ...mutOpts,
      onSuccess: () => {
        void saved.refetch();
      },
    },
  );

  const [actionPending, setActionPending] = useState(false);
  const runAction = useCallback(async (fn: () => Promise<unknown>) => {
    setActionPending(true);
    try {
      await fn();
    } catch {
      // Surface nothing for now; the action buttons re-enable below.
    } finally {
      setActionPending(false);
    }
  }, []);

  const onEnroll = useCallback(() => {
    setShowEnrollModal(true);
  }, []);

  const onConfirmEnroll = useCallback(
    async (startDate: string) => {
      setActionPending(true);
      try {
        await enrollProgram(fetchOpts, { programId: id, startDate });
        setShowEnrollModal(false);
        await active.refetch();
        router.push(`/(tabs)/programming/${encodeURIComponent(id)}/schedule`);
      } catch {
        // Surface nothing for now; the action buttons re-enable below.
      } finally {
        setActionPending(false);
      }
    },
    [fetchOpts, id, active, router],
  );
  const onSetStartDate = useCallback(
    () =>
      runAction(() =>
        startDateMut.mutate({ programId: id, startDate: todayIso() }),
      ),
    [runAction, startDateMut, id],
  );
  const onAbandon = useCallback(
    () => runAction(() => abandonMut.mutate({ programId: id })),
    [runAction, abandonMut, id],
  );

  const onToggleSave = useCallback(async () => {
    const nextSaved = !isSaved;
    setOptimisticSaved(nextSaved);
    try {
      if (nextSaved) {
        await saveMut.mutate({ programId: id });
      } else {
        await unsaveMut.mutate({ programId: id });
      }
    } catch {
      setOptimisticSaved(!nextSaved);
      await saved.refetch();
    }
  }, [isSaved, id, saveMut, unsaveMut, saved]);

  const program: ProgramDetailViewModel = useMemo(() => {
    return data
      ? toProgramDetailViewModel(data)
      : { id, name: "Loading…", description: "", phases: [] };
  }, [data, id]);

  // Derive phase and day tab defaults
  const defaultPhaseIndex = useMemo(() => {
    if (isEnrolled && activeProgram?.currentPhase) {
      return Math.max(0, activeProgram.currentPhase - 1);
    }
    return 0;
  }, [isEnrolled, activeProgram]);

  const defaultDayKey = useMemo(() => {
    const targetPhase = program.phases[defaultPhaseIndex] || program.phases[0];
    const workouts = targetPhase?.workouts || [];
    if (isEnrolled) {
      // Find first incomplete day in active phase
      const firstIncomplete = workouts.find((w) => {
        const d = w.day ?? `Day ${w.workoutIndex + 1}`;
        return !completedDays.has(d);
      });
      if (firstIncomplete) {
        return firstIncomplete.day ?? `Day ${firstIncomplete.workoutIndex + 1}`;
      }
      if (activeProgram?.currentDay) {
        return activeProgram.currentDay;
      }
    }
    return workouts[0]?.day ?? (workouts[0] ? `Day ${workouts[0].workoutIndex + 1}` : "Day 1");
  }, [isEnrolled, defaultPhaseIndex, program.phases, completedDays, activeProgram]);

  const [userSelectedPhase, setUserSelectedPhase] = useState<number | null>(null);
  const [userSelectedDay, setUserSelectedDay] = useState<string | null>(null);

  const selectedPhaseIndex = userSelectedPhase ?? defaultPhaseIndex;
  const selectedDayKey = userSelectedDay ?? defaultDayKey;

  const onPhaseSelect = useCallback(
    (phaseIndex: number) => {
      setUserSelectedPhase(phaseIndex);
      const newPhaseWorkouts = program.phases[phaseIndex]?.workouts || [];
      const hasCurrentDay = newPhaseWorkouts.some(
        (w) => (w.day ?? `Day ${w.workoutIndex + 1}`) === selectedDayKey,
      );
      if (!hasCurrentDay && newPhaseWorkouts.length > 0) {
        setUserSelectedDay(
          newPhaseWorkouts[0]!.day ?? `Day ${newPhaseWorkouts[0]!.workoutIndex + 1}`,
        );
      }
    },
    [program.phases, selectedDayKey],
  );

  const onDaySelect = useCallback((dayKey: string) => {
    setUserSelectedDay(dayKey);
  }, []);

  // Continue training on scheduled next day (opens Track/Workout overview)
  const onContinue = useCallback(() => {
    const phaseIndex = Math.max(0, (activeProgram?.currentPhase ?? 1) - 1);
    const dayLabel = activeProgram?.currentDay;
    const phaseWorkouts = program.phases[phaseIndex]?.workouts || [];
    let workoutIndex = -1;
    if (dayLabel) {
      workoutIndex = phaseWorkouts.findIndex(
        (w) => (w.day ?? `Day ${w.workoutIndex + 1}`) === dayLabel,
      );
    }
    if (workoutIndex < 0) {
      workoutIndex = workoutIndexFromDayLabel(dayLabel ?? undefined);
    }
    if (workoutIndex < 0 || workoutIndex >= phaseWorkouts.length) {
      workoutIndex = 0;
    }
    router.push(
      `/(tabs)/programming/${encodeURIComponent(id)}/workout/${workoutIndex}?phase=${phaseIndex}`,
    );
  }, [router, id, activeProgram?.currentPhase, activeProgram?.currentDay, program.phases]);

  // Live workout launchers
  const onStartLive = useCallback(
    (phaseIdx?: number, workoutIdx?: number, dayLabel?: string) => {
      const pIdx = phaseIdx ?? selectedPhaseIndex;
      const dLabel = dayLabel ?? selectedDayKey;
      const phaseWorkouts = program.phases[pIdx]?.workouts || [];
      let wIdx = workoutIdx;
      if (wIdx === undefined || wIdx < 0) {
        wIdx = phaseWorkouts.findIndex(
          (w) => (w.day ?? `Day ${w.workoutIndex + 1}`) === dLabel,
        );
        if (wIdx < 0) wIdx = 0;
      }
      const dayParam = dLabel ? `&day=${encodeURIComponent(dLabel)}` : "";
      router.push(
        `/(tabs)/programming/${encodeURIComponent(id)}/workout/${wIdx}/live?phase=${pIdx}${dayParam}`,
      );
    },
    [router, id, selectedPhaseIndex, selectedDayKey, program.phases],
  );

  const onResumeLive = useCallback(() => {
    const resumePhase = Math.max(0, (activeProgram?.currentPhase ?? 1) - 1);
    const resumeDay = activeProgram?.currentDay;
    const phaseWorkouts = program.phases[resumePhase]?.workouts || [];
    let resumeIdx = -1;
    if (resumeDay) {
      resumeIdx = phaseWorkouts.findIndex(
        (w) => (w.day ?? `Day ${w.workoutIndex + 1}`) === resumeDay,
      );
    }
    if (resumeIdx < 0) {
      resumeIdx = workoutIndexFromDayLabel(resumeDay ?? undefined);
    }
    if (resumeIdx < 0 || resumeIdx >= phaseWorkouts.length) {
      resumeIdx = 0;
    }
    const dayParam = resumeDay ? `&day=${encodeURIComponent(resumeDay)}` : "";
    router.push(
      `/(tabs)/programming/${encodeURIComponent(id)}/workout/${resumeIdx}/live?phase=${resumePhase}${dayParam}`,
    );
  }, [router, id, activeProgram?.currentPhase, activeProgram?.currentDay, program.phases]);

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing program id</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-detail-route"
    >
      {error ? (
        <View style={{ padding: 16 }}>
          <Text testID="programming-detail-error" className="text-destructive">
            Couldn&apos;t load this program.
          </Text>
        </View>
      ) : null}
      <ProgramDetail
        program={program}
        isEnrolled={isEnrolled}
        activeProgram={activeProgram}
        completedDays={completedDays}
        hasInProgressWorkout={hasInProgressWorkout}
        selectedPhaseIndex={selectedPhaseIndex}
        onPhaseSelect={onPhaseSelect}
        selectedDayKey={selectedDayKey}
        onDaySelect={onDaySelect}
        onEnroll={onEnroll}
        onContinue={onContinue}
        onStartLive={onStartLive}
        onResumeLive={onResumeLive}
        onSetStartDate={onSetStartDate}
        onAbandon={onAbandon}
        isSaved={isSaved}
        onToggleSave={onToggleSave}
        actionPending={actionPending}
      />
      <EnrollmentModal
        key={suggestedStartDate}
        visible={showEnrollModal}
        programName={program.name}
        durationWeeks={data?.duration_weeks ?? 4}
        initialDate={suggestedStartDate}
        onConfirm={onConfirmEnroll}
        onClose={() => setShowEnrollModal(false)}
        loading={actionPending}
        testID="enroll-modal"
      />
    </SafeAreaView>
  );
}
