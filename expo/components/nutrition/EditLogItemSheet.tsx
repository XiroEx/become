import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { AlertTriangle, Clock, Pencil, Tag as TagIcon, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import type { QuantityPickerSelection } from "@/components/nutrition/QuantityPicker";
import { FlagFoodSheet } from "@/components/nutrition/FlagFoodSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { scalingFactor, nutritionForQuantity } from "@/lib/nutrition/foodMath";
import type { Unit } from "@/lib/nutrition/units";
import type { LogCorrection } from "@/lib/nutrition/foodFlags";
import {
  editLoggedItem,
  formatTime12Hour,
  mealLogTagPatch,
  mealLogTimeInputValue,
  mealLogTimePatch,
  parseTime12Hour,
  type EditLogItemNutrition,
} from "@/lib/nutrition/editLoggedEntry";
import {
  updateMealPlanItems,
  type MealPlanItemInput,
} from "@/lib/nutrition/mealPlanApi";
import type { MealLog } from "@become/api-client";

/** Render a quantity for an amount chip: whole numbers bare, else 2 decimals max. */
function formatAmountNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

export type EditLogItem = MealLog["items"][number];

/**
 * One planned row, exactly the web's `EditFoodModal` plan-mode item shape
 * (`IMealItem & { _id?: string }`): per-serving `nutrition` + a `servings`
 * multiplier, with the `logged*` provenance quartet the picker restores from.
 */
export type EditPlanItem = {
  _id?: string;
  id?: string;
  name?: string;
  brand?: string;
  servingSize?: number | string;
  servingUnit?: string;
  servings?: number;
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
    saturatedFat?: number;
    [k: string]: unknown;
  };
  loggedQuantity?: number;
  loggedUnit?: string;
  loggedGramsPerServing?: number;
  loggedMlPerServing?: number;
  [k: string]: unknown;
};

export interface EditLogItemSheetProps {
  visible: boolean;
  /** The log this item belongs to (log mode). */
  logId: string | null;
  /** The item to edit. */
  item: EditLogItem | EditPlanItem | null;
  /**
   * Plan mode (NP-233): PATCH /api/meal-plans/{planId} with the FULL `items[]`
   * — the web's `EditFoodModal.tsx:242-283` port. `planItems` is the plan's
   * current array; the edited item is replaced by `_id` and the whole array
   * is sent. Requires `planId` + `planItems`; when set, `logId` is ignored
   * and the tag/time controls are hidden (plans carry no clock).
   */
  planId?: string | null;
  planItems?: readonly EditPlanItem[] | null;
  /** The log's own time metadata — a blank time means untimed. */
  loggedAt?: string;
  untimed?: boolean;
  /** The section this row is currently shown under. */
  currentTag?: string;
  /** Every tag the member can move it to. */
  availableTags?: { defaults: string[]; userTags: string[] };
  token?: string | null;
  onClose: () => void;
  /** Refetch the day after save. */
  onSaved: () => void | Promise<void>;
  testID?: string;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-") || "snack";
}

