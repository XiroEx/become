/**
 * ─── `Log this food`, natively (NP-325) ─────────────────────────────────────
 *
 * The web's `FoodLogSheet` (`webapp/components/meals/FoodLogSheet.tsx`) as a
 * sheet, replacing the OLD inline form NP-269 left behind inside the native
 * sheet's body (Variant chips, Serving Unit chips, a `- 1 +` stepper, a
 * Nutrition Preview card, Breakfast/Lunch/Dinner/Snack-only meal chips,
 * Now/Pick time/No time, and a raw `Date` text field):
 *
 *   • a header — thumbnail, name, the serving label, and a close X
 *     (`FoodLogSheet.tsx:332-359`) — no big repeated sheet title;
 *   • `ADDING TO <Tag>` (`FoodLogSheet.tsx:362-428`), defaulting to the
 *     CALLER's tag (the time-of-day tag the screen already computes) and
 *     offering every one of the member's own tags, not just the four
 *     defaults;
 *   • AMOUNT chips — the food's own serving, half of it, double it — plus a
 *     Custom fallback (`FoodLogSheet.tsx:430-436` → the web's
 *     `QuantityPicker`'s `buildQuickOptions`), never a variant picker: the
 *     web log sheet always logs the food's DEFAULT variant;
 *   • `Now` / `No time` (no raw date field — the member can't backdate from
 *     here, matching the dropped `Date` text input);
 *   • a coloured macro tile (`FoodLogSheet.tsx:554-580`);
 *   • one full-width `Log to day` button, black on white / white on black
 *     (`FoodLogSheet.tsx:588-596`) — never the brand red, and never a second
 *     `Save as meal` button underneath it, which the web page doesn't have.
 *
 * The sheet never writes anything itself: `onSubmit` hands the built item
 * back to the screen, which makes the single `POST /api/meal-logs` call
 * (`lib/nutrition/mealLogActions#logFoodItem`) — same architecture as
 * `SavedFoodLogSheet` / `MealLogSheet`.
 */

import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Apple, ChevronDown, Pencil, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import {
  defaultVariantOf,
  nutritionForQuantity,
  scalingFactor,
  type FoodVariantMath,
} from "@/lib/nutrition/foodMath";
import type { Unit } from "@/lib/nutrition/units";
import {
  buildMealItemPayload,
  type FoodMacros,
  type MealItemPayload,
} from "@/lib/nutrition/mealLogActions";
import {
  mealTagOptions,
  normalizeCustomTag,
  titleCaseMealTag,
} from "@/lib/nutrition/savedMeals";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Food } from "@become/api-client";

export interface FoodLogSheetSubmitOptions {
  item: MealItemPayload;
  tag: string;
  date: string;
  timeMode: "now" | "none";
  pickedTime: null;
}

