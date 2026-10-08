import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { Droplets, UtensilsCrossed, Zap } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { NutritionTrend } from "@/lib/dashboard/nutritionTrend";

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
  const quickAddColor = isDark ? "rgb(212, 212, 216)" : "rgb(63, 63, 70)";

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

  const ringColor = isOver ? colors.destructive : colors.success;

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
                stroke={ringColor}
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
                className="text-[11px] text-muted-foreground tabular-nums"
              >
                {Math.round(protein.current)}g / {Math.round(protein.goal)}g
              </Text>
            </View>
            <MiniBar
              current={protein.current}
              goal={protein.goal}
              barClassName="bg-blue-500"
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
                className="text-[11px] text-muted-foreground tabular-nums"
              >
                {Math.round(carbs.current)}g / {Math.round(carbs.goal)}g
              </Text>
            </View>
            <MiniBar
              current={carbs.current}
              goal={carbs.goal}
              barClassName="bg-emerald-500"
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
                className="text-[11px] text-muted-foreground tabular-nums"
              >
                {Math.round(fats.current)}g / {Math.round(fats.goal)}g
              </Text>
            </View>
            <MiniBar
              current={fats.current}
              goal={fats.goal}
              barClassName="bg-amber-400"
            />
          </View>

          {/* Water indicator */}
          <View style={styles.waterRow}>
            <Droplets size={12} color={colors["muted-foreground"]} />
            <View style={{ flex: 1 }}>
              <MiniBar
                current={water.current}
                goal={water.goal}
                barClassName="bg-sky-400"
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
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Zap size={14} color={quickAddColor} />
          <Text
            style={[styles.secondaryButtonText, { color: quickAddColor }]}
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
    paddingVertical: 8,
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
    paddingVertical: 8,
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
