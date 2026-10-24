import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Stop } from "react-native-svg";
import { Droplets, UtensilsCrossed, Zap } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { rgbOf, webGradientTokens } from "@/lib/theme/tokens";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { NutritionTrend } from "@/lib/dashboard/nutritionTrend";

type MacroBarKind = "floor" | "ceiling";
type MacroBarStatus = "empty" | "under" | "hit" | "warn" | "over";

function macroBarStatus(
  current: number,
  goal: number,
  kind: MacroBarKind,
): MacroBarStatus {
  if (!Number.isFinite(goal) || goal <= 0) return "empty";
  if (!Number.isFinite(current) || current <= 0) return "empty";
  const ratio = current / goal;
  if (kind === "floor") return ratio >= 0.95 ? "hit" : "under";
  if (ratio > 1.05) return "over";
  if (ratio > 1) return "warn";
  if (ratio >= 0.95) return "hit";
  return "under";
}

function macroBarFillClass(status: MacroBarStatus, identity: string): string {
  switch (status) {
    case "hit":
      return "bg-emerald-500";
    case "warn":
      return "bg-orange-500";
    case "over":
      return "bg-red-500";
    default:
      return identity;
  }
}

function macroValueClass(status: MacroBarStatus): string {
  switch (status) {
    case "hit":
      return "text-emerald-600 dark:text-emerald-400 font-semibold";
    case "warn":
      return "text-orange-600 dark:text-orange-400 font-semibold";
    case "over":
      return "text-red-500 font-semibold";
    default:
      return "text-muted-foreground";
  }
}

export interface MacroValues {
  current: number;
  goal: number;
}

export interface NutritionCardProps {
  calories: { consumed: number; goal: number };
  protein: MacroValues;
  carbs: MacroValues;
  fats: MacroValues;
  water: MacroValues;
  trend?: NutritionTrend | null;
  onOpenNutrition?: () => void;
  onLogMeal?: () => void;
  onQuickAdd?: () => void;
  testID?: string;
}

