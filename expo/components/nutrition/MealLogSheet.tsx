/**
 * ─── Log a saved meal, natively (NP-094) · plan mode (NP-232) ───────────────
 *
 * The web's `MealApplySheet` (`webapp/components/meals/MealApplySheet.tsx`)
 * as a sheet: pick a portion of a saved meal and file it under a tag, now or
 * untimed. The server scales every item's servings by `portion` and
 * recomputes the totals, so half portion natively reads half the calories on
 * the web.
 *
 * Plan mode (`mode="plan"`, `MealApplySheet.tsx:36-39`) posts
 * `POST /api/meal-plans { plannedDate, tag, mealId }` through `createMealPlan`
 * (`MealApplySheet.tsx:213-235`), hides the time/backdate controls, and the
 * CTA reads `Plan <Tag>` / `Planning...` / `Planned!`
 * (`MealApplySheet.tsx:642-651`).
 *
 * The sheet never writes anything itself: `onSubmit` hands the choice back to
 * the screen, which makes the single `POST /api/meals/{id}/log` call. See
 * `lib/nutrition/basketLog.ts#logSavedMeal`. In plan mode the screen instead
 * posts through `createMealPlan` with the meal's id.
 */

import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { ChefHat } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Meal } from "@become/api-client";

export type MealLogSheetMode = "log" | "plan";

export interface MealLogSubmitOptions {
  portion: number;
  tag: string;
  untimed: boolean;
}

export interface MealLogSheetProps {
  visible: boolean;
  /** The saved meal being logged. */
  meal: Meal | null;
  /** The tag the sitting is filed under. */
  currentTag?: string;
  submitting?: boolean;
  /** The server's own words when the log was refused. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (options: MealLogSubmitOptions) => void | Promise<void>;
  /**
   * `'log'` (default) files the meal now through `POST /api/meals/{id}/log`;
   * `'plan'` schedules it for `plannedDate` through
   * `POST /api/meal-plans { plannedDate, tag, mealId }` (the web's
   * `MealApplySheet` plan mode). Plan mode hides the time/backdate controls
   * and the CTA reads `Plan <Tag>` / `Planning...` / `Planned!`.
   */
  mode?: MealLogSheetMode;
  /** Local `YYYY-MM-DD` key the plan is filed under (plan mode only). */
  plannedDate?: string;
}

const PORTION_PRESETS = [0.5, 1, 1.5, 2];

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

export function MealLogSheet({
  visible,
  meal,
  currentTag = "snack",
  submitting = false,
  error,
  onClose,
  onSubmit,
  mode = "log",
  plannedDate,
}: MealLogSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [portionText, setPortionText] = useState("1");
  const [untimed, setUntimed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [planned, setPlanned] = useState(false);

  const isPlanMode = mode === "plan";
  const tagLabel = titleCaseTag(currentTag || "snack");

  const itemCount = meal?.items?.length ?? 0;
  const calories = meal?.totalNutrition?.calories;

  const handleClose = () => {
    setPortionText("1");
    setUntimed(false);
    setLocalError(null);
    setPlanned(false);
    onClose();
  };

  const handleSubmit = () => {
    if (!meal || submitting) return;
    const portion = Number(portionText);
    if (!Number.isFinite(portion) || portion <= 0) {
      setLocalError("Pick a valid portion.");
      return;
    }
    setLocalError(null);
    // The web's plan branch drops the clock (`MealApplySheet.tsx:213-235`):
    // a plan carries the page-supplied plannedDate, never a time.
    const result = onSubmit({
      portion,
      tag: currentTag,
      untimed: isPlanMode ? false : untimed,
    });
    if (isPlanMode && result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).then(
        () => setPlanned(true),
        () => {},
      );
    }
  };

  const shownError = localError ?? error ?? null;

  const submitLabel = isPlanMode
    ? submitting
      ? "Planning..."
      : planned
        ? "Planned!"
        : `Plan ${tagLabel}`
    : submitting
      ? "Logging..."
      : "Log meal";

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={
        meal
          ? isPlanMode
            ? `Plan ${meal.name}`
            : `Log ${meal.name}`
          : isPlanMode
            ? "Plan meal"
            : "Log meal"
      }
      testID="meal-log-sheet"
      accessibilityLabel={
        meal
          ? isPlanMode
            ? `Plan ${meal.name}`
            : `Log ${meal.name}`
          : isPlanMode
            ? "Plan meal"
            : "Log meal"
      }
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
                {itemCount} item{itemCount === 1 ? "" : "s"}
                {calories != null ? ` · ${Math.round(calories)} kcal` : ""}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                {isPlanMode && plannedDate
                  ? `Planned for ${plannedDate} · Filed under ${currentTag}`
                  : `Filed under ${currentTag}`}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {PORTION_PRESETS.map((preset) => {
              const active = Number(portionText) === preset;
              return (
                <Text
                  key={preset}
                  testID={`meal-log-sheet-portion-${preset}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Portion ${preset}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => setPortionText(String(preset))}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg ${
                    active ? "text-primary-foreground" : "text-foreground"
                  }`}
                  style={{
                    backgroundColor: active ? colors.primary : colors.muted,
                  }}
                >
                  {preset}×
                </Text>
              );
            })}
          </View>

          <Input
            testID="meal-log-sheet-portion"
            label="Portion"
            placeholder="1"
            keyboardType="decimal-pad"
            value={portionText}
            onChangeText={setPortionText}
          />

          {/* Time/backdate controls are log-mode only: a plan carries the
              page-supplied plannedDate (`MealApplySheet.tsx:455`). */}
          {!isPlanMode ? (
            <Text
              testID="meal-log-sheet-untimed-toggle"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: untimed }}
              accessibilityLabel="Log with no time"
              onPress={() => setUntimed((v) => !v)}
              className="text-muted-foreground text-xs font-semibold"
            >
              {untimed ? "✓ No time — filed by tag" : "No time — file by tag"}
            </Text>
          ) : null}

          {shownError ? (
            <Text
              testID="meal-log-sheet-error"
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
                variant="primary"
                loading={submitting}
                disabled={!meal || submitting}
                onPress={handleSubmit}
              >
                {submitLabel}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

export default MealLogSheet;
