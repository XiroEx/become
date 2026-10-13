import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Bookmark } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import {
  QuantityPicker,
  type QuantityPickerSelection,
} from "@/components/nutrition/QuantityPicker";
import {
  buildMealItemPayload,
  type MealItemPayload,
} from "@/lib/nutrition/mealLogActions";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Food } from "@become/api-client";

/**
 * ─── Log a saved food, natively (NP-142) ────────────────────────────────────
 *
 * The web's `FoodLogSheet` (`webapp/components/meals/FoodLogSheet.tsx`) as a
 * sheet: pick an amount of a saved food and file it under a tag, now or
 * untimed. The sheet never writes anything itself: `onSubmit` hands the built
 * item payload back to the screen, which makes the single
 * `POST /api/meal-logs` call (see `lib/nutrition/mealLogActions#logFoodItem`).
 */

export interface SavedFoodLogSubmitOptions {
  item: MealItemPayload;
  tag: string;
  date: string;
  timeMode: "now" | "picked" | "none";
  pickedTime?: string | null;
}

export interface SavedFoodLogSheetProps {
  visible: boolean;
  /** The saved food being logged. */
  food: Food | null;
  /** The tag the sitting is filed under. */
  currentTag?: string;
  submitting?: boolean;
  /** The server's own words when the log was refused. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (options: SavedFoodLogSubmitOptions) => void | Promise<void>;
}

export function SavedFoodLogSheet({
  visible,
  food,
  currentTag = "snack",
  submitting = false,
  error,
  onClose,
  onSubmit,
}: SavedFoodLogSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [selection, setSelection] = useState<QuantityPickerSelection | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleClose = () => {
    setSelection(null);
    setLocalError(null);
    onClose();
  };

  const handleSubmit = (result: {
    item: MealItemPayload;
    tag: string;
    date: string;
    timeMode: "now" | "picked" | "none";
    pickedTime?: string | null;
  }) => {
    if (!food || submitting) return;
    if (!Number.isFinite(result.item.servings) || result.item.servings <= 0) {
      setLocalError("Pick a valid amount.");
      return;
    }
    setLocalError(null);
    void onSubmit(result);
  };

  const shownError = localError ?? error ?? null;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={food ? `Log ${food.name}` : "Log food"}
      testID="saved-food-log-sheet"
      accessibilityLabel={food ? `Log ${food.name}` : "Log food"}
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
              <Bookmark size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                testID="saved-food-log-sheet-summary"
                className="text-foreground text-sm font-medium"
              >
                {food?.name ?? "Food"}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                Filed under {currentTag}
              </Text>
            </View>
          </View>

          {food ? (
            <QuantityPicker
              food={food}
              initialTag={currentTag}
              initialQuantity={1}
              showLogControls={false}
              onChange={setSelection}
              testID="saved-food-log-quantity"
            />
          ) : null}

          {shownError ? (
            <Text
              testID="saved-food-log-sheet-error"
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className="text-destructive text-xs"
            >
              {shownError}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="saved-food-log-sheet-cancel"
                variant="secondary"
                onPress={handleClose}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="saved-food-log-sheet-submit"
                variant="primary"
                loading={submitting}
                disabled={!food || !selection || submitting}
                onPress={() => {
                  if (!food || !selection) {
                    setLocalError("Pick a valid amount.");
                    return;
                  }
                  const item = buildMealItemPayload({
                    food,
                    variant: selection.variant,
                    quantity: selection.quantity,
                    unit: selection.unit,
                    servingChoice: selection.servingChoice,
                  });
                  handleSubmit({
                    item,
                    tag: selection.tag || currentTag,
                    date: selection.date,
                    timeMode: selection.timeMode,
                    pickedTime: selection.pickedTime,
                  });
                }}
              >
                Log food
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

export default SavedFoodLogSheet;
