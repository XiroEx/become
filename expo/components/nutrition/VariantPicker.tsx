import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Button } from "@/components/Button";

export interface FoodVariant {
  variantId: string;
  label: string;
  brand?: string | null;
  kcalPer100g: number;
}

export interface VariantPickerProps {
  variants: FoodVariant[];
  /** If the canonical (no-variant) option is selectable. */
  canonicalLabel?: string;
  onSubmit: (variantId: string | null) => void;
  testID?: string;
}

export function VariantPicker({
  variants,
  canonicalLabel = "Default",
  onSubmit,
  testID = "variant-picker",
}: VariantPickerProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <View testID={testID} style={{ gap: 8 }}>
      <Text className="text-foreground font-semibold mb-1">Pick a variant</Text>
      <Pressable
        testID={`${testID}-option-canonical`}
        onPress={() => setSelected(null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: selected === null }}
        className={`p-3 rounded-xl border ${
          selected === null ? "border-primary bg-primary/10" : "border-border bg-card"
        }`}
      >
        <Text className="text-foreground font-medium">{canonicalLabel}</Text>
      </Pressable>
      {variants.map((v) => (
        <Pressable
          key={v.variantId}
          testID={`${testID}-option-${v.variantId}`}
          onPress={() => setSelected(v.variantId)}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === v.variantId }}
          className={`p-3 rounded-xl border ${
            selected === v.variantId
              ? "border-primary bg-primary/10"
              : "border-border bg-card"
          }`}
        >
          <Text className="text-foreground font-medium">{v.label}</Text>
          {v.brand ? (
            <Text className="text-muted-foreground text-xs">{v.brand}</Text>
          ) : null}
          <Text className="text-muted-foreground text-xs mt-1">
            {Math.round(v.kcalPer100g)} kcal / 100g
          </Text>
        </Pressable>
      ))}
      <View style={{ height: 4 }} />
      <Button
        testID={`${testID}-submit`}
        onPress={() => onSubmit(selected)}
      >
        Continue
      </Button>
    </View>
  );
}
