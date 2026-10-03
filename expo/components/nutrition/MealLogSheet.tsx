/**
 * ─── Log a saved meal with a portion (NP-094) ────────────────────────────────
 *
 * The native `webapp/components/meals/MealApplySheet.tsx:221-250`: the member
 * picks a saved meal in the search sheet's Meals filter, chooses how much of
 * it they ate, and the screen logs it through `POST /api/meals/[id]/log` with
 * `portion`, `tags`, `loggedAt` and `untimed`.
 *
 * The sheet never writes anything itself: `onSubmit` hands the portion back
 * to the screen. See `lib/nutrition/basketLog.ts#logSavedMeal`.
 */

import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { ChefHat } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Meal } from "@become/api-client";

export interface MealLogSubmitOptions {
  /** Multiplier on every item's servings. The server clamps to [0.05, 20]. */
  portion: number;
}

export interface MealLogSheetProps {
  visible: boolean;
  /** The saved meal being logged. */
  meal: Meal | null;
  submitting?: boolean;
  /** The server's own words when the log was refused. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (options: MealLogSubmitOptions) => void | Promise<void>;
}

const PORTION_PRESETS = [0.5, 1, 1.5, 2] as const;

export function MealLogSheet({ visible, meal, submitting = false, error, onClose, onSubmit }: MealLogSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [portionText, setPortionText] = useState("1");
  const [portionError, setPortionError] = useState<string | null>(null);

  const itemCount = meal?.items?.length ?? 0;
  const calories = meal?.totalNutrition?.calories;

  const handleClose = () => {
    setPortionText("1");
    setPortionError(null);
    onClose();
  };

  const handleSubmit = () => {
    if (submitting) return;
    const portion = Number(portionText);
    if (!Number.isFinite(portion) || portion <= 0) {
      setPortionError("Pick a valid portion.");
      return;
    }
    setPortionError(null);
    void onSubmit({ portion });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Log this meal"
      testID="meal-log-sheet"
      accessibilityLabel="Log this meal"
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
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
              <Text testID="meal-log-sheet-name" className="text-foreground text-sm font-medium">
                {meal?.name ?? "Meal"}
              </Text>
              <Text testID="meal-log-sheet-meta" className="text-muted-foreground text-xs mt-0.5">
                {itemCount} {itemCount === 1 ? "item" : "items"}
                {calories != null ? ` · ${Math.round(calories)} kcal` : ""}
              </Text>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text className="text-foreground text-sm font-medium">Portion</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {PORTION_PRESETS.map((preset) => {
                const active = Number(portionText) === preset;
                return (
                  <Pressable
                    key={String(preset)}
                    testID={`meal-log-sheet-portion-${preset}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Log ${preset} of this meal`}
                    onPress={() => {
                      setPortionText(String(preset));
                      setPortionError(null);
                    }}
                    hitSlop={4}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? tint("primary", 0.12) : colors.card,
                      alignItems: "center",
                    }}
                  >
                    <Text className={`text-xs font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>
                      {preset}×
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Input
              testID="meal-log-sheet-portion-input"
              label="Custom portion"
              placeholder="1"
              keyboardType="decimal-pad"
              value={portionText}
              onChangeText={(text) => {
                setPortionText(text);
                setPortionError(null);
              }}
              error={portionError ?? undefined}
            />
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
              <Button testID="meal-log-sheet-cancel" variant="secondary" onPress={handleClose}>
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="meal-log-sheet-submit"
                variant="primary"
                loading={submitting}
                disabled={submitting}
                onPress={handleSubmit}
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

export default MealLogSheet;
