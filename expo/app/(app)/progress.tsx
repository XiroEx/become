/**
 * THE PROGRESS SCREEN (NP-130) — the native Training Log.
 *
 * The web's `webapp/app/dashboard/progress/ProgressClient.tsx` draws five
 * sections from `GET /api/progress?detailed=1&tz` plus `GET /api/profile`:
 * volume, workouts, records, this month and body composition. Native ports
 * three of them here:
 *
 *   volume    — the last-12-weeks bar chart (`VolumeBarChart`, theme-safe ink)
 *   workouts  — the workout list with best sets and per-workout volume,
 *               expandable rows exactly like the web's `WorkoutRow`
 *   this month — the activity calendar (`MonthGrid`)
 *
 * Records are NP-131 and the dashboard chart is NP-132: both deliberately
 * absent, not forgotten. Body composition already lives on the dashboard's
 * `ProgressChart` (weight / body-fat / lean-mass tabs), so it is not
 * duplicated here.
 *
 * The numbers come straight from the route — no client-side recomputation —
 * so weekly volume matches the web's by construction. Every colour comes from
 * `useThemeTokens()` or a Tailwind class (NP-123): no hard-coded ink.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  Clock,
  Dumbbell,
  Star,
} from "lucide-react-native";
import {
  ProgressApiResponseSchema,
  type ProgressApiResponse,
  type ProgressDetailedWorkout,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { ScreenState } from "@/components/ScreenState";
import {
  MonthGrid,
  VolumeBarChart,
  formatVolume,
} from "@/components/progress/ProgressCharts";

const WORKOUTS_PAGE = 5;

export function progressHeaderLine(data: ProgressApiResponse | null): string | null {
  const total = data?.stats?.totalWorkouts ?? 0;
  if (total <= 0) return null;
  const volume = data?.totalVolumeLbs ?? 0;
  if (volume > 0) {
    return `${total} workouts · ${formatVolume(volume)} lbs lifted all-time`;
  }
  return `${total} workouts`;
}

export function workoutDayKeys(
  workouts: ProgressDetailedWorkout[] | undefined | null,
): string[] {
  return (workouts ?? []).map((w) => w.rawDate.slice(0, 10));
}

function WorkoutRow({
  workout,
  expanded,
  onToggle,
  index,
}: {
  workout: ProgressDetailedWorkout;
  expanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  const { colors } = useThemeTokens();
  const hasPR = workout.exercises.some(
    (e: ProgressDetailedWorkout["exercises"][number]) => e.isPR,
  );

  return (
    <View
      testID={`progress-workout-${index}`}
      accessibilityRole="summary"
      accessibilityLabel={`${workout.title || workout.day}, ${workout.date}`}
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        overflow: "hidden",
      }}
    >
      <Pressable
        testID={`progress-workout-toggle-${index}`}
        accessibilityRole="button"
        accessibilityLabel={`${workout.title || workout.day}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          opacity: pressed ? 0.7 : 1,
          ...minTouchTarget,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.muted,
          }}
        >
          <Dumbbell size={16} color={colors["muted-foreground"]} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              className="text-foreground text-sm font-semibold"
              style={[WRAPPABLE_TEXT, { flexShrink: 1 }]}
              numberOfLines={1}
            >
              {workout.title || workout.day}
            </Text>
            {hasPR ? (
              <View
                testID={`progress-workout-pr-${index}`}
                accessibilityLabel="Personal record in this workout"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 2,
                  borderRadius: 999,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  backgroundColor: colors.muted,
                }}
              >
                <Star size={10} color={colors.accent} />
                <Text
                  style={{ color: colors.accent }}
                  className="text-xs font-bold"
                >
                  PR
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-muted-foreground text-xs">{workout.date}</Text>
        </View>
        <View style={{ alignItems: "flex-end", marginRight: 4 }}>
          {workout.totalVolume > 0 ? (
            <Text
              testID={`progress-workout-volume-${index}`}
              className="text-foreground text-sm font-semibold"
            >
              {formatVolume(workout.totalVolume)} lbs
            </Text>
          ) : null}
          {workout.duration ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Clock size={12} color={colors["muted-foreground"]} />
              <Text className="text-muted-foreground text-xs">
                {workout.duration}m
              </Text>
            </View>
          ) : null}
        </View>
        <ChevronDown
          size={16}
          color={colors["muted-foreground"]}
          style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
        />
      </Pressable>

      {expanded ? (
        <View
          testID={`progress-workout-detail-${index}`}
          style={{ borderTopWidth: 1, borderTopColor: colors.border }}
        >
          {workout.notes ? (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text className="text-muted-foreground text-xs italic">
                &ldquo;{workout.notes}&rdquo;
              </Text>
            </View>
          ) : null}
          {workout.exercises.length > 0 ? (
            workout.exercises.map(
              (ex: ProgressDetailedWorkout["exercises"][number], i: number) => (
              <View
                key={`${ex.slug ?? ex.name}-${i}`}
                testID={`progress-workout-${index}-exercise-${i}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor:
                    i % 2 === 0 ? undefined : colors.muted,
                }}
              >
                <View
                  style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Text
                    className="text-foreground text-sm"
                    style={[WRAPPABLE_TEXT, { flexShrink: 1 }]}
                    numberOfLines={1}
                  >
                    {ex.name}
                  </Text>
                  {ex.isPR ? (
                    <Text
                      style={{ color: colors.accent }}
                      className="text-xs font-bold"
                    >
                      PR
                    </Text>
                  ) : null}
                </View>
                {ex.bestSet ? (
                  <Text
                    className="text-foreground text-sm font-medium"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {ex.bestSet.weight} × {ex.bestSet.reps}
                  </Text>
                ) : (
                  <Text className="text-muted-foreground text-xs">
                    bodyweight
                  </Text>
                )}
              </View>
            ))
          ) : (
            <Text className="text-muted-foreground text-xs px-4 py-3">
              No tracked sets recorded
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

export interface ProgressScreenProps {
  data?: ProgressApiResponse | null;
  loading?: boolean;
  error?: unknown;
  refreshing?: boolean;
  onRefresh?: () => void;
  onBack?: () => void;
  testID?: string;
}

export function ProgressScreen({
  data = null,
  loading = false,
  error = null,
  refreshing = false,
  onRefresh,
  onBack,
  testID = "progress-screen",
}: ProgressScreenProps) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [workoutsShown, setWorkoutsShown] = useState(WORKOUTS_PAGE);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dashboard");
  }, [onBack, router]);

  const weeklyVolume = useMemo(
    () => data?.weeklyVolume ?? [],
    [data?.weeklyVolume],
  );
  const detailedWorkouts = useMemo(
    () => data?.detailedWorkouts ?? [],
    [data?.detailedWorkouts],
  );
  const hasVolume = weeklyVolume.some(
    (w: NonNullable<ProgressApiResponse["weeklyVolume"]>[number]) =>
      w.volume > 0,
  );
  const hasWorkouts = detailedWorkouts.length > 0;
  const weeklyGoal = data?.weeklyAvailability ?? data?.goal?.weeklyAvailability ?? 4;
  const thisWeek = data?.stats?.thisWeekWorkouts;
  const headerLine = progressHeaderLine(data);
  const dayKeys = useMemo(
    () => workoutDayKeys(detailedWorkouts),
    [detailedWorkouts],
  );

  const hasData = !loading && !error && data !== null;
  const isEmpty = hasData && !hasWorkouts && weeklyVolume.length === 0;

  return (
    <ScreenState
      testID={`${testID}-state`}
      loading={loading && !hasData}
      error={hasData ? null : error}
      onRetry={onRefresh}
      hasData={hasData}
      empty={isEmpty}
      emptyTitle="No workouts logged yet"
      emptyMessage="Start a program to build your history."
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID={testID}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.foreground}
              />
            ) : undefined
          }
        >
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to dashboard"
                testID="progress-back-button"
                onPress={handleBack}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <ChevronLeft size={20} color={colors.foreground} />
              </Pressable>
              <Text
                accessibilityRole="header"
                className="text-foreground text-2xl font-bold"
              >
                Training Log
              </Text>
            </View>
            <Text className="text-muted-foreground text-sm mt-1">
              {headerLine ?? "Your full training history"}
            </Text>
          </View>

          {weeklyVolume.length > 0 ? (
            <View testID="progress-volume-section">
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <BarChart3 size={16} color={colors["muted-foreground"]} />
                  <Text
                    accessibilityRole="header"
                    className="text-foreground text-base font-semibold"
                  >
                    {hasVolume ? "Weekly Volume" : "Weekly Activity"}
                  </Text>
                </View>
                <Text className="text-muted-foreground text-xs">
                  last 12 weeks
                </Text>
              </View>
              <View
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  paddingHorizontal: 8,
                  paddingTop: 16,
                  paddingBottom: 8,
                }}
              >
                <VolumeBarChart weeks={weeklyVolume} />
              </View>
            </View>
          ) : null}

          <View testID="progress-workouts-section">
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <Text
                accessibilityRole="header"
                className="text-foreground text-base font-semibold"
              >
                Workout History
              </Text>
              {thisWeek !== undefined ? (
                <Text
                  testID="progress-this-week"
                  className="text-muted-foreground text-xs font-medium"
                >
                  {thisWeek}/{weeklyGoal} this week
                </Text>
              ) : null}
            </View>

            {hasWorkouts ? (
              <View style={{ gap: 8 }}>
                {detailedWorkouts.slice(0, workoutsShown).map(
                  (w: ProgressDetailedWorkout, i: number) => (
                    <WorkoutRow
                      key={`${w.rawDate}-${i}`}
                      workout={w}
                      index={i}
                      expanded={expandedIdx === i}
                      onToggle={() =>
                        setExpandedIdx(expandedIdx === i ? null : i)
                      }
                    />
                  ),
                )}
                {detailedWorkouts.length > WORKOUTS_PAGE ? (
                  <Pressable
                    testID="progress-workouts-more"
                    accessibilityRole="button"
                    onPress={() =>
                      setWorkoutsShown((n) =>
                        n > WORKOUTS_PAGE ? WORKOUTS_PAGE : n + WORKOUTS_PAGE,
                      )
                    }
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      paddingVertical: 10,
                      alignItems: "center",
                      ...minTouchTarget,
                    }}
                  >
                    <Text className="text-muted-foreground text-sm font-medium">
                      {workoutsShown >= detailedWorkouts.length
                        ? "Show less"
                        : `Show more (${detailedWorkouts.length - workoutsShown} remaining)`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View
                testID="progress-workouts-empty"
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  padding: 32,
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Dumbbell size={40} color={colors["muted-foreground"]} />
                <Text className="text-muted-foreground text-sm font-medium text-center">
                  No workouts logged yet. Start a program to build your history.
                </Text>
              </View>
            )}
          </View>

          {hasWorkouts ? (
            <View testID="progress-month-section">
              <Text
                accessibilityRole="header"
                className="text-foreground text-base font-semibold mb-3"
              >
                This Month
              </Text>
              <MonthGrid workoutDays={dayKeys} />
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ScreenState>
  );
}

export default function ProgressRoute() {
  const { token } = useAuth();
  const router = useRouter();
  const ready = !!token;

  const fetchOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !ready,
    useCache: true,
    cacheKey: "progress-detailed",
  };

  // The web fetches `GET /api/progress?detailed=1&tz=<minutes west>`; the
  // shared client appends `tz` from the device clock per request (DST-safe),
  // so the path carries only `detailed=1` here.
  const progress = useFetch(
    ready ? "/api/progress?detailed=1" : null,
    ProgressApiResponseSchema,
    fetchOpts,
  );

  const onRefresh = useCallback(() => {
    void progress.refetch();
  }, [progress]);

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dashboard");
  }, [router]);

  return (
    <ProgressScreen
      data={progress.data}
      loading={progress.loading && !progress.data}
      error={progress.error}
      refreshing={false}
      onRefresh={onRefresh}
      onBack={onBack}
    />
  );
}
