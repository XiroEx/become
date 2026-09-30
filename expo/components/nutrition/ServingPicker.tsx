import { useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
export interface FoodNutrition {
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface MacroBreakdown {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type ServingUnit = "g" | "oz" | "custom";

export interface ServingSpec {
  unit: ServingUnit;
  amount: number;
  /** Required for `custom` units; defaults to 28.3495 for `oz`. */
  gramsPerUnit?: number;
}

export const GRAMS_PER_OZ = 28.3495;

export function gramsForServing(spec: ServingSpec): number {
  if (!Number.isFinite(spec.amount) || spec.amount <= 0) return 0;
  switch (spec.unit) {
    case "g":
      return spec.amount;
    case "oz":
      return spec.amount * (spec.gramsPerUnit ?? GRAMS_PER_OZ);
    case "custom":
      if (!spec.gramsPerUnit || spec.gramsPerUnit <= 0) return 0;
      return spec.amount * spec.gramsPerUnit;
  }
}

export function scaleNutrition(
  food: FoodNutrition,
  grams: number,
): MacroBreakdown {
  if (!Number.isFinite(grams) || grams <= 0) {
    return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }
  const factor = grams / 100;
  return {
    kcal: food.kcalPer100g * factor,
    protein: food.proteinPer100g * factor,
    carbs: food.carbsPer100g * factor,
    fat: food.fatPer100g * factor,
  };
}

export function macroBreakdownForServing(
  food: FoodNutrition,
  spec: ServingSpec,
): MacroBreakdown {
  return scaleNutrition(food, gramsForServing(spec));
}

export interface ServingPickerProps {
  food: FoodNutrition;
  onSubmit: (input: { spec: ServingSpec; grams: number }) => void;
  defaultUnit?: ServingUnit;
  defaultAmount?: number;
  /** Optional named servings the food supports (e.g. "1 medium" → 100g). */
  customUnits?: { label: string; gramsPerUnit: number }[];
  /**
   * Whether the food has a weight at all. A count-native food with no
   * grams-per-serving bridge ("1 scoop") is picked in servings, so the gram
   * units and the gram caption would both be inventions — hidden rather than
   * shown as a number that is not true.
   */
  showGrams?: boolean;
  testID?: string;
}

export function ServingPicker({
  food,
  onSubmit,
  defaultUnit = "g",
  defaultAmount = 100,
  customUnits = [],
  showGrams = true,
  testID = "serving-picker",
}: ServingPickerProps) {
  const [unit, setUnit] = useState<ServingUnit>(defaultUnit);
  const [amount, setAmount] = useState<string>(String(defaultAmount));
  const [customLabel, setCustomLabel] = useState<string | null>(
    customUnits[0]?.label ?? null,
  );

  const numericAmount = Number(amount);
  const gramsPerUnit =
    unit === "g"
      ? 1
      : unit === "oz"
        ? GRAMS_PER_OZ
        : customUnits.find((c) => c.label === customLabel)?.gramsPerUnit ?? 0;

  const spec: ServingSpec = {
    unit,
    amount: Number.isFinite(numericAmount) ? numericAmount : 0,
    gramsPerUnit,
  };
  const macros = useMemo(
    () => macroBreakdownForServing(food, spec),
    // Tracking the resolved primitives avoids forming a new spec identity
    // every render while still capturing every input the math depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [food, spec.unit, spec.amount, spec.gramsPerUnit],
  );
  const grams =
    unit === "g"
      ? numericAmount
      : numericAmount * gramsPerUnit;

  return (
    <View testID={testID} style={{ gap: 12 }}>
      <Text className="text-foreground font-semibold mb-1">Serving</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["g", "oz", "custom"] as ServingUnit[])
          .filter((u) => (u === "custom" ? customUnits.length > 0 : showGrams))
          .map((u) => (
            <Pressable
              key={u}
              testID={`${testID}-unit-${u}`}
              onPress={() => setUnit(u)}
              accessibilityRole="radio"
              accessibilityState={{ selected: unit === u }}
              className={`px-3 py-2 rounded-xl border ${
                unit === u ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <Text className="text-foreground">
                {u === "g" ? "grams" : u === "oz" ? "oz" : "Custom"}
              </Text>
            </Pressable>
          ))}
      </View>
      {unit === "custom" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {customUnits.map((c) => (
            <Pressable
              key={c.label}
              testID={`${testID}-custom-${c.label.replace(/\s+/g, "-")}`}
              onPress={() => setCustomLabel(c.label)}
              accessibilityRole="radio"
              accessibilityState={{ selected: customLabel === c.label }}
              className={`px-3 py-2 rounded-xl border ${
                customLabel === c.label ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <Text className="text-foreground">{c.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Input
        testID={`${testID}-amount`}
        label="Amount"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />
      <View
        testID={`${testID}-preview`}
        className="rounded-xl bg-muted p-3"
      >
        <Text testID={`${testID}-preview-kcal`} className="text-foreground font-semibold">
          {Math.round(macros.kcal)} kcal
        </Text>
        <Text className="text-muted-foreground text-xs">
          {Math.round(macros.protein * 10) / 10}P · {Math.round(macros.carbs * 10) / 10}C · {Math.round(macros.fat * 10) / 10}F
        </Text>
        {showGrams ? (
          <Text testID={`${testID}-preview-grams`} className="text-muted-foreground text-xs">
            {Math.round(grams)} g
          </Text>
        ) : null}
      </View>
      <Button
        testID={`${testID}-submit`}
        onPress={() => onSubmit({ spec, grams })}
        disabled={!Number.isFinite(numericAmount) || numericAmount <= 0}
      >
        Log
      </Button>
    </View>
  );
}
