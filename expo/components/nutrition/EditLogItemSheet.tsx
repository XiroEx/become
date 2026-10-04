import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Pencil } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import {
  QuantityPicker,
  type QuantityPickerSelection,
} from "@/components/nutrition/QuantityPicker";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { scalingFactor, nutritionForQuantity } from "@/lib/nutrition/foodMath";
import type { Unit } from "@/lib/nutrition/units";
import {
  editLoggedItem,
  mealLogTagPatch,
  mealLogTimeInputValue,
  mealLogTimePatch,
  type EditLogItemNutrition,
} from "@/lib/nutrition/editLoggedEntry";
import {
  updateMealPlanItems,
  type MealPlanItemInput,
} from "@/lib/nutrition/mealPlanApi";
import type { MealLog } from "@become/api-client";

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
 * The web's `EditFoodModal.tsx` as a sheet on the native quantity picker
 * (NP-093): change the amount (quantity + unit), move the row to another tag,
 * or change its clock time — keeping the untimed choice. The Flag-this-food
 * entry inside the item editor arrives with NP-174, so this sheet does not
 * offer macro correction: `nutrition` is never sent and the stored block is
 * left untouched.
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from sheet open + new target
      setSelection(null);
      setError(null);
      setSelectedTag(normalizedCurrentTag);
      setLogTime(mealLogTimeInputValue(loggedAt, untimed));
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
        // No `nutrition`: the member cannot correct macros here (NP-174 owns
        // that entry), so the stored block is left untouched.
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

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={item?.name ? `Edit ${item.name}` : "Edit item"}
      testID={testID}
      accessibilityLabel={item?.name ? `Edit ${item.name}` : "Edit logged item"}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
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

          {derived ? (
            <View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                Amount
              </Text>
              <QuantityPicker
                key={String((item as { _id?: unknown } | null)?._id ?? "item")}
                variant={derived.variant}
                initialQuantity={derived.initial.quantity}
                initialUnit={derived.initial.unit}
                initialTag={normalizedCurrentTag}
                showLogControls={false}
                onChange={setSelection}
                testID={`${testID}-quantity`}
              />
            </View>
          ) : null}

          {isPlanMode ? null : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                  Meal
                </Text>
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
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                    Time
                  </Text>
                  {logTime ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear time"
                      testID={`${testID}-clear-time`}
                      onPress={() => setLogTime("")}
                      hitSlop={8}
                    >
                      <Text className="text-muted-foreground text-xs font-medium underline">
                        Clear time
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  testID={`${testID}-time`}
                  accessibilityLabel="Logged time in HH:mm"
                  value={logTime}
                  onChangeText={setLogTime}
                  placeholder="HH:mm"
                  style={{
                    height: 40,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    paddingHorizontal: 12,
                    color: colors.foreground,
                  }}
                />
                <Text className="text-muted-foreground text-xs">
                  {logTime
                    ? "Change when this was logged."
                    : "No time set — it stays anchored to this meal tag."}
                </Text>
              </View>
            </>
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
  );
}
