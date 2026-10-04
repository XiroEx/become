import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { ChefHat } from "lucide-react-native";
import {
  MealsListResponseSchema,
  apiFetch as defaultApiFetch,
  type Meal,
  type apiFetch as ApiFetchType,
} from "@become/api-client";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";
import {
  applyMealToDays,
  bulkResultToast,
  expandDateRange,
  needsBulkConfirm,
} from "@/lib/nutrition/bulkSchedule";
import {
  MAX_REPEAT_COUNT_BY_DAY,
  MAX_REPEAT_COUNT_BY_WEEK,
  titleCaseTag,
  type MealPlanRepeatEvery,
} from "@/lib/nutrition/mealPlanApi";

/**
 * ─── Apply a saved meal across days, natively (NP-177) ───────────────────────
 *
 * The native port of the web's `ApplyMealToDaysSheet`
 * (`webapp/app/dashboard/timeline/PlanToolsSheets.tsx:321-...`) and the
 * `FromTemplateTab` of `ScheduleMealsDrawer.tsx`: search saved meals
 * (`GET /api/meals`), pick one (defaulting the tag to the meal's first tag),
 * pick a date range (every local date from→to inclusive), pick a tag, and
 * optionally repeat every day/week — then POST once to
 * `/api/meal-plans/bulk-from-meal` with
 * `{ mealId, tag, targetDates, mode: 'merge', repeat? }`.
 *
 * - One plan per day, exactly as the web tool does.
 * - `repeat` is sent only when the disclosure is open with count > 1.
 * - > 7 total targets surfaces the web's confirm step (tap submit again).
 * - `onApplied` receives the web's toast text
 *   (`"<total> meal plans created"`, `timeline/page.tsx:1446-1452`).
 */

export interface ApplyMealSheetProps {
  visible: boolean;
  /** First date of the range (defaults to the viewed day). */
  defaultFromDate: string;
  /** Last date of the range (defaults to the viewed day). */
  defaultToDate?: string;
  /** Initial meal-time tag. */
  defaultTag?: string;
  /** Tag choices — `/api/tags` defaults + userTags, like the web. */
  availableTags?: { defaults: string[]; userTags: string[] };
  onClose: () => void;
  /** Receives the toast text on success; the caller refetches. */
  onApplied: (toast: string) => void;
  /** Test seam — defaults to the real `apiFetch`. */
  apiFetch?: typeof ApiFetchType;
}

const TAG_FALLBACK = ["breakfast", "lunch", "dinner", "snack", "pre-workout", "post-workout"];

function maxRepeatCount(every: MealPlanRepeatEvery): number {
  return every === "day" ? MAX_REPEAT_COUNT_BY_DAY : MAX_REPEAT_COUNT_BY_WEEK;
}

