import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  AlertTriangle,
  CalendarDays,
  ChefHat,
  Plus,
  Repeat,
  Trash2,
  Utensils,
  X,
} from "lucide-react-native";
import {
  MealsListResponseSchema,
  MealLogsDayResponseSchema,
  apiFetch as defaultApiFetch,
  type Food,
  type Meal,
  type apiFetch as ApiFetchType,
} from "@become/api-client";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useAuth } from "@/lib/auth/useAuth";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { withTz } from "@/lib/time/localDay";
import {
  addDaysToKey,
  compareDateKeys,
  todayLocalKey,
} from "@/lib/nutrition/mealPlanDates";
import {
  applyMealToDays,
  bulkResultToast,
  copyDayForward,
  expandDateRange,
  needsBulkConfirm,
  type BulkSourceType,
} from "@/lib/nutrition/bulkSchedule";
import {
  MAX_REPEAT_COUNT_BY_DAY,
  MAX_REPEAT_COUNT_BY_WEEK,
  deleteMealPlan,
  titleCaseTag,
  type MealPlanRepeatEvery,
} from "@/lib/nutrition/mealPlanApi";
import { PlansResponseSchema, type MealPlan } from "@/lib/nutrition/mealPlans";
import { SOURCE_OPTIONS } from "@/components/nutrition/CopyDaySheet";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
import { PlanFoodSheet } from "@/components/nutrition/PlanFoodSheet";
import { ApplyMealSheet } from "@/components/nutrition/ApplyMealSheet";
import type { QuantityPickerFood } from "@/components/nutrition/QuantityPicker";
import { DateOnlyPicker, formatDatePillLabel } from "@/components/nutrition/DateOnlyPicker";
import { getTagVisuals } from "@/components/nutrition/TagSection";

/**
 * ─── Schedule meals, natively (NP-265) ───────────────────────────────────────
 *
 * The native port of the web's `ScheduleMealsDrawer`
 * (`webapp/components/nutrition/ScheduleMealsDrawer.tsx`): ONE sheet with a
 * `Range` toggle and three tabs — `By day` (per-tag slots), `From meals`
 * (apply a saved meal across a range) and `Copy day` (duplicate a past day
 * onto the viewed date/range) — behind the single blue "Schedule meals" CTA
 * that replaces the native-only red `Schedule food` / `Copy day…` /
 * `Repeat a meal…` buttons. Each tab is its OWN component, exactly how the
 * web splits `ByDayTab` / `FromTemplateTab` / `CopyDayTab` out of the same
 * file, rather than one sprawling function.
 *
 * REUSE, not reinvention:
 * - `By day`'s "+ Add" opens `FoodSearchSheet` → `PlanFoodSheet`, exactly the
 *   web's per-slot `FoodSearchModal`. Its saved-meal button opens
 *   `ApplyMealSheet` pinned to the slot's tag+date, exactly the web's
 *   `MealApplySheet` reuse. Both are full-screen `Modal`s, same as this
 *   drawer's own `BottomSheet` — iOS refuses a second simultaneous `Modal`
 *   (NP-261), so the drawer hides itself (`subFlow !== null`) while either is
 *   open and reappears once the sub-flow closes.
 * - `From meals` and `Copy day` are inline tabs (no nested sheet, exactly the
 *   web's own `FromTemplateTab` / `CopyDayTab`) that call the SAME bulk API
 *   functions the standalone `ApplyMealSheet` / `CopyDaySheet` already wrap
 *   (`applyMealToDays`, `copyDayForward`, `needsBulkConfirm`,
 *   `bulkResultToast`) — the logic those sheets wrap, reused, not copied.
 * - `Copy day` copies FROM a past day (default: yesterday) ONTO the viewed
 *   date/range, with a preview grouped by tag — the direction and preview
 *   the card asks for, where the standalone `CopyDaySheet` instead copies the
 *   viewed day FORWARD onto N future days (kept, unused by this screen, for
 *   `TimelineWeekView`'s own "Copy day…" tool).
 *
 * Submitting `From meals` or `Copy day` closes the whole drawer (the
 * existing native convention every sibling bulk sheet already follows); the
 * `By day` tab's own actions return to the drawer so composing stays quick.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_TAG_SLOTS = [
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "pre-workout",
  "post-workout",
] as const;

function buildSlotTags(availableTags?: { defaults: string[]; userTags: string[] }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const norm = t.trim().toLowerCase();
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  };
  for (const t of DEFAULT_TAG_SLOTS) push(t);
  for (const t of availableTags?.defaults ?? []) push(t);
  for (const t of availableTags?.userTags ?? []) push(t);
  return out;
}

interface PreviewItem {
  tag: string;
  name: string;
  cal: number;
}

function itemDisplay(it: {
  name: string;
  nutrition?: { calories?: number };
  servings?: number;
}): { name: string; cal: number } {
  return {
    name: it.name,
    cal: Math.round((it.nutrition?.calories ?? 0) * (it.servings ?? 1)),
  };
}

function maxRepeatCount(every: MealPlanRepeatEvery): number {
  return every === "day" ? MAX_REPEAT_COUNT_BY_DAY : MAX_REPEAT_COUNT_BY_WEEK;
}

type SubFlow =
  | { kind: "search"; tag: string }
  | { kind: "plan"; tag: string; food: Food }
  | { kind: "apply-meal"; tag: string }
  | null;

type DrawerTab = "by-day" | "from-meals" | "copy-day";

export interface ScheduleMealsDrawerProps {
  visible: boolean;
  /** The date the drawer opens at — today or a future day. */
  defaultDate: string;
  /** Tag choices — `/api/tags` defaults ∪ userTags, like the web. */
  availableTags?: { defaults: string[]; userTags: string[] };
  onClose: () => void;
  /** Receives the toast text after a mutation; the caller refetches. */
  onApplied?: (toast: string) => void;
  /** Test seam — defaults to the real `apiFetch`. */
  apiFetch?: typeof ApiFetchType;
}

