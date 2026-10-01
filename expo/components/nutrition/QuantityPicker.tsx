import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  TextInput,
} from "react-native";
import { ChevronDown, Minus, Plus, ChevronLeft, ChevronRight, Check } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  buildServingChoiceGroups,
  servingChoiceDisplayLabel,
  type ServingChoice,
  type ServingOptionVariant,
} from "@/lib/nutrition/servingOptions";
import {
  servingQuantityStep,
} from "@/lib/nutrition/servingQuantityStep";
import type { ServingUnit } from "@become/core/nutrition/types";
import { formatQuantity } from "@/lib/nutrition/units";
import { localDateKey } from "@/lib/time/localDay";
import {
  DEFAULT_TAGS,
  buildMealItemPayload,
  logFoodEntry,
  previewNutritionForChoice,
  type MealItemPayload,
  type TimeMode,
  type VariantLike,
} from "@/lib/nutrition/mealLogActions";
import type { Food, MealLog } from "@become/api-client";
import { defaultVariantOf } from "@/lib/nutrition/foodMath";

export interface QuantityPickerProps {
  food: Food;
  initialTag?: string;
  initialDate?: string;
  initialVariantIdx?: number;
  initialQuantity?: number;
  initialUnit?: string;
  existingLogs?: MealLog[];
  availableTags?: { defaults?: string[]; userTags?: string[] } | null;
  token?: string | null;
  onSuccess?: () => void;
  onSubmit?: (itemPayload: MealItemPayload) => Promise<void> | void;
  testID?: string;
}

function optionLabel(c: ServingChoice): string {
  if (c.group !== "servings") return formatQuantity(c.quantity, c.unit);
  return servingChoiceDisplayLabel(c);
}

