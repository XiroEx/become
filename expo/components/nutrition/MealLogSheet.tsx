/**
 * ─── Log a saved meal with a portion (NP-094) ────────────────────────────────
 *
 * What the web's apply sheet says, in a sheet:
 * `webapp/components/meals/MealApplySheet.tsx`. The meal's name and totals, a
 * portion picker (the same 1/4 … 3 pills the web offers), the tag it lands in,
 * and a live preview of what the portion scales to.
 *
 * The sheet never writes anything itself: `onSubmit` hands the portion back to
 * the caller, which makes the single `POST /api/meals/{id}/log` call. See
 * `lib/nutrition/basketLog.ts#logSavedMeal` for why the portion travels as a
 * multiplier the server applies to every item's `servings`.
 */

import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { ChefHat } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Meal } from "@become/api-client";

export interface MealLogSubmitOptions {
  portion: number;
}

export interface MealLogSheetProps {
  visible: boolean;
  /** The saved meal being logged. */
  meal: Meal | null;
  /** The tag it lands in, for the heading. */
  tag?: string;
  submitting?: boolean;
  /** The server's own words when the log was refused. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (options: MealLogSubmitOptions) => void | Promise<void>;
}

interface PortionPill {
  label: string;
  value: number;
}

/**
 * The web's portion pills (`MealApplySheet.tsx:55-65`). `value` is what is
 * sent as `portion` when the meal has no `recipe.servings`; with servings set,
 * "1" means "1 of N", so the portion sent is `value / recipe.servings`.
 */
export const MEAL_PORTION_PILLS: PortionPill[] = [
  { label: "1/4", value: 0.25 },
  { label: "1/3", value: 1 / 3 },
  { label: "1/2", value: 0.5 },
  { label: "2/3", value: 2 / 3 },
  { label: "3/4", value: 0.75 },
  { label: "1", value: 1 },
  { label: "1.5", value: 1.5 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
];

function capitalizeTag(tag: string): string {
  if (!tag) return "";
  return tag
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function MealLogSheet({
  visible,
  meal,
  tag,
  submitting = false,
  error,
  onClose,
  onSubmit,
}: MealLogSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [selectedPillIdx, setSelectedPillIdx] = useState(5);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("1");

  const recipeServings =
    meal?.recipe?.servings && meal.recipe.servings > 0
      ? meal.recipe.servings
      : null;

  const selectedValue = useMemo<number>(() => {
    if (customMode) {
      const n = Number(customValue);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return MEAL_PORTION_PILLS[selectedPillIdx]?.value ?? 1;
  }, [customMode, customValue, selectedPillIdx]);

  // Effective portion sent to the server — recipe-aware, as on the web.
  const effectivePortion = useMemo<number>(() => {
    if (recipeServings) return selectedValue / recipeServings;
    return selectedValue;
  }, [selectedValue, recipeServings]);

  const previewNutrition = useMemo(() => {
    const n = meal?.totalNutrition;
    if (!n) return { calories: 0, protein: 0, carbs: 0, fats: 0 };
    return {
      calories: Math.round((n.calories ?? 0) * effectivePortion),
      protein: Math.round((n.protein ?? 0) * effectivePortion * 10) / 10,
      carbs: Math.round((n.carbs ?? 0) * effectivePortion * 10) / 10,
      fats: Math.round((n.fats ?? 0) * effectivePortion * 10) / 10,
    };
  }, [meal, effectivePortion]);

  const valid = Number.isFinite(effectivePortion) && effectivePortion > 0;

  const handleClose = () => {
    setSelectedPillIdx(5);
    setCustomMode(false);
    setCustomValue("1");
    onClose();
  };

  const handleSubmit = () => {
    if (!valid || submitting || !meal) return;
    void onSubmit({ portion: effectivePortion });
  };

  const itemCount = meal?.items?.length ?? 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={meal ? `Log ${meal.name}` : "Log meal"}
      testID="meal-log-sheet"
      accessibilityLabel={meal ? `Log ${meal.name}` : "Log meal"}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: tint("primary", 0.15),
              }}
            >
              <ChefHat size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                testID="meal-log-sheet-summary"
                className="text-foreground text-sm font-medium"
              >
                {meal?.name ?? "Meal"}
                {tag ? ` to ${capitalizeTag(tag)}` : ""}
              </Text>
              <Text
                testID="meal-log-sheet-totals"
                className="text-muted-foreground text-xs mt-0.5"
              >
                {itemCount} {itemCount === 1 ? "item" : "items"} ·{" "}
                {Math.round(previewNutrition.calories)} kcal at this portion
              </Text>
            </View>
          </View>

          {/* Portion pills */}
          <View style={{ gap: 8 }}>
            <Text className="text-foreground text-sm font-medium">Portion</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {MEAL_PORTION_PILLS.map((pill, idx) => {
                const active = !customMode && selectedPillIdx === idx;
                return (
                  <Pressable
                    key={pill.label}
                    testID={`meal-log-portion-${pill.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Portion ${pill.label}`}
                    onPress={() => {
                      setCustomMode(false);
                      setSelectedPillIdx(idx);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.card,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: active ? "600" : "400",
                        color: active
                          ? colors["primary-foreground"]
                          : colors.foreground,
                      }}
                    >
                      {pill.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                testID="meal-log-portion-custom"
                accessibilityRole="button"
                accessibilityState={{ selected: customMode }}
                accessibilityLabel="Custom portion"
                onPress={() => setCustomMode(true)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: customMode ? colors.primary : colors.border,
                  backgroundColor: customMode ? colors.primary : colors.card,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: customMode ? "600" : "400",
                    color: customMode
                      ? colors["primary-foreground"]
                      : colors.foreground,
                  }}
                >
                  Custom
                </Text>
              </Pressable>
            </View>
            {customMode ? (
              <Input
                testID="meal-log-portion-input"
                label="Portion"
                placeholder="1"
                keyboardType="decimal-pad"
                value={customValue}
                onChangeText={setCustomValue}
              />
            ) : null}
            {recipeServings ? (
              <Text
                testID="meal-log-recipe-note"
                className="text-muted-foreground text-xs"
              >
                Recipe makes {recipeServings} — 1 means 1 of {recipeServings}.
              </Text>
            ) : null}
          </View>

          {error ? (
            <Text
              testID="meal-log-sheet-error"
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className="text-destructive text-xs"
            >
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="meal-log-sheet-cancel"
                variant="secondary"
                onPress={handleClose}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="meal-log-sheet-submit"
                onPress={handleSubmit}
                disabled={!valid || submitting || !meal}
              >
                Log meal
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
