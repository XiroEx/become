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
import type { MealLog } from "@become/api-client";

export type EditLogItem = MealLog["items"][number];

export interface EditLogItemSheetProps {
  visible: boolean;
  /** The log this item belongs to. */
  logId: string | null;
  /** The item to edit. */
  item: EditLogItem | null;
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
export function deriveEditVariantAndInitial(item: EditLogItem): {
  variant: {
    servingSize: number;
    servingUnit: string;
    nutrition: EditLogItemNutrition;
    gramsPerServing?: number;
    mlPerServing?: number;
  };
  initial: { quantity: number; unit: string };
} {
  const variant = {
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    nutrition: {
      calories: item.nutrition.calories,
      protein: item.nutrition.protein,
      carbs: item.nutrition.carbs,
      fats: item.nutrition.fats,
      fiber: item.nutrition.fiber,
      sugar: item.nutrition.sugar,
      sodium: item.nutrition.sodium,
      saturatedFat: item.nutrition.saturatedFat,
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
  const synthesizedQty = (item.servings ?? 1) * item.servingSize;
  return {
    variant,
    initial: { quantity: synthesizedQty, unit: item.servingUnit },
  };
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
 */
export function EditLogItemSheet({
  visible,
  logId,
  item,
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
    if (!item || !logId || !effectiveSelection) return;
    const next = effectiveSelection;
    if (next.quantity <= 0 || !(next.multiplier > 0)) {
      setError("Amount must be greater than 0");
      return;
    }
    setSaving(true);
    setError(null);
    try {
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
