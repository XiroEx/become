import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AlertCircle, SkipForward } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { usePressed } from "@/lib/a11y/usePressed";
import type { MissedWorkoutSummary } from "@/lib/dashboard/trainingCards";

/**
 * Missed sessions with Skip — the native half of the web's
 * `NextWorkoutCard.tsx` missed banner. Lists missed slots newest first (the
 * route already sorts them), shows the first two with a "+N more" overflow
 * line, and offers Do It (opens that exact slot) and Skip
 * (`PATCH /api/schedule { action: 'skip', workoutDate, tz }`) per row.
 */
export interface MissedWorkoutsCardProps {
  missed: MissedWorkoutSummary[];
  skippingDate?: string | null;
  onDoIt?: (workout: MissedWorkoutSummary) => void;
  onSkip?: (workout: MissedWorkoutSummary) => void;
  onViewAll?: () => void;
  testID?: string;
}

function DoItButton({
  testID,
  label,
  onPress,
  backgroundColor,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  backgroundColor: string;
}) {
  const press = usePressed();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.doIt,
        { backgroundColor, opacity: press.pressed ? 0.85 : 1 },
      ]}
    >
      <Text className="text-white text-[10px] font-bold" style={styles.doItText}>
        Do It
      </Text>
    </Pressable>
  );
}

function displayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const parsed = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function MissedWorkoutsCard({
  missed,
  skippingDate,
  onDoIt,
  onSkip,
  onViewAll,
  testID = "missed-workouts-card",
}: MissedWorkoutsCardProps) {
  const { colors } = useThemeTokens();

  if (missed.length === 0) return null;

  const shown = missed.slice(0, 2);
  const overflow = missed.length - shown.length;

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`${missed.length} incomplete ${missed.length === 1 ? "workout" : "workouts"}`}
      style={[
        styles.container,
        {
          backgroundColor: colors.destructive
            ? `${colors.destructive}14`
            : colors.card,
          borderColor: colors.destructive ?? colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AlertCircle size={16} color={colors.destructive} />
          <Text
            testID="missed-workouts-count"
            style={[styles.count, { color: colors.destructive }]}
          >
            {missed.length} Incomplete{" "}
            {missed.length === 1 ? "Workout" : "Workouts"}
          </Text>
        </View>
        <Pressable
          testID="missed-workouts-view-all"
          accessibilityRole="button"
          accessibilityLabel="View all missed workouts in calendar"
          onPress={onViewAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.viewAll, { color: colors.destructive }]}>
            View all
          </Text>
        </Pressable>
      </View>

      <View>
        {shown.map((w) => {
          const key = `${w.programId}-${w.date}-${w.dayLabel}`;
          const skipping = skippingDate === w.date;
          return (
            <View
              key={key}
              testID={`missed-workout-${w.date}`}
              style={styles.row}
            >
              <View style={styles.rowMeta}>
                <Text
                  testID={`missed-workout-label-${w.date}`}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                  style={[styles.rowLabel, { color: colors.destructive }]}
                >
                  {displayDate(w.date)} — {w.dayLabel}: {w.workoutTitle}
                </Text>
              </View>
              <View style={styles.rowActions}>
                <DoItButton
                  testID={`missed-workout-doit-${w.date}`}
                  label={`Do ${w.dayLabel} from ${displayDate(w.date)}`}
                  onPress={() => onDoIt?.(w)}
                  backgroundColor={colors.destructive}
                />
                <Pressable
                  testID={`missed-workout-skip-${w.date}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Skip ${w.dayLabel} from ${displayDate(w.date)}`}
                  accessibilityState={{ disabled: skipping }}
                  disabled={skipping}
                  onPress={() => onSkip?.(w)}
                  style={[
                    styles.skip,
                    {
                      borderColor: colors.destructive,
                      opacity: skipping ? 0.5 : 1,
                    },
                  ]}
                >
                  <SkipForward size={10} color={colors.destructive} />
                  <Text
                    style={[styles.skipText, { color: colors.destructive }]}
                  >
                    {skipping ? "Skipping…" : "Skip"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      {overflow > 0 ? (
        <Text
          testID="missed-workouts-overflow"
          style={[styles.overflow, { color: colors.destructive }]}
        >
          +{overflow} more in calendar
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  count: {
    fontSize: 14,
    fontWeight: "600",
  },
  viewAll: {
    fontSize: 12,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  rowMeta: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  doIt: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  doItText: {
    fontSize: 10,
    fontWeight: "700",
  },
  skip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 32,
  },
  skipText: {
    fontSize: 10,
    fontWeight: "600",
  },
  overflow: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default MissedWorkoutsCard;
