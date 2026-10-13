/**
 * ─── Log a saved meal, natively (NP-094) · plan mode (NP-232) · NP-268 ──────
 *
 * The web's `MealApplySheet` (`webapp/components/meals/MealApplySheet.tsx`)
 * as a sheet: a thumbnail, a tag picker (`ADDING TO`, defaulting to the
 * CALLER's tag — the meal's own `defaultTag` when the caller passes it on,
 * `MealApplySheet.tsx:94,126-143`), fractional portion pills + Custom
 * (`PORTION_PILLS`, `MealApplySheet.tsx:55-65`), a Now/No-time choice
 * (`MealApplySheet.tsx:494-511`), a coloured macro preview
 * (`MealApplySheet.tsx:600-625`) and `Apply to <Tag>` / `Plan <Tag>`
 * (`MealApplySheet.tsx:634-654`) — black on white in light mode, white on
 * black in dark, never the brand red.
 *
 * Plan mode (`mode="plan"`, `MealApplySheet.tsx:36-39`) posts
 * `POST /api/meal-plans { plannedDate, tag, mealId }` through `createMealPlan`
 * (`MealApplySheet.tsx:213-235`), hides the time choice (a plan carries the
 * page-supplied plannedDate, never a time), and the CTA reads
 * `Plan <Tag>` / `Planning...`.
 *
 * The sheet never writes anything itself: `onSubmit` hands the choice back to
 * the screen, which makes the single `POST /api/meals/{id}/log` call. See
 * `lib/nutrition/basketLog.ts#logSavedMeal`. In plan mode the screen instead
 * posts through `createMealPlan` with the meal's id.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { ChefHat } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { AuthedImage } from "@/components/media/AuthedImage";
import {
  mealTagOptions,
  normalizeCustomTag,
  titleCaseMealTag,
} from "@/lib/nutrition/savedMeals";
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
  /** The tag the sitting is filed under — "ADDING TO" starts here. */
  currentTag?: string;
  /** Tag chips offered beyond the fallback set — the web's `availableTags`. */
  availableTags?: { defaults: string[]; userTags: string[] };
  submitting?: boolean;
  /** The server's own words when the log was refused. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (options: MealLogSubmitOptions) => void | Promise<void>;
  /**
   * `'log'` (default) files the meal now through `POST /api/meals/{id}/log`;
   * `'plan'` schedules it for `plannedDate` through
   * `POST /api/meal-plans { plannedDate, tag, mealId }` (the web's
   * `MealApplySheet` plan mode). Plan mode hides the time choice and the
   * CTA reads `Plan <Tag>` / `Planning...`.
   */
  mode?: MealLogSheetMode;
  /** Local `YYYY-MM-DD` key the plan is filed under (plan mode only). */
  plannedDate?: string;
}

const TAG_FALLBACK = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "pre-workout",
  "post-workout",
];

/**
 * The web's `PORTION_PILLS` (`MealApplySheet.tsx:55-65`): fractions first,
 * then whole/half steps, then Custom (rendered separately, below).
 */
