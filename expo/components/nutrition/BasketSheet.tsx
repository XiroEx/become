/**
 * ─── The basket sheet (NP-094) ───────────────────────────────────────────────
 *
 * What the web's floating basket says, in a sheet:
 * `webapp/components/nutrition/FoodSearchModal.tsx:2524-2657`. The items picked
 * so far with their running totals, an optional name, and the one gated extra —
 * keeping the basket as a reusable meal.
 *
 * The gate is only over the SAVE. A free member at 3/3 meals sees no name field
 * and no toggle (exactly as on the web, where both live behind `canSaveMeals`)
 * and the Log button still logs their basket — `custom-meals` is checked by the
 * route only when a meal is saved.
 *
 * The sheet never writes anything itself: `onSubmit` hands the choice back to
 * the caller, which makes the `POST /api/meal-logs` (+ best-effort
 * `POST /api/meals`) calls. See `lib/nutrition/basketLog.ts` for why the log
 * goes first and a failed meal save never costs it.
 */

import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { ChefHat, Trash2, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { Toggle } from "@/components/Toggle";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import { showUpgradeSheet } from "@/lib/entitlements";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { defaultBasketMealName } from "@/lib/nutrition/basketLog";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";

export interface BasketSheetItem {
  item: MealItemPayload;
}

export interface BasketSubmitOptions {
  mealName?: string | undefined;
  saveAsMeal: boolean;
}

export interface BasketSheetProps {
  visible: boolean;
  /** The basket rows, in the order they were added. */
  items: readonly BasketSheetItem[];
  /**
   * May they keep the basket as a reusable meal? `custom-meals`' `canCreate`,
   * READ from the snapshot and never recomputed — a capped member may still
   * edit and delete the meals they own.
   */
  canSaveMeals: boolean;
  submitting?: boolean;
  /** The server's own words when the log was refused. */
  error?: string | null;
  /** "Could not save the meal" — the log landed, the save did not. */
  notice?: string | null;
  onRemoveItem: (index: number) => void;
  onClose: () => void;
  onSubmit: (options: BasketSubmitOptions) => void | Promise<void>;
}

function itemCalories(item: MealItemPayload): number {
  const servings =
    typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
  return (item.nutrition?.calories ?? 0) * servings;
}

function itemProtein(item: MealItemPayload): number {
  const servings =
    typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
  return (item.nutrition?.protein ?? 0) * servings;
}

function itemCarbs(item: MealItemPayload): number {
  const servings =
    typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
  return (item.nutrition?.carbs ?? 0) * servings;
}

function itemFats(item: MealItemPayload): number {
  const servings =
    typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
  return (item.nutrition?.fats ?? 0) * servings;
}

export function BasketSheet({
  visible,
  items,
  canSaveMeals,
  submitting = false,
  error,
  notice,
  onRemoveItem,
  onClose,
  onSubmit,
}: BasketSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [mealName, setMealName] = useState("");
  const [saveAsMeal, setSaveAsMeal] = useState(true);

  const totals = items.reduce(
    (acc, row) => ({
      calories: acc.calories + itemCalories(row.item),
      protein: acc.protein + itemProtein(row.item),
      carbs: acc.carbs + itemCarbs(row.item),
      fats: acc.fats + itemFats(row.item),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );
  const placeholder = defaultBasketMealName(items.map((row) => row.item.name));
  const enough = items.length > 0;
  // The toggle is only honoured when they may actually save one.
  const saving = canSaveMeals && saveAsMeal;

  const handleClose = () => {
    setMealName("");
    setSaveAsMeal(true);
    onClose();
  };

  const handleSubmit = () => {
    if (!enough || submitting) return;
    void onSubmit({
      // Falling back to the placeholder is what makes the pre-filled name real:
      // a member who never touched the field still gets "Oats + Whey".
      mealName: saving
        ? mealName.trim() || placeholder || "Meal"
        : canSaveMeals
          ? mealName.trim() || undefined
          : undefined,
      saveAsMeal: saving,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={`Log ${items.length} item${items.length === 1 ? "" : "s"} together`}
      testID="basket-sheet"
      accessibilityLabel={`Log ${items.length} items together`}
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
                testID="basket-sheet-summary"
                className="text-foreground text-sm font-medium"
              >
                {items.length} item{items.length === 1 ? "" : "s"} become one
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

          {/* The basket, named, so a mis-tap is visible before it is written. */}
          <View style={{ gap: 2 }}>
            {items.map((row, index) => (
              <View
                key={`${row.item.foodId ?? row.item.name}-${index}`}
                testID={`basket-sheet-item-${index}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 6,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text className="text-foreground text-sm font-medium">
                    {row.item.name}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {Math.round(itemCalories(row.item))} kcal
                  </Text>
                </View>
                <Pressable
                  testID={`basket-sheet-remove-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${row.item.name}`}
                  onPress={() => onRemoveItem(index)}
                  hitSlop={8}
                  style={{ padding: 6 }}
                >
                  <Trash2 size={16} color={colors.destructive} />
                </Pressable>
              </View>
            ))}
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
            // Renders NOTHING while the kill-switch is off or the snapshot is
            // unknown, and explains the cap when it is on. The log below
            // stays available either way.
            <AllowanceLock
              feature="custom-meals"
              onPress={showUpgradeSheet}
              testID="basket-sheet-lock"
            />
          )}

          {notice ? (
            <Text
              testID="basket-sheet-notice"
              accessibilityRole="alert"
              className="text-muted-foreground text-xs"
            >
              {notice}
            </Text>
          ) : null}

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
                onPress={handleSubmit}
                disabled={!enough || submitting}
              >
                {saving
                  ? `Save meal and log ${items.length}`
                  : `Log ${items.length} item${items.length === 1 ? "" : "s"}`}
              </Button>
            </View>
          </View>

          {/* Dismiss affordance for tests that close by icon. */}
          <Pressable
            testID="basket-sheet-close"
            accessibilityRole="button"
            accessibilityLabel="Close basket"
            onPress={handleClose}
            hitSlop={8}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              padding: 4,
              opacity: 0,
            }}
          >
            <X size={16} color={colors["muted-foreground"]} />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