export interface FoodLogSheetProps {
  visible: boolean;
  /** The food being logged. */
  food: Food | null;
  /** `ADDING TO` starts here — the screen's own time-of-day tag. */
  defaultTag?: string;
  /** Every tag the member can file it under — the web's `availableTags`. */
  availableTags?: { defaults: string[]; userTags: string[] };
  /** The local `YYYY-MM-DD` day this entry is logged against. */
  date: string;
  submitting?: boolean;
  /** The server's own words when the log was refused. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (options: FoodLogSheetSubmitOptions) => void | Promise<void>;
  testID?: string;
}

const TAG_FALLBACK = ["breakfast", "lunch", "dinner", "snack"];

/** Render a quantity for an amount chip: whole numbers bare, else 2 decimals max. */
function formatAmountNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

function zeroMacros(): FoodMacros {
  return { calories: 0, protein: 0, carbs: 0, fats: 0 };
}

interface AmountPreset {
  id: string;
  quantity: number;
  unit: string;
  label: string;
}

/**
 * The web's `buildQuickOptions` primary/half/double chips
 * (`webapp/components/nutrition/QuantityPicker.tsx:207-273`), simplified to
 * skip `alternateServings` (not carried by the flattened variant shape this
 * screen reads) — the middle chip is always half rather than a named
 * alternate, same simplification `EditLogItemSheet`'s own presets make.
 *
 * Crucially, the unit STAYS the variant's own `servingUnit` — a count-native
 * food ("1 each") keeps presets in `each`, never collapsed to the
 * `gramsPerServing` bridge the way a grams-based picker would. Only a
 * mass/volume-native variant whose bridge diverges from its storage size
 * (an OpenFoodFacts per-100g import with a 38 g bag) swaps the PRIMARY
 * quantity for the bridge, exactly like the web.
 */
function buildAmountPresets(variant: FoodVariantMath): AmountPreset[] {
  const unit = variant.servingUnit;
  let primaryQty = variant.servingSize;
  if (
    unit === "g" &&
    variant.gramsPerServing != null &&
    variant.gramsPerServing > 0 &&
    Math.abs(variant.gramsPerServing - variant.servingSize) > 0.001
  ) {
    primaryQty = variant.gramsPerServing;
  } else if (
    unit === "ml" &&
    variant.mlPerServing != null &&
    variant.mlPerServing > 0 &&
    Math.abs(variant.mlPerServing - variant.servingSize) > 0.001
  ) {
    primaryQty = variant.mlPerServing;
  }
  const halfQty = primaryQty / 2;
  const doubleQty = primaryQty * 2;
  return [
    { id: "primary", quantity: primaryQty, unit, label: `${formatAmountNumber(primaryQty)} ${unit}` },
    { id: "half", quantity: halfQty, unit, label: `${formatAmountNumber(halfQty)} ${unit}` },
    { id: "double", quantity: doubleQty, unit, label: `${formatAmountNumber(doubleQty)} ${unit}` },
  ];
}

export function FoodLogSheet({
  visible,
  food,
  defaultTag = "snack",
  availableTags,
  date,
  submitting = false,
  error,
  onClose,
  onSubmit,
  testID = "nutrition-food-log-sheet",
}: FoodLogSheetProps) {
  const { colors } = useThemeTokens();

  const [activeTag, setActiveTag] = useState(defaultTag || "snack");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");
  const [amountMode, setAmountMode] = useState<"quick" | "custom">("quick");
  const [activePresetId, setActivePresetId] = useState<string>("primary");
  const [customQtyText, setCustomQtyText] = useState("");
  const [untimed, setUntimed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // The web log sheet always logs the food's own DEFAULT variant — there is
  // no variant picker here (that was the NP-269 bug this sheet replaces).
  const variant: FoodVariantMath | null = useMemo(
    () => defaultVariantOf(food),
    [food],
  );

  // Reset on open for a new food — mirrors the web's own effect
  // (`FoodLogSheet.tsx:163-177`): `ADDING TO` starts at the CALLER's tag,
  // never whatever was left selected in the last sheet.
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from the sheet's own open/close prop, not a render-derivable value
    setActiveTag(defaultTag || "snack");
    setTagPickerOpen(false);
    setCustomTagInput("");
    setAmountMode("quick");
    setActivePresetId("primary");
    setCustomQtyText("");
    setUntimed(false);
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, food?._id, food?.id]);

  const tagOptions = useMemo(() => {
    const defaults = availableTags?.defaults ?? TAG_FALLBACK;
    const userTags = availableTags?.userTags ?? [];
    return mealTagOptions([...defaults, activeTag], userTags);
  }, [availableTags, activeTag]);

  // Amount presets — the food's own serving, half, double — the native port
  // of the web's `buildQuickOptions` primary/middle/double chips.
  const amountPresets = useMemo(
    () => (variant ? buildAmountPresets(variant) : []),
    [variant],
  );
  const primaryPreset = amountPresets[0] ?? null;

  const resolveSelection = (
    quantity: number,
    unit: string,
  ): { quantity: number; unit: string; multiplier: number; nutrition: FoodMacros } | null => {
    if (!variant) return null;
    try {
      // `servingUnit` here is a plain `string` (the native `FoodVariantMath`);
      // the core math wants the narrower `ServingUnit` union. `as never`
      // matches `EditLogItemSheet`'s own cast for the identical mismatch.
      const multiplier = scalingFactor(variant as never, quantity, unit as Unit);
      if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
      return {
        quantity,
        unit,
        multiplier,
        nutrition: nutritionForQuantity(variant as never, quantity, unit as Unit),
      };
    } catch {
      return null;
    }
  };

  const [selection, setSelection] = useState<{
    quantity: number;
    unit: string;
    multiplier: number;
    nutrition: FoodMacros;
  } | null>(null);