function TabButton({
  active,
  onPress,
  icon,
  label,
  testID,
}: {
  active: boolean;
  onPress: () => void;
  icon: ReactNode;
  label: string;
  testID: string;
}) {
  const { colors } = useThemeTokens();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: active ? colors.primary : "transparent",
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: active ? colors["primary-foreground"] : colors.foreground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── By day ───────────────────────────────────────────────────────────────────

interface ByDayTabProps {
  active: boolean;
  dateKey: string;
  tagOptions: string[];
  refreshKey: number;
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  onAdd: (tag: string) => void;
  onApplyMeal: (tag: string) => void;
  onApplied: (toast: string) => void;
}

function ByDayTab({
  active,
  dateKey,
  tagOptions,
  refreshKey,
  apiFetch,
  token,
  onAdd,
  onApplyMeal,
  onApplied,
}: ByDayTabProps) {
  const { colors } = useThemeTokens();
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(
        `/api/meal-plans?from=${dateKey}&to=${dateKey}`,
        PlansResponseSchema,
        { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
      );
      setPlans((data.plans ?? []).filter((p) => p.status === "active"));
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [dateKey, apiFetch, token]);

  useEffect(() => {
    if (!active) return;
    // The fetch (and its setState) is driven entirely by `dateKey` /
    // `refreshKey` changing from outside this effect (the tab becoming
    // active, a sub-flow completing) — a network sync, not a derivable value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [active, refetch, refreshKey]);

  const plansBySlot = useMemo(() => {
    const map = new Map<string, MealPlan[]>();
    for (const p of plans) {
      const key = p.tag.toLowerCase();
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [plans]);

  const handleDeletePlan = useCallback(
    async (planId: string) => {
      try {
        await deleteMealPlan(planId, { apiFetch, token: token ?? undefined });
        await refetch();
        onApplied("Removed plan");
      } catch {
        // Leave the row — surviving a failed delete beats silently vanishing
        // a plan that is still there server-side.
      }
    },
    [apiFetch, token, refetch, onApplied],
  );

  if (!active) return null;

  return (
    <View testID="schedule-meals-by-day-tab" style={{ gap: 10 }}>
      <Text className="text-muted-foreground text-xs">Compose meals for {dateKey}</Text>
      {loading ? (
        <Text className="text-muted-foreground text-xs text-center">Loading…</Text>
      ) : (
        tagOptions.map((tag) => {
          const slotPlans = plansBySlot.get(tag) ?? [];
          const items: { planId: string; name: string; cal: number }[] = [];
          for (const p of slotPlans) {
            for (const it of p.items) items.push({ planId: p._id, ...itemDisplay(it) });
          }
          const cals = items.reduce((s, it) => s + it.cal, 0);
          return (
            <View
              key={tag}
              testID={`schedule-meals-slot-${tag}`}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                backgroundColor: colors.card,
                padding: 10,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {(() => {
                  const visuals = getTagVisuals(tag);
                  const TagIcon = visuals.Icon;
                  return (
                    <View
                      testID={`schedule-meals-slot-icon-${tag}`}
                      className={`w-8 h-8 items-center justify-center rounded-lg ${visuals.bgClass}`}
                    >
                      <TagIcon size={16} color={colors.foreground} />
                    </View>
                  );
                })()}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="text-foreground text-sm font-semibold">
                    {titleCaseTag(tag)}
                  </Text>
                  {items.length > 0 ? (
                    <Text className="text-muted-foreground text-xs">
                      {items.length} item{items.length === 1 ? "" : "s"}
                      {cals > 0 ? ` · ${cals} cal` : ""}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  testID={`schedule-meals-add-${tag}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Add food to ${titleCaseTag(tag)}`}
                  onPress={() => onAdd(tag)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: colors.primary,
                  }}
                >
                  <Plus size={14} color={colors["primary-foreground"]} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors["primary-foreground"] }}>
                    Add
                  </Text>
                </Pressable>
                <Pressable
                  testID={`schedule-meals-apply-meal-${tag}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Apply a saved meal to ${titleCaseTag(tag)}`}
                  onPress={() => onApplyMeal(tag)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ChefHat size={16} color={colors.foreground} />
                </Pressable>
              </View>
              {items.length > 0 ? (
                <View style={{ gap: 4 }}>
                  {items.map((it, idx) => (
                    <View
                      key={`${it.planId}-${idx}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                    >
                      <Text className="text-foreground text-xs" style={{ flex: 1 }} numberOfLines={1}>
                        {it.name}
                      </Text>
                      <Text className="text-muted-foreground text-xs">{it.cal} cal</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${it.name}`}
                        onPress={() => void handleDeletePlan(it.planId)}
                        hitSlop={8}
                      >
                        <Trash2 size={14} color={colors["muted-foreground"]} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

// ── From meals ───────────────────────────────────────────────────────────────

interface FromMealsTabProps {
  active: boolean;
  targetDates: string[];
  tagOptions: string[];
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  onApplied: (toast: string) => void;
}

function FromMealsTab({ active, targetDates, tagOptions, apiFetch, token, onApplied }: FromMealsTabProps) {
  const { colors } = useThemeTokens();
  const [query, setQuery] = useState("");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [tag, setTag] = useState("lunch");
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatEvery, setRepeatEvery] = useState<MealPlanRepeatEvery>("week");
  const [repeatCount, setRepeatCount] = useState("4");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArmed, setConfirmArmed] = useState(false);

  const debouncedQuery = useDebouncedValue(query, 200);

  useEffect(() => {
    if (!active) return;
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
  }, [active, debouncedQuery, apiFetch, token]);

  const pickMeal = useCallback((meal: Meal) => {
    setSelectedMeal(meal);
    const first = meal.tags?.[0];
    if (first) setTag(String(first).toLowerCase());
    setConfirmArmed(false);
  }, []);

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

  const doSubmit = useCallback(async () => {
    if (!selectedMeal || submitting || targetDates.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await applyMealToDays({
        mealId: selectedMeal._id,
        tag,
        targetDates,
        mode: "merge",
        ...(repeatOpen && repeatCountNum > 1 ? { repeat: { every: repeatEvery, count: repeatCountNum } } : {}),
        apiFetch,
        token: token ?? undefined,
      });
      onApplied(bulkResultToast(result, "meal-plan"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply meal.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedMeal, submitting, targetDates, tag, repeatOpen, repeatCountNum, repeatEvery, apiFetch, token, onApplied]);

  const handleSubmit = useCallback(() => {
    if (needsConfirm && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }
    void doSubmit();
  }, [needsConfirm, confirmArmed, doSubmit]);

  if (!active) return null;

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
    <View testID="schedule-meals-from-meals-tab" style={{ gap: 10 }}>
      <Text className="text-muted-foreground text-xs">
        Apply a saved meal across {targetDates.length === 1 ? "this date" : `${targetDates.length} dates`}.
      </Text>

      <Input
        testID="schedule-meals-meal-search"
        label="Search meals"
        placeholder="Search meals…"
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Search meals"
      />

      {mealsLoading ? (
        <Text className="text-muted-foreground text-xs text-center">Loading meals…</Text>
      ) : meals.length === 0 ? (
        <Text testID="schedule-meals-meals-empty" className="text-muted-foreground text-xs text-center">
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
                testID={`schedule-meals-meal-${id}`}
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
                <ChefHat size={16} color={colors.foreground} />
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
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={{ gap: 6 }}>
        <Text className="text-foreground text-sm font-medium">Tag</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {tagOptions.map((t) => {
            const isSelected = tag === t;
            return (
              <Pressable
                key={t}
                testID={`schedule-meals-from-tag-${t}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Tag ${t}`}
                onPress={() => {
                  setTag(t);
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

      <View style={{ gap: 6 }}>
        {!repeatOpen ? (
          <Pressable
            testID="schedule-meals-repeat-toggle"
            accessibilityRole="button"
            accessibilityLabel="Repeat this meal"
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
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>Repeat…</Text>
          </Pressable>
        ) : (
          <View
            testID="schedule-meals-repeat-editor"
            style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          >
            {(["day", "week"] as const).map((every) => {
              const isSelected = repeatEvery === every;
              return (
                <Pressable
                  key={every}
                  testID={`schedule-meals-repeat-${every}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Repeat every ${every}`}
                  onPress={() => {
                    setRepeatEvery(every);
                    setConfirmArmed(false);
                  }}
                  style={{
                    paddingHorizontal: 10,
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
            <Input
              testID="schedule-meals-repeat-count"
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
              testID="schedule-meals-repeat-close"
              accessibilityRole="button"
              accessibilityLabel="Close recurrence"
              onPress={() => {
                setRepeatOpen(false);
                setRepeatCount("4");
              }}
              style={{ padding: 8 }}
            >
              <Text style={{ fontSize: 14, color: colors["muted-foreground"] }}>✕</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Text testID="schedule-meals-from-targets" className="text-muted-foreground text-xs">
        {targetDates.length === 0
          ? "Enter a valid date range."
          : `${targetDates.length} date${targetDates.length === 1 ? "" : "s"} selected${
              repeatOpen && repeatCountNum > 1 ? ` × ${repeatCountNum} = ${totalTargets} plans` : ""
            }`}
      </Text>

      {needsConfirm ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <AlertTriangle size={14} color={colors["muted-foreground"]} />
          <Text className="text-muted-foreground text-xs" style={{ flex: 1 }}>
            {confirmArmed
              ? `Tap submit again to apply to ${totalTargets} days.`
              : "That's a lot of days. We'll ask once more before submitting."}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text
          testID="schedule-meals-from-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="text-destructive text-xs"
        >
          {error}
        </Text>
      ) : null}

      <Button
        testID="schedule-meals-from-submit"
        onPress={handleSubmit}
        disabled={submitting || !selectedMeal || targetDates.length === 0}
        loading={submitting}
        accessibilityLabel={submitLabel}
      >
        {submitLabel}
      </Button>
    </View>
  );
}

// ── Copy day ─────────────────────────────────────────────────────────────────

interface CopyDayTabProps {
  active: boolean;
  targetDates: string[];
  apiFetch: typeof ApiFetchType;
  token?: string | null;
  onApplied: (toast: string) => void;
}

function CopyDayTab({ active, targetDates, apiFetch, token, onApplied }: CopyDayTabProps) {
  const { colors } = useThemeTokens();
  const [sourceKey, setSourceKey] = useState(() => addDaysToKey(todayLocalKey(), -1));
  const [sourceType, setSourceType] = useState<BulkSourceType>("log");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArmed, setConfirmArmed] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const run = async () => {
      if (!DATE_RE.test(sourceKey)) {
        if (!cancelled) setPreview([]);
        return;
      }
      setPreviewLoading(true);
      try {
        if (sourceType === "log") {
          const data = await apiFetch(withTz(`/api/meal-logs?date=${sourceKey}`), MealLogsDayResponseSchema, {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          });
          if (cancelled) return;
          const items: PreviewItem[] = [];
          for (const log of data.logs ?? []) {
            const tag = (log.tags?.[0] ?? "snack") as string;
            for (const it of log.items ?? []) items.push({ tag, ...itemDisplay(it) });
          }
          setPreview(items);
        } else {
          const data = await apiFetch(
            `/api/meal-plans?from=${sourceKey}&to=${sourceKey}`,
            PlansResponseSchema,
            { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
          );
          if (cancelled) return;
          const items: PreviewItem[] = [];
          for (const p of data.plans ?? []) {
            if (p.status !== "active") continue;
            for (const it of p.items) items.push({ tag: p.tag, ...itemDisplay(it) });
          }
          setPreview(items);
        }
      } catch {
        if (!cancelled) setPreview([]);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [active, sourceKey, sourceType, apiFetch, token]);

  const byTag = useMemo(() => {
    const map = new Map<string, PreviewItem[]>();
    for (const it of preview) {
      const arr = map.get(it.tag) ?? [];
      arr.push(it);
      map.set(it.tag, arr);
    }
    return Array.from(map.entries());
  }, [preview]);

  const needsConfirm = needsBulkConfirm(targetDates.length);

  const doSubmit = useCallback(async () => {
    if (submitting || targetDates.length === 0 || preview.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await copyDayForward({
        sourceDate: sourceKey,
        sourceType,
        targetDates,
        mode: "merge",
        apiFetch,
        token: token ?? undefined,
      });
      onApplied(bulkResultToast(result, "plan"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to copy day.");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, targetDates, preview.length, sourceKey, sourceType, apiFetch, token, onApplied]);

  const handleSubmit = useCallback(() => {
    if (needsConfirm && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }
    void doSubmit();
  }, [needsConfirm, confirmArmed, doSubmit]);

  if (!active) return null;

  const submitLabel = submitting
    ? "Copying…"
    : preview.length === 0
      ? "Nothing to copy"
      : needsConfirm && !confirmArmed
        ? `Copy to ${targetDates.length} dates? Tap again`
        : `Copy to ${targetDates.length} date${targetDates.length === 1 ? "" : "s"}`;

  return (
    <View testID="schedule-meals-copy-day-tab" style={{ gap: 10 }}>
      <Text className="text-muted-foreground text-xs">
        Duplicate a past or current day&apos;s meals onto{" "}
        {targetDates.length === 1 ? "this date" : `${targetDates.length} target dates`}.
      </Text>

      <View style={{ gap: 8 }}>
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          From
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Pressable
            testID="schedule-meals-copy-source"
            accessibilityRole="button"
            accessibilityLabel={`Source date: ${formatDatePillLabel(sourceKey)}`}
            onPress={() => setSourceOpen((o) => !o)}
            className="inline-flex flex-row items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 dark:bg-blue-900/40"
            {...({ value: sourceKey } as any)}
          >
            <CalendarDays size={12} color={colors.info} />
            <Text className="text-[11px] font-semibold text-blue-700 dark:text-blue-200 tabular-nums">
              {formatDatePillLabel(sourceKey)}
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {SOURCE_OPTIONS.map((opt) => {
              const selected = sourceType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  testID={`schedule-meals-copy-source-${opt.value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                  onPress={() => {
                    setSourceType(opt.value);
                    setConfirmArmed(false);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.card : "transparent",
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: selected ? "600" : "400", color: colors.foreground }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {sourceOpen && (
          <View style={{ marginVertical: 8 }}>
            <DateOnlyPicker
              value={sourceKey}
              maxDate={todayLocalKey()}
              onChange={(next) => {
                if (!next) return;
                setSourceKey(next);
                setConfirmArmed(false);
                setSourceOpen(false);
              }}
            />
          </View>
        )}
      </View>

      <View style={{ gap: 4 }}>
        <Text className="text-muted-foreground text-xs" style={{ textTransform: "uppercase", fontWeight: "600" }}>
          Preview
        </Text>
        {previewLoading ? (
          <Text className="text-muted-foreground text-xs text-center">Loading…</Text>
        ) : preview.length === 0 ? (
          <Text
            testID="schedule-meals-copy-preview-empty"
            className="text-muted-foreground text-xs"
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 10,
              textAlign: "center",
            }}
          >
            Nothing to copy on this day.
          </Text>
        ) : (
          <View
            testID="schedule-meals-copy-preview"
            style={{ gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 8 }}
          >
            {byTag.map(([tag, items]) => {
              const cals = items.reduce((s, x) => s + x.cal, 0);
              return (
                <View key={tag} style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text className="text-foreground text-xs font-semibold">{titleCaseTag(tag)}</Text>
                    <Text className="text-muted-foreground text-xs">
                      {items.length} item{items.length === 1 ? "" : "s"} · {cals} cal
                    </Text>
                  </View>
                  <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                    {items.map((i) => i.name).join(", ")}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Text testID="schedule-meals-copy-targets" className="text-muted-foreground text-xs">
        Copying to {targetDates.length} target{targetDates.length === 1 ? "" : "s"}.
      </Text>

      {needsConfirm ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <AlertTriangle size={14} color={colors["muted-foreground"]} />
          <Text className="text-muted-foreground text-xs" style={{ flex: 1 }}>
            {confirmArmed
              ? `Tap copy again to apply to ${targetDates.length} dates.`
              : "That's a lot of dates. We'll ask once more before submitting."}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text
          testID="schedule-meals-copy-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="text-destructive text-xs"
        >
          {error}
        </Text>
      ) : null}

      <Button
        testID="schedule-meals-copy-submit"
        onPress={handleSubmit}
        disabled={submitting || preview.length === 0 || targetDates.length === 0}
        loading={submitting}
        accessibilityLabel={submitLabel}
      >
        {submitLabel}
      </Button>
    </View>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────────

export function ScheduleMealsDrawer({
  visible,
  defaultDate,
  availableTags,
  onClose,
  onApplied,
  apiFetch = defaultApiFetch,
}: ScheduleMealsDrawerProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const [rangeMode, setRangeMode] = useState(false);
  const [fromKey, setFromKey] = useState(defaultDate);
  const [toKey, setToKey] = useState(defaultDate);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>("by-day");
  // "By day" doesn't fit a range (per-slot composition is for ONE day), so a
  // range forces the tab bar onto "From meals" at RENDER time rather than via
  // an effect — the tab button itself disappears while ranged, so this is
  // just the fallback for the one render where both are simultaneously true.
  const effectiveTab: DrawerTab = rangeMode && activeTab === "by-day" ? "from-meals" : activeTab;

  // Per-slot sub-flows (NP-261): both `FoodSearchSheet`→`PlanFoodSheet` and
  // `ApplyMealSheet` are their own `Modal`s, so the drawer's own `BottomSheet`
  // hides itself while one is open.
  const [subFlow, setSubFlow] = useState<SubFlow>(null);
  const [byDayRefreshKey, setByDayRefreshKey] = useState(0);

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from open intent
      setRangeMode(false);
      setFromKey(defaultDate);
      setToKey(defaultDate);
      setFromOpen(false);
      setToOpen(false);
      setActiveTab("by-day");
      setSubFlow(null);
    }
  }, [visible, defaultDate]);

  const handleToggleRange = useCallback(() => {
    setRangeMode((prev) => {
      const next = !prev;
      if (next) {
        setToKey((t) => (compareDateKeys(t, fromKey) <= 0 ? addDaysToKey(fromKey, 6) : t));
      } else {
        setToOpen(false);
      }
      return next;
    });
  }, [fromKey]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleBulkApplied = useCallback(
    (toast: string) => {
      onApplied?.(toast);
      onClose();
    },
    [onApplied, onClose],
  );

  const handleByDayApplied = useCallback(
    (toast: string) => {
      onApplied?.(toast);
    },
    [onApplied],
  );

  const handleSubFlowDone = useCallback((toast: string) => {
    setSubFlow(null);
    setByDayRefreshKey((k) => k + 1);
    handleByDayApplied(toast);
  }, [handleByDayApplied]);

  // Every target date — `[fromKey]` single-date, every local day from
  // `fromKey..toKey` inclusive when ranged. Shared by `From meals` and
  // `Copy day`, exactly the web's own `toKey: rangeMode ? toKey : fromKey`.
  const targetDates = useMemo(() => {
    if (!DATE_RE.test(fromKey)) return [];
    if (!rangeMode) return [fromKey];
    if (!DATE_RE.test(toKey)) return [];
    if (compareDateKeys(toKey, fromKey) < 0) return [];
    try {
      return expandDateRange(fromKey, toKey);
    } catch {
      return [];
    }
  }, [fromKey, toKey, rangeMode]);

  const tagOptions = useMemo(() => buildSlotTags(availableTags), [availableTags]);

  return (
    <>
      <BottomSheet
        visible={visible && subFlow === null}
        onClose={handleClose}
        title="Schedule meals"
        testID="schedule-meals-drawer"
        accessibilityLabel="Schedule meals"
        sheetStyle={{ maxHeight: "90%" }}
        headerLeading={
          <View
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
            }}
            className="bg-blue-100 dark:bg-blue-900/30"
          >
            <CalendarDays size={20} color={colors.info} />
          </View>
        }
        headerTrailing={
          <Pressable
            testID="schedule-meals-close"
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={handleClose}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 18,
            }}
          >
            <X size={18} color={colors["muted-foreground"]} />
          </Pressable>
        }
      >
        <View style={{ gap: 12 }}>
          <Text testID="schedule-meals-subtitle" className="text-muted-foreground text-xs">
            {rangeMode
              ? `${formatDatePillLabel(fromKey)} → ${formatDatePillLabel(toKey)}`
              : formatDatePillLabel(fromKey)}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {rangeMode ? "From" : "For"}
            </Text>
            <Pressable
              testID="schedule-meals-from"
              accessibilityRole="button"
              accessibilityLabel={`${rangeMode ? "From" : "For"}: ${formatDatePillLabel(fromKey)}`}
              onPress={() => {
                setFromOpen((o) => !o);
                setToOpen(false);
              }}
              className="inline-flex flex-row items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 dark:bg-blue-900/40"
              {...({ value: fromKey } as any)}
            >
              <CalendarDays size={12} color={colors.info} />
              <Text className="text-[11px] font-semibold text-blue-700 dark:text-blue-200 tabular-nums">
                {formatDatePillLabel(fromKey)}
              </Text>
            </Pressable>
            {rangeMode ? (
              <>
                <Text className="text-muted-foreground">→</Text>
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  To
                </Text>
                <Pressable
                  testID="schedule-meals-to"
                  accessibilityRole="button"
                  accessibilityLabel={`To: ${formatDatePillLabel(toKey)}`}
                  onPress={() => {
                    setToOpen((o) => !o);
                    setFromOpen(false);
                  }}
                  className="inline-flex flex-row items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 dark:bg-blue-900/40"
                  {...({ value: toKey } as any)}
                >
                  <CalendarDays size={12} color={colors.info} />
                  <Text className="text-[11px] font-semibold text-blue-700 dark:text-blue-200 tabular-nums">
                    {formatDatePillLabel(toKey)}
                  </Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              testID="schedule-meals-range-toggle"
              accessibilityRole="button"
              accessibilityState={{ selected: rangeMode }}
              accessibilityLabel="Range"
              onPress={handleToggleRange}
              style={{
                marginLeft: "auto",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 16,
                backgroundColor: rangeMode ? colors.primary : colors.card,
                borderWidth: 1,
                borderColor: rangeMode ? colors.primary : colors.border,
              }}
            >
              <Repeat size={12} color={rangeMode ? colors["primary-foreground"] : colors.foreground} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: rangeMode ? colors["primary-foreground"] : colors.foreground,
                }}
              >
                Range
              </Text>
            </Pressable>
          </View>

          {fromOpen && (
            <View style={{ marginVertical: 4 }}>
              <DateOnlyPicker
                value={fromKey}
                onChange={(next) => {
                  if (!next) return;
                  setFromKey(next);
                  setFromOpen(false);
                }}
              />
            </View>
          )}

          {rangeMode && toOpen && (
            <View style={{ marginVertical: 4 }}>
              <DateOnlyPicker
                value={toKey}
                minDate={fromKey}
                onChange={(next) => {
                  if (!next) return;
                  setToKey(next);
                  setToOpen(false);
                }}
              />
            </View>
          )}

          <View
            style={{ flexDirection: "row", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 3 }}
          >
            {!rangeMode ? (
              <TabButton
                testID="schedule-meals-tab-by-day"
                active={effectiveTab === "by-day"}
                onPress={() => setActiveTab("by-day")}
                icon={
                  <Utensils size={14} color={effectiveTab === "by-day" ? colors["primary-foreground"] : colors.foreground} />
                }
                label="By day"
              />
            ) : null}
            <TabButton
              testID="schedule-meals-tab-from-meals"
              active={effectiveTab === "from-meals"}
              onPress={() => setActiveTab("from-meals")}
              icon={
                <ChefHat size={14} color={effectiveTab === "from-meals" ? colors["primary-foreground"] : colors.foreground} />
              }
              label="From meals"
            />
            <TabButton
              testID="schedule-meals-tab-copy-day"
              active={effectiveTab === "copy-day"}
              onPress={() => setActiveTab("copy-day")}
              icon={
                <CalendarDays size={14} color={effectiveTab === "copy-day" ? colors["primary-foreground"] : colors.foreground} />
              }
              label="Copy day"
            />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
            <ByDayTab
              active={effectiveTab === "by-day" && !rangeMode}
              dateKey={fromKey}
              tagOptions={tagOptions}
              refreshKey={byDayRefreshKey}
              apiFetch={apiFetch}
              token={token}
              onAdd={(tag) => setSubFlow({ kind: "search", tag })}
              onApplyMeal={(tag) => setSubFlow({ kind: "apply-meal", tag })}
              onApplied={handleByDayApplied}
            />
            <FromMealsTab
              active={effectiveTab === "from-meals"}
              targetDates={targetDates}
              tagOptions={tagOptions}
              apiFetch={apiFetch}
              token={token}
              onApplied={handleBulkApplied}
            />
            <CopyDayTab
              active={effectiveTab === "copy-day"}
              targetDates={targetDates}
              apiFetch={apiFetch}
              token={token}
              onApplied={handleBulkApplied}
            />
          </ScrollView>

          <Button testID="schedule-meals-done" onPress={handleClose} variant="inverted">
            Done
          </Button>
        </View>
      </BottomSheet>

      {/* Per-slot "+ Add" (By day) — the web's `FoodSearchModal` reuse. The
          drawer hides itself (above) while this Modal is visible. */}
      <FoodSearchSheet
        testID="schedule-meals-food-search"
        visible={subFlow?.kind === "search"}
        currentTag={subFlow?.kind === "search" ? subFlow.tag : undefined}
        onPickFood={(food) => {
          setSubFlow((prev) => (prev?.kind === "search" ? { kind: "plan", tag: prev.tag, food } : prev));
        }}
        onClose={() => setSubFlow(null)}
      />

      <PlanFoodSheet
        visible={subFlow?.kind === "plan"}
        food={subFlow?.kind === "plan" ? (subFlow.food as QuantityPickerFood) : null}
        plannedDate={fromKey}
        tag={subFlow?.kind === "plan" ? subFlow.tag : "snack"}
        availableTags={availableTags}
        onClose={() => setSubFlow(null)}
        onPlanned={handleSubFlowDone}
        apiFetch={apiFetch}
      />

      {/* Per-slot saved-meal button (By day) — the web's `MealApplySheet`
          reuse, pinned to this slot's tag + the drawer's date. */}
      <ApplyMealSheet
        visible={subFlow?.kind === "apply-meal"}
        defaultFromDate={fromKey}
        defaultToDate={fromKey}
        defaultTag={subFlow?.kind === "apply-meal" ? subFlow.tag : "lunch"}
        availableTags={availableTags}
        onClose={() => setSubFlow(null)}
        onApplied={handleSubFlowDone}
        apiFetch={apiFetch}
      />
    </>
  );
}

export default ScheduleMealsDrawer;
