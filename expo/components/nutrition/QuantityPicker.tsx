import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
} from "react-native";
import { Text } from "@/components/Text";
import {
  nutritionForQuantity,
  scalingFactor,
} from "@/lib/nutrition/foodMath";
import {
  type ServingChoice,
  buildServingChoiceGroups,
  servingChoiceDisplayLabel,
  variantForServingChoice,
} from "@/lib/nutrition/servingOptions";
import { servingQuantityStep } from "@/lib/nutrition/servingQuantityStep";
import type { Unit } from "@/lib/nutrition/units";
import {
  buildMealItemPayload,
  type FoodMacros,
  type MealItemPayload,
} from "@/lib/nutrition/mealLogActions";
import { todayLocalKey } from "@/lib/nutrition/mealPlanDates";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface QuantityPickerFood {
  _id?: string | null;
  id?: string | null;
  name?: string | null;
  brand?: string | null;
  servingSize?: number;
  servingUnit?: string;
  gramsPerServing?: number;
  mlPerServing?: number;
  nutrition?: FoodMacros;
  variants?: any[];
  [k: string]: unknown;
}

export interface QuantityPickerSelection {
  quantity: number;
  unit: string;
  nutrition: FoodMacros;
  multiplier: number;
  variant: any;
  servingChoice?: ServingChoice;
  tag: string;
  date: string;
  timeMode: "now" | "picked" | "none";
  pickedTime: string | null;
}

/** What the Log/"Add to <tag>"/"Build a meal" buttons hand back. */
export interface QuantityPickerLogResult {
  item: MealItemPayload;
  tag: string;
  date: string;
  timeMode: "now" | "picked" | "none";
  pickedTime: string | null;
}

export interface QuantityPickerProps {
  food?: QuantityPickerFood | null;
  variant?: any;
  variants?: any[];
  initialVariantId?: string;
  initialQuantity?: number;
  initialUnit?: string;
  initialTag?: string;
  initialDate?: string;
  initialTimeMode?: "now" | "picked" | "none";
  initialPickedTime?: string;
  /**
   * Amount-only mode for the edit sheets (NP-095): hides the tag / time /
   * date / log-button controls — the sheet owns those — and leaves the
   * variant, serving-unit and quantity controls with their live preview.
   * `onChange` still emits every amount edit.
   */
  showLogControls?: boolean;
  onChange?: (selection: QuantityPickerSelection) => void;
  onSubmit?: (result: QuantityPickerLogResult) => void | Promise<void>;
  /**
   * Overrides the primary button's label (default "Log Food") — e.g.
   * `FoodSearchSheet`'s "Add to Breakfast" (NP-261). Still fires `onSubmit`.
   */
  primaryActionLabel?: string;
  /**
   * A second button next to the primary one (NP-261's "Build a meal",
   * additive to every other consumer — only rendered when both this and
   * `onSecondaryAction` are set).
   */
  secondaryActionLabel?: string;
  onSecondaryAction?: (result: QuantityPickerLogResult) => void | Promise<void>;
  testID?: string;
}

const TAG_OPTIONS = ["breakfast", "lunch", "dinner", "snack"] as const;

