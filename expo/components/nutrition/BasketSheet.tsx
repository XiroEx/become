/**
 * ─── The basket sheet (NP-094) ───────────────────────────────────────────────
 *
 * What the web's floating basket says, in a sheet:
 * `webapp/components/nutrition/FoodSearchModal.tsx:2524-2657`. The collected
 * rows, what the sitting will read, and the one gated extra — keeping it as a
 * reusable meal.
 *
 * The gate is only over the SAVE. A free member at 3/3 sees no name field
 * and no toggle (exactly as on the web, where both live behind
 * `canSaveMeals`) and the Log button still files their basket — `custom-meals`
 * is checked by the route only when a meal is kept.
 *
 * The sheet never writes anything itself: `onSubmit` hands the choice back to
 * the screen, which makes the log-first `logBasket` call. See
 * `lib/nutrition/basketLog.ts` for why the log goes first.
 */

import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { ChefHat } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { Toggle } from "@/components/Toggle";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import { showUpgradeSheet } from "@/lib/entitlements";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";
import { defaultBasketMealName } from "@/lib/nutrition/basketLog";

export interface BasketItem extends MealItemPayload {
  /** Stable row key for the list; never sent to the server. */
  key: string;
}

export interface BasketSubmitOptions {
  mealName?: string | undefined;
  saveAsMeal: boolean;
}

export interface BasketSheetProps {
  visible: boolean;
  /** The rows collected so far, in pick order. */
  items: readonly BasketItem[];
  /**
   * May they keep the basket as a reusable meal? `custom-meals`' `canCreate`,
   * READ from the snapshot and never recomputed — a capped member may still
   * edit and delete the meals they own.
   */
  canSaveMeals: boolean;
  submitting?: boolean;
  /** The server's own words when the log was refused. */
  error?: string | null;
  onRemoveItem: (key: string) => void;
  onClose: () => void;
  onSubmit: (options: BasketSubmitOptions) => void | Promise<void>;
}

function basketTotals(items: readonly MealItemPayload[]): {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
} {
  return items.reduce(
    (acc, item) => {
      const servings =
        typeof item.servings === "number" && item.servings > 0
          ? item.servings
          : 1;
      const nut = item.nutrition ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
      };
      return {
        calories: acc.calories + (nut.calories ?? 0) * servings,
        protein: acc.protein + (nut.protein ?? 0) * servings,
        carbs: acc.carbs + (nut.carbs ?? 0) * servings,
        fats: acc.fats + (nut.fats ?? 0) * servings,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );
}

export function BasketSheet({
  visible,
  items,
  canSaveMeals,
  submitting = false,
  error,
  onRemoveItem,
  onClose,
  onSubmit,
}: BasketSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [mealName, setMealName] = useState("");
  const [saveAsMeal, setSaveAsMeal] = useState(true);

  const totals = basketTotals(items);
  const placeholder = defaultBasketMealName(items);
  // The toggle is only honoured when they may actually save one.
  const saving = canSaveMeals && saveAsMeal;

  const handleClose = () => {
    setMealName("");
    setSaveAsMeal(true);
    onClose();
  };

  const handleSubmit = () => {
    if (items.length === 0 || submitting) return;
    void onSubmit({
      // Falling back to the placeholder is what makes the pre-filled name real:
      // a member who never touched the field still gets "Oats + Whey".
      mealName: saving
        ? mealName.trim() || placeholder || "Meal"
        : undefined,
      saveAsMeal: saving,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Your basket"
      testID="basket-sheet"
      accessibilityLabel="Your basket"
    >
      {/* NP-319: real Android keyboard avoidance — see EstimateSheet.tsx. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                testID="basket-sheet-summary"
                className="text-foreground text-sm font-medium"
              >
                {items.length} item{items.length === 1 ? "" : "s"} in this
                sitting
              </Text>
              <Text
                testID="basket-sheet-totals"
                className="text-muted-foreground text-xs mt-0.5"
              >
                {Math.round(totals.calories)} kcal ·{" "}
                {Math.round(totals.protein)}g P · {Math.round(totals.carbs)}g C ·{" "}
                {Math.round(totals.fats)}g F
              </Text>
            </View>
          </View>

          {/* The picks, named, so a mis-tap is visible before it is written. */}
          <View style={{ gap: 2 }}>
            {items.map((item) => {
              const servings =
                typeof item.servings === "number" && item.servings > 0
                  ? item.servings
                  : 1;
              return (
                <View
                  key={item.key}
                  testID={`basket-sheet-item-${item.key}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text className="text-muted-foreground text-xs flex-1">
                    {item.name} ·{" "}
                    {Math.round((item.nutrition?.calories ?? 0) * servings)} kcal
                  </Text>
                  <Text
                    testID={`basket-sheet-remove-${item.key}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                    onPress={() => onRemoveItem(item.key)}
                    className="text-destructive text-xs font-semibold"
                  >
                    Remove
                  </Text>
                </View>
              );
            })}
          </View>

          {canSaveMeals ? (
            <>
              <Input
                testID="basket-sheet-name"
                label="Name this sitting"
                placeholder={placeholder || "e.g. Turkey sandwich"}
                value={mealName}
                onChangeText={setMealName}
              />
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View style={{ flex: 1 }}>
                  <Text className="text-foreground text-sm font-medium">
                    Also save as a reusable meal
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    Keep it in My Stuff to log again later.
                  </Text>
                </View>
                <Toggle
                  testID="basket-sheet-save-toggle"
                  value={saveAsMeal}
                  onValueChange={setSaveAsMeal}
                  accessibilityLabel="Also save as a reusable meal"
                />
              </View>
            </>
          ) : (
            // Renders NOTHING tier-aware while the kill-switch is off or the
            // snapshot is unknown, and explains the cap when it is on. The
            // log below stays available either way.
            <AllowanceLock
              feature="custom-meals"
              onPress={showUpgradeSheet}
              testID="basket-sheet-lock"
            />
          )}

          {error ? (
            <Text
              testID="basket-sheet-error"
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
                testID="basket-sheet-cancel"
                variant="secondary"
                onPress={handleClose}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="basket-sheet-submit"
                variant="primary"
                loading={submitting}
                disabled={items.length === 0 || submitting}
                onPress={handleSubmit}
              >
                {saving
                  ? `Log ${items.length} and save`
                  : `Log ${items.length} item${items.length === 1 ? "" : "s"}`}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

export default BasketSheet;
