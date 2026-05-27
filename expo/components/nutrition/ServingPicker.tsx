import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import {
  GRAMS_PER_OZ,
  macroBreakdownForServing,
  type FoodNutrition,
  type ServingSpec,
  type ServingUnit,
} from "@/lib/nutrition/servingMath";

export interface ServingPickerProps {
  food: FoodNutrition;
  onSubmit: (input: { spec: ServingSpec; grams: number }) => void;
  defaultUnit?: ServingUnit;
  defaultAmount?: number;
  /** Optional named servings the food supports (e.g. "1 medium" → 100g). */
  customUnits?: { label: string; gramsPerUnit: number }[];
  testID?: string;
}

export function ServingPicker({
  food,
  onSubmit,
  defaultUnit = "g",
  defaultAmount = 100,
  customUnits = [],
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
          .filter((u) => u !== "custom" || customUnits.length > 0)
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
        <Text testID={`${testID}-preview-grams`} className="text-muted-foreground text-xs">
          {Math.round(grams)} g
        </Text>
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
