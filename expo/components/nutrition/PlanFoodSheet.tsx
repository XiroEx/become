import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import {
  apiFetch as defaultApiFetch,
  type apiFetch as ApiFetchType,
} from "@become/api-client";
import { BottomSheet } from "@/components/BottomSheet";
import { Text } from "@/components/Text";
import {
  QuantityPicker,
  type QuantityPickerFood,
  type QuantityPickerSelection,
} from "@/components/nutrition/QuantityPicker";
import { buildMealItemPayload } from "@/lib/nutrition/mealLogActions";
import {
  MAX_REPEAT_COUNT_BY_DAY,
  MAX_REPEAT_COUNT_BY_WEEK,
  createMealPlan,
  planResultToast,
  titleCaseTag,
  type MealPlanRepeatEvery,
} from "@/lib/nutrition/mealPlanApi";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * ─── Plan a food natively, plan-mode tail (NP-230) ──────────────────────────
 *
 * The native plan-mode tail of the web's `FoodSearchModal`
 * (`webapp/components/nutrition/FoodSearchModal.tsx`): pick a portion and a
 * tag, optionally repeat every day/week, and file it with `createMealPlan`.
 *
 * - `QuantityPicker` owns portion/variant/unit with its time/date controls
 *   hidden (`showLogControls={false}` — plan mode never picks a clock time,
 *   `FoodSearchModal.tsx:1167`, `!isPlanMode`); the sheet owns the tag chips.
 * - Repeat mirrors the web's disclosure (state 434-436, UI 2398-2440):
 *   closed by default, `week x 6` when opened, clamped to 30 by day and 52
 *   by week, and sent only when open with count > 1 (1179-1180).
 * - CTA reads `Plan <Tag>` and `Planning...` while submitting. A 409
 *   `plan_exists` retries once with `mode: 'merge'` (the web's default
 *   outcome); `onPlanned` receives the toast text (`planResultToast`).
 *
 * Not mounted anywhere yet — NP-231 and NP-232 mount it.
 */

export interface PlanFoodSheetProps {
  visible: boolean;
  /** The food being planned. */
  food: QuantityPickerFood | null;
  /** Local `YYYY-MM-DD` key the plan is filed under. */
  plannedDate: string;
  /** Initial meal-time tag. */
  tag?: string;
  onClose: () => void;
  /** Receives the toast text for the plan result. */
  onPlanned: (toast: string) => void;
  /** Test seam — defaults to the real `apiFetch`. */
  apiFetch?: typeof ApiFetchType;
}

const TAG_OPTIONS = ["breakfast", "lunch", "dinner", "snack"] as const;

function maxRepeatCount(every: MealPlanRepeatEvery): number {
  return every === "day" ? MAX_REPEAT_COUNT_BY_DAY : MAX_REPEAT_COUNT_BY_WEEK;
}

