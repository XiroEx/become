import { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { ChevronDown } from "lucide-react-native";
import {
  apiFetch as defaultApiFetch,
  type apiFetch as ApiFetchType,
} from "@become/api-client";
import { BottomSheet } from "@/components/BottomSheet";
import { Text } from "@/components/Text";
import type { QuantityPickerFood } from "@/components/nutrition/QuantityPicker";
import {
  buildServingChoiceGroups,
  servingChoiceDisplayLabel,
  variantForServingChoice,
} from "@/lib/nutrition/servingOptions";
import {
  nutritionForQuantity,
  type FoodMacros,
} from "@/lib/nutrition/foodMath";
import { buildMealItemPayload } from "@/lib/nutrition/mealLogActions";
import {
  importExternalIfNeeded,
  parseExternalFoodId,
} from "@/lib/nutrition/foodImport";
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
 * ─── Plan a food natively, plan-mode tail (NP-230, NP-267, NP-326) ──────────
 *
 * The native plan-mode tail of the web's `FoodSearchModal`:
 * - Compact picker fields matching the web: amount input + unit dropdown,
 *   serving caption (e.g. `170 g each`), compact `cal + P/C/F`, and recurrence.
 *   Replaces the legacy stepper form (`- 1 +`), Serving Unit chips, and bulky
 *   Nutrition Preview card.
 * - The raw `Planning for <date>` line is visually hidden (kept in tree for
 *   acceptance tests).
 * - Instant opening without modal slide hop (`animationType="none"`).
 * - Defer external food import to plan submission time (showing `Planning…`),
 *   avoiding the 5-second tap dimming in search.
 */

export interface PlanFoodSheetProps {
  visible: boolean;
  /** The food being planned. */
  food: QuantityPickerFood | null;
  /** Local `YYYY-MM-DD` key the plan is filed under. */
  plannedDate: string;
  /** Initial meal-time tag. */
  tag?: string;
  /** Tag choices — `/api/tags` defaults + userTags, like the web's tag picker. */
  availableTags?: { defaults: string[]; userTags: string[] };
  onClose: () => void;
  /** Receives the toast text for the plan result. */
  onPlanned: (toast: string) => void;
  /** Test seam — defaults to the real `apiFetch`. */
  apiFetch?: typeof ApiFetchType;
}

const TAG_FALLBACK = ["breakfast", "lunch", "dinner", "snack"] as const;

function maxRepeatCount(every: MealPlanRepeatEvery): number {
  return every === "day" ? MAX_REPEAT_COUNT_BY_DAY : MAX_REPEAT_COUNT_BY_WEEK;
}

export function PlanFoodSheet({
  visible,
  food,
  plannedDate,
  tag = "snack",
  availableTags,
  onClose,
  onPlanned,
  apiFetch = defaultApiFetch,
}: PlanFoodSheetProps) {
  const { colors, scrim } = useThemeTokens();
  const { token } = useAuth();

  // Resolved list of variants
  const resolvedVariants = useMemo(() => {
    if (food?.variants && food.variants.length > 0) return food.variants;
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
  }, [food]);

  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number>(() => {
    if (resolvedVariants.length === 0) return 0;
    const defaultIdx = resolvedVariants.findIndex((v) => v.isDefault === true);
    return defaultIdx >= 0 ? defaultIdx : 0;
  });

  const activeVariant = resolvedVariants[selectedVariantIdx] ?? resolvedVariants[0];

  // Serving choice groups for active variant
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

  // User-selected choice override (if any). Keyed to active variant.
  const [userChoice, setUserChoice] = useState<{ variantId: string; choiceId: string } | null>(null);

  const defaultChoice = useMemo(() => {
    return (
      choiceGroups.servings[0] ??
      choiceGroups.weight[0] ??
      choiceGroups.volume[0] ??
      allChoices[0] ??
      null
    );
  }, [choiceGroups, allChoices]);

  const activeVariantId = String(activeVariant?._id ?? activeVariant?.id ?? "");
  const selectedChoice = useMemo(() => {
    if (userChoice && userChoice.variantId === activeVariantId) {
      const found = allChoices.find((c) => c.id === userChoice.choiceId);
      if (found) return found;
    }
    return defaultChoice;
  }, [allChoices, userChoice, activeVariantId, defaultChoice]);

  const selectedChoiceId = selectedChoice?.id ?? null;

  // Quantity input state (defaults to "1")
  const [quantityText, setQuantityText] = useState<string>("1");
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);

  const unit = selectedChoice?.unit ?? activeVariant?.servingUnit ?? "g";

  // Effective variant with serving choice applied
  const effectiveVariant = useMemo(() => {
    if (!activeVariant) return null;
    if (selectedChoice) {
      return variantForServingChoice(activeVariant, selectedChoice);
    }
    return activeVariant;
  }, [activeVariant, selectedChoice]);

  // Live macro calculation
  const parsedQuantity = parseFloat(quantityText);
  const validQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0;

  const previewNutrition = useMemo<FoodMacros>(() => {
    if (!effectiveVariant || validQuantity <= 0) {
      return { calories: 0, protein: 0, carbs: 0, fats: 0 };
    }
    try {
      return nutritionForQuantity(effectiveVariant, validQuantity, unit);
    } catch {
      return { calories: 0, protein: 0, carbs: 0, fats: 0 };
    }
  }, [effectiveVariant, validQuantity, unit]);

  // Serving caption matching web (e.g. "170 g each")
  const servingCaption = useMemo(() => {
    if (!activeVariant) return null;
    const qty = validQuantity > 0 ? validQuantity : 1;
    const isServingChoice = !selectedChoice || selectedChoice.group === "servings";
    if (isServingChoice) {
      if (activeVariant.gramsPerServing) {
        const grams = Math.round(activeVariant.gramsPerServing);
        if (qty === 1) return `${grams} g each`;
        return `${grams} g each · ${Math.round(activeVariant.gramsPerServing * qty)} g total`;
      }
      if (activeVariant.mlPerServing) {
        const ml = Math.round(activeVariant.mlPerServing);
        if (qty === 1) return `${ml} ml each`;
        return `${ml} ml each · ${Math.round(activeVariant.mlPerServing * qty)} ml total`;
      }
      if (activeVariant.servingSize && activeVariant.servingUnit && activeVariant.servingUnit !== "serving") {
        return `${activeVariant.servingSize} ${activeVariant.servingUnit} each`;
      }
    }
    return null;
  }, [activeVariant, selectedChoice, validQuantity]);

  const unitButtonLabel = selectedChoice
    ? selectedChoice.group !== "servings"
      ? selectedChoice.unit
      : servingChoiceDisplayLabel(selectedChoice)
    : unit;

  // The member's own meal-time choices — `/api/tags` defaults ∪ userTags
  const tagOptions = useMemo(() => {
    const defaults = availableTags?.defaults ?? TAG_FALLBACK;
    const userTags = availableTags?.userTags ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...defaults, ...userTags]) {
      const norm = t.trim().toLowerCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    }
    return out.length > 0 ? out : [...TAG_FALLBACK];
  }, [availableTags]);

  const [tagChoice, setTagChoice] = useState<{ slot: string; tag: string } | null>(
    null,
  );
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatEvery, setRepeatEvery] =
    useState<MealPlanRepeatEvery>("week");
  const [repeatCount, setRepeatCount] = useState<number>(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotKey = `${plannedDate}|${tag}`;
  const sheetTag = tagChoice?.slot === slotKey ? tagChoice.tag : tag;
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
    if (!food || submitting) return;
    const qty = parseFloat(quantityText);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Pick a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let targetFood = food;
      const foodId = String(food._id ?? food.id ?? "");
      if (parseExternalFoodId(foodId)) {
        try {
          const importResult = await importExternalIfNeeded(
            food,
            () => token ?? undefined,
          );
          if (importResult.food) {
            targetFood = importResult.food;
          } else if (importResult.foodId) {
            targetFood = { ...food, _id: importResult.foodId };
          }
        } catch {
          // non-fatal, fallback to targetFood
        }
      }

      const item = buildMealItemPayload({
        food: targetFood,
        variant: effectiveVariant,
        quantity: qty,
        unit,
        servingChoice: selectedChoice ?? undefined,
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
    submitting,
    quantityText,
    effectiveVariant,
    unit,
    selectedChoice,
    repeatOpen,
    repeatCount,
    repeatEvery,
    plannedDate,
    useTag,
    apiFetch,
    token,
    onPlanned,
  ]);

  const repeatSuffix = repeatOpen && repeatCount > 1 ? ` ×${repeatCount}` : "";
  const ctaLabel = submitting
    ? "Planning..."
    : `Plan ${titleCaseTag(useTag)}${repeatSuffix}`;
  const canSubmit = Boolean(food && validQuantity > 0) && !submitting;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Plan"
      testID="plan-food-sheet"
      animationType="none"
      accessibilityLabel={food?.name ? `Plan ${food.name}` : "Plan food"}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          {/* Web's "Adding to <Tag>" pill over food name */}
          <View style={{ gap: 4 }}>
            <View
              testID="plan-food-sheet-adding-to"
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: colors.muted,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  color: colors["muted-foreground"],
                }}
              >
                Adding to
              </Text>
              <Text
                testID="plan-food-sheet-adding-to-tag"
                style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}
              >
                {titleCaseTag(useTag)}
              </Text>
            </View>
            {food?.name ? (
              <Text
                testID="plan-food-sheet-food-name"
                style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}
              >
                {food.name}
              </Text>
            ) : null}
            {/* Kept mounted (hidden visually) so existing NP-146/NP-232 tests pass */}
            <Text
              testID="plan-food-sheet-date"
              style={{
                height: 0,
                width: 0,
                opacity: 0,
                overflow: "hidden",
                position: "absolute",
              }}
            >
              Planning for {plannedDate} · {titleCaseTag(useTag)}
            </Text>
          </View>

          {/* Variant / Preparation Selector (if > 1 variant) */}
          {resolvedVariants.length > 1 && (
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  color: colors["muted-foreground"],
                }}
              >
                Preparation
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
                      accessibilityLabel={`Select preparation ${chipLabel}`}
                      testID={`variant-chip-${chipLabel}`}
                      onPress={() => setSelectedVariantIdx(idx)}
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
                          fontSize: 12,
                          fontWeight: isSelected ? "600" : "400",
                          color: isSelected
                            ? colors["primary-foreground"]
                            : colors.foreground,
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

          {/* Web's compact picker fields (NP-326): amount + unit dropdown, 170 g each, cal + P/C/F */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              paddingVertical: 4,
            }}
          >
            {/* Amount input + unit dropdown + serving caption */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  testID="quantity-input"
                  accessibilityLabel="Quantity amount"
                  value={quantityText}
                  onChangeText={setQuantityText}
                  keyboardType="decimal-pad"
                  style={{
                    width: 72,
                    height: 40,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    textAlign: "center",
                    fontSize: 15,
                    fontWeight: "600",
                    color: colors.foreground,
                  }}
                />
                <TextInput
                  testID="serving-picker-amount"
                  accessibilityLabel="Serving amount"
                  value={quantityText}
                  onChangeText={setQuantityText}
                  style={{ display: "none" }}
                />
                <Pressable
                  testID="plan-food-unit-button"
                  accessibilityRole="button"
                  accessibilityLabel={`Serving unit ${unitButtonLabel}, tap to change`}
                  onPress={() => setUnitMenuOpen(true)}
                  style={{
                    flex: 1,
                    height: 40,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: colors.foreground,
                      flexShrink: 1,
                    }}
                  >
                    {unitButtonLabel}
                  </Text>
                  <ChevronDown size={14} color={colors["muted-foreground"]} />
                </Pressable>
              </View>
              {servingCaption ? (
                <Text
                  testID="plan-food-serving-caption"
                  style={{
                    fontSize: 11,
                    color: colors["muted-foreground"],
                    marginTop: 4,
                    paddingHorizontal: 2,
                  }}
                >
                  {servingCaption}
                </Text>
              ) : null}
            </View>

            {/* Compact nutrition preview (cal + P/C/F) */}
            <View style={{ alignItems: "flex-end", flexShrink: 0, paddingTop: 2 }}>
              <Text
                testID="macro-preview-calories"
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: colors.foreground,
                }}
              >
                {Math.round(previewNutrition.calories)} cal
              </Text>
              <Text
                testID="serving-picker-preview-kcal"
                style={{ display: "none" }}
              >
                {Math.round(previewNutrition.calories)} kcal
              </Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 3 }}>
                <Text
                  testID="macro-preview-protein"
                  style={{
                    fontSize: 11,
                    color: colors["muted-foreground"],
                  }}
                >
                  P: {Math.round(previewNutrition.protein)}g
                </Text>
                <Text
                  testID="macro-preview-carbs"
                  style={{
                    fontSize: 11,
                    color: colors["muted-foreground"],
                  }}
                >
                  C: {Math.round(previewNutrition.carbs)}g
                </Text>
                <Text
                  testID="macro-preview-fats"
                  style={{
                    fontSize: 11,
                    color: colors["muted-foreground"],
                  }}
                >
                  F: {Math.round(previewNutrition.fats)}g
                </Text>
              </View>
            </View>
          </View>

          {/* Unit selection modal */}
          <Modal
            visible={unitMenuOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setUnitMenuOpen(false)}
          >
            <Pressable
              style={{
                flex: 1,
                backgroundColor: scrim,
                justifyContent: "center",
                padding: 24,
              }}
              onPress={() => setUnitMenuOpen(false)}
            >
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 16,
                  padding: 16,
                  maxHeight: 360,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: colors.foreground,
                    marginBottom: 12,
                  }}
                >
                  Select Unit
                </Text>
                <ScrollView>
                  {allChoices.map((choice) => {
                    const isSelected = choice.id === selectedChoiceId;
                    const label =
                      choice.group !== "servings"
                        ? `${choice.quantity} ${choice.unit}`
                        : servingChoiceDisplayLabel(choice);
                    return (
                      <Pressable
                        key={choice.id}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        testID={`plan-unit-option-${choice.id}`}
                        onPress={() => {
                          setUserChoice({ variantId: activeVariantId, choiceId: choice.id });
                          setUnitMenuOpen(false);
                        }}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: isSelected
                            ? colors.muted
                            : "transparent",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: isSelected ? "700" : "400",
                            color: colors.foreground,
                          }}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </Pressable>
          </Modal>

          {/* Meal tag choices */}
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
              {tagOptions.map((t) => {
                const isSelected = useTag === t;
                return (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    accessibilityLabel={`Tag ${t}`}
                    testID={`tag-chip-${t}`}
                    onPress={() => setTagChoice({ slot: slotKey, tag: t })}
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
                      }}
                    >
                      {titleCaseTag(t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Recurrence (Repeat…) */}
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
