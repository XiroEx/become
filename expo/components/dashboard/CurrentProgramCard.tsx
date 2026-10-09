import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { currentProgramPercent } from "@/lib/dashboard/trainingCards";

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
  /** Opens the Training Log records (web's `/dashboard/progress#records`, NP-256). */
  onPressProgress?: () => void;
  testID?: string;
}

export function CurrentProgramCard({
  program,
  onView,
  onContinue,
  onPressProgress,
  testID = "dashboard-current-program-card",
}: CurrentProgramCardProps) {
  const { colors } = useThemeTokens();

  // Session-based %, falling back to the week ratio only when the counts are
  // missing — the same rule the web's Current Program card uses.
  const pct = currentProgramPercent({
    completedWorkouts: program.completedWorkouts,
    totalWorkouts: program.totalWorkouts,
    currentWeek: program.currentWeek,
    totalWeeks: program.totalWeeks,
  });

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
          className="text-foreground font-medium text-base"
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
          <Pressable
            testID="current-program-progress-link"
            accessibilityRole="link"
            accessibilityLabel="Progress"
            onPress={onPressProgress}
            disabled={!onPressProgress}
            hitSlop={8}
          >
            {/* Subtle grey, matching the web's `text-zinc-500
                dark:text-zinc-400` — not the bright blue link native used to
                draw here (NP-352). */}
            <Text className="text-xs text-muted-foreground font-medium">
              Progress
            </Text>
          </Pressable>
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
        {/* No `numberOfLines` — the web's Continue label wraps to two lines
            (`<span className="text-left">`, no truncate class) rather than
            being cut off with an ellipsis. */}
        <Text style={[styles.continueButtonText, { color: colors.background }]}>
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