export function PlanFoodSheet({
  visible,
  food,
  plannedDate,
  tag = "snack",
  onClose,
  onPlanned,
  apiFetch = defaultApiFetch,
}: PlanFoodSheetProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const [selection, setSelection] = useState<QuantityPickerSelection | null>(
    null,
  );
  const [sheetTag, setSheetTag] = useState<string>(tag);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatEvery, setRepeatEvery] =
    useState<MealPlanRepeatEvery>("week");
  const [repeatCount, setRepeatCount] = useState<number>(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useTag = (sheetTag || tag || "snack").trim().toLowerCase() || "snack";

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleEveryChange = (every: MealPlanRepeatEvery) => {
    setRepeatEvery(every);
    setRepeatCount((prev) => Math.min(prev, maxRepeatCount(every)));
  };

  const handleCountText = (text: string) => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n)) return;
    setRepeatCount(Math.min(Math.max(n, 1), maxRepeatCount(repeatEvery)));
  };

  const handleSubmit = useCallback(async () => {
    if (!food || !selection || submitting) return;
    if (!Number.isFinite(selection.quantity) || selection.quantity <= 0) {
      setError("Pick a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const item = buildMealItemPayload({
        food,
        variant: selection.variant,
        quantity: selection.quantity,
        unit: selection.unit,
        servingChoice: selection.servingChoice,
      });
      const repeat =
        repeatOpen && repeatCount > 1
          ? { every: repeatEvery, count: repeatCount }
          : undefined;
      const base = {
        plannedDate,
        tag: useTag,
        items: [item],
        ...(repeat ? { repeat } : {}),
        apiFetch,
        token: token ?? undefined,
      };
      let result = await createMealPlan(base);
      if ("conflict" in result) {
        // 409 `plan_exists` — retry once with the web's default outcome.
        result = await createMealPlan({ ...base, mode: "merge" });
      }
      if ("conflict" in result) {
        onPlanned(`Added to existing ${titleCaseTag(useTag)} plan`);
      } else {
        onPlanned(planResultToast(result, useTag));
      }
      setRepeatOpen(false);
      setRepeatCount(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to plan food.");
    } finally {
      setSubmitting(false);
    }
  }, [
    food,
    selection,
    submitting,
    repeatOpen,
    repeatCount,
    repeatEvery,
    plannedDate,
    useTag,
    apiFetch,
    token,
    onPlanned,
  ]);

  const ctaLabel = submitting ? "Planning..." : `Plan ${titleCaseTag(useTag)}`;
  const canSubmit = Boolean(food && selection) && !submitting;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={food?.name ? `Plan ${food.name}` : "Plan food"}
      testID="plan-food-sheet"
      accessibilityLabel={food?.name ? `Plan ${food.name}` : "Plan food"}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          <Text
            testID="plan-food-sheet-date"
            style={{ fontSize: 13, color: colors["muted-foreground"] }}
          >
            Planning for {plannedDate} · {titleCaseTag(useTag)}
          </Text>

          {food ? (
            <QuantityPicker
              food={food}
              initialTag={sheetTag}
              initialQuantity={1}
              showLogControls={false}
              onChange={setSelection}
              testID="plan-food-quantity"
            />
          ) : null}

          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: colors.foreground,
              }}
            >
              Meal
            </Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {TAG_OPTIONS.map((t) => {
                const isSelected = useTag === t;
                return (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    accessibilityLabel={`Tag ${t}`}
                    testID={`tag-chip-${t}`}
                    onPress={() => setSheetTag(t)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: isSelected
                        ? colors.primary
                        : colors.card,
                      borderWidth: 1,
                      borderColor: isSelected
                        ? colors.primary
                        : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected ? "600" : "400",
                        color: isSelected
                          ? colors["primary-foreground"]
                          : colors.foreground,
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

          <View style={{ gap: 6 }}>
            {!repeatOpen ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Repeat this plan"
                testID="plan-repeat-toggle"
                onPress={() => setRepeatOpen(true)}
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: colors.foreground,
                  }}
                >
                  Repeat…
                </Text>
              </Pressable>
            ) : (
              <View
                testID="plan-repeat-editor"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: colors.foreground,
                  }}
                >
                  Every
                </Text>
                {(["day", "week"] as const).map((every) => {
                  const isSelected = repeatEvery === every;
                  return (
                    <Pressable
                      key={every}
                      accessibilityRole="button"
                      accessibilityLabel={`Repeat every ${every}`}
                      testID={`plan-repeat-every-${every}`}
                      onPress={() => handleEveryChange(every)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        backgroundColor: isSelected
                          ? colors.primary
                          : colors.background,
                        borderWidth: 1,
                        borderColor: isSelected
                          ? colors.primary
                          : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? "600" : "400",
                          color: isSelected
                            ? colors["primary-foreground"]
                            : colors.foreground,
                        }}
                      >
                        {every}
                      </Text>
                    </Pressable>
                  );
                })}
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: colors.foreground,
                  }}
                >
                  for
                </Text>
                <TextInput
                  testID="plan-repeat-count"
                  accessibilityLabel="Number of occurrences"
                  value={String(repeatCount)}
                  onChangeText={handleCountText}
                  keyboardType="numeric"
                  style={{
                    width: 56,
                    height: 36,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    paddingHorizontal: 8,
                    color: colors.foreground,
                    fontSize: 12,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: colors.foreground,
                  }}
                >
                  {repeatEvery === "day"
                    ? repeatCount === 1
                      ? "day"
                      : "days"
                    : repeatCount === 1
                      ? "week"
                      : "weeks"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close recurrence"
                  testID="plan-repeat-close"
                  onPress={() => {
                    setRepeatOpen(false);
                    setRepeatCount(6);
                  }}
                  style={{
                    marginLeft: "auto",
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{ fontSize: 14, color: colors.foreground }}
                  >
                    ×
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {error ? (
            <Text
              testID="plan-food-sheet-error"
              accessibilityRole="alert"
              style={{ fontSize: 12, color: colors.destructive }}
            >
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel planning"
                testID="plan-food-sheet-cancel"
                onPress={handleClose}
                style={{
                  height: 48,
                  borderRadius: 8,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: colors.foreground,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ctaLabel}
                testID="plan-food-submit"
                onPress={() => void handleSubmit()}
                disabled={!canSubmit}
                style={{
                  height: 48,
                  borderRadius: 8,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: canSubmit ? 1 : 0.5,
                }}
              >
                <Text
                  testID="plan-food-submit-label"
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: colors["primary-foreground"],
                  }}
                >
                  {ctaLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

export default PlanFoodSheet;
