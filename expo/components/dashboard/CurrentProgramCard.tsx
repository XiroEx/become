import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface CurrentProgramData {
  programId: string;
  name: string;
  currentPhase: number;
  currentWeek: number;
  totalWeeks: number;
  completedWorkouts?: number | null;
  totalWorkouts?: number | null;
  nextWorkout?: string | null;
  nextWorkoutDay?: string | null;
}

export interface CurrentProgramCardProps {
  program: CurrentProgramData;
  onView?: () => void;
  onContinue?: () => void;
  testID?: string;
}

export function CurrentProgramCard({
  program,
  onView,
  onContinue,
  testID = "dashboard-current-program-card",
}: CurrentProgramCardProps) {
  const { colors } = useThemeTokens();

  const pct =
    program.totalWorkouts &&
    program.totalWorkouts > 0 &&
    program.completedWorkouts != null
      ? Math.round((program.completedWorkouts / program.totalWorkouts) * 100)
      : program.totalWeeks > 0
        ? Math.round((program.currentWeek / program.totalWeeks) * 100)
        : 0;

  const continueLabel = program.nextWorkout
    ? `Continue: ${program.nextWorkout}`
    : "Start workout";

  return (
    <Card testID={testID}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text
          testID="current-program-title"
          className="text-base font-semibold text-foreground"
        >
          Current Program
        </Text>
        <Pressable
          testID="current-program-view"
          accessibilityRole="button"
          accessibilityLabel="View current program"
          onPress={onView}
          hitSlop={8}
        >
          <Text className="text-sm font-medium text-blue-600 dark:text-blue-400">
            View
          </Text>
        </Pressable>
      </View>

      {/* Program Name and Phase/Week */}
      <View style={styles.infoCol}>
        <Text
          testID="current-program-name"
          className="text-foreground font-semibold text-base"
        >
          {program.name}
        </Text>
        <Text
          testID="current-program-phase"
          className="text-muted-foreground text-sm mt-0.5"
        >
          {`Phase ${program.currentPhase} • Week ${program.currentWeek} of ${program.totalWeeks}`}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressMetaRow}>
          <Text className="text-xs text-muted-foreground">Progress</Text>
          <Text
            testID="current-program-progress-pct"
            className="text-xs text-muted-foreground font-medium"
          >
            {`${pct}%`}
          </Text>
        </View>
        <View className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <View
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${pct}%` }}
          />
        </View>
      </View>

      {/* Continue Workout Button */}
      <Pressable
        testID="current-program-continue"
        accessibilityRole="button"
        accessibilityLabel={continueLabel}
        onPress={onContinue}
        style={[
          styles.continueButton,
          { backgroundColor: colors.foreground },
        ]}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.continueButtonText, { color: colors.background }]}
        >
          {continueLabel}
        </Text>
        <ChevronRight size={16} color={colors.background} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  infoCol: {
    marginBottom: 14,
  },
  progressSection: {
    marginBottom: 14,
  },
  progressMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
});
