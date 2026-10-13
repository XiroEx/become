import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Pause, Play, Zap } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import {
  apiFetch,
  ActiveProgramsApiResponseSchema,
  type ActiveProgramSummary,
  type ActiveProgramsApiResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import { formatStartLabel } from "@/lib/workout/formatStartLabel";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { subscribeProgramUpdates } from "@/lib/programs/programEvents";
import { useScreenFocus } from "@/lib/navigation/useScreenFocus";

export interface ContinueTrainingSectionProps {
  className?: string;
  initialPrograms?: ActiveProgramSummary[] | null;
  testID?: string;
  onWorkoutNow?: () => void;
}

export function ContinueTrainingSection({
  className = "",
  initialPrograms,
  testID = "continue-training-section",
  onWorkoutNow,
}: ContinueTrainingSectionProps) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  const [programs, setPrograms] = useState<ActiveProgramSummary[] | null>(
    initialPrograms ?? null,
  );
  const [loading, setLoading] = useState(initialPrograms === undefined);

  const fetchActive = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = (await apiFetch(
        "/api/programs/active",
        ActiveProgramsApiResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      )) as ActiveProgramsApiResponse;
      setPrograms(res.activePrograms ?? []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (initialPrograms !== undefined) return;
    // Sync with external system: fetch active programs on mount or auth change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchActive();
  }, [initialPrograms, fetchActive]);

  useEffect(() => {
    if (initialPrograms !== undefined) return;
    return subscribeProgramUpdates(() => {
      void fetchActive();
    });
  }, [initialPrograms, fetchActive]);

  useScreenFocus(
    useCallback(() => {
      if (initialPrograms === undefined) {
        void fetchActive();
      }
    }, [initialPrograms, fetchActive]),
  );

  const handleWorkoutNow = () => {
    if (onWorkoutNow) {
      onWorkoutNow();
    } else {
      // Default: routes to quick workout session or Workout Now
      router.push("/(tabs)/programming?quick=true");
    }
  };

  const handleOpenProgram = (program: ActiveProgramSummary) => {
    const isPaused = program.status === "paused";
    if (isPaused) {
      router.push(`/(tabs)/programming/${program.programId}`);
    } else {
      // Continue opens the TRACK view (NP-087): every set of the next day on
      // one screen, the way `/dashboard/workout/{id}/workout?day=…` does on
      // the web, with Live a tap away on the toggle.
      const phaseIndex = Math.max(0, (program.currentPhase ?? 1) - 1);
      const workoutIndex = workoutIndexFromDayLabel(
        program.currentDay ?? undefined,
      );
      const currentDay = program.currentDay || "Day 1";
      const dayParam = `&day=${encodeURIComponent(currentDay)}`;
      router.push(
        `/(tabs)/programming/${program.programId}/workout/${workoutIndex}/live?phase=${phaseIndex}${dayParam}`,
      );
    }
  };

  if (loading && !programs) {
    // `key="loading"` (distinct from the empty/loaded branches below) so
    // React unmounts this View instead of patching props onto it when the
    // branch changes: on Android, reusing the host node left the
    // `animate-pulse` branch's animated width/height/background styles
    // attached to the real header row and program-card container (the "..."
    // heading, the misplaced pill and the grey block under the card).
    return (
      <View key="loading" testID={`${testID}-loading`} className="mb-4">
        <View className="h-6 w-36 rounded bg-muted animate-pulse mb-3" />
        <View className="h-28 rounded-2xl bg-muted animate-pulse" />
      </View>
    );
  }

  const activeList = programs ?? [];

  if (activeList.length === 0) {
    return (
      <View key="empty" testID={`${testID}-empty`} className="mb-4">
        <Card>
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-foreground text-base font-semibold">
                Not on a program?
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                Just train — log a one-off session.
              </Text>
            </View>
            <Pressable
              testID="workout-now-button"
              accessibilityRole="button"
              accessibilityLabel="Workout Now"
              onPress={handleWorkoutNow}
              className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-full bg-emerald-600"
            >
              <Zap size={14} color={colors["primary-foreground"]} fill={colors["primary-foreground"]} />
              <Text className="text-white text-xs font-bold">Workout Now</Text>
            </Pressable>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View key="loaded" testID={testID} className={`mb-4 ${className}`}>
      {/* Section Header — title gets flex-1 + numberOfLines so a long heading
          (or a narrow phone) never overlaps the pill the way an un-flexed
          Text (React Native's default flexShrink: 0) used to: the pill
          stays pinned right and the title truncates itself instead. */}
      <View className="flex-row items-center justify-between gap-3 mb-3">
        <Text
          className="text-foreground text-lg font-bold flex-1"
          numberOfLines={1}
        >
          Continue Training
        </Text>
        <Pressable
          testID="workout-now-button"
          accessibilityRole="button"
          accessibilityLabel="Workout Now"
          onPress={handleWorkoutNow}
          className="flex-row items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600 shrink-0"
        >
          <Zap size={14} color={colors["primary-foreground"]} fill={colors["primary-foreground"]} />
          <Text className="text-white text-xs font-bold">Workout Now</Text>
        </Pressable>
      </View>

      {/* Program Cards */}
      <View className="gap-3">
        {activeList.map((program) => {
          const isPaused = program.status === "paused";
          const { label: startLabel, isFuture } = formatStartLabel(
            program.startDate,
          );
          const progress = Math.min(
            100,
            Math.max(0, Math.round(program.progress ?? 0)),
          );

          // Left accent stripe — mirrors the web's Card `accent` prop
          // (success/info/warning), an 8px bar clipped to the card's
          // rounded corners via the parent's `overflow-hidden`.
          const accentClass = isPaused
            ? "bg-amber-500"
            : isFuture
              ? "bg-blue-500"
              : "bg-emerald-500";

          return (
            <Pressable
              key={program.programId}
              testID={`continue-program-card-${program.programId}`}
              accessibilityRole="button"
              accessibilityLabel={`Continue ${program.programName}, ${
                isPaused ? "Paused" : `${progress}% complete`
              }`}
              onPress={() => handleOpenProgram(program)}
              className="relative overflow-hidden bg-card border border-border rounded-2xl p-4 pl-5 active:opacity-95 shadow-sm"
            >
              <View
                testID={`continue-program-accent-${program.programId}`}
                pointerEvents="none"
                className={`absolute inset-y-0 left-0 w-2 ${accentClass}`}
              />
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-1 mr-3 min-w-0">
                  <Text
                    className="text-foreground text-base font-semibold"
                    numberOfLines={1}
                  >
                    {program.programName}
                  </Text>

                  {isPaused ? (
                    <View
                      testID={`continue-program-paused-${program.programId}`}
                      className="flex-row items-center gap-1 mt-1"
                    >
                      <Pause size={14} color={colors.accent} />
                      <Text className="text-amber-600 dark:text-amber-400 text-sm font-semibold">
                        Paused
                      </Text>
                    </View>
                  ) : isFuture ? (
                    <Text className="text-blue-500 text-sm font-semibold mt-1">
                      {startLabel}
                    </Text>
                  ) : (
                    <Text className="text-muted-foreground text-sm mt-1">
                      Phase {program.currentPhase ?? 1} •{" "}
                      {program.currentDay ?? "Day 1"}
                    </Text>
                  )}
                </View>

                {/* Progress Number and Play/Pause action button */}
                <View className="flex-row items-center gap-3">
                  <View className="items-end">
                    <Text
                      testID={`continue-program-progress-${program.programId}`}
                      className={`text-sm font-semibold ${
                        isPaused
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {progress}%
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {program.completedWorkouts ?? 0}/
                      {program.totalWorkouts ?? 0} sessions
                    </Text>
                  </View>

                  <View
                    className={`h-10 w-10 rounded-full items-center justify-center ${
                      isPaused ? "bg-amber-500" : "bg-emerald-600"
                    }`}
                  >
                    {isPaused ? (
                      <Pause size={18} color={colors["primary-foreground"]} />
                    ) : (
                      <Play size={18} color={colors["primary-foreground"]} fill={colors["primary-foreground"]} />
                    )}
                  </View>
                </View>
              </View>

              {/* Progress Bar */}
              <View className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
                <View
                  style={{ width: `${progress}%` }}
                  className={`h-full rounded-full ${
                    isPaused ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
