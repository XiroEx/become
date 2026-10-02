/**
 * ─── The combine sheet (NP-175) ──────────────────────────────────────────────
 *
 * What the web's select-mode action bar says, in a sheet:
 * `webapp/components/nutrition/TagSection.tsx:538-607`. The picked rows, what
 * the merged sitting will read, an optional name, and the one gated extra —
 * keeping it as a reusable meal.
 *
 * The gate is only over the SAVE. A free member at 3/3 meals sees no name field
 * and no toggle (exactly as on the web, where both live behind `canSaveMeals`)
 * and the Combine button still folds their day — `custom-meals` is checked by
 * the route only when `saveAsMeal` is true.
 *
 * The sheet never writes anything itself: `onSubmit` hands the choice back to
 * the screen, which makes the single `POST /api/meal-logs/combine` call. See
 * `lib/nutrition/combineItems.ts` for why that stays one request.
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
import {
  canCombine,
  combineTotals,
  defaultCombineName,
  type SelectableLogItem,
} from "@/lib/nutrition/combineItems";

export interface CombineSubmitOptions {
  mealName?: string | undefined;
  saveAsMeal: boolean;
}

export interface CombineSheetProps {
  visible: boolean;
  /** The sitting being folded, for the heading. */
  tag?: string;
  /** The rows the member picked, in day order. */
  picked: readonly SelectableLogItem[];
  /**
   * May they keep the result as a reusable meal? `custom-meals`' `canCreate`,
   * READ from the snapshot and never recomputed — a capped member may still
   * edit and delete the meals they own.
   */
  canSaveMeals: boolean;
  submitting?: boolean;
  /** The server's own words when the combine was refused. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (options: CombineSubmitOptions) => void | Promise<void>;
}

function capitalizeTag(tag: string): string {
  if (!tag) return "";
  return tag
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function CombineSheet({
  visible,
  tag,
  picked,
  canSaveMeals,
  submitting = false,
  error,
  onClose,
  onSubmit,
}: CombineSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [mealName, setMealName] = useState("");
  const [saveAsMeal, setSaveAsMeal] = useState(true);

  const totals = combineTotals(picked);
  const placeholder = defaultCombineName(picked);
  const enough = canCombine(picked);
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
      title="Combine into one meal"
      testID="combine-sheet"
      accessibilityLabel="Combine into one meal"
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
                testID="combine-sheet-summary"
                className="text-foreground text-sm font-medium"
              >
                {picked.length} item{picked.length === 1 ? "" : "s"}
                {tag ? ` from ${capitalizeTag(tag)}` : ""} become one sitting
              </Text>
              <Text
                testID="combine-sheet-totals"
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
            {picked.map((item) => (
              <Text
                key={item.key}
                testID={`combine-sheet-item-${item.itemId}`}
                className="text-muted-foreground text-xs"
              >
                {item.name} · {Math.round(item.calories)} kcal
              </Text>
            ))}
          </View>

          {canSaveMeals ? (
            <>
              <Input
                testID="combine-sheet-name"
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
                  testID="combine-sheet-save-toggle"
                  value={saveAsMeal}
                  onValueChange={setSaveAsMeal}
                  accessibilityLabel="Also save as a reusable meal"
                />
              </View>
            </>
          ) : (
            // Renders NOTHING while the kill-switch is off or the snapshot is
            // unknown, and explains the cap when it is on. The combine below
            // stays available either way.
            <AllowanceLock
              feature="custom-meals"
              onPress={showUpgradeSheet}
              testID="combine-sheet-lock"
            />
          )}

          {error ? (
            <Text
              testID="combine-sheet-error"
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
                testID="combine-sheet-cancel"
                variant="secondary"
                onPress={handleClose}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="combine-sheet-submit"
                variant="primary"
                loading={submitting}
                disabled={!enough || submitting}
                onPress={handleSubmit}
              >
                {saving
                  ? `Combine ${picked.length} and save`
                  : `Combine ${picked.length}`}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

export default CombineSheet;
