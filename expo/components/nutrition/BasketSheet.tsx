/**
 * ─── The basket sheet (NP-094) ───────────────────────────────────────────────
 *
 * What the web's search-sheet basket tray says, in a sheet:
 * `webapp/components/nutrition/FoodSearchModal.tsx:1216-1324`. The picked
 * foods, what the sitting will read, an optional name, and the one gated
 * extra — keeping it as a reusable meal.
 *
 * The gate is only over the SAVE. A free member at 3/3 meals sees no name
 * field and no toggle (exactly as on the web, where both live behind
 * `canSaveMeals`) and the Log button still logs their basket — `custom-meals`
 * is checked by the route only when the meal is saved.
 *
 * The sheet never writes anything itself: `onSubmit` hands the choice back to
 * the screen, which makes the `POST /api/meal-logs` (+ best-effort
 * `POST /api/meals`) calls. See `lib/nutrition/basketLog.ts` for why the log
 * always goes first.
 */

import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { ChefHat, Trash2 } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { Toggle } from "@/components/Toggle";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import { showUpgradeSheet } from "@/lib/entitlements";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { defaultBasketName } from "@/lib/nutrition/basketLog";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";

export interface BasketEntry extends MealItemPayload {
  /** Stable row key for the list (the payload itself has no id). */
  key: string;
}

export interface BasketSubmitOptions {
  mealName?: string | undefined;
  saveAsMeal: boolean;
}

export interface BasketSheetProps {
  visible: boolean;
  /** The picked foods, in pick order. */
  entries: readonly BasketEntry[];
  /**
   * May they keep the basket as a reusable meal? `custom-meals`' `canCreate`,
   * READ from the snapshot and never recomputed — a capped member may still
   * edit and delete the meals they own.
   */
  canSaveMeals: boolean;
  submitting?: boolean;
  /** The server's own words when the log was refused. */
  error?: string | null;
  /** The save refusal, when the log landed but the meal did not. */
  mealNotice?: string | null;
  onRemoveEntry: (key: string) => void;
  onClose: () => void;
  onSubmit: (options: BasketSubmitOptions) => void | Promise<void>;
}

function entryCalories(entry: MealItemPayload): number {
  const servings = typeof entry.servings === "number" && entry.servings > 0 ? entry.servings : 1;
  return (entry.nutrition?.calories ?? 0) * servings;
}

export function BasketSheet({
  visible,
  entries,
  canSaveMeals,
  submitting = false,
  error,
  mealNotice,
  onRemoveEntry,
  onClose,
  onSubmit,
}: BasketSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [mealName, setMealName] = useState("");
  const [saveAsMeal, setSaveAsMeal] = useState(true);

  const totalCalories = entries.reduce((sum, e) => sum + entryCalories(e), 0);
  const placeholder = defaultBasketName(entries.map((e) => e.name));
  const enough = entries.length > 0;
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
      title="Log these foods"
      testID="basket-sheet"
      accessibilityLabel="Log these foods"
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
              <Text testID="basket-sheet-summary" className="text-foreground text-sm font-medium">
                {entries.length} item{entries.length === 1 ? "" : "s"} become one sitting
              </Text>
              <Text testID="basket-sheet-totals" className="text-muted-foreground text-xs mt-0.5">
                {Math.round(totalCalories)} kcal
              </Text>
            </View>
          </View>

          {/* The picks, named, so a mis-tap is visible before it is written. */}
          <View style={{ gap: 2 }}>
            {entries.map((entry) => (
              <View
                key={entry.key}
                testID={`basket-sheet-item-${entry.key}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text className="text-muted-foreground text-xs" style={{ flex: 1 }}>
                  {entry.name} · {Math.round(entryCalories(entry))} kcal
                </Text>
                <Pressable
                  testID={`basket-sheet-remove-${entry.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${entry.name} from basket`}
                  onPress={() => onRemoveEntry(entry.key)}
                  hitSlop={8}
                  style={{ padding: 6 }}
                >
                  <Trash2 size={14} color={colors.destructive} />
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text className="text-foreground text-sm font-medium">Also save as a reusable meal</Text>
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
            <AllowanceLock feature="custom-meals" onPress={showUpgradeSheet} testID="basket-sheet-lock" />
          )}

          {mealNotice ? (
            <Text testID="basket-sheet-meal-notice" className="text-muted-foreground text-xs">
              {mealNotice}
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
              <Button testID="basket-sheet-cancel" variant="secondary" onPress={handleClose}>
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="basket-sheet-submit"
                variant="primary"
                loading={submitting}
                disabled={!enough || submitting}
                onPress={handleSubmit}
              >
                {saving ? `Log ${entries.length} and save` : `Log ${entries.length}`}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

export default BasketSheet;