function formatDateDisplay(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const date = new Date(y, m, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shiftDate(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const date = new Date(y, m, d + deltaDays);
  return localDateKey(date);
}

export function QuantityPicker({
  food,
  initialTag,
  initialDate,
  initialVariantIdx = 0,
  initialQuantity,
  initialUnit,
  existingLogs = [],
  availableTags,
  token,
  onSuccess,
  onSubmit,
  testID = "quantity-picker",
}: QuantityPickerProps) {
  const { colors } = useThemeTokens();
  const todayStr = useMemo(() => localDateKey(new Date()), []);

  // ── Variants ───────────────────────────────────────────────────────────────
  const variants = useMemo<VariantLike[]>(() => {
    if (Array.isArray(food.variants) && food.variants.length > 0) {
      return food.variants.map((v) => ({
        _id: v._id,
        id: v._id,
        name: v.name,
        isDefault: v.isDefault,
        servingSize: v.servingSize,
        servingUnit: v.servingUnit,
        nutrition: v.nutrition,
        gramsPerServing: v.gramsPerServing,
        mlPerServing: v.mlPerServing,
        alternateServings: v.alternateServings,
        displayLabel: v.displayLabel,
      }));
    }
    const def = defaultVariantOf(food);
    return [
      {
        name: def?.name ?? "Default",
        isDefault: true,
        servingSize: def?.servingSize ?? food.servingSize ?? 100,
        servingUnit: def?.servingUnit ?? food.servingUnit ?? "g",
        nutrition: def?.nutrition ?? food.nutrition ?? {
          calories: 0,
          protein: 0,
          carbs: 0,
          fats: 0,
        },
        gramsPerServing: def?.gramsPerServing ?? food.gramsPerServing,
        mlPerServing: def?.mlPerServing ?? food.mlPerServing,
        alternateServings: food.alternateServings,
        displayLabel: food.displayLabel as string | undefined,
      },
    ];
  }, [food]);

  const [selectedVariantIdx, setSelectedVariantIdx] = useState(() => {
    if (initialVariantIdx >= 0 && initialVariantIdx < variants.length) {
      return initialVariantIdx;
    }
    const idx = variants.findIndex((v) => v.isDefault);
    return idx >= 0 ? idx : 0;
  });

  const activeVariant = variants[selectedVariantIdx] ?? variants[0]!;

  // ── Serving Choice Groups ──────────────────────────────────────────────────
  const choiceGroups = useMemo(() => {
    const optVariant: ServingOptionVariant = {
      servingSize: activeVariant.servingSize,
      servingUnit: activeVariant.servingUnit as ServingUnit,
      displayLabel: activeVariant.displayLabel,
      alternateServings: activeVariant.alternateServings?.map((a) => ({
        label: a.label,
        multiplier: a.multiplier,
      })),
      gramsPerServing: activeVariant.gramsPerServing,
      mlPerServing: activeVariant.mlPerServing,
    };
    return buildServingChoiceGroups(optVariant);
  }, [activeVariant]);

  const defaultChoice = useMemo(
    () => choiceGroups.servings[0] ?? choiceGroups.all[0] ?? null,
    [choiceGroups],
  );

  const [selectedChoiceId, setSelectedChoiceId] = useState<string>(
    () => defaultChoice?.id ?? "",
  );
  const [unit, setUnit] = useState<string>(
    () => initialUnit ?? defaultChoice?.unit ?? activeVariant.servingUnit,
  );
  const [quantity, setQuantity] = useState<number>(
    () => initialQuantity ?? defaultChoice?.quantity ?? activeVariant.servingSize,
  );
  const [quantityText, setQuantityText] = useState<string>(() =>
    String(initialQuantity ?? defaultChoice?.quantity ?? activeVariant.servingSize),
  );
  const [servingLabel, setServingLabel] = useState<string>(() =>
    defaultChoice ? optionLabel(defaultChoice) : activeVariant.servingUnit,
  );
  const [choiceSheetOpen, setChoiceSheetOpen] = useState(false);

  const selectedChoice = useMemo(() => {
    return choiceGroups.all.find((c) => c.id === selectedChoiceId) ?? defaultChoice;
  }, [choiceGroups, selectedChoiceId, defaultChoice]);

  // When changing variant, update choice and unit
  const handleSelectVariant = useCallback(
    (idx: number) => {
      setSelectedVariantIdx(idx);
      const v = variants[idx];
      if (!v) return;
      const optV: ServingOptionVariant = {
        servingSize: v.servingSize,
        servingUnit: v.servingUnit as ServingUnit,
        displayLabel: v.displayLabel,
        alternateServings: v.alternateServings?.map((a) => ({
          label: a.label,
          multiplier: a.multiplier,
        })),
        gramsPerServing: v.gramsPerServing,
        mlPerServing: v.mlPerServing,
      };
      const grps = buildServingChoiceGroups(optV);
      const defC = grps.servings[0] ?? grps.all[0] ?? null;
      if (defC) {
        setSelectedChoiceId(defC.id);
        setUnit(defC.unit);
        setQuantity(defC.quantity);
        setQuantityText(String(defC.quantity));
        setServingLabel(optionLabel(defC));
      } else {
        setSelectedChoiceId("");
        setUnit(v.servingUnit);
        setQuantity(v.servingSize);
        setQuantityText(String(v.servingSize));
        setServingLabel(v.servingUnit);
      }
    },
    [variants],
  );

  const handlePickChoice = useCallback((c: ServingChoice) => {
    setSelectedChoiceId(c.id);
    setUnit(c.unit);
    setQuantity(c.quantity);
    setQuantityText(String(c.quantity));
    setServingLabel(optionLabel(c));
    setChoiceSheetOpen(false);
  }, []);

  // ── Stepper Math ───────────────────────────────────────────────────────────
  const step = useMemo(() => servingQuantityStep(unit), [unit]);

  const handleStep = useCallback(
    (delta: number) => {
      const next = Math.max(step, Math.round((quantity + delta) * 100) / 100);
      setQuantity(next);
      setQuantityText(String(next));
    },
    [quantity, step],
  );

  const handleQuantityTextChange = useCallback((text: string) => {
    setQuantityText(text);
    const parsed = parseFloat(text);
    if (!isNaN(parsed) && parsed > 0) {
      setQuantity(parsed);
    }
  }, []);

  // ── Live Macro Preview ─────────────────────────────────────────────────────
  const liveNutrition = useMemo(() => {
    return previewNutritionForChoice(activeVariant, quantity, unit, selectedChoice);
  }, [activeVariant, quantity, unit, selectedChoice]);

  // ── Tag, Date, Time State ──────────────────────────────────────────────────
  const tagList = useMemo(() => {
    const list = [
      ...(availableTags?.defaults ?? DEFAULT_TAGS),
      ...(availableTags?.userTags ?? []),
    ];
    return Array.from(new Set(list.map((t) => t.toLowerCase())));
  }, [availableTags]);

  const [selectedTag, setSelectedTag] = useState<string>(() => {
    const norm = initialTag?.trim().toLowerCase();
    return norm && tagList.includes(norm) ? norm : "snack";
  });

  const [selectedDate, setSelectedDate] = useState<string>(
    () => initialDate || todayStr,
  );

  const [timeMode, setTimeMode] = useState<TimeMode>("none");
  const [customTime, setCustomTime] = useState<string>("12:00");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Submit / Log Action ────────────────────────────────────────────────────
  const handleLog = useCallback(async () => {
    if (quantity <= 0 || !Number.isFinite(quantity)) {
      setErrorMessage("Please enter a valid positive quantity");
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      if (onSubmit) {
        const payload = buildMealItemPayload({
          food,
          variant: activeVariant,
          quantity,
          unit,
          servingLabel,
          choice: selectedChoice,
        });
        await onSubmit(payload);
      } else {
        await logFoodEntry({
          food,
          variant: activeVariant,
          quantity,
          unit,
          servingLabel,
          choice: selectedChoice,
          tag: selectedTag,
          date: selectedDate,
          timeMode,
          customTime: timeMode === "custom" ? customTime : undefined,
          existingLogs,
          token,
        });
      }
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to log food";
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  }, [
    activeVariant,
    customTime,
    existingLogs,
    food,
    onSubmit,
    onSuccess,
    quantity,
    selectedChoice,
    selectedDate,
    selectedTag,
    servingLabel,
    timeMode,
    token,
    unit,
  ]);

  return (
    <View testID={testID} style={{ gap: 16 }}>
      {/* ── Variant Chips (if multiple) ── */}
      {variants.length > 1 ? (
        <View style={{ gap: 6 }}>
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Preparation / Variant
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {variants.map((v, idx) => {
              const active = idx === selectedVariantIdx;
              return (
                <Pressable
                  key={v._id ?? v.name ?? idx}
                  testID={`quantity-picker-variant-${v.name}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => handleSelectVariant(idx)}
                  className={`px-3 py-2 rounded-xl border ${
                    active
                      ? "bg-primary border-primary"
                      : "bg-card border-border"
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      active ? "text-primary-foreground font-semibold" : "text-foreground"
                    }`}
                  >
                    {v.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* ── Serving Size & Quantity Stepper ── */}
      <View style={{ gap: 6 }}>
        <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Serving & Quantity
        </Text>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          {/* Serving Size Selector */}
          <Pressable
            testID="quantity-picker-serving-button"
            accessibilityRole="button"
            accessibilityLabel={`Serving size: ${servingLabel}`}
            onPress={() => setChoiceSheetOpen(true)}
            className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 flex-row items-center justify-between"
          >
            <Text className="text-foreground text-sm font-medium truncate" numberOfLines={1}>
              {servingLabel}
            </Text>
            <ChevronDown size={18} color={colors["muted-foreground"]} />
          </Pressable>

          {/* Stepper with - / Input / + */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 4,
            }}
          >
            <Pressable
              testID="quantity-picker-stepper-decrement"
              accessibilityLabel="Decrease quantity"
              accessibilityRole="button"
              onPress={() => handleStep(-step)}
              disabled={quantity <= step}
              style={{
                width: 36,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: quantity <= step ? 0.3 : 1,
              }}
            >
              <Minus size={16} color={colors.foreground} />
            </Pressable>

            <TextInput
              testID="quantity-picker-quantity-input"
              value={quantityText}
              onChangeText={handleQuantityTextChange}
              keyboardType="decimal-pad"
              style={{
                minWidth: 50,
                textAlign: "center",
                fontSize: 15,
                fontWeight: "600",
                color: colors.foreground,
                paddingVertical: 4,
              }}
            />

            <Pressable
              testID="quantity-picker-stepper-increment"
              accessibilityLabel="Increase quantity"
              accessibilityRole="button"
              onPress={() => handleStep(step)}
              style={{
                width: 36,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={16} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Live Macro Preview ── */}
      <View
        testID="quantity-picker-preview"
        className="bg-card border border-border rounded-2xl p-4"
        style={{ gap: 8 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Nutrition Preview
          </Text>
          <Text
            testID="quantity-picker-preview-kcal"
            className="text-foreground text-xl font-bold"
          >
            {Math.round(liveNutrition.calories)} kcal
          </Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ alignItems: "center" }}>
            <Text className="text-muted-foreground text-xs font-medium">Protein</Text>
            <Text
              testID="quantity-picker-preview-protein"
              className="text-foreground text-sm font-semibold mt-0.5"
            >
              {Math.round(liveNutrition.protein * 10) / 10}g
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text className="text-muted-foreground text-xs font-medium">Carbs</Text>
            <Text
              testID="quantity-picker-preview-carbs"
              className="text-foreground text-sm font-semibold mt-0.5"
            >
              {Math.round(liveNutrition.carbs * 10) / 10}g
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text className="text-muted-foreground text-xs font-medium">Fat</Text>
            <Text
              testID="quantity-picker-preview-fats"
              className="text-foreground text-sm font-semibold mt-0.5"
            >
              {Math.round(liveNutrition.fats * 10) / 10}g
            </Text>
          </View>
        </View>
      </View>

      {/* ── Tag Selection ── */}
      <View style={{ gap: 6 }}>
        <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Meal Tag
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {tagList.map((tag) => {
            const active = tag === selectedTag;
            return (
              <Pressable
                key={tag}
                testID={`quantity-picker-tag-${tag}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setSelectedTag(tag)}
                className={`px-3 py-1.5 rounded-full border ${
                  active
                    ? "bg-primary border-primary"
                    : "bg-card border-border"
                }`}
              >
                <Text
                  className={`text-xs font-semibold uppercase ${
                    active ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Date and Time Selection ── */}
      <View style={{ gap: 10 }}>
        {/* Date Row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Date
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              testID="quantity-picker-prev-date"
              accessibilityLabel="Previous day"
              onPress={() => setSelectedDate((d) => shiftDate(d, -1))}
              hitSlop={8}
            >
              <ChevronLeft size={18} color={colors.foreground} />
            </Pressable>
            <Text
              testID="quantity-picker-date"
              className="text-foreground text-sm font-semibold tabular-nums"
            >
              {selectedDate === todayStr ? "Today" : formatDateDisplay(selectedDate)}
            </Text>
            <Pressable
              testID="quantity-picker-next-date"
              accessibilityLabel="Next day"
              onPress={() => setSelectedDate((d) => shiftDate(d, 1))}
              hitSlop={8}
            >
              <ChevronRight size={18} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        {/* Time Mode Chips */}
        <View style={{ gap: 6 }}>
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Time
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              testID="quantity-picker-time-none"
              accessibilityRole="radio"
              accessibilityState={{ selected: timeMode === "none" }}
              onPress={() => setTimeMode("none")}
              className={`px-3 py-1.5 rounded-xl border flex-1 items-center ${
                timeMode === "none"
                  ? "bg-primary border-primary"
                  : "bg-card border-border"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  timeMode === "none" ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                No time
              </Text>
            </Pressable>

            <Pressable
              testID="quantity-picker-time-now"
              accessibilityRole="radio"
              accessibilityState={{ selected: timeMode === "now" }}
              onPress={() => setTimeMode("now")}
              className={`px-3 py-1.5 rounded-xl border flex-1 items-center ${
                timeMode === "now"
                  ? "bg-primary border-primary"
                  : "bg-card border-border"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  timeMode === "now" ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                Now
              </Text>
            </Pressable>

            <Pressable
              testID="quantity-picker-time-custom"
              accessibilityRole="radio"
              accessibilityState={{ selected: timeMode === "custom" }}
              onPress={() => setTimeMode("custom")}
              className={`px-3 py-1.5 rounded-xl border flex-1 items-center ${
                timeMode === "custom"
                  ? "bg-primary border-primary"
                  : "bg-card border-border"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  timeMode === "custom" ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                Picked time
              </Text>
            </Pressable>
          </View>

          {/* Custom Time Input */}
          {timeMode === "custom" ? (
            <View style={{ marginTop: 4 }}>
              <Input
                testID="quantity-picker-custom-time-input"
                label="Custom Time (HH:MM)"
                placeholder="12:00"
                value={customTime}
                onChangeText={setCustomTime}
              />
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Error Message ── */}
      {errorMessage ? (
        <Text testID="quantity-picker-error" className="text-destructive text-sm font-medium">
          {errorMessage}
        </Text>
      ) : null}

      {/* ── Submit Button ── */}
      <Button
        testID="quantity-picker-submit"
        onPress={handleLog}
        disabled={saving || quantity <= 0}
        loading={saving}
      >
        Log Food
      </Button>

      {/* ── Serving Choice BottomSheet ── */}
      <BottomSheet
        visible={choiceSheetOpen}
        onClose={() => setChoiceSheetOpen(false)}
        title="Select Serving Size"
        testID="quantity-picker-serving-sheet"
      >
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 12 }}>
          {choiceGroups.servings.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                Servings
              </Text>
              {choiceGroups.servings.map((c) => (
                <Pressable
                  key={c.id}
                  testID={`quantity-picker-choice-${c.id}`}
                  onPress={() => handlePickChoice(c)}
                  className={`p-3 rounded-xl border flex-row items-center justify-between ${
                    c.id === selectedChoiceId
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <Text className="text-foreground text-sm font-medium">
                    {optionLabel(c)}
                  </Text>
                  {c.id === selectedChoiceId ? (
                    <Check size={16} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {choiceGroups.weight.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                Weight Units
              </Text>
              {choiceGroups.weight.map((c) => (
                <Pressable
                  key={c.id}
                  testID={`quantity-picker-choice-${c.id}`}
                  onPress={() => handlePickChoice(c)}
                  className={`p-3 rounded-xl border flex-row items-center justify-between ${
                    c.id === selectedChoiceId
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <Text className="text-foreground text-sm font-medium">
                    {optionLabel(c)}
                  </Text>
                  {c.id === selectedChoiceId ? (
                    <Check size={16} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {choiceGroups.volume.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                Volume Units
              </Text>
              {choiceGroups.volume.map((c) => (
                <Pressable
                  key={c.id}
                  testID={`quantity-picker-choice-${c.id}`}
                  onPress={() => handlePickChoice(c)}
                  className={`p-3 rounded-xl border flex-row items-center justify-between ${
                    c.id === selectedChoiceId
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <Text className="text-foreground text-sm font-medium">
                    {optionLabel(c)}
                  </Text>
                  {c.id === selectedChoiceId ? (
                    <Check size={16} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}