export function ApplyMealSheet({
  visible,
  defaultFromDate,
  defaultToDate,
  defaultTag = "lunch",
  availableTags,
  onClose,
  onApplied,
  apiFetch = defaultApiFetch,
}: ApplyMealSheetProps) {
  const { colors, tint } = useThemeTokens();
  const { token } = useAuth();

  const [query, setQuery] = useState("");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate ?? defaultFromDate);
  const [activeTag, setActiveTag] = useState(defaultTag);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatEvery, setRepeatEvery] = useState<MealPlanRepeatEvery>("week");
  const [repeatCount, setRepeatCount] = useState("4");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArmed, setConfirmArmed] = useState(false);

  const debouncedQuery = useDebouncedValue(query, 200);

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from open intent
      setQuery("");
       
      setSelectedMeal(null);
       
      setFromDate(defaultFromDate);
       
      setToDate(defaultToDate ?? defaultFromDate);
       
      setActiveTag(defaultTag);
       
      setRepeatOpen(false);
       
      setRepeatCount("4");
       
      setRepeatEvery("week");
       
      setError(null);
       
      setConfirmArmed(false);
       
      setSubmitting(false);
    }
  }, [visible, defaultFromDate, defaultToDate, defaultTag]);

  // Meal search (debounced) — the web's `GET /api/meals?q=&limit=20`.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const run = async () => {
      setMealsLoading(true);
      try {
        const q = debouncedQuery.trim();
        const url = q ? `/api/meals?q=${encodeURIComponent(q)}&limit=20` : "/api/meals?limit=20";
        const data = await apiFetch(url, MealsListResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        if (!cancelled) setMeals(Array.isArray(data.meals) ? data.meals : []);
      } catch {
        if (!cancelled) setMeals([]);
      } finally {
        if (!cancelled) setMealsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [visible, debouncedQuery, apiFetch, token]);

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
    return out;
  }, [availableTags]);

  const targetDates = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return [];
    if (fromDate > toDate) return [];
    try {
      return expandDateRange(fromDate, toDate);
    } catch {
      return [];
    }
  }, [fromDate, toDate]);

  const repeatCountNum = useMemo(() => {
    const n = Math.round(Number(repeatCount));
    if (!Number.isFinite(n)) return 1;
    return Math.min(Math.max(n, 1), maxRepeatCount(repeatEvery));
  }, [repeatCount, repeatEvery]);

  const totalTargets = useMemo(() => {
    if (!repeatOpen || repeatCountNum <= 1) return targetDates.length;
    return targetDates.length * repeatCountNum;
  }, [targetDates.length, repeatOpen, repeatCountNum]);

  const needsConfirm = needsBulkConfirm(totalTargets);

  const pickMeal = useCallback((meal: Meal) => {
    setSelectedMeal(meal);
    const first = meal.tags?.[0];
    if (first) setActiveTag(String(first).toLowerCase());
    setConfirmArmed(false);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  const doSubmit = useCallback(async () => {
    if (!selectedMeal || submitting || targetDates.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await applyMealToDays({
        mealId: selectedMeal._id,
        tag: activeTag,
        targetDates,
        mode: "merge",
        ...(repeatOpen && repeatCountNum > 1
          ? { repeat: { every: repeatEvery, count: repeatCountNum } }
          : {}),
        apiFetch,
        token: token ?? undefined,
      });
      onApplied(bulkResultToast(result, "meal-plan"));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply meal.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedMeal, submitting, targetDates, activeTag, repeatOpen, repeatCountNum, repeatEvery, apiFetch, token, onApplied, onClose]);

  const handleSubmit = useCallback(() => {
    if (needsConfirm && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }
    void doSubmit();
  }, [needsConfirm, confirmArmed, doSubmit]);

  const submitLabel = submitting
    ? "Applying…"
    : !selectedMeal
      ? "Pick a meal"
      : targetDates.length === 0
        ? "Pick dates"
        : needsConfirm && !confirmArmed
          ? `Apply to ${totalTargets} days? Tap again`
          : `Apply to ${totalTargets} plan${totalTargets === 1 ? "" : "s"}`;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Apply meal to days"
      testID="apply-meal-sheet"
      accessibilityLabel="Apply meal to days"
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          <Text className="text-muted-foreground text-xs">
            Pick a saved meal to apply across one or more days.
          </Text>

          <Input
            testID="apply-meal-search"
            label="Search meals"
            placeholder="Search meals…"
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search meals"
          />

          {mealsLoading ? (
            <Text testID="apply-meal-loading" className="text-muted-foreground text-xs text-center">
              Loading meals…
            </Text>
          ) : meals.length === 0 ? (
            <Text testID="apply-meal-empty" className="text-muted-foreground text-xs text-center">
              No meals found.
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {meals.map((meal) => {
                const id = String(meal._id);
                const isSelected = selectedMeal?._id === meal._id;
                return (
                  <Pressable
                    key={id}
                    testID={`apply-meal-result-${id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Pick meal ${meal.name}`}
                    onPress={() => pickMeal(meal)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: colors.card,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: tint("primary", 0.15),
                      }}
                    >
                      <ChefHat size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {meal.name}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        {meal.totalNutrition?.calories != null
                          ? `${Math.round(meal.totalNutrition.calories)} cal`
                          : "No nutrition data"}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Text testID={`apply-meal-selected-${id}`} style={{ color: colors.primary }}>
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedMeal ? (
            <Text testID="apply-meal-selected-name" className="text-foreground text-sm font-semibold">
              {selectedMeal.name}
            </Text>
          ) : null}

          <View style={{ gap: 6 }}>
            <Text className="text-foreground text-sm font-medium">Tag</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {tagOptions.map((t) => {
                const isSelected = activeTag === t;
                return (
                  <Pressable
                    key={t}
                    testID={`apply-meal-tag-${t}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Tag ${t}`}
                    onPress={() => {
                      setActiveTag(t);
                      setConfirmArmed(false);
                    }}
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
                        color: isSelected ? colors["primary-foreground"] : colors.foreground,
                      }}
                    >
                      {titleCaseTag(t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID="apply-meal-from"
                label="From (YYYY-MM-DD)"
                placeholder={defaultFromDate}
                value={fromDate}
                onChangeText={(v) => {
                  setFromDate(v.trim());
                  setConfirmArmed(false);
                }}
                accessibilityLabel="First date"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID="apply-meal-to"
                label="To (YYYY-MM-DD)"
                placeholder={defaultToDate ?? defaultFromDate}
                value={toDate}
                onChangeText={(v) => {
                  setToDate(v.trim());
                  setConfirmArmed(false);
                }}
                accessibilityLabel="Last date"
              />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            {!repeatOpen ? (
              <Pressable
                testID="apply-meal-repeat-toggle"
                accessibilityRole="button"
                accessibilityLabel="Repeat this meal"
                onPress={() => {
                  setRepeatOpen(true);
                  setConfirmArmed(false);
                }}
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
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>
                  Repeat…
                </Text>
              </Pressable>
            ) : (
              <View
                testID="apply-meal-repeat-editor"
                style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}
              >
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["day", "week"] as const).map((every) => {
                    const isSelected = repeatEvery === every;
                    return (
                      <Pressable
                        key={every}
                        testID={`apply-meal-repeat-${every}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Repeat every ${every}`}
                        onPress={() => {
                          setRepeatEvery(every);
                          setConfirmArmed(false);
                        }}
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
                            color: isSelected ? colors["primary-foreground"] : colors.foreground,
                          }}
                        >
                          Every {every}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Input
                  testID="apply-meal-repeat-count"
                  label={`Count (1–${maxRepeatCount(repeatEvery)})`}
                  keyboardType="numeric"
                  value={repeatCount}
                  onChangeText={(v) => {
                    setRepeatCount(v.replace(/[^0-9]/g, ""));
                    setConfirmArmed(false);
                  }}
                  accessibilityLabel="Repeat count"
                />
                <Pressable
                  testID="apply-meal-repeat-close"
                  accessibilityRole="button"
                  accessibilityLabel="Close recurrence"
                  onPress={() => {
                    setRepeatOpen(false);
                    setRepeatCount("4");
                    setConfirmArmed(false);
                  }}
                  style={{ padding: 8 }}
                >
                  <Text style={{ fontSize: 14, color: colors["muted-foreground"] }}>✕</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text testID="apply-meal-targets" className="text-muted-foreground text-xs">
            {targetDates.length === 0
              ? "Enter a valid date range."
              : `${targetDates.length} date${targetDates.length === 1 ? "" : "s"} selected${repeatOpen && repeatCountNum > 1 ? ` × ${repeatCountNum} = ${totalTargets} plans` : ""}`}
          </Text>

          {needsConfirm ? (
            <Text testID="apply-meal-confirm" className="text-muted-foreground text-xs">
              {confirmArmed
                ? `Tap submit again to apply to ${totalTargets} days.`
                : "That's a lot of days. We'll ask once more before submitting."}
            </Text>
          ) : null}

          {error ? (
            <Text
              testID="apply-meal-error"
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              className="text-destructive text-xs"
            >
              {error}
            </Text>
          ) : null}

          <Button
            testID="apply-meal-submit"
            onPress={handleSubmit}
            disabled={submitting || !selectedMeal || targetDates.length === 0}
            loading={submitting}
            accessibilityLabel={submitLabel}
          >
            {submitLabel}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
