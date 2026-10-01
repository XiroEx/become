import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { DashboardTile } from "@become/api-client";
import {
  Flame,
  TrendingUp,
  Target,
  Utensils,
  Droplets,
  Scale,
  Dumbbell,
  Sparkles,
  ChevronRight,
  Smile,
} from "lucide-react-native";
import { describeGoal } from "@become/core";
import type { DashboardStatData } from "@/lib/dashboard/types";

export interface StatTileProps {
  tile: DashboardTile;
  statData?: DashboardStatData | null;
  loading?: boolean;
  onOpenCalendar?: () => void;
  onOpenNutrition?: () => void;
  onOpenCheckIn?: () => void;
  onPress?: () => void;
}

const MOOD_LABELS: Record<number, string> = {
  1: "Bad",
  2: "Not Great",
  3: "Okay",
  4: "Pretty Good",
  5: "Great",
};

export function StatTile({
  tile,
  statData,
  loading = false,
  onOpenCalendar,
  onOpenNutrition,
  onOpenCheckIn,
  onPress,
}: StatTileProps) {
  const { colors, tint } = useThemeTokens();
  const wide = tile.size === "2x1";

  // Loading skeleton
  if (loading && !statData) {
    return (
      <View
        testID={`tile-${tile.id}`}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.squareContent}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={[
                styles.badgeSmall,
                { backgroundColor: colors.muted },
              ]}
            />
            <View
              style={{
                height: 12,
                width: "50%",
                borderRadius: 4,
                backgroundColor: colors.muted,
              }}
            />
          </View>
          <View
            style={{
              height: 24,
              width: "70%",
              borderRadius: 4,
              backgroundColor: colors.muted,
              marginTop: 10,
            }}
          />
          <View
            style={{
              height: 6,
              width: "100%",
              borderRadius: 3,
              backgroundColor: colors.muted,
              marginTop: 8,
            }}
          />
        </View>
      </View>
    );
  }

  let label = "";
  let value = "—";
  let footer = "";
  let pct = 0;
  let IconComponent = Sparkles;
  let iconColor = colors.accent;
  let badgeBg = tint("accent", 0.15);
  let barColor = colors.accent;
  let handlePress = onPress;

  if (tile.id === "streak") {
    label = "Day Streak";
    IconComponent = Flame;
    iconColor = colors.accent;
    badgeBg = tint("accent", 0.15);
    barColor = colors.accent;
    handlePress = handlePress ?? onOpenCalendar;

    const days = statData?.streakDays ?? 0;
    const next = statData?.nextMilestone ?? (days < 3 ? 3 : days < 7 ? 7 : days < 14 ? 14 : days < 30 ? 30 : days + 7);
    const prevMilestone = next ? Math.max(0, next - 7) : 0;
    const visible = days >= 3;

    value = visible ? `${days} days` : days > 0 ? `${days} days` : "0 days";

    if (visible) {
      pct = next ? Math.min(100, Math.round(((days - prevMilestone) / Math.max(1, next - prevMilestone)) * 100)) : 100;
      footer = next ? `${next - days}d to ${next}-day 🏆` : "Every milestone reached";
    } else {
      pct = Math.round((Math.min(days, 3) / 3) * 100);
      const remainingDays = Math.max(0, 3 - days);
      footer = `${days}/3 · ${remainingDays} more ${remainingDays === 1 ? "day" : "days"}`;
    }
  } else if (tile.id === "mood") {
    label = "Today's Mood";
    IconComponent = Smile;
    iconColor = colors.accent;
    badgeBg = tint("accent", 0.15);
    handlePress = handlePress ?? onOpenCheckIn;

    const currentMood = statData?.todaysMood;
    value = currentMood && MOOD_LABELS[currentMood] ? MOOD_LABELS[currentMood] : "Set";

    const recent = statData?.recentMoods ?? [];
    const last7 = recent.slice(-7);
    if (last7.length > 0) {
      const avg = last7.reduce((a, b) => a + b, 0) / last7.length;
      pct = Math.min(100, Math.round((avg / 5) * 100));
      barColor = avg >= 3.5 ? colors.success : avg >= 2.5 ? colors.accent : colors.destructive;
      footer = `Last ${last7.length} ${last7.length === 1 ? "day" : "days"}`;
    } else {
      pct = 0;
      barColor = colors.muted;
      footer = "No entries yet";
    }
  } else if (tile.id === "weekly") {
    label = "This Week";
    IconComponent = TrendingUp;
    iconColor = colors.success;
    badgeBg = tint("success", 0.15);
    barColor = colors.success;
    handlePress = handlePress ?? onOpenCalendar;

    const target = statData?.weeklyTarget ?? 3;
    const done = statData?.thisWeekWorkouts ?? 0;
    value = target ? `${done}/${target}` : String(done);

    if (target) {
      pct = Math.min(100, Math.round((done / target) * 100));
      const remaining = Math.max(0, target - done);
      footer = remaining === 0 ? "Weekly target hit 🎉" : `${remaining} to weekly target`;
    } else {
      pct = 0;
      footer = "Set a weekly target";
    }
  } else if (tile.id === "goal") {
    IconComponent = Target;
    iconColor = colors.accent;
    badgeBg = tint("accent", 0.15);

    const goalView = describeGoal({
      fitnessGoal: statData?.fitnessGoal,
      nutritionDirection: statData?.nutritionDirection,
      targetWeightKg: statData?.targetWeightKg,
      startWeightKg: statData?.startWeightKg,
      latestWeight: statData?.latestWeight,
      earliestWeight: statData?.earliestWeight,
      weightUnit: statData?.weightUnit ?? "lbs",
      pace: statData?.pace ?? null,
      program: statData?.programProgress ?? null,
    });

    label = goalView.label;
    value = goalView.value;
    footer = goalView.footer;
    pct = goalView.pct;
    barColor = goalView.atTarget ? colors.success : colors.accent;
    handlePress = handlePress ?? onOpenNutrition;
  } else if (tile.id === "calories") {
    label = "Calories";
    IconComponent = Utensils;
    iconColor = colors.primary;
    badgeBg = tint("primary", 0.15);
    handlePress = handlePress ?? onOpenNutrition;

    const consumed = Math.round(statData?.caloriesConsumed ?? 0);
    const goal = Math.round(statData?.caloriesGoal ?? 2000);
    value = !goal ? "0/--" : `${consumed}/${goal}`;

    if (goal > 0) {
      pct = Math.min(100, Math.max(0, Math.round((consumed / goal) * 100)));
      const over = consumed > goal;
      const remaining = Math.max(0, goal - consumed);
      barColor = over ? colors.destructive : pct >= 90 ? colors.accent : colors.success;
      footer = over ? `${consumed - goal} over` : `${remaining} cal left`;
    } else {
      pct = 0;
      barColor = colors.muted;
      footer = "Set a calorie goal";
    }
  } else if (tile.id === "water") {
    label = "Water";
    IconComponent = Droplets;
    iconColor = colors.primary;
    badgeBg = tint("primary", 0.15);
    barColor = colors.primary;
    handlePress = handlePress ?? onOpenNutrition;

    const current = Math.round(statData?.waterCurrent ?? 0);
    const goal = Math.round(statData?.waterGoal ?? 64);
    value = !goal ? "0/-- oz" : `${current}/${goal} oz`;

    if (goal > 0) {
      pct = Math.min(100, Math.max(0, Math.round((current / goal) * 100)));
      const remaining = Math.max(0, goal - current);
      footer = current >= goal ? "Hydration goal hit 💧" : `${remaining} oz to goal`;
    } else {
      pct = 0;
      footer = "Set a water goal";
    }
  } else if (tile.id === "weight") {
    label = "Weight";
    IconComponent = Scale;
    iconColor = colors["muted-foreground"];
    badgeBg = tint("muted", 0.3);
    barColor = colors["muted-foreground"];
    handlePress = handlePress ?? onOpenCheckIn;

    const unit = statData?.weightUnit ?? "lbs";
    const latest = statData?.latestWeight;
    value = latest != null ? `${latest.toFixed(1)} ${unit}` : "—";
    pct = 50;

    const entries = statData?.weightEntries ?? [];
    if (entries.length >= 2) {
      const cur = entries[entries.length - 1]?.value ?? 0;
      const prev = entries[entries.length - 2]?.value ?? 0;
      const delta = cur - prev;
      const abs = Math.abs(delta);
      if (abs < 0.05) footer = "→ no change";
      else if (delta > 0) footer = `↑ +${abs.toFixed(1)}`;
      else footer = `↓ -${abs.toFixed(1)}`;
    } else if (entries.length === 1) {
      footer = "First weigh-in";
    } else {
      footer = "Log your first weigh-in";
    }
  } else if (tile.id === "workouts") {
    label = "Total Workouts";
    IconComponent = Dumbbell;
    iconColor = colors["muted-foreground"];
    badgeBg = tint("muted", 0.3);
    barColor = colors["muted-foreground"];
    handlePress = handlePress ?? onOpenCalendar;

    const total = statData?.totalWorkouts ?? 0;
    value = String(total);
    pct = 100;
    footer = total === 0 ? "Keep going" : "Lifetime";
  } else {
    label = tile.id
      ? tile.id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Stat";
    value = "—";
    footer = "";
  }

  const accessibilityLabel = `${label}: ${value}${footer ? `, ${footer}` : ""}`;

  return (
    <Pressable
      testID={`tile-${tile.id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      disabled={!handlePress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {wide ? (
        <View style={styles.wideRow}>
          <View style={styles.wideLeft}>
            <View style={[styles.badge, { backgroundColor: badgeBg }]}>
              <IconComponent size={20} color={iconColor} />
            </View>
            <View style={styles.wideMeta}>
              <Text
                className="text-muted-foreground text-xs font-medium"
                numberOfLines={1}
              >
                {label}
              </Text>
              <Text
                testID={`tile-${tile.id}-value`}
                className="text-foreground text-2xl font-bold"
                numberOfLines={1}
              >
                {value}
              </Text>
              {footer ? (
                <Text
                  testID={`tile-${tile.id}-footer`}
                  className="text-muted-foreground text-[11px] mt-0.5"
                  numberOfLines={1}
                >
                  {footer}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.wideRight}>
            <View style={[styles.barTrack, { backgroundColor: colors.muted, width: 80 }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: barColor,
                    width: `${Math.max(0, Math.min(100, pct))}%`,
                  },
                ]}
              />
            </View>
            <ChevronRight size={16} color={colors["muted-foreground"]} />
          </View>
        </View>
      ) : (
        <View style={styles.squareContent}>
          <View style={styles.squareHeader}>
            <View style={[styles.badgeSmall, { backgroundColor: badgeBg }]}>
              <IconComponent size={16} color={iconColor} />
            </View>
            <Text
              className="text-muted-foreground text-xs font-medium flex-1 ml-2"
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
          <Text
            testID={`tile-${tile.id}-value`}
            className="text-foreground text-2xl font-bold mt-2"
            numberOfLines={1}
          >
            {value}
          </Text>
          {/* Progress bar */}
          <View style={[styles.barTrack, { backgroundColor: colors.muted, marginTop: 6 }]}>
            <View
              style={[
                styles.barFill,
                {
                  backgroundColor: barColor,
                  width: `${Math.max(0, Math.min(100, pct))}%`,
                },
              ]}
            />
          </View>
          {footer ? (
            <Text
              testID={`tile-${tile.id}-footer`}
              className="text-muted-foreground text-[11px] mt-1"
              numberOfLines={1}
            >
              {footer}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    minHeight: 96,
    minWidth: 44,
    justifyContent: "center",
  },
  wideRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wideLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 1,
  },
  wideMeta: {
    justifyContent: "center",
    flexShrink: 1,
  },
  wideRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeSmall: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  squareContent: {
    flex: 1,
    justifyContent: "center",
  },
  squareHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
});

export default StatTile;
