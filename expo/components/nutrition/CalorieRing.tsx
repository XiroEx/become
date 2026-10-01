import { Pressable, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { Settings2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface MacroValues {
  current: number;
  goal: number;
}

export interface CalorieRingProps {
  consumed: number;
  goal: number;
  protein: MacroValues;
  carbs: MacroValues;
  fats: MacroValues;
  fiber?: number;
  goalLine?: string | null;
  onEditGoals?: () => void;
  testID?: string;
}

function renderMacroPill(
  current: number,
  goal: number,
  kind: "floor" | "ceiling",
  testID: string,
) {
  if (goal <= 0) return null;
  const safeCurrent = Math.max(0, current);
  const remaining = Math.max(0, Math.round(goal - safeCurrent));
  const excess = Math.max(0, Math.round(safeCurrent - goal));
  const ratio = safeCurrent / goal;

  let pillText = "";
  let bgClass = "bg-muted";
  let textClass = "text-muted-foreground";

  if (kind === "floor") {
    // Floor target (Protein): exceeding is a win
    if (excess > 0) {
      pillText = `+${excess}g`;
      bgClass = "bg-emerald-500/10";
      textClass = "text-emerald-600 dark:text-emerald-400";
    } else if (remaining > 0) {
      pillText = `${remaining}g left`;
      if (ratio >= 0.95) {
        bgClass = "bg-emerald-500/10";
        textClass = "text-emerald-600 dark:text-emerald-400";
      } else {
        bgClass = "bg-muted";
        textClass = "text-muted-foreground";
      }
    }
  } else {
    // Ceiling target (Carbs, Fats)
    if (excess > 0) {
      pillText = `+${excess}g`;
      if (ratio > 1.05) {
        bgClass = "bg-red-500/10";
        textClass = "text-red-500";
      } else {
        bgClass = "bg-orange-500/10";
        textClass = "text-orange-500";
      }
    } else if (remaining > 0) {
      pillText = `${remaining}g left`;
      if (ratio >= 0.95) {
        bgClass = "bg-emerald-500/10";
        textClass = "text-emerald-600 dark:text-emerald-400";
      } else {
        bgClass = "bg-muted";
        textClass = "text-muted-foreground";
      }
    }
  }

  if (!pillText) return null;

  return (
    <View testID={testID} className={`px-1.5 py-0.5 rounded ${bgClass}`}>
      <Text className={`text-[10px] font-semibold ${textClass}`}>
        {pillText}
      </Text>
    </View>
  );
}

export function CalorieRing({
  consumed,
  goal,
  protein,
  carbs,
  fats,
  fiber,
  goalLine,
  onEditGoals,
  testID = "calorie-ring",
}: CalorieRingProps) {
  const { colors } = useThemeTokens();
  const safeGoal = Math.round(Number.isFinite(goal) && goal > 0 ? goal : 0);
  const safeConsumed = Math.round(Number.isFinite(consumed) && consumed > 0 ? consumed : 0);
  const remaining = safeGoal - safeConsumed;
  const isOver = remaining < 0;
  const percentage = safeGoal > 0 ? Math.min(safeConsumed / safeGoal, 1) : 0;

  const size = 160;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - percentage * circumference;

  const progressColor = isOver ? colors.destructive : colors.success;

  const proteinPct =
    protein.goal > 0
      ? Math.min((Math.max(protein.current, 0) / protein.goal) * 100, 100)
      : 0;
  const carbsPct =
    carbs.goal > 0
      ? Math.min((Math.max(carbs.current, 0) / carbs.goal) * 100, 100)
      : 0;
  const fatsPct =
    fats.goal > 0
      ? Math.min((Math.max(fats.current, 0) / fats.goal) * 100, 100)
      : 0;

  return (
    <Card testID={testID}>
      {/* Card header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text
          testID="calorie-ring-title"
          className="text-sm font-semibold text-foreground"
        >
          Daily Calories
        </Text>
        <Pressable
          testID="nutrition-edit-goals-btn"
          accessibilityRole="button"
          accessibilityLabel="Edit Goals"
          onPress={onEditGoals}
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          <Settings2 size={14} color={colors["muted-foreground"]} />
          <Text className="text-xs font-medium text-foreground">
            Edit Goals
          </Text>
        </Pressable>
      </View>

      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg width={size} height={size}>
            <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={colors.border}
                strokeWidth={strokeWidth}
                fill="none"
              />
              {percentage > 0 && (
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={progressColor}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              )}
            </G>
          </Svg>
          <View
            style={{
              position: "absolute",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              testID="day-totals-kcal"
              className={`text-3xl font-bold ${
                isOver ? "text-red-500" : "text-foreground"
              }`}
            >
              {Math.abs(remaining)}
            </Text>
            <Text className="text-muted-foreground text-xs font-medium">
              {isOver ? "over" : "remaining"}
            </Text>
          </View>
        </View>

        {/* Goal breakdown */}
        <Text
          testID="day-totals-target"
          className="text-muted-foreground text-xs text-center mt-3"
        >
          Goal {safeGoal} - Food {safeConsumed} ={" "}
          <Text
            testID="day-totals-target-remaining"
            className={
              isOver
                ? "text-red-500 font-semibold"
                : "text-emerald-600 dark:text-emerald-400 font-semibold"
            }
          >
            {Math.abs(remaining)} {isOver ? "over" : "remaining"}
          </Text>
        </Text>

        {/* Goal line */}
        {goalLine ? (
          <Text
            testID="nutrition-goal-line"
            className="text-muted-foreground text-xs text-center mt-1"
          >
            {goalLine}
          </Text>
        ) : null}
      </View>

      {/* Macro bars */}
      <View style={{ marginTop: 20, gap: 12 }}>
        {/* Protein */}
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <Text className="text-foreground text-xs font-semibold">Protein</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text testID="day-totals-protein" className="text-muted-foreground text-xs">
                {Math.round(protein.current)}g / {Math.round(protein.goal)}g P
              </Text>
              {renderMacroPill(protein.current, protein.goal, "floor", "day-totals-protein-pill")}
            </View>
          </View>
          <View className="h-2 rounded-full bg-muted overflow-hidden">
            <View
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${proteinPct}%` }}
            />
          </View>
        </View>

        {/* Carbs */}
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <Text className="text-foreground text-xs font-semibold">Carbs</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text testID="day-totals-carbs" className="text-muted-foreground text-xs">
                {Math.round(carbs.current)}g / {Math.round(carbs.goal)}g C
              </Text>
              {renderMacroPill(carbs.current, carbs.goal, "ceiling", "day-totals-carbs-pill")}
            </View>
          </View>
          <View className="h-2 rounded-full bg-muted overflow-hidden">
            <View
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${carbsPct}%` }}
            />
          </View>
        </View>

        {/* Fats */}
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <Text className="text-foreground text-xs font-semibold">Fats</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text testID="day-totals-fat" className="text-muted-foreground text-xs">
                {Math.round(fats.current)}g / {Math.round(fats.goal)}g F
              </Text>
              {renderMacroPill(fats.current, fats.goal, "ceiling", "day-totals-fat-pill")}
            </View>
          </View>
          <View className="h-2 rounded-full bg-muted overflow-hidden">
            <View
              className="h-full rounded-full bg-purple-500"
              style={{ width: `${fatsPct}%` }}
            />
          </View>
        </View>

        {/* Fiber */}
        {fiber !== undefined && fiber > 0 ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 2,
            }}
          >
            <Text className="text-muted-foreground text-xs">Fiber</Text>
            <Text
              testID="day-totals-fiber"
              className="text-muted-foreground text-xs font-medium"
            >
              {Math.round(fiber)}g
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