function MiniBar({
  current,
  goal,
  barClassName,
}: {
  current: number;
  goal: number;
  barClassName: string;
}) {
  const pct = goal > 0 ? Math.min(Math.max(0, current / goal) * 100, 100) : 0;
  return (
    <View className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <View
        className={`h-full rounded-full ${barClassName}`}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

export function NutritionCard({
  calories,
  protein,
  carbs,
  fats,
  water,
  trend,
  onOpenNutrition,
  onLogMeal,
  onQuickAdd,
  testID = "dashboard-nutrition-card",
}: NutritionCardProps) {
  const { colors, isDark } = useThemeTokens();

  const safeGoal = Math.round(
    Number.isFinite(calories.goal) && calories.goal > 0 ? calories.goal : 2000,
  );
  const safeConsumed = Math.round(
    Number.isFinite(calories.consumed) && calories.consumed > 0
      ? calories.consumed
      : 0,
  );
  const remaining = safeGoal - safeConsumed;
  const isOver = remaining < 0;
  const calPct = safeGoal > 0 ? Math.min(safeConsumed / safeGoal, 1) : 0;

  // Mini ring dimensions matching web (ringSize: 80, strokeWidth: 7)
  const ringSize = 80;
  const strokeWidth = 7;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - calPct * circumference;

  const ringStroke = isOver
    ? colors.destructive
    : calPct >= 0.9
      ? colors.orange
      : "url(#miniCalorieGrad)";
  const proteinStatus = macroBarStatus(protein.current, protein.goal, "floor");
  const carbsStatus = macroBarStatus(carbs.current, carbs.goal, "ceiling");
  const fatsStatus = macroBarStatus(fats.current, fats.goal, "ceiling");

  return (
    <Card testID={testID}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text
          testID="nutrition-card-title"
          className="text-sm font-semibold text-foreground"
        >
          Nutrition
        </Text>
        <Pressable
          testID="nutrition-card-view-all"
          accessibilityRole="button"
          accessibilityLabel="View All Nutrition"
          onPress={onOpenNutrition}
          hitSlop={8}
        >
          <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
            View All
          </Text>
        </Pressable>
      </View>

      <View style={styles.bodyRow}>
        {/* Mini calorie ring */}
        <View style={styles.ringWrapper}>
          <Svg width={ringSize} height={ringSize}>
            <Defs>
              <LinearGradient
                id="miniCalorieGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <Stop
                  offset="0%"
                  stopColor={rgbOf(webGradientTokens.emerald500)}
                />
                <Stop offset="100%" stopColor={colors["mind-green"]} />
              </LinearGradient>
            </Defs>
            <G rotation="-90" origin={`${ringSize / 2}, ${ringSize / 2}`}>
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke={colors.border}
                strokeWidth={strokeWidth}
                fill="none"
              />
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke={ringStroke}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </G>
          </Svg>
          <View style={styles.ringCenterText}>
            <Text
              testID="nutrition-card-calories-val"
              className={`text-sm font-bold leading-none ${
                isOver ? "text-red-500" : "text-foreground"
              }`}
            >
              {Math.abs(remaining)}
            </Text>
            <Text
              testID="nutrition-card-calories-label"
              className="text-[9px] text-muted-foreground mt-0.5"
            >
              {isOver ? "over" : "left"}
            </Text>
          </View>
        </View>

        {/* Macros + water */}
        <View style={styles.macrosCol}>
          {/* Protein */}
          <View>
            <View style={styles.macroMetaRow}>
              <Text className="text-[11px] font-medium text-muted-foreground">
                Protein
              </Text>
              <Text
                testID="nutrition-card-protein-meta"
                className={`text-[11px] tabular-nums ${macroValueClass(proteinStatus)}`}
              >
                {Math.round(protein.current)}g / {Math.round(protein.goal)}g
              </Text>
            </View>
            <MiniBar
              current={protein.current}
              goal={protein.goal}
              barClassName={macroBarFillClass(proteinStatus, "bg-blue-600")}
            />
          </View>

          {/* Carbs */}
          <View>
            <View style={styles.macroMetaRow}>
              <Text className="text-[11px] font-medium text-muted-foreground">
                Carbs
              </Text>
              <Text
                testID="nutrition-card-carbs-meta"
                className={`text-[11px] tabular-nums ${macroValueClass(carbsStatus)}`}
              >
                {Math.round(carbs.current)}g / {Math.round(carbs.goal)}g
              </Text>
            </View>
            <MiniBar
              current={carbs.current}
              goal={carbs.goal}
              barClassName={macroBarFillClass(carbsStatus, "bg-green-600")}
            />
          </View>

          {/* Fats */}
          <View>
            <View style={styles.macroMetaRow}>
              <Text className="text-[11px] font-medium text-muted-foreground">
                Fats
              </Text>
              <Text
                testID="nutrition-card-fats-meta"
                className={`text-[11px] tabular-nums ${macroValueClass(fatsStatus)}`}
              >
                {Math.round(fats.current)}g / {Math.round(fats.goal)}g
              </Text>
            </View>
            <MiniBar
              current={fats.current}
              goal={fats.goal}
              barClassName={macroBarFillClass(fatsStatus, "bg-yellow-400")}
            />
          </View>

          {/* Water indicator */}
          <View style={styles.waterRow}>
            <Droplets size={12} color={colors.info} />
            <View style={{ flex: 1 }}>
              <MiniBar
                current={water.current}
                goal={water.goal}
                barClassName="bg-blue-400"
              />
            </View>
            <Text
              testID="nutrition-card-water-meta"
              className="text-[11px] text-muted-foreground tabular-nums"
            >
              {water.current}/{water.goal} oz
            </Text>
          </View>
        </View>
      </View>

      {/* Last 7 days trend */}
      {trend ? (
        <Text
          testID="nutrition-trend"
          className="mt-3 text-[11px] text-muted-foreground"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          <Text className="font-semibold text-foreground">Last 7 days:</Text>{" "}
          {trend.line.replace(/^Logged /, "logged ")}
        </Text>
      ) : null}

      {/* Action buttons */}
      <View style={styles.buttonsRow}>
        <Pressable
          testID="nutrition-card-log-meal"
          accessibilityRole="button"
          accessibilityLabel="Log Meal"
          onPress={onLogMeal ?? onOpenNutrition}
          style={[styles.primaryButton, { backgroundColor: colors.foreground }]}
        >
          <UtensilsCrossed size={14} color={colors.background} />
          <Text
            style={[styles.primaryButtonText, { color: colors.background }]}
          >
            Log Meal
          </Text>
        </Pressable>

        <Pressable
          testID="nutrition-card-quick-add"
          accessibilityRole="button"
          accessibilityLabel="Quick Add"
          onPress={onQuickAdd}
          style={[
            styles.secondaryButton,
            {
              backgroundColor: isDark ? colors.muted : colors.card,
              borderColor: isDark
                ? rgbOf(webGradientTokens.zinc700)
                : colors.border,
            },
          ]}
        >
          <Zap size={14} color={colors.foreground} />
          <Text
            style={[styles.secondaryButtonText, { color: colors.foreground }]}
          >
            Quick Add
          </Text>
        </Pressable>
      </View>
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
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  ringWrapper: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ringCenterText: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  macrosCol: {
    flex: 1,
    justifyContent: "center",
    gap: 8,
  },
  macroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  waterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    minHeight: 44,
  },
  primaryButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
