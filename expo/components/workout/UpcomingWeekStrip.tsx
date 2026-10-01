import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  X,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import {
  apiFetch,
  ScheduleApiResponseSchema,
  WorkoutHistoryResponseSchema,
  type ScheduleApiResponse,
  type WorkoutHistoryResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import {
  computeWeekStripDayStatus,
  DAY_LABELS,
  getWeekDays,
  isSameDay,
  toLocalDateKey,
  weekLabel,
  weekStartFor,
  type ScheduledWorkoutStatus,
  type WeekStripDayStatus,
} from "@/lib/workout/dayStatus";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface UpcomingWeekStripProps {
  className?: string;
  initialSchedule?: ScheduleApiResponse | null;
  initialLogs?: WorkoutHistoryResponse | null;
  baseDate?: Date;
  testID?: string;
}

interface PrimaryWorkout {
  date: string;
  programId: string;
  phase: number;
  dayLabel: string;
  workoutTitle: string;
  status: ScheduledWorkoutStatus;
}

function StatusIndicator({ status }: { status: WeekStripDayStatus }) {
  const { colors } = useThemeTokens();
  switch (status) {
    case "completed":
      return <Check size={14} color={colors.success} strokeWidth={2.5} />;
    case "missed":
      return <X size={14} color={colors.destructive} strokeWidth={2.5} />;
    case "skipped":
      return <Clock size={14} color={colors.accent} strokeWidth={2} />;
    case "scheduled":
      return <Dumbbell size={14} color={colors.primary} strokeWidth={2} />;
    case "quick":
      return <View className="h-2 w-2 rounded-full bg-purple-500" />;
    case "rest":
    default:
      return <Text className="text-[10px] text-muted-foreground">Rest</Text>;
  }
}

export function UpcomingWeekStrip({
  className = "",
  initialSchedule,
  initialLogs,
  baseDate,
  testID = "upcoming-week-strip",
}: UpcomingWeekStripProps) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  const [scheduleData, setScheduleData] = useState<ScheduleApiResponse | null>(
    initialSchedule ?? null,
  );
  const [logsData, setLogsData] = useState<WorkoutHistoryResponse | null>(
    initialLogs ?? null,
  );
  const [loading, setLoading] = useState(
    initialSchedule === undefined || initialLogs === undefined,
  );
  const [weekOffset, setWeekOffset] = useState<number>(0);

  useEffect(() => {
    if (initialSchedule !== undefined && initialLogs !== undefined) return;
    let mounted = true;
    void (async () => {
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const from = weekStartFor(-8, baseDate);
        const to = weekStartFor(17, baseDate);
        const tz = new Date().getTimezoneOffset();

        const [schedulesRes, logsRes] = await Promise.allSettled([
          apiFetch(
            `/api/schedule?from=${from.toISOString()}&to=${to.toISOString()}&tz=${tz}`,
            ScheduleApiResponseSchema,
            { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
          ),
          apiFetch(
            `/api/workouts/logs?includeIncomplete=true`,
            WorkoutHistoryResponseSchema,
            { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
          ),
        ]);

        if (!mounted) return;
        if (schedulesRes.status === "fulfilled") {
          setScheduleData(schedulesRes.value);
        }
        if (logsRes.status === "fulfilled") {
          setLogsData(logsRes.value);
        }
      } catch {
        // non-fatal
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [initialSchedule, initialLogs, token, baseDate]);

  const today = useMemo(() => {
    const d = baseDate ? new Date(baseDate) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [baseDate]);

  const weekDays = useMemo(
    () => getWeekDays(weekOffset, today),
    [weekOffset, today],
  );

  // Group scheduled workouts by slot marker day key (date.slice(0, 10))
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, PrimaryWorkout[]>();
    for (const schedule of scheduleData?.schedules ?? []) {
      for (const w of schedule.scheduledWorkouts ?? []) {
        const dateStr =
          typeof w.date === "string" ? w.date : new Date(w.date).toISOString();
        const key = dateStr.slice(0, 10);
        const existing = map.get(key) || [];
        existing.push({
          date: key,
          programId: w.programId ?? schedule.programId,
          phase: w.phase ?? 1,
          dayLabel: w.dayLabel ?? "",
          workoutTitle: w.workoutTitle || schedule.programName || "",
          status: w.status as ScheduledWorkoutStatus,
        });
        map.set(key, existing);
      }
    }
    return map;
  }, [scheduleData]);

  // Group quick logs by local date
  const quickByDate = useMemo(() => {
    const map = new Map<string, { completed: boolean }[]>();
    for (const log of logsData?.logs ?? []) {
      if (log.kind === "quick") {
        const key = toLocalDateKey(new Date(log.date));
        const existing = map.get(key) || [];
        existing.push({ completed: log.completed });
        map.set(key, existing);
      }
    }
    return map;
  }, [logsData]);

  const hasSchedules =
    (scheduleData?.schedules && scheduleData.schedules.length > 0) ||
    (logsData?.logs && logsData.logs.length > 0);

  if (loading && !scheduleData && !logsData) {
    return (
      <Card testID={`${testID}-loading`}>
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <Calendar size={18} color={colors.primary} />
            <Text className="text-foreground text-base font-semibold">
              Loading schedule…
            </Text>
          </View>
        </View>
        <View className="flex-row justify-between gap-1 py-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <View
              key={i}
              className="flex-1 h-16 rounded-xl bg-muted animate-pulse"
            />
          ))}
        </View>
      </Card>
    );
  }

  if (!hasSchedules) {
    return (
      <Card testID={`${testID}-empty`}>
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <Calendar size={18} color={colors.primary} />
            <Text className="text-foreground text-base font-semibold">
              This Week
            </Text>
          </View>
          <Pressable
            testID="week-strip-open-calendar"
            accessibilityRole="button"
            accessibilityLabel="Calendar"
            onPress={() => router.push("/(tabs)/calendar")}
            className="flex-row items-center gap-0.5"
          >
            <Text className="text-primary text-xs font-semibold">Calendar</Text>
            <ChevronRight size={14} color={colors.primary} />
          </Pressable>
        </View>
        <View className="py-3 items-center">
          <Text className="text-muted-foreground text-sm text-center mb-3">
            No workouts scheduled yet. Enroll in a program to plan your week.
          </Text>
          <Pressable
            testID="week-strip-browse-link"
            accessibilityRole="button"
            accessibilityLabel="Browse Programs"
            onPress={() => router.push("/(tabs)/programming/browse")}
            className="bg-primary px-4 py-2 rounded-xl"
          >
            <Text className="text-white text-sm font-semibold">
              Browse Programs
            </Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  // Today's workout detail (for current week only)
  const todayKey = toLocalDateKey(today);
  const todayWorkouts = workoutsByDate.get(todayKey);
  const todayWorkout = todayWorkouts?.find((w) => w.status !== "completed");

  return (
    <Card testID={testID}>
      {/* Header with week label, controls, and calendar link */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <Calendar size={18} color={colors.primary} />
          <Text
            testID="week-strip-label"
            className="text-foreground text-base font-semibold"
          >
            {weekLabel(weekOffset, weekDays)}
          </Text>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Pressable
            testID="week-strip-prev"
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            onPress={() => setWeekOffset((o) => o - 1)}
            className="h-7 w-7 rounded-full bg-muted items-center justify-center"
          >
            <ChevronLeft size={16} color={colors["muted-foreground"]} />
          </Pressable>

          {weekOffset !== 0 && (
            <Pressable
              testID="week-strip-today"
              accessibilityRole="button"
              accessibilityLabel="Today"
              onPress={() => setWeekOffset(0)}
              className="px-2 py-0.5 rounded-full bg-primary/10"
            >
              <Text className="text-primary text-xs font-semibold">Today</Text>
            </Pressable>
          )}

          <Pressable
            testID="week-strip-next"
            accessibilityRole="button"
            accessibilityLabel="Next week"
            onPress={() => setWeekOffset((o) => o + 1)}
            className="h-7 w-7 rounded-full bg-muted items-center justify-center"
          >
            <ChevronRight size={16} color={colors["muted-foreground"]} />
          </Pressable>

          <Pressable
            testID="week-strip-open-calendar"
            accessibilityRole="button"
            accessibilityLabel="Calendar"
            onPress={() => router.push("/(tabs)/calendar")}
            className="flex-row items-center ml-1"
          >
            <Text className="text-primary text-xs font-semibold">Calendar</Text>
            <ChevronRight size={14} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {/* The 7-day strip */}
      <View className="flex-row justify-between gap-1">
        {weekDays.map((day) => {
          const key = toLocalDateKey(day);
          const workouts = workoutsByDate.get(key);
          const dayQuick = quickByDate.get(key);
          const isToday = isSameDay(day, today);
          const status = computeWeekStripDayStatus(workouts, dayQuick);

          return (
            <Pressable
              key={key}
              testID={`week-strip-day-${key}`}
              accessibilityRole="button"
              accessibilityLabel={`${DAY_LABELS[day.getDay()]}, ${day.getDate()}, status: ${status}`}
              onPress={() => router.push(`/(tabs)/calendar?date=${key}`)}
              className={`flex-1 items-center py-2 px-1 rounded-xl ${
                isToday
                  ? "bg-foreground"
                  : "bg-muted/50"
              }`}
            >
              <Text
                className={`text-[10px] font-medium mb-0.5 ${
                  isToday ? "text-background/80" : "text-muted-foreground"
                }`}
              >
                {DAY_LABELS[day.getDay()]}
              </Text>

              <Text
                className={`text-sm font-bold mb-1 ${
                  isToday ? "text-background" : "text-foreground"
                }`}
              >
                {day.getDate()}
              </Text>

              <View
                testID={`week-strip-status-${status}-${key}`}
                className="h-5 items-center justify-center"
              >
                <StatusIndicator status={status} />
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Today's scheduled workout banner (current week only) */}
      {weekOffset === 0 && todayWorkout && (
        <Pressable
          testID="week-strip-today-workout"
          accessibilityRole="button"
          accessibilityLabel={`Today's workout: ${todayWorkout.dayLabel}, ${todayWorkout.workoutTitle}`}
          onPress={() => {
            const workoutIndex = workoutIndexFromDayLabel(todayWorkout.dayLabel);
            const phaseIndex = Math.max(0, todayWorkout.phase - 1);
            router.push(
              `/(tabs)/programming/${todayWorkout.programId}/workout/${workoutIndex}?phase=${phaseIndex}&sd=${encodeURIComponent(todayWorkout.date)}&day=${encodeURIComponent(todayWorkout.dayLabel)}`,
            );
          }}
          className="mt-3 flex-row items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20"
        >
          <View className="h-9 w-9 rounded-lg bg-blue-500/20 items-center justify-center">
            <Dumbbell size={18} color={colors.primary} />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-sm font-semibold">
              Today: {todayWorkout.dayLabel}
            </Text>
            <Text className="text-muted-foreground text-xs truncate">
              {todayWorkout.workoutTitle}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.primary} />
        </Pressable>
      )}
    </Card>
  );
}
