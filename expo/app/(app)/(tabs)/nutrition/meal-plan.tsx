import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  ShoppingCart,
  X,
} from "lucide-react-native";
import {
  TagsResponseSchema,
  NutritionGoalsResponseSchema,
  type Food,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
import { PlanFoodSheet } from "@/components/nutrition/PlanFoodSheet";
import type { QuantityPickerFood } from "@/components/nutrition/QuantityPicker";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  PlansResponseSchema,
  type MealPlan,
} from "@/lib/nutrition/mealPlans";
import {
  tintForCalories,
  TINT_BG_CLASSES,
} from "@/lib/nutrition/timelinePlanning";
import { deleteMealPlan } from "@/lib/nutrition/mealPlanApi";
import {
  activePlans,
  addableTags,
  addDays,
  aggregateGrocery,
  dayCalories,
  formatGroceryQty,
  groupPlansByDay,
  slotsForDay,
  startOfWeek,
  titleCaseSlot,
  weekDays,
  weekLabel,
  weekRangeKeys,
  ymd,
} from "@/lib/nutrition/mealPlanWeek";

/**
 * ─── Meal plan week (NP-231) ─────────────────────────────────────────────────
 *
 * The native port of `webapp/app/dashboard/meal-plan/page.tsx`: a
 * Sunday-start week of day cards, each tinted by day calories against
 * `GET /api/nutrition/goals`, with breakfast + planned + revealed slots in
 * meal order, an optimistic Remove per planned row, `+` on a slot opening
 * `FoodSearchSheet` (`basketMode={false}`) whose pick opens `PlanFoodSheet`
 * for that date and slot (then refetch), a `+ Add meal` control revealing a
 * tag from `/api/tags` defaults + userTags, and a grocery sheet aggregating
 * the week's items by `name|unit`.
 *
 * Data travels through `useFetch` + `apiFetch` against the same paths the
 * web reads (`GET /api/meal-plans?from=<sun>&to=<sat>`, keeping
 * `status === 'active'`; `GET /api/nutrition/goals`; `GET /api/tags`).
 * "View day-by-day timeline" pushes the nutrition timeline view.
 */

interface PickerTarget {
  dateKey: string;
  tag: string;
}

const TINT_TEST_IDS = {
  none: "meal-plan-tint-none",
  under: "meal-plan-tint-under",
  on: "meal-plan-tint-on",
  over: "meal-plan-tint-over",
} as const;

