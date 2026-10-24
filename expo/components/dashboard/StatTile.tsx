import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { Text } from "@/components/Text";
import { rgbOf, webGradientTokens } from "@/lib/theme/tokens";
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
  Smile,
} from "lucide-react-native";
import { describeGoal } from "@become/core";
import { useUnits } from "@/lib/hooks/useUnits";
import { ProgressFill } from "@/components/motion/ProgressFill";
import { PulseView } from "@/components/motion/PulseView";
import { usePressed } from "@/lib/a11y/usePressed";
import { MoodLogSheet } from "./MoodLogSheet";
import type { MoodLevel } from "@/components/CheckInModal";
import { MOOD_LABELS } from "@/components/CheckInModal";
import type { DashboardStatData } from "@/lib/dashboard/types";

/**
 * Custom filled SVG mood faces matching `webapp/components/MoodCard.tsx`
 * (`BadFace`, `NotGreatFace`, `OkayFace`, `PrettyGoodFace`, `GreatFace`,
 * `QuestionFace`).
 */
function MoodTileFace({
  mood,
  size = 20,
  isDark,
  darkStroke,
}: {
  mood: MoodLevel | null | undefined;
  size?: number;
  isDark: boolean;
  darkStroke: string;
}) {
  const strokeFg = isDark ? darkStroke : rgbOf(webGradientTokens.zinc700);
  if (!mood) {
    return (
      <Svg viewBox="0 0 48 48" width={size} height={size}>
        <Circle
          cx="24"
          cy="24"
          r="22"
          fill={
            isDark
              ? rgbOf(webGradientTokens.zinc600)
              : rgbOf(webGradientTokens.zinc300)
          }
        />
        <SvgText
          x="24"
          y="30"
          textAnchor="middle"
          fill={
            isDark
              ? rgbOf(webGradientTokens.zinc400)
              : rgbOf(webGradientTokens.zinc600)
          }
          fontSize="20"
          fontWeight="bold"
        >
          ?
        </SvgText>
      </Svg>
    );
  }
  const faceFill =
    mood === 1
      ? rgbOf(webGradientTokens.red400)
      : mood === 2
        ? rgbOf(webGradientTokens.orange400)
        : mood === 3
          ? rgbOf(webGradientTokens.amber400)
          : mood === 4
            ? rgbOf(webGradientTokens.lime400)
            : rgbOf(webGradientTokens.emerald400);

  return (
    <Svg viewBox="0 0 48 48" width={size} height={size}>
      <Circle cx="24" cy="24" r="22" fill={faceFill} />
      <Circle cx="16" cy="20" r="3" fill={strokeFg} />
      <Circle cx="32" cy="20" r="3" fill={strokeFg} />
      {mood === 1 ? (
        <Path
          d="M14 35 Q24 26 34 35"
          fill="none"
          stroke={strokeFg}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : mood === 2 ? (
        <Path
          d="M16 34 Q24 30 32 34"
          fill="none"
          stroke={strokeFg}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : mood === 3 ? (
        <Line
          x1="16"
          y1="32"
          x2="32"
          y2="32"
          stroke={strokeFg}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : mood === 4 ? (
        <Path
          d="M16 31 Q24 36 32 31"
          fill="none"
          stroke={strokeFg}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : (
        <Path
          d="M14 30 Q24 40 34 30"
          fill="none"
          stroke={strokeFg}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

export interface StatTileProps {
  tile: DashboardTile;
  statData?: DashboardStatData | null;
  loading?: boolean;
  onOpenCalendar?: () => void;
  onOpenNutrition?: () => void;
  /** The Goal tile's own destination: Nutrition Goals, not the day screen (NP-256). */
  onOpenNutritionGoals?: () => void;
  onOpenCheckIn?: () => void;
  /** Opens the weigh-in sheet (NP-105). The weight tile falls back to onOpenCheckIn. */
  onOpenWeight?: () => void;
  /** Opens the mood sheet (NP-107). Falls back to internal sheet or onOpenCheckIn. */
  onOpenMood?: () => void;
  onMoodChange?: (mood: MoodLevel) => Promise<void> | void;
  /** Opens weekly target settings (NP-127). */
  onOpenSettings?: () => void;
  /** Opens streaks detail screen (NP-108). */
  onOpenStreaks?: () => void;
  /** Opens training history (NP-112). The This Week + Total Workouts tiles. */
  onOpenHistory?: () => void;
  onPress?: () => void;
  /**
   * Fired on press BEFORE the tile's own action, and never instead of it — the
   * smart tile's engagement signal (NP-156). The card keeps doing what it does
   * on the grid; the tap is simply also recorded.
   */
  onTap?: () => void;
  testID?: string;
}

export function StatTile({
  tile,
  statData,
  loading = false,
  onOpenCalendar,
  onOpenNutrition,
  onOpenNutritionGoals,
  onOpenCheckIn,
  onOpenWeight,
  onOpenMood,
  onMoodChange,
  onOpenSettings,
  onOpenStreaks,
  onOpenHistory,
  onPress,
  onTap,
  testID,
}: StatTileProps) {
  const { colors, tint, isDark } = useThemeTokens();
  const { weightUnit: userWeightUnit } = useUnits();
  const tilePress = usePressed();
  const unit = statData?.weightUnit ?? userWeightUnit ?? "lbs";
  const wide = tile.size === "2x1";
  const [internalMoodOpen, setInternalMoodOpen] = useState(false);
  const rootTestId = testID ?? `tile-${tile.id}`;

  // Loading skeleton
  if (loading && !statData) {
    return (
      <View
        testID={rootTestId}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <PulseView style={styles.squareContent}>
          <View style={styles.topRow}>
            <View
              style={[
                styles.circleBadge,
                { backgroundColor: colors.muted },
              ]}
            />
            <View style={styles.topMeta}>
              <View
                style={{
                  height: 10,
                  width: "60%",
                  borderRadius: 4,
                  backgroundColor: colors.muted,
                }}
              />
              <View
                style={{
                  height: 22,
                  width: "70%",
                  borderRadius: 4,
                  backgroundColor: colors.muted,
                  marginTop: 4,
                }}
              />
            </View>
          </View>
          <View
            style={{
              height: 6,
              width: "100%",
              borderRadius: 3,
              backgroundColor: colors.muted,
            }}
          />
        </PulseView>
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
  // Mood only: the web's value text and face badge are filled in the
  // SPECIFIC mood's colour (`MoodCard`'s `moodConfig[level].textColor` /
  // `bgColor`), not one flat accent for every level. `undefined` elsewhere
  // leaves every other tile's `text-foreground` className untouched.
  let valueColor: string | undefined;

  if (tile.id === "streak") {
    label = "Day Streak";
    IconComponent = Flame;
    iconColor = colors.accent;
    badgeBg = isDark
      ? rgbOf(webGradientTokens.amber900, 0.3)
      : rgbOf(webGradientTokens.amber100);
    barColor = rgbOf(webGradientTokens.amber500);
    handlePress = handlePress ?? onOpenStreaks ?? onOpenCalendar;

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
    handlePress =
      handlePress ??
      onOpenMood ??
      (onMoodChange ? () => setInternalMoodOpen(true) : onOpenCheckIn);

    const currentMood = statData?.todaysMood as MoodLevel | null | undefined;
    // Filled face + coloured value, matching `webapp/components/MoodCard.tsx`
    // (`moodConfig[level]` `bgColor`/`textColor`).
    if (currentMood === 1) {
      badgeBg = isDark
        ? rgbOf(webGradientTokens.red900, 0.3)
        : rgbOf(webGradientTokens.red100);
      valueColor = isDark
        ? rgbOf(webGradientTokens.red300)
        : rgbOf(webGradientTokens.red700);
    } else if (currentMood === 2) {
      badgeBg = isDark
        ? rgbOf(webGradientTokens.orange900, 0.3)
        : rgbOf(webGradientTokens.orange100);
      valueColor = isDark
        ? colors["mood-low"]
        : rgbOf(webGradientTokens.orange700);
    } else if (currentMood === 3) {
      badgeBg = isDark
        ? rgbOf(webGradientTokens.amber900, 0.3)
        : rgbOf(webGradientTokens.amber100);
      valueColor = isDark
        ? rgbOf(webGradientTokens.amber300)
        : rgbOf(webGradientTokens.amber700);
    } else if (currentMood === 4) {
      badgeBg = isDark
        ? rgbOf(webGradientTokens.lime900, 0.3)
        : rgbOf(webGradientTokens.lime100);
      valueColor = isDark
        ? rgbOf(webGradientTokens.lime300)
        : rgbOf(webGradientTokens.lime700);
    } else if (currentMood === 5) {
      badgeBg = isDark
        ? rgbOf(webGradientTokens.emerald900, 0.3)
        : rgbOf(webGradientTokens.emerald100);
      valueColor = isDark
        ? rgbOf(webGradientTokens.emerald300)
        : rgbOf(webGradientTokens.emerald700);
    } else {
      badgeBg = isDark ? colors.muted : rgbOf(webGradientTokens.zinc100);
      valueColor = colors.foreground;
    }
    value = currentMood && MOOD_LABELS[currentMood] ? MOOD_LABELS[currentMood] : "Set";

    const recent = statData?.recentMoods ?? [];
    const last7 = recent.slice(-7);
    if (last7.length > 0) {
      const avg = last7.reduce((a, b) => a + b, 0) / last7.length;
      pct = Math.min(100, Math.round((avg / 5) * 100));
      barColor =
        avg >= 4.5
          ? rgbOf(webGradientTokens.emerald500)
          : avg >= 3.5
            ? rgbOf(webGradientTokens.lime500)
            : avg >= 2.5
              ? rgbOf(webGradientTokens.amber500)
              : avg >= 1.5
                ? colors.orange
                : rgbOf(webGradientTokens.red500);
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
    badgeBg = isDark
      ? rgbOf(webGradientTokens.green900, 0.3)
      : rgbOf(webGradientTokens.green100);
    barColor = colors["mind-green"];

    const target = statData?.weeklyTarget ?? null;
    const done = statData?.thisWeekWorkouts ?? 0;

    if (!target) {
      value = String(done);
      pct = 0;
      footer = "Set a weekly target";
      // The link opens the weekly-target setting (NP-127), and is inert until that exists
      handlePress = handlePress ?? onOpenSettings;
    } else {
      value = `${done}/${target}`;
      pct = Math.min(100, Math.round((done / target) * 100));
      const remaining = Math.max(0, target - done);
      footer = remaining === 0 ? "Weekly target hit 🎉" : `${remaining} to weekly target`;
      // The training log — the sessions this number counts (web
      // `dashboardTiles.tsx#renderWeekly` hrefs `/dashboard/history`).
      handlePress = handlePress ?? onOpenHistory ?? onOpenCalendar;
    }
  } else if (tile.id === "goal") {
    IconComponent = Target;
    iconColor = colors.accent;
    badgeBg = isDark
      ? rgbOf(webGradientTokens.amber900, 0.3)
      : rgbOf(webGradientTokens.amber100);

    const goalView = describeGoal({
      fitnessGoal: statData?.fitnessGoal,
      nutritionDirection: statData?.nutritionDirection,
      targetWeightKg: statData?.targetWeightKg,
      startWeightKg: statData?.startWeightKg,
      latestWeight: statData?.latestWeight,
      earliestWeight: statData?.earliestWeight,
      weightUnit: unit,
      pace: statData?.pace ?? null,
      program: statData?.programProgress ?? null,
    });

    label = goalView.label;
    value = goalView.value;
    if (goalView.kind === "unset") {
      valueColor = isDark
        ? rgbOf(webGradientTokens.zinc500)
        : rgbOf(webGradientTokens.zinc400);
    }
    const arrow =
      goalView.direction === "down" ? "↓ " : goalView.direction === "up" ? "↑ " : "";
    footer = `${arrow}${goalView.footer}`;
    pct = goalView.pct;
    barColor = goalView.atTarget
      ? colors["mind-green"]
      : rgbOf(webGradientTokens.amber500);
    // Nutrition Goals (web's `/dashboard/nutrition/goals`), not the day
    // screen — NP-256.
    handlePress = handlePress ?? onOpenNutritionGoals ?? onOpenNutrition;
  } else if (tile.id === "calories") {
    label = "Calories";
    IconComponent = Utensils;
    handlePress = handlePress ?? onOpenNutrition;

    const consumed = Math.round(statData?.caloriesConsumed ?? 0);
    const hasGoal = statData?.caloriesGoal != null && statData.caloriesGoal > 0;
    const goal = hasGoal ? Math.round(statData!.caloriesGoal!) : 0;
    value = !goal ? "0/--" : `${consumed}/${goal}`;

    if (goal > 0) {
      pct = Math.min(100, Math.max(0, Math.round((consumed / goal) * 100)));
      const over = consumed > goal;
      const remaining = Math.max(0, goal - consumed);
      barColor = over
        ? colors.brand
        : pct >= 90
          ? rgbOf(webGradientTokens.amber500)
          : colors["mind-green"];
      footer = over ? `${consumed - goal} over` : `${remaining} cal left`;
      // Matches the web's `renderCalories`: green while under goal, red only
      // when over (or, below, when no goal is set at all) — never a flat red
      // icon tile for the common "on track" state.
      iconColor = over ? colors.destructive : colors.success;
      badgeBg = over
        ? isDark
          ? rgbOf(webGradientTokens.red900, 0.3)
          : rgbOf(webGradientTokens.red100)
        : isDark
          ? rgbOf(webGradientTokens.green900, 0.3)
          : rgbOf(webGradientTokens.green100);
    } else {
      pct = 0;
      barColor = colors.muted;
      footer = "Set a calorie goal";
      iconColor = colors.destructive;
      badgeBg = isDark
        ? rgbOf(webGradientTokens.red900, 0.3)
        : rgbOf(webGradientTokens.red100);
    }
  } else if (tile.id === "water") {
    label = "Water";
    IconComponent = Droplets;
    iconColor = colors.info;
    badgeBg = isDark
      ? rgbOf(webGradientTokens.blue900, 0.3)
      : rgbOf(webGradientTokens.blue100);
    barColor = colors["mind-blue"];
    handlePress = handlePress ?? onOpenNutrition;

    const current = Math.round(statData?.waterCurrent ?? 0);
    const hasGoal = statData?.waterGoal != null && statData.waterGoal > 0;
    const goal = hasGoal ? Math.round(statData!.waterGoal!) : 0;
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
    badgeBg = isDark ? colors.muted : rgbOf(webGradientTokens.zinc100);
    handlePress = handlePress ?? onOpenWeight ?? onOpenCheckIn;

    const latest = statData?.latestWeight;
    value = latest != null ? `${latest.toFixed(1)} ${unit}` : "—";
    pct = 50;

    let isFlat = false;
    const entries = statData?.weightEntries ?? [];
    if (entries.length >= 2) {
      const cur = entries[entries.length - 1]?.value ?? 0;
      const prev = entries[entries.length - 2]?.value ?? 0;
      const delta = cur - prev;
      const abs = Math.abs(delta);
      if (abs < 0.05) {
        footer = "→ no change";
        isFlat = true;
      } else if (delta > 0) footer = `↑ +${abs.toFixed(1)}`;
      else footer = `↓ -${abs.toFixed(1)}`;
    } else if (entries.length === 1) {
      footer = "First weigh-in";
    } else {
      footer = "Log your first weigh-in";
    }
    barColor = isFlat
      ? isDark
        ? rgbOf(webGradientTokens.zinc700)
        : rgbOf(webGradientTokens.zinc300)
      : isDark
        ? rgbOf(webGradientTokens.zinc500)
        : rgbOf(webGradientTokens.zinc400);
  } else if (tile.id === "workouts") {
    label = "Total Workouts";
    IconComponent = Dumbbell;
    iconColor = colors["muted-foreground"];
    badgeBg = isDark ? colors.muted : rgbOf(webGradientTokens.zinc100);
    barColor = isDark
      ? rgbOf(webGradientTokens.zinc500)
      : rgbOf(webGradientTokens.zinc400);
    // The training log — the sessions this number counts (web
    // `dashboardTiles.tsx#renderWorkouts` hrefs `/dashboard/history`).
    handlePress = handlePress ?? onOpenHistory ?? onOpenCalendar;

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

  // The tap signal is additive: record it, then do whatever the tile does.
  const resolvedPress = handlePress;
  const pressHandler = onTap
    ? () => {
        onTap();
        resolvedPress?.();
      }
    : resolvedPress;

  return (
    <>
      <Pressable
        testID={rootTestId}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={pressHandler}
        onPressIn={tilePress.onPressIn}
        onPressOut={tilePress.onPressOut}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: tilePress.pressed ? 0.85 : 1,
          },
        ]}
      >
        {wide ? (
          <View style={styles.wideRow}>
            <View style={styles.wideLeft}>
              <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                {tile.id === "mood" ? (
                  <MoodTileFace
                    mood={statData?.todaysMood as MoodLevel | null | undefined}
                    size={22}
                    isDark={isDark}
                    darkStroke={colors.muted}
                  />
                ) : (
                  <IconComponent size={20} color={iconColor} />
                )}
              </View>
              <View style={styles.wideMeta}>
                <Text
                  className="text-muted-foreground text-xs font-medium"
                  numberOfLines={1}
                >
                  {label}
                </Text>
                <Text
                  testID={`${rootTestId}-value`}
                  className="text-foreground text-2xl font-bold"
                  style={valueColor ? { color: valueColor } : undefined}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {value}
                </Text>
                {footer ? (
                  <Text
                    testID={`${rootTestId}-footer`}
                    className="text-muted-foreground text-[11px] mt-0.5"
                    numberOfLines={1}
                  >
                    {footer}
                  </Text>
                ) : null}
              </View>
            </View>
            {/* Web's wide `StatTile` never draws a chevron or a trailing dot
                — just the bar, and it stretches (`flex-1`) to fill the space
                beside the value column rather than a short fixed width. */}
            <View style={styles.wideRight}>
              <View
                style={[
                  styles.barTrack,
                  {
                    backgroundColor: colors.muted,
                    height: tile.id === "mood" ? 4 : 6,
                  },
                ]}
              >
                <ProgressFill
                  pct={pct}
                  color={barColor}
                  testID={`${rootTestId}-fill`}
                />
              </View>
            </View>
          </View>
        ) : (
          // Horizontal 1x1 layout, matching the web's `StatTile.tsx`
          // (`flex h-full flex-col justify-center gap-1.5`): a circular
          // badge on the LEFT with label + value stacked beside it, and a
          // full-width bar + caption below — not the old vertically-stacked
          // badge-above-label shape (NP-352).
          <View style={styles.squareContent}>
            <View style={styles.topRow}>
              <View style={[styles.circleBadge, { backgroundColor: badgeBg }]}>
                {tile.id === "mood" ? (
                  <MoodTileFace
                    mood={statData?.todaysMood as MoodLevel | null | undefined}
                    size={20}
                    isDark={isDark}
                    darkStroke={colors.muted}
                  />
                ) : (
                  <IconComponent size={18} color={iconColor} />
                )}
              </View>
              <View style={styles.topMeta}>
                <Text
                  className="text-muted-foreground text-xs"
                  numberOfLines={1}
                >
                  {label}
                </Text>
                <Text
                  testID={`${rootTestId}-value`}
                  className="text-foreground text-2xl font-extrabold tracking-tight leading-none"
                  style={valueColor ? { color: valueColor } : undefined}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {value}
                </Text>
              </View>
            </View>
            <View style={styles.bottomCol}>
              <View
                style={[
                  styles.barTrack,
                  {
                    backgroundColor: colors.muted,
                    height: tile.id === "mood" ? 4 : 6,
                  },
                ]}
              >
                <ProgressFill
                  pct={pct}
                  color={barColor}
                  testID={`${rootTestId}-fill`}
                />
              </View>
              {footer ? (
                <Text
                  testID={`${rootTestId}-footer`}
                  className="text-muted-foreground text-[11px]"
                  numberOfLines={1}
                >
                  {footer}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>

      {tile.id === "mood" ? (
        <MoodLogSheet
          testID="tile-mood-sheet"
          visible={internalMoodOpen}
          onClose={() => setInternalMoodOpen(false)}
          onSubmit={onMoodChange}
          currentMood={statData?.todaysMood}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    // Fills the grid's fixed 96px cell (NP-352) instead of growing to
    // content — a `minHeight` here is how Weight and Mood ended up visibly
    // different heights in the same row.
    height: "100%",
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
    flex: 1,
    minWidth: 0,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  squareContent: {
    flex: 1,
    justifyContent: "center",
    gap: 6,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  // The web's circular badge on the left of the 1x1 layout (`h-9 w-9
  // rounded-full`) — the old `badgeSmall` was a rounded SQUARE sitting
  // above the label (NP-352).
  circleBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  topMeta: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  bottomCol: {
    gap: 2,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
});

export default StatTile;
