import { useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StreakBanner } from "@/components/StreakBanner";
import {
  CheckInModal,
  type CheckInPayload,
} from "@/components/CheckInModal";

export interface TodayWorkoutSummary {
  programName: string;
  workoutTitle: string;
  phaseLabel: string;
  exerciseCount: number;
}

export interface DashboardScreenProps {
  userName?: string | null;
  streakDays: number;
  freezeAvailable?: boolean;
  todayWorkout: TodayWorkoutSummary | null;
  onStartWorkout?: () => void;
  onSubmitCheckIn: (payload: CheckInPayload) => Promise<void> | void;
  submittingCheckIn?: boolean;
  /** Controls modal externally for testability. Defaults to internal state. */
  checkInOpen?: boolean;
  onCheckInOpenChange?: (open: boolean) => void;
  /** Initial-load skeleton (no data yet). Distinct from pull-to-refresh. */
  loading?: boolean;
  /** Inline error banner text; null/undefined hides it. */
  errorText?: string | null;
  /** Pull-to-refresh wiring. */
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function DashboardScreen({
  userName,
  streakDays,
  freezeAvailable = false,
  todayWorkout,
  onStartWorkout,
  onSubmitCheckIn,
  submittingCheckIn = false,
  checkInOpen,
  onCheckInOpenChange,
  loading = false,
  errorText,
  refreshing = false,
  onRefresh,
}: DashboardScreenProps) {
  const [internalOpen, setInternalOpen] = useState<boolean>(false);
  const isControlled = checkInOpen !== undefined;
  const open = isControlled ? checkInOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled) onCheckInOpenChange?.(value);
    else setInternalOpen(value);
  };

  if (loading) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
        testID="dashboard-screen"
      >
        <View
          testID="dashboard-skeleton"
          style={{ padding: 16, gap: 16 }}
          accessibilityLabel="Loading your dashboard"
        >
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                height: i === 0 ? 32 : 96,
                borderRadius: 12,
                backgroundColor: "#1a1a1a",
              }}
            />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="dashboard-screen"
    >
      <ScrollView
        testID="dashboard-scroll"
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              testID="dashboard-refresh"
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
      >
        {errorText ? (
          <View
            testID="dashboard-error"
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: "#3a1212",
            }}
          >
            <Text className="text-destructive text-sm">{errorText}</Text>
          </View>
        ) : null}
        <View>
          <Text
            testID="dashboard-greeting"
            className="text-foreground text-2xl font-bold"
          >
            {userName ? `Hey, ${userName}` : "Welcome"}
          </Text>
          <Text className="text-muted-foreground text-sm">
            Here&apos;s your day
          </Text>
        </View>

        <StreakBanner
          testID="dashboard-streak"
          streakDays={streakDays}
          freezeAvailable={freezeAvailable}
        />

        {todayWorkout ? (
          <Card testID="dashboard-today" title="Today's workout">
            <Text
              testID="dashboard-today-workout"
              className="text-foreground text-lg font-semibold mb-1"
            >
              {todayWorkout.workoutTitle}
            </Text>
            <Text
              testID="dashboard-today-program"
              className="text-muted-foreground text-sm mb-1"
            >
              {todayWorkout.programName} · {todayWorkout.phaseLabel}
            </Text>
            <Text
              testID="dashboard-today-exercises"
              className="text-muted-foreground text-sm mb-3"
            >
              {todayWorkout.exerciseCount} exercise
              {todayWorkout.exerciseCount === 1 ? "" : "s"}
            </Text>
            <Button
              testID="dashboard-start-workout"
              onPress={onStartWorkout ?? (() => {})}
            >
              Start workout
            </Button>
          </Card>
        ) : (
          <Card testID="dashboard-rest" title="Today">
            <Text className="text-muted-foreground">
              Rest day. Take a walk, drink water, log your mood.
            </Text>
          </Card>
        )}

        <Button
          testID="dashboard-open-checkin"
          variant="secondary"
          onPress={() => setOpen(true)}
        >
          Check in
        </Button>
      </ScrollView>

      <CheckInModal
        testID="dashboard-checkin-modal"
        visible={open}
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          await onSubmitCheckIn(payload);
          setOpen(false);
        }}
        submitting={submittingCheckIn}
      />
    </SafeAreaView>
  );
}