  // (Re-)seed the selection from the primary preset whenever the sheet opens
  // for a (possibly new) food — the web's default chip, always selected.
  useEffect(() => {
    if (!visible || !primaryPreset) return;
    const next = resolveSelection(primaryPreset.quantity, primaryPreset.unit);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from the sheet's own open/close prop + a new food, not a render-derivable value
    setSelection(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, primaryPreset?.unit, primaryPreset?.quantity, variant]);

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
    setCustomQtyText(formatAmountNumber(selection?.quantity ?? primaryPreset?.quantity ?? 0));
  };

  const handleCustomQtyChange = (text: string) => {
    setCustomQtyText(text);
    if (!primaryPreset) return;
    const parsed = parseFloat(text);
    if (Number.isFinite(parsed) && parsed > 0) {
      const next = resolveSelection(parsed, primaryPreset.unit);
      if (next) setSelection(next);
    }
  };

  const handleSelectTag = (tag: string) => {
    setActiveTag(tag);
    setTagPickerOpen(false);
  };

  const handleAddCustomTag = () => {
    const norm = normalizeCustomTag(customTagInput);
    if (!norm) return;
    setActiveTag(norm);
    setCustomTagInput("");
    setTagPickerOpen(false);
  };

  const handleClose = () => {
    onClose();
  };

  const previewNutrition = selection?.nutrition ?? zeroMacros();
  const tagLabel = titleCaseMealTag(activeTag || "snack");
  const servingCaption = primaryPreset?.label ?? "";

  const handleSubmit = () => {
    if (!food || !variant || !selection || submitting) return;
    if (!Number.isFinite(selection.quantity) || selection.quantity <= 0) {
      setLocalError("Pick a valid amount.");
      return;
    }
    setLocalError(null);
    const item = buildMealItemPayload({
      food,
      variant,
      quantity: selection.quantity,
      unit: selection.unit,
    });
    void onSubmit({
      item,
      tag: activeTag,
      date,
      timeMode: untimed ? "none" : "now",
      pickedTime: null,
    });
  };

