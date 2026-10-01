import React from "react";
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { CalendarDays, ChevronRight, Dumbbell } from "lucide-react-native";
import type { TodayWorkoutSummary } from "@/components/DashboardScreen";

// TODO: NP-106 owns full NextWorkoutCard with missed sessions, resume, and program overview

export interface NextWorkoutSectionProps {
  todayWorkout: TodayWorkoutSummary | null;
  onStartWorkout: () => void;
  onOpenCalendar: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function NextWorkoutSection({
  todayWorkout,
  onStartWorkout,
  onOpenCalendar,
  testID,
  style,
}: NextWorkoutSectionProps) {
  const { colors, tint } = useThemeTokens();

  return (
    <View testID={testID ?? "dashboard-up-next"} style={[styles.container, style]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <CalendarDays size={18} color={colors.primary} />
          <Text className="text-foreground text-base font-semibold">Up Next</Text>
        </View>

        <Pressable
          testID="dashboard-open-calendar"
          accessibilityRole="button"
          accessibilityLabel="Open calendar"
          onPress={onOpenCalendar}
          style={({ pressed }) => [
            styles.calendarLink,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text className="text-primary text-xs font-semibold mr-0.5">Calendar</Text>
          <ChevronRight size={14} color={colors.primary} />
        </Pressable>
      </View>

      {todayWorkout ? (
        <Card testID="dashboard-today">
          <View style={styles.workoutRow}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: tint("primary", 0.15) },
              ]}
            >
              <Dumbbell size={20} color={colors.primary} />
            </View>

            <View style={styles.workoutMeta}>
              <Text
                testID="dashboard-today-workout"
                className="text-foreground text-base font-semibold"
              >
                {todayWorkout.workoutTitle}
              </Text>
              <Text
                testID="dashboard-today-program"
                className="text-muted-foreground text-sm"
              >
                {todayWorkout.programName}
                {" · "}
                {todayWorkout.phaseLabel}
              </Text>
              <Text
                testID="dashboard-today-exercises"
                className="text-muted-foreground text-xs mt-0.5 mb-2"
              >
                {todayWorkout.exerciseCount} exercise
                {todayWorkout.exerciseCount === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          <Button
            testID="dashboard-start-workout"
            accessibilityLabel={`Start workout: ${todayWorkout.workoutTitle}`}
            onPress={onStartWorkout}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  calendarLink: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  workoutRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  workoutMeta: {
    flex: 1,
  },
});

export default NextWorkoutSection;