export default function MealPlanRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickedFood, setPickedFood] = useState<QuantityPickerFood | null>(null);
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Per-day meal slots the user has revealed beyond the default Breakfast (+
  // any slot that already has plans). Keyed by dateKey — the web's
  // `extraSlots` (page.tsx:67).
  const [extraSlots, setExtraSlots] = useState<Record<string, string[]>>({});
  const [addingSlotFor, setAddingSlotFor] = useState<string | null>(null);
  const [removedPlanIds, setRemovedPlanIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const range = useMemo(() => weekRangeKeys(weekStart), [weekStart]);
  const label = useMemo(() => weekLabel(weekStart), [weekStart]);
  const todayKey = useMemo(() => ymd(new Date()), []);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    }),
    [token],
  );

  const plansPath = `/api/meal-plans?from=${range.from}&to=${range.to}`;
  const {
    data: plansData,
    loading: plansLoading,
    refetch: refetchPlans,
  } = useFetch(plansPath, PlansResponseSchema, fetchOpts);
  const { data: goalsData } = useFetch(
    "/api/nutrition/goals",
    NutritionGoalsResponseSchema,
    fetchOpts,
  );
  const { data: tagsData } = useFetch("/api/tags", TagsResponseSchema, fetchOpts);

  const goalCal = Number(goalsData?.calories) || 0;
  const tagDefaults: string[] = tagsData?.defaults ?? [];
  const tagUserTags: string[] = tagsData?.userTags ?? [];

  const plans: MealPlan[] = useMemo(
    () => activePlans(plansData?.plans ?? []).filter((p) => !removedPlanIds.has(p._id)),
    [plansData, removedPlanIds],
  );
  const byDay = useMemo(() => groupPlansByDay(plans), [plans]);
  const grocery = useMemo(() => aggregateGrocery(plans), [plans]);

  // The week GET is keyed by the Sunday/Saturday range; a week change must
  // re-read even when the token is unchanged.
  useEffect(() => {
    if (token) {
      void refetchPlans();
    }
  }, [plansPath, token, refetchPlans]);

  const toggleChecked = useCallback((key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleRemovePlan = useCallback(
    async (planId: string) => {
      setRemovedPlanIds((prev) => new Set(prev).add(planId));
      try {
        await deleteMealPlan(planId, { token: token ?? undefined });
      } catch {
        setRemovedPlanIds((prev) => {
          const next = new Set(prev);
          next.delete(planId);
          return next;
        });
        setNotice("Could not remove");
      }
    },
    [token],
  );

  const handlePickFood = useCallback((food: Food) => {
    setPickedFood(food as QuantityPickerFood);
  }, []);

  const handlePlanned = useCallback(
    (toast: string) => {
      setPickedFood(null);
      setPicker(null);
      setNotice(toast);
      void refetchPlans();
    },
    [refetchPlans],
  );

  const closePlanFlow = useCallback(() => {
    setPickedFood(null);
    setPicker(null);
  }, []);

  const revealSlot = useCallback((dayKey: string, tag: string) => {
    setExtraSlots((prev) => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] ?? []), tag],
    }));
    setAddingSlotFor(null);
  }, []);

  const hideSlot = useCallback((dayKey: string, slot: string) => {
    setExtraSlots((prev) => ({
      ...prev,
      [dayKey]: (prev[dayKey] ?? []).filter((t) => t !== slot),
    }));
  }, []);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="meal-plan-route"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        testID="meal-plan-scroll"
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to nutrition"
            testID="meal-plan-back-button"
            onPress={() => router.back()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronLeft size={20} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text className="text-foreground text-2xl font-bold">Meal Plan</Text>
            <Text className="text-muted-foreground text-sm">
              Plan your week ahead, one slot at a time.
            </Text>
          </View>
        </View>

        {/* Week nav */}
        <View
          testID="meal-plan-week-nav"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 8,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            testID="meal-plan-prev-week"
            onPress={() => setWeekStart((w) => addDays(w, -7))}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ChevronLeft size={20} color={colors["muted-foreground"]} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="This week"
            testID="meal-plan-this-week"
            onPress={() => setWeekStart(startOfWeek(new Date()))}
          >
            <Text
              testID="meal-plan-week-label"
              className="text-foreground text-sm font-semibold"
            >
              {label}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next week"
            testID="meal-plan-next-week"
            onPress={() => setWeekStart((w) => addDays(w, 7))}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ChevronRight size={20} color={colors["muted-foreground"]} />
          </Pressable>
        </View>

        {/* Grocery list button */}
        <Button
          testID="meal-plan-grocery-button"
          accessibilityLabel={
            grocery.length > 0
              ? `Grocery list, ${grocery.length} items`
              : "Grocery list"
          }
          disabled={grocery.length === 0}
          onPress={() => setGroceryOpen(true)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ShoppingCart size={16} color={colors["primary-foreground"]} />
            <Text
              style={{ color: colors["primary-foreground"] }}
              className="text-sm font-semibold"
            >
              Grocery list{grocery.length > 0 ? ` (${grocery.length})` : ""}
            </Text>
          </View>
        </Button>

        {notice ? (
          <Text
            testID="meal-plan-notice"
            className="text-muted-foreground text-center text-xs"
          >
            {notice}
          </Text>
        ) : null}

        {plansLoading && plans.length === 0 ? (
          <View
            testID="meal-plan-loading"
            style={{ alignItems: "center", paddingVertical: 64 }}
          >
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View testID="meal-plan-days" style={{ gap: 12 }}>
            {days.map((day) => {
              const dayKey = ymd(day);
              const dayPlans = byDay.get(dayKey) ?? [];
              const cals = Math.round(dayCalories(dayPlans));
              const tint = tintForCalories(cals, goalCal);
              const tintClass = TINT_BG_CLASSES[tint];
              const isToday = dayKey === todayKey;
              const slotList = slotsForDay(dayPlans, extraSlots[dayKey] ?? []);
              const addable = addableTags(slotList, tagDefaults, tagUserTags);
              return (
                <View
                  key={dayKey}
                  testID={`meal-plan-day-${dayKey}`}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                  style={isToday ? { borderColor: colors.foreground } : undefined}
                >
                  <View
                    testID={`${TINT_TEST_IDS[tint]}-${dayKey}`}
                    className={`flex-row items-center justify-between px-3 py-2 ${tintClass}`}
                  >
                    <Text className="text-foreground text-sm font-semibold">
                      {day.toLocaleDateString("en-US", { weekday: "short" })}{" "}
                      <Text className="text-muted-foreground">
                        {day.toLocaleDateString("en-US", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </Text>
                      {isToday ? " · Today" : ""}
                    </Text>
                    {cals > 0 ? (
                      <Text
                        testID={`meal-plan-day-cals-${dayKey}`}
                        className="text-muted-foreground text-xs font-medium"
                      >
                        {cals}
                        {goalCal > 0 ? ` / ${goalCal}` : ""} cal
                      </Text>
                    ) : null}
                  </View>
                  <View>
                    {slotList.map((slot) => {
                      const slotPlans = dayPlans.filter(
                        (p) => p.tag.toLowerCase() === slot,
                      );
                      const removableEmpty =
                        slot !== "breakfast" &&
                        slotPlans.length === 0 &&
                        (extraSlots[dayKey] ?? []).includes(slot);
                      return (
                        <View
                          key={slot}
                          testID={`meal-plan-slot-${dayKey}-${slot}`}
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                          }}
                        >
                          <Text
                            className="text-muted-foreground text-[11px] font-semibold uppercase"
                            style={{ width: 64, marginTop: 4 }}
                          >
                            {titleCaseSlot(slot)}
                          </Text>
                          <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                            {slotPlans.length === 0 ? (
                              <Text className="text-muted-foreground text-xs">
                                —
                              </Text>
                            ) : (
                              slotPlans.map((plan) => (
                                <View
                                  key={plan._id}
                                  testID={`meal-plan-row-${plan._id}`}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <Text
                                    testID={`meal-plan-row-title-${plan._id}`}
                                    className="text-foreground text-sm flex-1"
                                    numberOfLines={1}
                                  >
                                    {plan.mealName ||
                                      plan.items.map((i) => i.name).join(", ")}
                                  </Text>
                                  <Text className="text-muted-foreground text-xs">
                                    {Math.round(
                                      plan.expectedNutrition?.calories ?? 0,
                                    )}
                                  </Text>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Remove planned item"
                                    testID={`meal-plan-remove-${plan._id}`}
                                    onPress={() => void handleRemovePlan(plan._id)}
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 14,
                                      justifyContent: "center",
                                      alignItems: "center",
                                    }}
                                  >
                                    <X size={14} color={colors["muted-foreground"]} />
                                  </Pressable>
                                </View>
                              ))
                            )}
                          </View>
                          {removableEmpty ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Hide ${slot}`}
                              testID={`meal-plan-hide-slot-${dayKey}-${slot}`}
                              onPress={() => hideSlot(dayKey, slot)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <X size={16} color={colors["muted-foreground"]} />
                            </Pressable>
                          ) : null}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add to ${slot} on ${dayKey}`}
                            testID={`meal-plan-add-${dayKey}-${slot}`}
                            onPress={() =>
                              setPicker({ dateKey: dayKey, tag: slot })
                            }
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              justifyContent: "center",
                              alignItems: "center",
                              backgroundColor: colors.muted,
                            }}
                          >
                            <Plus size={16} color={colors.foreground} />
                          </Pressable>
                        </View>
                      );
                    })}

                    {/* Add another meal slot — driven by the meal-tag system. */}
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                      {addingSlotFor === dayKey ? (
                        <View
                          testID={`meal-plan-addable-${dayKey}`}
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          }}
                        >
                          {addable.length === 0 ? (
                            <Text className="text-muted-foreground text-xs">
                              All meals added
                            </Text>
                          ) : (
                            addable.map((t) => (
                              <Pressable
                                key={t}
                                accessibilityRole="button"
                                accessibilityLabel={`Add ${t} to ${dayKey}`}
                                testID={`meal-plan-add-tag-${dayKey}-${t}`}
                                onPress={() => revealSlot(dayKey, t)}
                                style={{
                                  borderRadius: 16,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  backgroundColor: colors.card,
                                  paddingHorizontal: 12,
                                  paddingVertical: 4,
                                }}
                              >
                                <Text className="text-foreground text-xs font-medium">
                                  {titleCaseSlot(t)}
                                </Text>
                              </Pressable>
                            ))
                          )}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Cancel adding meal"
                            testID={`meal-plan-add-cancel-${dayKey}`}
                            onPress={() => setAddingSlotFor(null)}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <X size={16} color={colors["muted-foreground"]} />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Add a meal to ${dayKey}`}
                          testID={`meal-plan-add-meal-${dayKey}`}
                          disabled={addable.length === 0}
                          onPress={() => setAddingSlotFor(dayKey)}
                          style={{
                            alignSelf: "center",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            borderRadius: 16,
                            backgroundColor: colors.muted,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            opacity: addable.length === 0 ? 0.4 : 1,
                          }}
                        >
                          <Plus size={14} color={colors["muted-foreground"]} />
                          <Text className="text-muted-foreground text-xs font-semibold">
                            Add meal
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Button
          testID="meal-plan-timeline-link"
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: "/(tabs)/nutrition",
              params: { view: "week" },
            } as never)
          }
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Clock size={16} color={colors.foreground} />
            <Text className="text-foreground text-sm font-medium">
              View day-by-day timeline
            </Text>
          </View>
        </Button>
      </ScrollView>

      {/* Grocery list — aggregated for the displayed week */}
      <BottomSheet
        visible={groceryOpen}
        onClose={() => setGroceryOpen(false)}
        title="Grocery list"
        testID="meal-plan-grocery-sheet"
        accessibilityLabel="Grocery list"
      >
        <Text
          testID="meal-plan-grocery-subtitle"
          className="text-muted-foreground text-xs mb-2"
        >
          {label} · {grocery.length} item{grocery.length === 1 ? "" : "s"}
        </Text>
        {grocery.length === 0 ? (
          <Text
            testID="meal-plan-grocery-empty"
            className="text-muted-foreground text-center text-sm py-10"
          >
            Nothing planned this week yet.
          </Text>
        ) : (
          <View style={{ gap: 2 }}>
            {grocery.map((g) => {
              const isChecked = checked.has(g.key);
              return (
                <Pressable
                  key={g.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={`${g.name}, ${formatGroceryQty(g.qty)} ${g.unit}`}
                  testID={`meal-plan-grocery-line-${g.key}`}
                  onPress={() => toggleChecked(g.key)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 8,
                  }}
                >
                  <View
                    testID={`meal-plan-grocery-check-${g.key}`}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: isChecked
                        ? colors.foreground
                        : colors["muted-foreground"],
                      backgroundColor: isChecked
                        ? colors.foreground
                        : "transparent",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {isChecked ? (
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "bold",
                          color: colors.background,
                        }}
                      >
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    className="text-foreground text-sm flex-1"
                    numberOfLines={1}
                    style={isChecked ? { textDecorationLine: "line-through" } : undefined}
                  >
                    {g.name}
                  </Text>
                  <Text
                    testID={`meal-plan-grocery-qty-${g.key}`}
                    className="text-muted-foreground text-xs"
                  >
                    {formatGroceryQty(g.qty)} {g.unit}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </BottomSheet>

      {/* Plan a food into the chosen day + slot (plan mode = no time picker) */}
      <FoodSearchSheet
        visible={picker !== null && pickedFood === null}
        onClose={() => setPicker(null)}
        currentTag={picker?.tag}
        basketMode={false}
        onPickFood={handlePickFood}
        testID="meal-plan-food-search"
      />
      <PlanFoodSheet
        visible={picker !== null && pickedFood !== null}
        food={pickedFood}
        plannedDate={picker?.dateKey ?? ""}
        tag={picker?.tag ?? "snack"}
        onClose={closePlanFlow}
        onPlanned={handlePlanned}
      />
    </SafeAreaView>
  );
}
