import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useRouter } from "expo-router";
import { CalendarDays, ChevronRight, Dumbbell } from "lucide-react-native";
import type { UpcomingWorkoutSummary } from "@/lib/dashboard/types";

// TODO: NP-106 owns dashboard training cards: next workout with missed sessions, resume, current program

export interface UpNextCardProps {
  workout?: UpcomingWorkoutSummary | null;
  onOpenCalendar?: () => void;
  onPressWorkout?: () => void;
  testID?: string;
}

export function UpNextCard({
  workout,
  onOpenCalendar,
  onPressWorkout,
  testID = "up-next-card",
}: UpNextCardProps) {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();

  if (!workout) return null;

  const handleOpenCalendar = () => {
    if (onOpenCalendar) {
      onOpenCalendar();
    } else {
      router.push("/(tabs)/calendar" as never);
    }
  };

  const handlePressWorkout = () => {
    if (onPressWorkout) {
      onPressWorkout();
    } else if (workout.programId) {
      const pIdx = workout.workoutIndex ?? 0;
      const phase = workout.phase ? Math.max(0, workout.phase - 1) : 0;
      router.push(
        `/(tabs)/programming/${workout.programId}/workout/${pIdx}?phase=${phase}` as never,
      );
    } else {
      handleOpenCalendar();
    }
  };

  const dayText = workout.dateLabel
    ? `${workout.dateLabel}${workout.dayLabel ? `: ${workout.dayLabel}` : ""}`
    : workout.dayLabel || "Upcoming Workout";

  return (
    <View
      testID={`${testID}-container`}
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Header with Calendar link */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <CalendarDays size={16} color={colors.primary} />
          <Text className="text-foreground text-sm font-semibold">
            Up Next
          </Text>
        </View>
        <Pressable
          testID="up-next-calendar"
          accessibilityRole="button"
          accessibilityLabel="Open calendar"
          onPress={handleOpenCalendar}
          style={styles.calendarLink}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.calendarText, { color: colors.primary }]}>
            Calendar
          </Text>
          <ChevronRight size={14} color={colors.primary} />
        </Pressable>
      </View>

      {/* Main workout pressable card with tinted row */}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`Up next: ${dayText}. ${workout.workoutTitle} · ${workout.programName}`}
        onPress={handlePressWorkout}
        style={({ pressed }) => [
          styles.tintedRow,
          {
            backgroundColor: tint("primary", 0.08),
            borderColor: tint("primary", 0.15),
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.iconBadge,
            { backgroundColor: tint("primary", 0.18) },
          ]}
        >
          <Dumbbell size={20} color={colors.primary} />
        </View>
        <View style={styles.meta}>
          <Text
            testID="up-next-day"
            numberOfLines={1}
            ellipsizeMode="tail"
            className="text-foreground text-sm font-semibold"
          >
            {dayText}
          </Text>
          <Text
            testID="up-next-title"
            numberOfLines={1}
            ellipsizeMode="tail"
            className="text-muted-foreground text-xs mt-0.5"
          >
            {workout.workoutTitle}
            {workout.programName ? ` · ${workout.programName}` : ""}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.primary} style={styles.chevron} />
      </Pressable>
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
  calendarLink: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  calendarText: {
    fontSize: 12,
    fontWeight: "600",
  },
  tintedRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  chevron: {
    flexShrink: 0,
  },
});

export default UpNextCard;
