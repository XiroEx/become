import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
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
  testID?: string;
}

export function CalorieRing({
  consumed,
  goal,
  protein,
  carbs,
  fats,
  fiber,
  goalLine,
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
          Goal {safeGoal} - Food {safeConsumed} = {Math.abs(remaining)}{" "}
          {isOver ? "over" : "remaining"}
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
              marginBottom: 4,
            }}
          >
            <Text className="text-foreground text-xs font-semibold">Protein</Text>
            <Text testID="day-totals-protein" className="text-muted-foreground text-xs">
              {Math.round(protein.current)}g / {Math.round(protein.goal)}g P
            </Text>
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
              marginBottom: 4,
            }}
          >
            <Text className="text-foreground text-xs font-semibold">Carbs</Text>
            <Text testID="day-totals-carbs" className="text-muted-foreground text-xs">
              {Math.round(carbs.current)}g / {Math.round(carbs.goal)}g C
            </Text>
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
              marginBottom: 4,
            }}
          >
            <Text className="text-foreground text-xs font-semibold">Fats</Text>
            <Text testID="day-totals-fat" className="text-muted-foreground text-xs">
              {Math.round(fats.current)}g / {Math.round(fats.goal)}g F
            </Text>
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