  const shownError = localError ?? error ?? null;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      testID={testID}
      accessibilityLabel={food ? `Log ${food.name}` : "Log food"}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          {/* Header — thumbnail, name, serving label, close X
              (`FoodLogSheet.tsx:332-359`). No big repeated sheet title. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.muted,
                overflow: "hidden",
              }}
            >
              <Apple size={20} color={colors["muted-foreground"]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                testID={`${testID}-name`}
                className="text-foreground text-base font-bold"
                numberOfLines={1}
              >
                {food?.name ?? "Food"}
              </Text>
              <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                {food?.brand ? `${food.brand} · ${servingCaption}` : servingCaption}
              </Text>
            </View>
            <Pressable
              testID={`${testID}-close`}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={handleClose}
              disabled={submitting}
              hitSlop={8}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                opacity: submitting ? 0.4 : 1,
              }}
            >
              <X size={18} color={colors["muted-foreground"]} />
            </Pressable>
          </View>

          {/* `ADDING TO <Tag>` — defaults to the caller's tag, offers every
              tag the member has (`FoodLogSheet.tsx:362-428`). */}
          <View>
            <Pressable
              testID={`${testID}-tag-toggle`}
              accessibilityRole="button"
              accessibilityLabel={`Adding to ${tagLabel}, tap to change`}
              onPress={() => setTagPickerOpen((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.muted,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text
                testID={`${testID}-tag-current`}
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 0.5,
                  color: colors["muted-foreground"],
                }}
              >
                ADDING TO {tagLabel.toUpperCase()}
              </Text>
              <ChevronDown
                size={14}
                color={colors["muted-foreground"]}
                style={{
                  marginLeft: "auto",
                  transform: [{ rotate: tagPickerOpen ? "180deg" : "0deg" }],
                }}
              />
            </Pressable>
            {tagPickerOpen ? (
              <View style={{ marginTop: 8, gap: 8 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {tagOptions.map((tag) => {
                    const active = tag === activeTag;
                    return (
                      <Pressable
                        key={tag}
                        testID={`${testID}-tag-${tag}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Add to ${titleCaseMealTag(tag)}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => handleSelectTag(tag)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          backgroundColor: active ? colors.foreground : colors.card,
                          borderWidth: 1,
                          borderColor: active ? colors.foreground : colors.border,
                        }}
                      >
                        <Text
                          className={`text-xs font-medium ${active ? "text-background" : "text-foreground"}`}
                        >
                          {titleCaseMealTag(tag)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      testID={`${testID}-custom-tag`}
                      placeholder="e.g. brunch"
                      autoCapitalize="none"
                      value={customTagInput}
                      onChangeText={setCustomTagInput}
                      onSubmitEditing={handleAddCustomTag}
                    />
                  </View>
                  <Button
                    testID={`${testID}-custom-tag-add`}
                    variant="secondary"
                    disabled={!customTagInput.trim()}
                    onPress={handleAddCustomTag}
                  >
                    Add
                  </Button>
                </View>
              </View>
            ) : null}
          </View>

          {/* AMOUNT chips — the food's own serving / half / double + Custom
              (`FoodLogSheet.tsx:430-436` → web `QuantityPicker`'s
              `buildQuickOptions`). Never a variant picker. */}
          <View style={{ gap: 6 }}>
            <Text className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Amount
            </Text>
            {amountMode === "quick" ? (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {amountPresets.map((preset) => {
                  const isSelected = activePresetId === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      testID={`${testID}-amount-preset-${preset.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Amount ${preset.label}`}
                      accessibilityState={{ selected: isSelected }}
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
                  testID={`${testID}-amount-custom`}
                  accessibilityRole="button"
                  accessibilityLabel="Custom amount"
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
                    {primaryPreset?.unit ?? "g"}
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

          {/* `Now` / `No time` — no raw date field (the dropped `Date`
              text input). */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              testID={`${testID}-time-now`}
              accessibilityRole="button"
              accessibilityLabel="Log now"
              accessibilityState={{ selected: !untimed }}
              onPress={() => setUntimed(false)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 16,
                backgroundColor: !untimed ? colors.foreground : colors.muted,
              }}
            >
              <Text
                className={`text-[11px] font-semibold ${!untimed ? "text-background" : "text-foreground"}`}
              >
                Now
              </Text>
            </Pressable>
            <Pressable
              testID={`${testID}-time-none`}
              accessibilityRole="button"
              accessibilityLabel="No time — filed by tag order"
              accessibilityState={{ selected: untimed }}
              onPress={() => setUntimed(true)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 16,
                backgroundColor: untimed ? colors.foreground : colors.muted,
              }}
            >
              <Text
                className={`text-[11px] font-semibold ${untimed ? "text-background" : "text-foreground"}`}
              >
                No time
              </Text>
            </Pressable>
          </View>

          {/* Coloured macro tile (`FoodLogSheet.tsx:554-580`). */}
          <View
            testID={`${testID}-macros`}
            style={{
              flexDirection: "row",
              borderRadius: 10,
              backgroundColor: colors.muted,
              padding: 10,
            }}
          >
            {[
              { label: "Cal", value: String(Math.round(previewNutrition.calories)), color: colors.foreground },
              { label: "Protein", value: `${Math.round(previewNutrition.protein * 10) / 10}g`, color: colors.info },
              { label: "Carbs", value: `${Math.round(previewNutrition.carbs * 10) / 10}g`, color: colors.success },
              { label: "Fats", value: `${Math.round(previewNutrition.fats * 10) / 10}g`, color: colors.accent },
            ].map((m) => (
              <View key={m.label} style={{ flex: 1, alignItems: "center" }}>
                <Text
                  testID={`${testID}-macro-${m.label.toLowerCase()}`}
                  style={{ color: m.color }}
                  className="text-base font-bold"
                >
                  {m.value}
                </Text>
                <Text className="text-muted-foreground text-[10px] uppercase">{m.label}</Text>
              </View>
            ))}
          </View>

          {shownError ? (
            <Text
              testID={`${testID}-error`}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className="text-destructive text-xs"
            >
              {shownError}
            </Text>
          ) : null}

          {/* One full-width `Log to day` button — black on white / white on
              black, never the brand red, and never a second `Save as meal`
              button underneath it (`FoodLogSheet.tsx:588-596`). */}
          <Button
            testID={`${testID}-submit`}
            variant="inverted"
            loading={submitting}
            disabled={submitting || !selection || selection.quantity <= 0}
            onPress={handleSubmit}
          >
            {submitting ? "Logging…" : "Log to day"}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

export default FoodLogSheet;
