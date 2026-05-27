import { View, Text } from "react-native";
import {
  totalForDay,
  totalsByMeal,
  type MealEntry,
  type MealType,
} from "@/lib/nutrition/daySelector";

export interface DayTotalsProps {
  date: string;
  entries: MealEntry[];
  kcalTarget?: number;
  testID?: string;
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export function DayTotals({
  date,
  entries,
  kcalTarget,
  testID = "day-totals",
}: DayTotalsProps) {
  const totals = totalForDay(entries, date);
  const perMeal = totalsByMeal(entries, date);

  return (
    <View
      testID={testID}
      className="bg-card border border-border rounded-2xl p-4"
    >
      <Text className="text-foreground text-lg font-semibold">Today</Text>
      <Text
        testID={`${testID}-kcal`}
        className="text-foreground text-3xl font-bold"
      >
        {Math.round(totals.kcal)}
        <Text className="text-muted-foreground text-base"> kcal</Text>
      </Text>
      {kcalTarget !== undefined ? (
        <Text
          testID={`${testID}-target`}
          className="text-muted-foreground text-xs"
        >
          target {kcalTarget} kcal
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        <Text
          testID={`${testID}-protein`}
          className="text-foreground"
        >
          {Math.round(totals.protein)}g P
        </Text>
        <Text
          testID={`${testID}-carbs`}
          className="text-foreground"
        >
          {Math.round(totals.carbs)}g C
        </Text>
        <Text
          testID={`${testID}-fat`}
          className="text-foreground"
        >
          {Math.round(totals.fat)}g F
        </Text>
      </View>
      <View style={{ marginTop: 12, gap: 4 }}>
        {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((m) => (
          <View
            key={m}
            testID={`${testID}-meal-${m}`}
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text className="text-muted-foreground text-xs">
              {MEAL_LABELS[m]}
            </Text>
            <Text className="text-muted-foreground text-xs">
              {Math.round(perMeal[m].kcal)} kcal
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