function round(val: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

export function QuantityPicker({
  food,
  variant: propVariant,
  variants: propVariants,
  initialVariantId,
  initialQuantity = 1,
  initialUnit,
  initialTag = "snack",
  initialDate,
  initialTimeMode = "now",
  initialPickedTime = "12:00",
  showLogControls = true,
  onChange,
  onSubmit,
  primaryActionLabel,
  secondaryActionLabel,
  onSecondaryAction,
  testID = "quantity-picker",
}: QuantityPickerProps) {
  const { colors } = useThemeTokens();

  // 1. Resolve list of variants
  const resolvedVariants = useMemo(() => {
    if (propVariants && propVariants.length > 0) return propVariants;
    if (food?.variants && food.variants.length > 0) return food.variants;
    if (propVariant) return [propVariant];
    if (food && food.servingSize && food.servingUnit && food.nutrition) {
      return [
        {
          _id: (food._id ?? food.id) ? `${food._id ?? food.id}-var-default` : "default",
          name: "Default",
          servingSize: food.servingSize,
          servingUnit: food.servingUnit,
          nutrition: food.nutrition,
          gramsPerServing: food.gramsPerServing,
          mlPerServing: food.mlPerServing,
        },
      ];
    }
    return [];
  }, [propVariants, food, propVariant]);

  // Selected variant index
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number>(() => {
    if (!initialVariantId || resolvedVariants.length === 0) return 0;
    const idx = resolvedVariants.findIndex(
      (v) => (v._id ?? v.id) === initialVariantId || v.name === initialVariantId,
    );
    return idx >= 0 ? idx : 0;
  });

  const handleSelectVariant = (idx: number) => {
    setSelectedVariantIdx(idx);
    const nextVariant = resolvedVariants[idx];
    if (nextVariant) {
      try {
        const nextGroups = buildServingChoiceGroups(nextVariant);
        const nextAll = [
          ...nextGroups.servings,
          ...nextGroups.weight,
          ...nextGroups.volume,
        ];
        setSelectedChoiceId((prevId) => {
          if (prevId && nextAll.some((c) => c.id === prevId)) {
            return prevId;
          }
          const defaultChoice =
            nextGroups.servings[0] ??
            nextGroups.weight[0] ??
            nextGroups.volume[0] ??
            nextAll[0] ??
            null;
          return defaultChoice ? defaultChoice.id : null;
        });
      } catch {
        setSelectedChoiceId(null);
      }
    }
  };

  const activeVariant = resolvedVariants[selectedVariantIdx] ?? resolvedVariants[0];

  // 2. Build serving choice groups
  const choiceGroups = useMemo(() => {
    if (!activeVariant) return { servings: [], weight: [], volume: [] };
    try {
      return buildServingChoiceGroups(activeVariant);
    } catch {
      return { servings: [], weight: [], volume: [] };
    }
  }, [activeVariant]);

  const allChoices = useMemo(() => {
    return [
      ...choiceGroups.servings,
      ...choiceGroups.weight,
      ...choiceGroups.volume,
    ];
  }, [choiceGroups]);

  // Selected serving choice ID
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(() => {
    if (initialUnit && allChoices.length > 0) {
      const match = allChoices.find((c) => c.unit === initialUnit);
      if (match) return match.id;
    }
    return (
      choiceGroups.servings[0]?.id ??
      choiceGroups.weight[0]?.id ??
      choiceGroups.volume[0]?.id ??
      allChoices[0]?.id ??
      null
    );
  });

  const selectedChoice = useMemo(() => {
    if (selectedChoiceId) {
      const found = allChoices.find((c) => c.id === selectedChoiceId);
      if (found) return found;
    }
    return (
      choiceGroups.servings[0] ??
      choiceGroups.weight[0] ??
      choiceGroups.volume[0] ??
      allChoices[0] ??
      null
    );
  }, [allChoices, choiceGroups, selectedChoiceId]);

  // 3. Unit and Quantity
  const unit = selectedChoice?.unit ?? initialUnit ?? activeVariant?.servingUnit ?? "g";

  const [quantity, setQuantity] = useState<number>(initialQuantity);
  const [quantityText, setQuantityText] = useState<string>(String(initialQuantity));

  const handleQuantityTextChange = (text: string) => {
    setQuantityText(text);
    const parsed = parseFloat(text);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      setQuantity(parsed);
    } else if (text.trim() === "") {
      setQuantity(0);
    }
  };

  const step = useMemo(() => {
    return servingQuantityStep(unit);
  }, [unit]);

  const handleDecrement = () => {
    const nextVal = Math.max(step, round(quantity - step));
    setQuantity(nextVal);
    setQuantityText(String(nextVal));
  };

  const handleIncrement = () => {
    const nextVal = round(quantity + step);
    setQuantity(nextVal);
    setQuantityText(String(nextVal));
  };

  // 4. Tag selection
  const [tag, setTag] = useState<string>(initialTag);

  // 5. Time selection
  const [timeMode, setTimeMode] = useState<"now" | "picked" | "none">(initialTimeMode);
  const [pickedTime, setPickedTime] = useState<string>(initialPickedTime);

  // 6. Date selection
  const [date, setDate] = useState<string>(() => initialDate ?? todayLocalKey());

  // 7. Live macro preview
  const effectiveVariant = useMemo(() => {
    if (!activeVariant) return null;
    if (selectedChoice) {
      return variantForServingChoice(activeVariant, selectedChoice);
    }
    return activeVariant;
  }, [activeVariant, selectedChoice]);

  const previewMacros = useMemo(() => {
    if (!effectiveVariant || quantity <= 0) {
      return { calories: 0, protein: 0, carbs: 0, fats: 0 };
    }
    try {
      const raw = nutritionForQuantity(effectiveVariant, quantity, unit as Unit);
      return {
        calories: Math.round(raw.calories * 10) / 10,
        protein: Math.round(raw.protein * 10) / 10,
        carbs: Math.round(raw.carbs * 10) / 10,
        fats: Math.round(raw.fats * 10) / 10,
      };
    } catch {
      return { calories: 0, protein: 0, carbs: 0, fats: 0 };
    }
  }, [effectiveVariant, quantity, unit]);

  const multiplier = useMemo(() => {
    if (!effectiveVariant || quantity <= 0) return 0;
    try {
      return scalingFactor(effectiveVariant, quantity, unit as Unit);
    } catch {
      return 0;
    }
  }, [effectiveVariant, quantity, unit]);

  // Notify onChange
  useEffect(() => {
    if (onChange && activeVariant) {
      onChange({
        quantity,
        unit,
        nutrition: previewMacros,
        multiplier,
        variant: activeVariant,
        servingChoice: selectedChoice ?? undefined,
        tag,
        date,
        timeMode,
        pickedTime: timeMode === "picked" ? pickedTime : null,
      });
    }
  }, [
    quantity,
    unit,
    previewMacros,
    multiplier,
    activeVariant,
    selectedChoice,
    tag,
    date,
    timeMode,
    pickedTime,
    onChange,
  ]);

  // 8. Submit / Log handler
  const buildLogResult = useCallback((): QuantityPickerLogResult | null => {
    if (!activeVariant) return null;
    const foodObj = food ?? {
      name: activeVariant.name ?? "Food",
    };
    const item = buildMealItemPayload({
      food: foodObj,
      variant: activeVariant,
      quantity,
      unit,
      servingChoice: selectedChoice ?? undefined,
    });

    return {
      item,
      tag,
      date,
      timeMode,
      pickedTime: timeMode === "picked" ? pickedTime : null,
    };
  }, [food, activeVariant, quantity, unit, selectedChoice, tag, date, timeMode, pickedTime]);

  const handleLog = useCallback(() => {
    const result = buildLogResult();
    if (!result) return;
    if (onSubmit) {
      onSubmit(result);
    }
  }, [buildLogResult, onSubmit]);

  const handleSecondaryAction = useCallback(() => {
    const result = buildLogResult();
    if (!result) return;
    if (onSecondaryAction) {
      onSecondaryAction(result);
    }
  }, [buildLogResult, onSecondaryAction]);

  return (
    <View testID={testID} style={{ gap: 16 }}>
      {/* Variant Chips (only shown if > 1 variant or if variant has a distinct name) */}
      {resolvedVariants.length > 1 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
            Variant
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {resolvedVariants.map((v, idx) => {
              const isSelected = idx === selectedVariantIdx;
              const chipLabel = v.name ?? `Variant ${idx + 1}`;
              return (
                <Pressable
                  key={v._id ?? v.id ?? idx}
                  accessibilityRole="button"
                  accessibilityLabel={`Select variant ${chipLabel}`}
                  testID={`variant-chip-${chipLabel}`}
                  onPress={() => handleSelectVariant(idx)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: isSelected ? "600" : "400",
                      color: isSelected ? colors["primary-foreground"] : colors.foreground,
                    }}
                  >
                    {chipLabel}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Serving Choice Groups */}
      {allChoices.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
            Serving Unit
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {allChoices.map((choice) => {
              const isSelected = selectedChoice?.id === choice.id;
              const label =
                choice.group !== "servings"
                  ? `${choice.quantity} ${choice.unit}`
                  : servingChoiceDisplayLabel(choice);
              return (
                <Pressable
                  key={choice.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Serving choice ${label}`}
                  testID={`serving-choice-${choice.id}`}
                  onPress={() => setSelectedChoiceId(choice.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: isSelected ? "600" : "400",
                      color: isSelected ? colors["primary-foreground"] : colors.foreground,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Quantity Stepper */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
          Quantity ({unit})
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
            testID="quantity-decrement"
            onPress={handleDecrement}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.foreground }}>
              −
            </Text>
          </Pressable>

          <TextInput
            testID="quantity-input"
            accessibilityLabel="Quantity amount"
            value={quantityText}
            onChangeText={handleQuantityTextChange}
            keyboardType="decimal-pad"
            style={{
              flex: 1,
              height: 44,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              textAlign: "center",
              fontSize: 16,
              fontWeight: "600",
              color: colors.foreground,
            }}
          />
          {/* Also mount hidden input for serving-picker-amount compatibility if queried */}
          <TextInput
            testID="serving-picker-amount"
            accessibilityLabel="Serving amount"
            value={quantityText}
            onChangeText={handleQuantityTextChange}
            style={{ display: "none" }}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
            testID="quantity-increment"
            onPress={handleIncrement}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.foreground }}>
              +
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Live Macro Preview */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
            Nutrition Preview
          </Text>
          <Text
            testID="macro-preview-calories"
            style={{ fontSize: 16, fontWeight: "bold", color: colors.primary }}
          >
            {Math.round(previewMacros.calories)} kcal
          </Text>
        </View>

        {/* Back-compat test node expecting [210, " kcal"] children */}
        <Text
          testID="serving-picker-preview-kcal"
          style={{ fontSize: 12, color: colors["muted-foreground"] }}
        >
          {Math.round(previewMacros.calories)}{" kcal"}
        </Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <Text testID="macro-preview-protein" style={{ fontSize: 12, color: colors["muted-foreground"] }}>
            Protein: {previewMacros.protein}g
          </Text>
          <Text testID="macro-preview-carbs" style={{ fontSize: 12, color: colors["muted-foreground"] }}>
            Carbs: {previewMacros.carbs}g
          </Text>
          <Text testID="macro-preview-fats" style={{ fontSize: 12, color: colors["muted-foreground"] }}>
            Fats: {previewMacros.fats}g
          </Text>
        </View>
      </View>

      {/* Tag Selector */}
      {showLogControls ? (
        <>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
              Meal
            </Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {TAG_OPTIONS.map((t) => {
                const isSelected = tag === t;
                return (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    accessibilityLabel={`Tag ${t}`}
                    testID={`tag-chip-${t}`}
                    onPress={() => setTag(t)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected ? "600" : "400",
                        color: isSelected ? colors["primary-foreground"] : colors.foreground,
                        textTransform: "capitalize",
                      }}
                    >
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Time Mode Selector */}
          <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
          Time
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log time now"
            testID="time-mode-now"
            onPress={() => setTimeMode("now")}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: "center",
              backgroundColor: timeMode === "now" ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: timeMode === "now" ? colors.primary : colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: timeMode === "now" ? colors["primary-foreground"] : colors.foreground,
              }}
            >
              Now
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick custom log time"
            testID="time-mode-picked"
            onPress={() => setTimeMode("picked")}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: "center",
              backgroundColor: timeMode === "picked" ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: timeMode === "picked" ? colors.primary : colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: timeMode === "picked" ? colors["primary-foreground"] : colors.foreground,
              }}
            >
              Pick time
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log with no time"
            testID="time-mode-none"
            onPress={() => setTimeMode("none")}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: "center",
              backgroundColor: timeMode === "none" ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: timeMode === "none" ? colors.primary : colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: timeMode === "none" ? colors["primary-foreground"] : colors.foreground,
              }}
            >
              No time
            </Text>
          </Pressable>
        </View>

        {timeMode === "picked" && (
          <View style={{ marginTop: 4 }}>
            <TextInput
              testID="picked-time-input"
              accessibilityLabel="Picked time in HH:mm"
              value={pickedTime}
              onChangeText={setPickedTime}
              placeholder="HH:mm"
              style={{
                height: 40,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 12,
                color: colors.foreground,
              }}
            />
          </View>
        )}
          </View>
        </>
      ) : null}

      {/* Date */}
      {showLogControls ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
            Date
          </Text>
          <TextInput
            testID="date-input"
            accessibilityLabel="Log date"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            style={{
              height: 40,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 12,
              color: colors.foreground,
            }}
          />
        </View>
      ) : null}

      {/* Log Food Button */}
      {showLogControls ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log food item"
          testID="log-food-button"
          onPress={handleLog}
          style={{
            marginTop: 8,
            height: 48,
            borderRadius: 8,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "bold", color: colors["primary-foreground"] }}>
            {primaryActionLabel ?? "Log Food"}
          </Text>
        </Pressable>
      ) : null}

      {/* NP-261: a second action next to the primary one — "Build a meal"
          on `FoodSearchSheet`'s inline picker, additive for every other
          consumer (only rendered when both props are set). */}
      {showLogControls && secondaryActionLabel && onSecondaryAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondaryActionLabel}
          testID="quantity-picker-secondary-action"
          onPress={handleSecondaryAction}
          style={{
            marginTop: 8,
            height: 48,
            borderRadius: 8,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "bold", color: colors.foreground }}>
            {secondaryActionLabel}
          </Text>
        </Pressable>
      ) : null}

      {/* Backwards-compatible submit button for tests querying serving-picker-submit */}
      {showLogControls ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Submit serving"
          testID="serving-picker-submit"
          onPress={handleLog}
          style={{ display: "none" }}
        >
          <Text>Submit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
