import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import type { MealType } from "@/lib/nutrition/daySelector";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export interface SaveAsMealButtonProps {
  onSave: (mealType: MealType) => Promise<void> | void;
  saving?: boolean;
  testID?: string;
}

export function SaveAsMealButton({
  onSave,
  saving = false,
  testID = "save-as-meal",
}: SaveAsMealButtonProps) {
  const [open, setOpen] = useState<boolean>(false);
  const [selected, setSelected] = useState<MealType | null>(null);

  const handleConfirm = async () => {
    if (!selected) return;
    await onSave(selected);
    setOpen(false);
    setSelected(null);
  };

  return (
    <View testID={testID}>
      <Button
        testID={`${testID}-open`}
        onPress={() => setOpen(true)}
      >
        Save as meal
      </Button>
      <BottomSheet
        testID={`${testID}-sheet`}
        visible={open}
        onClose={() => setOpen(false)}
        title="Add to which meal?"
      >
        <View style={{ gap: 8 }}>
          {MEAL_TYPES.map((m) => (
            <Pressable
              key={m}
              testID={`${testID}-option-${m}`}
              onPress={() => setSelected(m)}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === m }}
              className={`p-3 rounded-xl border ${
                selected === m
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              }`}
            >
              <Text className="text-foreground font-medium">
                {MEAL_LABEL[m]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: 8 }} />
        <Button
          testID={`${testID}-confirm`}
          onPress={handleConfirm}
          disabled={!selected || saving}
          loading={saving}
        >
          Save
        </Button>
      </BottomSheet>
    </View>
  );
}