function tagLabel(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Build a synthetic single-variant picker state from a stored MealLog item.
 * The item carries per-serving nutrition + a `servings` multiplier, so it is
 * projected back to a canonical variant ("1 serving = servingSize ×
 * servingUnit at the snapshotted nutrition") with the already-applied
 * multiplier as the logged amount in the same unit. Mirrors the web's
 * `deriveVariantAndInitial` in `EditFoodModal.tsx`.
 *
 * Read-on-write back-compat: when the stored item lacks loggedQuantity /
 * loggedUnit (old write), synthesize `loggedQuantity = servingSize ×
 * multiplier` so the picker opens at the same physical amount.
 */
export function deriveEditVariantAndInitial(
  item: EditLogItem | EditPlanItem,
): {
  variant: {
    servingSize: number;
    servingUnit: string;
    nutrition: EditLogItemNutrition;
    gramsPerServing?: number;
    mlPerServing?: number;
  };
  initial: { quantity: number; unit: string };
} {
  const nutrition = (item.nutrition ?? {}) as EditLogItemNutrition;
  const servingSize =
    typeof item.servingSize === "number"
      ? item.servingSize
      : Number(item.servingSize) || 1;
  const servingUnit =
    typeof item.servingUnit === "string" && item.servingUnit
      ? item.servingUnit
      : "serving";
  const variant = {
    servingSize,
    servingUnit,
    nutrition: {
      calories: nutrition.calories ?? 0,
      protein: nutrition.protein ?? 0,
      carbs: nutrition.carbs ?? 0,
      fats: nutrition.fats ?? 0,
      fiber: nutrition.fiber,
      sugar: nutrition.sugar,
      sodium: nutrition.sodium,
      saturatedFat: nutrition.saturatedFat,
    },
    gramsPerServing: item.loggedGramsPerServing,
    mlPerServing: item.loggedMlPerServing,
  };
  if (item.loggedQuantity != null && item.loggedUnit) {
    return {
      variant,
      initial: { quantity: item.loggedQuantity, unit: item.loggedUnit },
    };
  }
  const synthesizedQty = (item.servings ?? 1) * servingSize;
  return {
    variant,
    initial: { quantity: synthesizedQty, unit: servingUnit },
  };
}

/**
 * Rebuild a plan's FULL `items[]` with the edited item replaced by `_id`
 * (port of `webapp/components/nutrition/EditFoodModal.tsx:242-283`):
 * `servings` is the picker's multiplier, `loggedQuantity`/`loggedUnit` are
 * what the member typed, the grams/ml bridge rolls forward, and the
 * per-serving nutrition is the picker's scaled total divided back by the
 * multiplier. Items without a matching `_id` pass through untouched.
 */
export function buildUpdatedPlanItems(
  planItems: readonly EditPlanItem[],
  itemId: string,
  selection: {
    quantity: number;
    unit: string;
    multiplier: number;
    nutrition: EditLogItemNutrition;
    variant?: {
      gramsPerServing?: number | null;
      mlPerServing?: number | null;
    } | null;
  },
  bridge?: { gramsPerServing?: number; mlPerServing?: number },
): EditPlanItem[] {
  return planItems.map((it) => {
    if (String((it as { _id?: unknown })._id ?? "") !== itemId) return it;
    const m = selection.multiplier;
    const scaled = selection.nutrition;
    const prevNutrition = ((it.nutrition ?? {}) as Record<string, unknown>);
    return {
      ...it,
      servings: m,
      loggedQuantity: selection.quantity,
      loggedUnit: selection.unit,
      loggedGramsPerServing:
        selection.variant?.gramsPerServing ??
        bridge?.gramsPerServing ??
        it.loggedGramsPerServing,
      loggedMlPerServing:
        selection.variant?.mlPerServing ??
        bridge?.mlPerServing ??
        it.loggedMlPerServing,
      nutrition: {
        ...prevNutrition,
        calories: scaled.calories / m,
        protein: scaled.protein / m,
        carbs: scaled.carbs / m,
        fats: scaled.fats / m,
        fiber: (scaled.fiber ?? 0) / m,
        sugar: (scaled.sugar ?? 0) / m,
        sodium: (scaled.sodium ?? 0) / m,
        saturatedFat: (scaled.saturatedFat ?? 0) / m,
      },
    };
  });
}

/**
 * ─── Edit a logged item, natively (NP-095) ──────────────────────────────────
 *
 * The web's `EditFoodModal.tsx` as a sheet: amount presets (as logged, half,
 * double) plus a Custom fallback, move the row to another tag, change its
 * clock time — keeping the untimed choice — and "Fix these macros" (NP-174's
 * `FlagFoodSheet`, wired here the same way `EditFoodModal.tsx` wires it) to
 * correct this entry's own nutrition. `nutrition` is only ever sent when the
 * member actually corrected it; otherwise the stored block is left untouched.
 *
 * Plan mode (NP-233): with `planId` + `planItems` the sheet edits a PLANNED
 * item instead — same picker, but save rebuilds the whole `items[]` via
 * `buildUpdatedPlanItems` and PATCHes `/api/meal-plans/{id}` with `{ items }`.
 * A 409 `plan_already_promoted` surfaces the server's refusal as the sheet
 * error (the plan already lives in the log).
 */
export function EditLogItemSheet({
  visible,
  logId,
  item,
  planId = null,
  planItems = null,
  loggedAt,
  untimed = false,
  currentTag = "snack",
  availableTags,
  token,
  onClose,
  onSaved,
  testID = "edit-log-item",
}: EditLogItemSheetProps) {
  const { colors } = useThemeTokens();
  const normalizedCurrentTag = normalizeTag(currentTag);
  const [selection, setSelection] = useState<QuantityPickerSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState(normalizedCurrentTag);
  const [logTime, setLogTime] = useState(() =>
    mealLogTimeInputValue(loggedAt, untimed),
  );
  // 12-hour display text bound to the input — NP-264 matches the web's
  // `<input type="time">` 12-hour rendering ("4:00 AM") while `logTime`
  // keeps the 24-hour wire format `mealLogTimePatch` expects.
  const [timeText, setTimeText] = useState(() =>
    formatTime12Hour(mealLogTimeInputValue(loggedAt, untimed)),
  );
  // Amount presets + Custom (NP-264) — the web's quick chips (1×, ½×, 2×)
  // plus a free-typed fallback, replacing the unit-chip picker here.
  const [amountMode, setAmountMode] = useState<"quick" | "custom">("quick");
  const [activePresetId, setActivePresetId] = useState<string>("primary");
  const [customQtyText, setCustomQtyText] = useState("");
  // A macro correction the member typed for THIS entry, on the item's
  // storage basis — held until save so it travels with the amount edit
  // rather than being a second, invisible write. Mirrors the web's
  // `nutritionOverride` in `EditFoodModal.tsx`.
  const [nutritionOverride, setNutritionOverride] = useState<LogCorrection | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);

  const derived = useMemo(
    () => (item ? deriveEditVariantAndInitial(item) : null),
    [item],
  );

  // Fallback selection representing "the amount as already logged" — computed
  // synchronously from `derived`, not from the picker's `onChange`. The picker
  // only emits once its own mount effect runs, and without this fallback Save
  // would stay disabled until the member touched the amount, even when all
  // they changed was the meal tag. Mirrors the web's `derivedSelection`.
  const derivedSelection = useMemo<QuantityPickerSelection | null>(() => {
    if (!derived) return null;
    try {
      const { quantity, unit } = derived.initial;
      const multiplier = scalingFactor(
        derived.variant as never,
        quantity,
        unit as Unit,
      );
      if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
      return {
        quantity,
        unit,
        multiplier,
        nutrition: nutritionForQuantity(
          derived.variant as never,
          quantity,
          unit as Unit,
        ),
        variant: derived.variant,
        tag: normalizedCurrentTag,
        date: "",
        timeMode: "now" as const,
        pickedTime: null,
      };
    } catch {
      return null;
    }
  }, [derived, normalizedCurrentTag]);

  const effectiveSelection = selection ?? derivedSelection;

  // Resolve a (quantity, unit) pair against the derived variant — shared by
  // the amount preset chips and the Custom input.
  const resolveSelection = (
    quantity: number,
    unit: string,
  ): QuantityPickerSelection | null => {
    if (!derived) return null;
    try {
      const multiplier = scalingFactor(derived.variant as never, quantity, unit as Unit);
      if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
      return {
        quantity,
        unit,
        multiplier,
        nutrition: nutritionForQuantity(derived.variant as never, quantity, unit as Unit),
        variant: derived.variant,
        tag: normalizedCurrentTag,
        date: "",
        timeMode: "now" as const,
        pickedTime: null,
      };
    } catch {
      return null;
    }
  };

  // Amount presets (NP-264): the web's quick chips — the amount as already
  // logged, half of it, and double it — plus a "Custom" fallback. Unlike the
  // web's `buildQuickOptions`, this does not consider the food's
  // `alternateServings` (not carried by the stored log/plan item shapes
  // here), so the middle chip is always half rather than a named alternate.
  const amountPresets = useMemo(() => {
    if (!derived) return [];
    const { unit } = derived.initial;
    const primaryQty = derived.initial.quantity;
    const halfQty = primaryQty / 2;
    const doubleQty = primaryQty * 2;
    return [
      { id: "primary", quantity: primaryQty, unit, label: `${formatAmountNumber(primaryQty)} ${unit}` },
      { id: "half", quantity: halfQty, unit, label: `${formatAmountNumber(halfQty)} ${unit}` },
      { id: "double", quantity: doubleQty, unit, label: `${formatAmountNumber(doubleQty)} ${unit}` },
    ];
  }, [derived]);

  const handlePresetSelect = (id: string) => {
    const preset = amountPresets.find((p) => p.id === id);
    if (!preset) return;
    setActivePresetId(id);
    setAmountMode("quick");
    const next = resolveSelection(preset.quantity, preset.unit);
    if (next) setSelection(next);
  };

  const enterCustomMode = () => {
    setAmountMode("custom");
    const base = effectiveSelection?.quantity ?? derived?.initial.quantity ?? 0;
    setCustomQtyText(formatAmountNumber(base));
  };

  const handleCustomQtyChange = (text: string) => {
    setCustomQtyText(text);
    if (!derived) return;
    const parsed = parseFloat(text);
    if (Number.isFinite(parsed) && parsed > 0) {
      const next = resolveSelection(parsed, derived.initial.unit);
      if (next) setSelection(next);
    }
  };

  // Live preview: the selection itself carries the scaled nutrition. A
  // pending correction is per storage basis, so it scales by the same
  // multiplier. Mirrors the web's `preview` in `EditFoodModal.tsx`.
  const preview = useMemo(() => {
    if (!effectiveSelection) return undefined;
    if (!nutritionOverride) return effectiveSelection.nutrition;
    const f = effectiveSelection.multiplier > 0 ? effectiveSelection.multiplier : 1;
    return {
      ...effectiveSelection.nutrition,
      calories: nutritionOverride.calories * f,
      protein: nutritionOverride.protein * f,
      carbs: nutritionOverride.carbs * f,
      fats: nutritionOverride.fats * f,
    };
  }, [effectiveSelection, nutritionOverride]);

  const isPlanMode = planId != null && planItems != null;

  const tagOptions = useMemo(() => {
    const tags = [
      normalizedCurrentTag,
      ...(availableTags?.defaults ?? []),
      ...(availableTags?.userTags ?? []),
    ];
    return Array.from(
      new Set(
        tags
          .map((tag) => normalizeTag(String(tag)))
          .filter(Boolean),
      ),
    );
  }, [normalizedCurrentTag, availableTags]);

  useEffect(() => {
    if (visible) {
      const t = mealLogTimeInputValue(loggedAt, untimed);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from sheet open + new target
      setSelection(null);
      setError(null);
      setSelectedTag(normalizedCurrentTag);
      setLogTime(t);
      setTimeText(formatTime12Hour(t));
      setAmountMode("quick");
      setActivePresetId("primary");
      setCustomQtyText("");
      // A pending correction belongs to the entry it was typed for. Leaving
      // it set would silently apply one row's macros to the next row opened.
      setNutritionOverride(null);
    }
  }, [visible, item, normalizedCurrentTag, loggedAt, untimed]);

  const handleClose = () => {
    if (saving) return;
    setError(null);
    onClose();
  };

  const handleSave = async () => {
    if (!item || !effectiveSelection) return;
    const next = effectiveSelection;
    if (next.quantity <= 0 || !(next.multiplier > 0)) {
      setError("Amount must be greater than 0");
      return;
    }
    // Guard the plan-mode divide below: per-serving nutrition is the scaled
    // total / multiplier — a 0/invalid multiplier would write Infinity/NaN.
    if (isPlanMode && !(next.multiplier > 0)) {
      setError("Amount must be greater than 0");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isPlanMode) {
        const itemId = String((item as { _id?: unknown })._id ?? "");
        if (!itemId) {
          setError("Plan context missing.");
          setSaving(false);
          return;
        }
        const updated = buildUpdatedPlanItems(
          planItems as readonly EditPlanItem[],
          itemId,
          {
            quantity: next.quantity,
            unit: next.unit,
            multiplier: next.multiplier,
            nutrition: next.nutrition,
            variant: next.variant as {
              gramsPerServing?: number | null;
              mlPerServing?: number | null;
            } | null,
          },
        );
        try {
          await updateMealPlanItems(
            planId as string,
            updated as unknown as MealPlanItemInput[],
            { token },
          );
        } catch (err) {
          // The server refuses edits on an already-promoted plan — show its
          // refusal rather than a generic failure.
          setError(
            err instanceof Error ? err.message : "Failed to save. Please try again.",
          );
          setSaving(false);
          return;
        }
        await onSaved();
        onClose();
        return;
      }
      if (!logId) return;
      const tagPatch = mealLogTagPatch(normalizedCurrentTag, selectedTag);
      const timePatch = mealLogTimePatch(loggedAt, logTime);
      await editLoggedItem({
        logId,
        itemId: String((item as { _id?: unknown })._id ?? ""),
        servings: next.multiplier,
        loggedQuantity: next.quantity,
        loggedUnit: next.unit,
        ...(next.variant?.gramsPerServing != null ||
        (item.loggedGramsPerServing != null && next.variant != null)
          ? {
              loggedGramsPerServing:
                (next.variant?.gramsPerServing as number | undefined) ??
                item.loggedGramsPerServing,
            }
          : {}),
        ...(next.variant?.mlPerServing != null ||
        (item.loggedMlPerServing != null && next.variant != null)
          ? {
              loggedMlPerServing:
                (next.variant?.mlPerServing as number | undefined) ??
                item.loggedMlPerServing,
            }
          : {}),
        // Only present when the member corrected the macros via "Fix these
        // macros" — the route replaces nutrition wholesale, so sending it
        // unconditionally would rewrite good data with a round-tripped copy
        // of itself.
        ...(nutritionOverride
          ? {
              nutrition: {
                calories: nutritionOverride.calories,
                protein: nutritionOverride.protein,
                carbs: nutritionOverride.carbs,
                fats: nutritionOverride.fats,
                fiber: nutritionOverride.fiber,
              },
            }
          : {}),
        ...(nutritionOverride?.servingLabel !== undefined
          ? { servingLabel: nutritionOverride.servingLabel }
          : {}),
        ...tagPatch,
        ...timePatch,
        token,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const itemFoodId = (item as { foodId?: unknown } | null)?.foodId;
  const hasFoodId = Boolean(itemFoodId);

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        // The header row below is the web's single title (icon + name + X) —
        // BottomSheet's own big title would just repeat it.
        testID={testID}
        accessibilityLabel={item?.name ? `Edit ${item.name}` : "Edit logged item"}
      >
        {/* NP-319: real Android keyboard avoidance — see EstimateSheet.tsx. */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Pencil size={18} color={colors.foreground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                    {item?.name ?? "Item"}
                  </Text>
                  {item?.brand ? (
                    <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                      {item.brand}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Pressable
                testID={`${testID}-close`}
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={handleClose}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} color={colors["muted-foreground"]} />
              </Pressable>
            </View>

            {derived ? (
              <View style={{ gap: 8 }}>
                <Text className="text-muted-foreground text-[11px] font-medium uppercase">
                  Amount
                </Text>
                {amountMode === "quick" ? (
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {amountPresets.map((preset) => {
                      const isSelected = activePresetId === preset.id;
                      return (
                        <Pressable
                          key={preset.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Amount ${preset.label}`}
                          testID={`${testID}-amount-preset-${preset.id}`}
                          onPress={() => handlePresetSelect(preset.id)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 16,
                            backgroundColor: isSelected ? colors.foreground : colors.card,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.foreground : colors.border,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color: isSelected ? colors.background : colors.foreground,
                            }}
                          >
                            {preset.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Enter a custom amount"
                      testID={`${testID}-amount-custom`}
                      onPress={enterCustomMode}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 16,
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Pencil size={11} color={colors.foreground} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>
                        Custom
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TextInput
                        testID={`${testID}-amount-custom-input`}
                        accessibilityLabel="Custom amount"
                        value={customQtyText}
                        onChangeText={handleCustomQtyChange}
                        keyboardType="decimal-pad"
                        placeholder="Amount"
                        style={{
                          flex: 1,
                          height: 40,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                          paddingHorizontal: 12,
                          color: colors.foreground,
                        }}
                      />
                      <Text className="text-foreground text-sm font-semibold">
                        {derived.initial.unit}
                      </Text>
                    </View>
                    <Pressable
                      testID={`${testID}-amount-back-to-presets`}
                      accessibilityRole="button"
                      onPress={() => setAmountMode("quick")}
                      hitSlop={6}
                    >
                      <Text className="text-muted-foreground text-xs font-medium">
                        ← Back to presets
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}

            {isPlanMode ? null : (
              <>
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <TagIcon size={12} color={colors["muted-foreground"]} />
                    <Text className="text-muted-foreground text-[11px] font-medium uppercase">
                      Meal tag
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {tagOptions.map((tag) => {
                      const isSelected = selectedTag === tag;
                      return (
                        <Pressable
                          key={tag}
                          accessibilityRole="button"
                          accessibilityLabel={`Move to ${tagLabel(tag)}`}
                          testID={`${testID}-tag-${tag}`}
                          onPress={() => setSelectedTag(tag)}
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
                              fontSize: 13,
                              fontWeight: isSelected ? "600" : "400",
                              color: isSelected
                                ? colors["primary-foreground"]
                                : colors.foreground,
                            }}
                          >
                            {tagLabel(tag)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Clock size={12} color={colors["muted-foreground"]} />
                      <Text className="text-muted-foreground text-[11px] font-medium uppercase">
                        Time
                      </Text>
                    </View>
                    {logTime ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear time"
                        testID={`${testID}-clear-time`}
                        onPress={() => {
                          setLogTime("");
                          setTimeText("");
                        }}
                        hitSlop={8}
                      >
                        <Text className="text-muted-foreground text-xs font-medium underline">
                          Clear time
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={{ position: "relative", justifyContent: "center" }}>
                    <Clock
                      size={16}
                      color={colors["muted-foreground"]}
                      style={{ position: "absolute", left: 12, zIndex: 1 }}
                    />
                    <TextInput
                      testID={`${testID}-time`}
                      accessibilityLabel="Logged time, 12-hour clock"
                      value={timeText}
                      onChangeText={(text) => {
                        setTimeText(text);
                        const parsed = parseTime12Hour(text);
                        if (parsed !== null) setLogTime(parsed);
                      }}
                      placeholder="4:00 AM"
                      style={{
                        height: 40,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        paddingLeft: 36,
                        paddingRight: 12,
                        color: colors.foreground,
                      }}
                    />
                  </View>
                  <Text className="text-muted-foreground text-xs">
                    {logTime
                      ? "Change when this was logged."
                      : "No time set — it stays anchored to this meal tag."}
                  </Text>
                </View>
              </>
            )}

            {preview ? (
              <View
                testID={`${testID}-macros`}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 6,
                }}
              >
                <Text className="text-muted-foreground text-xs font-medium">
                  Updated macros
                </Text>
                <View style={{ flexDirection: "row" }}>
                  {[
                    { label: "Cal", value: String(Math.round(preview.calories)), color: colors.foreground },
                    { label: "Protein", value: `${Math.round(preview.protein * 10) / 10}g`, color: colors.info },
                    { label: "Carbs", value: `${Math.round(preview.carbs * 10) / 10}g`, color: colors.success },
                    { label: "Fats", value: `${Math.round(preview.fats * 10) / 10}g`, color: colors.accent },
                  ].map((m) => (
                    <View key={m.label} style={{ flex: 1, alignItems: "center" }}>
                      <Text
                        testID={`${testID}-macro-${m.label.toLowerCase()}`}
                        style={{ color: m.color }}
                        className="text-base font-bold"
                      >
                        {m.value}
                      </Text>
                      <Text className="text-muted-foreground text-[10px] uppercase">
                        {m.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {isPlanMode ? null : (
              <Pressable
                testID={`${testID}-fix-macros`}
                accessibilityRole="button"
                onPress={() => setFlagOpen(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingTop: 2,
                }}
              >
                <AlertTriangle size={13} color={colors.accent} />
                <Text
                  className="text-xs font-medium underline"
                  style={{ color: nutritionOverride ? colors.accent : colors["muted-foreground"] }}
                >
                  {nutritionOverride
                    ? "Macros edited — save to apply"
                    : hasFoodId
                      ? "Something look wrong?"
                      : "Fix these macros"}
                </Text>
              </Pressable>
            )}

            {error ? (
              <Text testID={`${testID}-error`} className="text-destructive text-sm font-medium">
                {error}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`${testID}-cancel`}
                  variant="secondary"
                  disabled={saving}
                  onPress={handleClose}
                >
                  Cancel
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`${testID}-save`}
                  variant="inverted"
                  disabled={
                    saving || !effectiveSelection || effectiveSelection.quantity <= 0
                  }
                  loading={saving}
                  onPress={() => void handleSave()}
                >
                  Save
                </Button>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </BottomSheet>

      {item && !isPlanMode ? (
        <FlagFoodSheet
          visible={flagOpen}
          canReport={hasFoodId}
          foodId={hasFoodId ? String(itemFoodId) : ""}
          foodName={item.name ?? "this food"}
          currentNutrition={{
            calories: nutritionOverride?.calories ?? item.nutrition?.calories ?? 0,
            protein: nutritionOverride?.protein ?? item.nutrition?.protein ?? 0,
            carbs: nutritionOverride?.carbs ?? item.nutrition?.carbs ?? 0,
            fats: nutritionOverride?.fats ?? item.nutrition?.fats ?? 0,
            fiber: nutritionOverride?.fiber ?? item.nutrition?.fiber ?? 0,
          }}
          // storage basis -> the portion on screen. Prefer the live
          // selection, but fall back to the item's own `servings` (the same
          // factor), available immediately before the picker has emitted.
          portion={{
            label:
              (item as { servingLabel?: string }).servingLabel ||
              (item.loggedQuantity != null && item.loggedUnit
                ? `${item.loggedQuantity} ${item.loggedUnit}`
                : effectiveSelection
                  ? `${effectiveSelection.quantity} ${effectiveSelection.unit}`
                  : "this entry"),
            factor: effectiveSelection?.multiplier ?? item.servings ?? 1,
          }}
          onApplyToLog={setNutritionOverride}
          onClose={() => setFlagOpen(false)}
          editableServingLabel
          token={token}
          testID={`${testID}-flag`}
        />
      ) : null}
    </>
  );
}