const PORTION_PILLS: { label: string; value: number }[] = [
  { label: "1/4", value: 0.25 },
  { label: "1/3", value: 1 / 3 },
  { label: "1/2", value: 0.5 },
  { label: "2/3", value: 2 / 3 },
  { label: "3/4", value: 0.75 },
  { label: "1 portion", value: 1 },
  { label: "1.5", value: 1.5 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
];
/** "1 portion" — the web's default selection (`selectedPillIdx` starts at 5). */
const DEFAULT_PILL_INDEX = 5;

/** A stable testID suffix for a pill — 1/3 and 2/3 round to 3 decimals. */
function portionTestId(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function MealLogSheet({
  visible,
  meal,
  currentTag = "snack",
  availableTags,
  submitting = false,
  error,
  onClose,
  onSubmit,
  mode = "log",
  plannedDate,
}: MealLogSheetProps) {
  const { colors, tint } = useThemeTokens();
  const isPlanMode = mode === "plan";

  const [activeTag, setActiveTag] = useState(currentTag || "snack");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");
  const [selectedPillIdx, setSelectedPillIdx] = useState(DEFAULT_PILL_INDEX);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("1");
  const [untimed, setUntimed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset when opening for a new meal — the web's own effect
  // (`MealApplySheet.tsx:126-143`): ADDING TO starts at the CALLER's tag
  // (the meal's own `defaultTag` when the caller passes it on), never
  // whatever was left selected in the last sheet.
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!visible || wasVisible) return;
    setActiveTag(currentTag || "snack");
    setTagPickerOpen(false);
    setCustomTagInput("");
    setSelectedPillIdx(DEFAULT_PILL_INDEX);
    setCustomMode(false);
    setCustomValue("1");
    setUntimed(false);
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const tagOptions = useMemo(() => {
    const defaults = availableTags?.defaults ?? TAG_FALLBACK;
    const userTags = availableTags?.userTags ?? [];
    return mealTagOptions([...defaults, activeTag], userTags);
  }, [availableTags, activeTag]);

  const selectedValue = useMemo<number>(() => {
    if (customMode) {
      const n = Number(customValue);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return PORTION_PILLS[selectedPillIdx]?.value ?? 1;
  }, [customMode, customValue, selectedPillIdx]);

  const itemCount = meal?.items?.length ?? 0;

  const previewNutrition = useMemo(() => {
    const n = meal?.totalNutrition;
    if (!n) return { calories: 0, protein: 0, carbs: 0, fats: 0 };
    return {
      calories: Math.round((n.calories ?? 0) * selectedValue),
      protein: Math.round((n.protein ?? 0) * selectedValue * 10) / 10,
      carbs: Math.round((n.carbs ?? 0) * selectedValue * 10) / 10,
      fats: Math.round((n.fats ?? 0) * selectedValue * 10) / 10,
    };
  }, [meal, selectedValue]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSelectTag = useCallback((tag: string) => {
    setActiveTag(tag);
    setTagPickerOpen(false);
  }, []);

  const handleAddCustomTag = useCallback(() => {
    const norm = normalizeCustomTag(customTagInput);
    if (!norm) return;
    setActiveTag(norm);
    setCustomTagInput("");
    setTagPickerOpen(false);
  }, [customTagInput]);

  const handleSubmit = useCallback(() => {
    if (!meal || submitting) return;
    if (!Number.isFinite(selectedValue) || selectedValue <= 0) {
      setLocalError("Pick a valid portion.");
      return;
    }
    setLocalError(null);
    void onSubmit({
      portion: selectedValue,
      tag: activeTag,
      // The web's plan branch drops the clock (`MealApplySheet.tsx:213-235`):
      // a plan carries the page-supplied plannedDate, never a time.
      untimed: isPlanMode ? false : untimed,
    });
  }, [meal, submitting, selectedValue, onSubmit, activeTag, isPlanMode, untimed]);

  const shownError = localError ?? error ?? null;
  const tagLabel = titleCaseMealTag(activeTag || "snack");

  const submitLabel = isPlanMode
    ? submitting
      ? "Planning..."
      : `Plan ${tagLabel}`
    : submitting
      ? "Logging..."
      : `Apply to ${tagLabel}`;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={meal ? (isPlanMode ? `Plan ${meal.name}` : `Log ${meal.name}`) : isPlanMode ? "Plan meal" : "Log meal"}
      testID="meal-log-sheet"
      accessibilityLabel={
        meal ? (isPlanMode ? `Plan ${meal.name}` : `Log ${meal.name}`) : isPlanMode ? "Plan meal" : "Log meal"
      }
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          {/* Thumbnail + name — the web's header row (`MealApplySheet.tsx:290-319`) */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {meal?.imageUrl ? (
              <AuthedImage
                source={meal.imageUrl}
                accessibilityLabel={`Photo of ${meal.name}`}
                testID="meal-log-sheet-photo"
                containerStyle={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden" }}
                style={{ width: 48, height: 48 }}
              />
            ) : (
              <View
                testID="meal-log-sheet-photo-fallback"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.muted,
                }}
              >
                <ChefHat size={22} color={colors["muted-foreground"]} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text
                testID="meal-log-sheet-summary"
                className="text-foreground text-sm font-bold"
                numberOfLines={1}
              >
                {meal?.name ?? "Meal"}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                {itemCount} item{itemCount === 1 ? "" : "s"}
                {isPlanMode && plannedDate ? ` · Planned for ${plannedDate}` : ""}
              </Text>
            </View>
          </View>

          {/* Tag picker — "ADDING TO <Tag>" (`MealApplySheet.tsx:322-388`) */}
          <View>
            <Pressable
              testID="meal-log-sheet-tag-toggle"
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
              <Text className="text-muted-foreground text-[10px] uppercase tracking-wide">
                Adding to
              </Text>
              <Text className="text-foreground text-sm font-semibold">{tagLabel}</Text>
            </Pressable>
            {tagPickerOpen ? (
              <View style={{ marginTop: 8, gap: 8 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {tagOptions.map((tag) => {
                    const active = tag === activeTag;
                    return (
                      <Pressable
                        key={tag}
                        testID={`meal-log-sheet-tag-${tag}`}
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
                      testID="meal-log-sheet-custom-tag"
                      placeholder="e.g. brunch"
                      autoCapitalize="none"
                      value={customTagInput}
                      onChangeText={setCustomTagInput}
                      onSubmitEditing={handleAddCustomTag}
                    />
                  </View>
                  <Button
                    testID="meal-log-sheet-custom-tag-add"
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

          {/* Portion picker — fractions + whole/half steps + Custom
              (`MealApplySheet.tsx:390-450`) */}
          <View>
            <Text className="text-muted-foreground text-[10px] uppercase tracking-wide mb-1.5">
              Portion
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {PORTION_PILLS.map((p, idx) => {
                const active = !customMode && selectedPillIdx === idx;
                return (
                  <Pressable
                    key={p.label}
                    testID={`meal-log-sheet-portion-${portionTestId(p.value)}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Portion ${p.label}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      setCustomMode(false);
                      setSelectedPillIdx(idx);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 16,
                      backgroundColor: active ? colors.foreground : colors.muted,
                    }}
                  >
                    <Text
                      className={`text-xs font-semibold ${active ? "text-background" : "text-foreground"}`}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                testID="meal-log-sheet-portion-custom"
                accessibilityRole="button"
                accessibilityLabel="Custom portion"
                accessibilityState={{ selected: customMode }}
                onPress={() => setCustomMode(true)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 16,
                  backgroundColor: customMode ? colors.foreground : colors.muted,
                }}
              >
                <Text
                  className={`text-xs font-semibold ${customMode ? "text-background" : "text-foreground"}`}
                >
                  Custom
                </Text>
              </Pressable>
            </View>
            {customMode ? (
              <View style={{ marginTop: 8 }}>
                <Input
                  testID="meal-log-sheet-portion-custom-input"
                  label="Portions"
                  placeholder="1"
                  keyboardType="decimal-pad"
                  value={customValue}
                  onChangeText={setCustomValue}
                />
              </View>
            ) : null}
          </View>

          {/* Now / No time — log mode only; a plan carries the page-supplied
              plannedDate (`MealApplySheet.tsx:452-512`). */}
          {!isPlanMode ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                testID="meal-log-sheet-time-now"
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
                testID="meal-log-sheet-time-none"
                accessibilityRole="button"
                accessibilityLabel="No time — placed by meal order"
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
              <Text className="text-muted-foreground text-[10px]">
                {untimed ? "Placed by meal order" : "Logged now"}
              </Text>
            </View>
          ) : null}

          {/* Macro preview — coloured the web's way: protein blue, carbs
              green, fats amber (`MealApplySheet.tsx:599-625`) */}
          <View
            testID="meal-log-sheet-macros"
            style={{
              flexDirection: "row",
              borderRadius: 10,
              backgroundColor: tint("foreground", 0.04),
              padding: 10,
            }}
          >
            {[
              { label: "Cal", value: String(previewNutrition.calories), color: colors.foreground },
              { label: "Protein", value: `${previewNutrition.protein}g`, color: colors.info },
              { label: "Carbs", value: `${previewNutrition.carbs}g`, color: colors.success },
              { label: "Fats", value: `${previewNutrition.fats}g`, color: colors.accent },
            ].map((m) => (
              <View key={m.label} style={{ flex: 1, alignItems: "center" }}>
                <Text
                  testID={`meal-log-sheet-macro-${m.label.toLowerCase()}`}
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
              <Button testID="meal-log-sheet-cancel" variant="secondary" onPress={handleClose}>
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              {/* Black on white / white on black (the web's `bg-zinc-900
                  dark:bg-white`) — never the brand red `primary`. */}
              <Button
                testID="meal-log-sheet-submit"
                variant="inverted"
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
