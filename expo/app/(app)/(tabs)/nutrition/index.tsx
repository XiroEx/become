import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  GestureResponderEvent,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  MoreVertical,
  Search,
  X,
} from "lucide-react-native";
import { z } from "zod";
import {
  GoalProgressResponseSchema,
  MealLogsDayResponseSchema,
  MealScheduleResponseSchema,
  NutritionGoalsResponseSchema,
  NutritionLogDayResponseSchema,
  TagsResponseSchema,
  apiFetch,
  type MealLog,
} from "@become/api-client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  localDateKey,
  useLocalDay,
  useOnForeground,
  withTz,
} from "@/lib/time/localDay";
import { buildDayOccurrences } from "@/lib/nutrition/dayOrder";
import {
  defaultTagAt,
  minutesOfDay,
  sortMinutesForTag,
  type TagWindow,
} from "@/lib/nutrition/mealSchedule";
import { nutritionGoalLine } from "@/lib/nutrition/goalLine";
import { isFutureLocalDate } from "@/lib/nutrition/mealPlanDates";
import { CalorieRing } from "@/components/nutrition/CalorieRing";
import { DateNav } from "@/components/nutrition/DateNav";
import { TagSection } from "@/components/nutrition/TagSection";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

const EMPTY_PLANS: any[] = [];
const OCCURRENCE_OPTS = { includePlans: false } as const;
const EMPTY_LOGS: MealLog[] = [];

export default function NutritionIndexRoute() {
  const { colors, scrim } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ date?: string }>();

  // Device-local day and timezone offset (NP-035).
  // Automatically rolls over on local midnight timer or app foregrounding.
  const { day: today, tzOffset } = useLocalDay();

  // If params.date is provided (e.g. deep link or push), use it.
  // When no route param is provided, viewingDate follows `today` dynamically.
  const [explicitDate, setExplicitDate] = useState<string | null>(() => {
    return params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : null;
  });

  useEffect(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from route param
      setExplicitDate(params.date);
    }
  }, [params.date]);

  const activeDate = explicitDate ?? today;
  const isToday = activeDate === today;

  const [y, m, d] = activeDate.split("-").map(Number);
  const activeDateObj = useMemo(
    () => new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0),
    [y, m, d],
  );
  const isFuture = isFutureLocalDate(activeDateObj);

  // ── Fetchers ───────────────────────────────────────────────────────────────

  // 1. GET /api/meal-logs?date=YYYY-MM-DD&tz=<minutes>
  const mealLogsPath = withTz(`/api/meal-logs?date=${activeDate}`, tzOffset);
  const {
    data: mealLogsData,
    refetch: refetchMealLogs,
  } = useFetch(mealLogsPath, MealLogsDayResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  // 2. GET /api/nutrition/log?date=YYYY-MM-DD&tz=<minutes> for water and quick adds
  const sideTablesPath = withTz(`/api/nutrition/log?date=${activeDate}`, tzOffset);
  const {
    data: sideTablesData,
    refetch: refetchSideTables,
  } = useFetch(sideTablesPath, NutritionLogDayResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  // 3. GET /api/tags
  useFetch("/api/tags", TagsResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  // 4. GET /api/nutrition/meal-schedule
  const { data: scheduleData } = useFetch(
    "/api/nutrition/meal-schedule",
    MealScheduleResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  // 5. GET /api/nutrition/goals
  const { data: goalsData } = useFetch(
    "/api/nutrition/goals",
    NutritionGoalsResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  // 6. GET /api/goals?tz=<minutes>
  const goalsWeightPath = withTz("/api/goals", tzOffset);
  const { data: goalsWeightData } = useFetch(
    goalsWeightPath,
    GoalProgressResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  useOnForeground(() => {
    void refetchMealLogs();
    void refetchSideTables();
  });

  // ── Optimistic item deletion ──────────────────────────────────────────────
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(new Set());

  const displayedLogs = useMemo(() => {
    const rawLogs = (mealLogsData?.logs ?? []) as MealLog[];
    if (removedItemIds.size === 0) return rawLogs;
    return rawLogs
      .map((log) => {
        const filteredItems = (log.items ?? []).filter((item) => {
          const id = String(item._id ?? item.id ?? "");
          return !removedItemIds.has(id);
        });
        return {
          ...log,
          items: filteredItems,
        };
      })
      .filter((log) => (log.items ?? []).length > 0);
  }, [mealLogsData?.logs, removedItemIds]);

  const handleRemoveItem = useCallback(
    async (logId: string, itemId: string) => {
      setRemovedItemIds((prev) => new Set(prev).add(itemId));
      try {
        await apiFetch(
          `/api/meal-logs/${encodeURIComponent(logId)}/items/${encodeURIComponent(itemId)}`,
          z.any(),
          {
            method: "DELETE",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await refetchMealLogs();
      } catch {
        // Revert on error
        setRemovedItemIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [refetchMealLogs, token],
  );

  // ── Session Tags (add-a-tag behaviour) ────────────────────────────────────
  const [sessionTags, setSessionTags] = useState<string[]>([]);
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  const rawWindows = scheduleData?.windows;
  const scheduleWindows: TagWindow[] = useMemo(() => {
    if (!Array.isArray(rawWindows)) return [];
    return rawWindows.map((w) => ({
      tag: w.tag,
      startMinutes: w.startMinutes ?? null,
      endMinutes: w.endMinutes ?? null,
    }));
  }, [rawWindows]);

  // Occurrences ordered with vendored buildDayOccurrences
  const occurrences = useMemo(() => {
    return buildDayOccurrences(
      displayedLogs,
      EMPTY_PLANS,
      scheduleWindows,
      OCCURRENCE_OPTS,
    );
  }, [displayedLogs, scheduleWindows]);

  const sections = useMemo(() => {
    const withContent = occurrences.map((o) => ({ ...o, empty: false }));
    const used = new Set(withContent.map((o) => o.tag.toLowerCase()));
    const empties = sessionTags
      .map((t) => t.toLowerCase())
      .filter((t) => !used.has(t))
      .map((tag) => ({
        key: `empty:${tag}`,
        tag,
        sortMinutes: sortMinutesForTag(scheduleWindows, tag),
        logs: EMPTY_LOGS,
        plans: EMPTY_PLANS,
        planned: false,
        untimed: false,
        empty: true,
      }));
    return [...withContent, ...empties].sort((a, b) => {
      if (a.sortMinutes !== b.sortMinutes) return a.sortMinutes - b.sortMinutes;
      if (a.planned !== b.planned) return a.planned ? 1 : -1;
      return 0;
    });
  }, [occurrences, sessionTags, scheduleWindows]);

  const handleRemoveTag = (tag: string) => {
    setSessionTags((prev) => prev.filter((t) => t !== tag));
  };

  // ── Totals & Goal Line ────────────────────────────────────────────────────
  const quickAdds = Array.isArray(sideTablesData?.quickAdds)
    ? sideTablesData.quickAdds
    : [];

  const quickAddCalories = quickAdds.reduce(
    (sum, qa) => sum + (qa.calories || 0),
    0,
  );
  const quickAddProtein = quickAdds.reduce(
    (sum, qa) => sum + (qa.protein || 0),
    0,
  );
  const quickAddCarbs = quickAdds.reduce(
    (sum, qa) => sum + (qa.carbs || 0),
    0,
  );
  const quickAddFats = quickAdds.reduce(
    (sum, qa) => sum + (qa.fats || 0),
    0,
  );

  const activeDailyTotals = useMemo(() => {
    const serverTotals = mealLogsData?.dailyTotals ?? {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
    };
    if (removedItemIds.size === 0) return serverTotals;
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fats = 0;
    let fiber = 0;
    for (const log of displayedLogs) {
      for (const item of log.items ?? []) {
        const s = typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
        const n = item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
        calories += (n.calories ?? 0) * s;
        protein += (n.protein ?? 0) * s;
        carbs += (n.carbs ?? 0) * s;
        fats += (n.fats ?? 0) * s;
        fiber += (n.fiber ?? 0) * s;
      }
    }
    return { calories, protein, carbs, fats, fiber };
  }, [displayedLogs, removedItemIds.size, mealLogsData?.dailyTotals]);

  // Ring totals = daily totals + quick adds
  const consumedCalories = Math.max(
    0,
    Math.round(activeDailyTotals.calories + quickAddCalories),
  );
  const totalProtein = Math.max(
    0,
    Math.round(activeDailyTotals.protein + quickAddProtein),
  );
  const totalCarbs = Math.max(
    0,
    Math.round(activeDailyTotals.carbs + quickAddCarbs),
  );
  const totalFats = Math.max(
    0,
    Math.round(activeDailyTotals.fats + quickAddFats),
  );
  const totalFiber = Math.max(0, Math.round(activeDailyTotals.fiber ?? 0));

  const goalCalories = goalsData?.calories ?? 2000;
  const goalProtein = goalsData?.protein ?? 150;
  const goalCarbs = goalsData?.carbs ?? 200;
  const goalFats = goalsData?.fats ?? 65;

  const goalWeight = useMemo(() => {
    const n = goalsWeightData?.nutrition;
    if (!n) return null;
    return {
      weight: n.target?.weight ?? null,
      unit: n.unit === "kg" ? ("kg" as const) : ("lbs" as const),
      direction: n.direction ?? null,
      paceStatus: n.pace?.status ?? null,
    };
  }, [goalsWeightData]);

  const goalLineText = useMemo(() => {
    return nutritionGoalLine({
      calories: goalCalories,
      targetWeight: goalWeight?.weight ?? null,
      unit: goalWeight?.unit ?? "lbs",
      direction: goalWeight?.direction ?? null,
      paceStatus: goalWeight?.paceStatus ?? null,
    });
  }, [goalCalories, goalWeight]);

  // ── Default Tag ───────────────────────────────────────────────────────────
  const currentDefaultTag = useMemo(() => {
    return defaultTagAt(scheduleWindows, minutesOfDay(new Date()));
  }, [scheduleWindows]);

  // ── Navigation & Swipe ────────────────────────────────────────────────────
  const shiftDay = (delta: number) => {
    const dt = new Date(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + delta, 12, 0, 0);
    const nextKey = localDateKey(dt);
    setExplicitDate(nextKey === today ? null : nextKey);
  };

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: GestureResponderEvent) => {
    touchStartX.current = e.nativeEvent?.pageX ?? null;
    touchStartY.current = e.nativeEvent?.pageY ?? null;
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const endX = e.nativeEvent?.pageX ?? touchStartX.current;
    const endY = e.nativeEvent?.pageY ?? touchStartY.current;
    const dx = endX - touchStartX.current;
    const dy = endY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) {
      shiftDay(1); // Swipe left -> next day
    } else {
      shiftDay(-1); // Swipe right -> prev day
    }
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTag, setSearchTag] = useState<string | undefined>(undefined);

  const openSearch = (tagToUse?: string) => {
    setSearchTag(tagToUse ?? currentDefaultTag);
    setSearchOpen(true);
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="nutrition-index-route"
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <Text className="text-foreground text-2xl font-bold">Nutrition</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            testID="nutrition-menu-button"
            accessibilityLabel="Nutrition menu"
            accessibilityRole="button"
            onPress={() => setMenuOpen((o) => !o)}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MoreVertical size={20} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Date Navigation & Swipe Container */}
      <View
        style={{ flex: 1 }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        >
          {/* Search bar */}
          <Pressable
            testID="nutrition-search-bar"
            accessibilityRole="button"
            accessibilityLabel="Search foods"
            onPress={() => openSearch()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Search size={16} color={colors["muted-foreground"]} />
            <Text className="text-muted-foreground text-sm ml-2.5">
              Search foods…
            </Text>
          </Pressable>

          {/* Date Navigator */}
          <DateNav
            dateKey={activeDate}
            isToday={isToday}
            onPrev={() => shiftDay(-1)}
            onNext={() => shiftDay(1)}
            onToday={() => setExplicitDate(null)}
          />

          {/* Calorie Ring & Macro Bars */}
          <CalorieRing
            consumed={consumedCalories}
            goal={goalCalories}
            protein={{ current: totalProtein, goal: goalProtein }}
            carbs={{ current: totalCarbs, goal: goalCarbs }}
            fats={{ current: totalFats, goal: goalFats }}
            fiber={totalFiber}
            goalLine={goalLineText}
          />

          {/* Quick Adds (only on today / past dates; disabled on future dates) */}
          {quickAdds.length > 0 ? (
            <Card testID="nutrition-quick-adds-section">
              <Text className="text-foreground text-lg font-bold mb-2">
                Quick Adds
              </Text>
              {quickAdds.map((qa, idx) => (
                <View
                  key={qa.id ?? `qa-${idx}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 6,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text className="text-foreground text-sm font-medium">
                    {qa.note ? qa.note : "Quick Add"}
                  </Text>
                  <Text className="text-muted-foreground text-xs font-medium">
                    {Math.round(qa.calories)} kcal
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}

          {/* Water Tracker */}
          {sideTablesData?.water ? (
            <Card testID="nutrition-water-section">
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text className="text-foreground text-base font-bold">
                    Water
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {sideTablesData.water.current ?? 0} /{" "}
                    {sideTablesData.water.goal ?? 96} oz
                  </Text>
                </View>
                <Button
                  variant="ghost"
                  size="sm"
                  testID="nutrition-add-water-button"
                  onPress={async () => {
                    try {
                      await apiFetch(
                        withTz("/api/nutrition/water", tzOffset),
                        z.any(),
                        {
                          method: "POST",
                          body: { amount: 8, date: activeDate, tz: tzOffset },
                          baseUrl: WEBAPP_BASE_URL,
                          getToken: () => token ?? undefined,
                        },
                      );
                      void refetchSideTables();
                    } catch {}
                  }}
                >
                  +8 oz
                </Button>
              </View>
            </Card>
          ) : null}

          {/* Occurrence / Tag Sections */}
          {sections.map((section) => (
            <TagSection
              key={section.key}
              occurrence={section}
              empty={section.empty}
              removable={section.empty && sessionTags.includes(section.tag)}
              onRemoveItem={handleRemoveItem}
              onRemoveTag={handleRemoveTag}
              onAddFood={openSearch}
            />
          ))}

          {/* Empty State when nothing logged */}
          {sections.length === 0 && quickAdds.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <Text className="text-muted-foreground text-base mb-4">
                {isFuture ? "Nothing planned yet" : "No foods logged yet"}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={{ gap: 10, marginTop: 8 }}>
            <Button
              testID="nutrition-find-food"
              onPress={() => openSearch()}
            >
              Find a food
            </Button>
            <Button
              testID="nutrition-add-tag-button"
              variant="ghost"
              onPress={() => setAddTagOpen(true)}
            >
              + Add a tag
            </Button>
          </View>
        </ScrollView>
      </View>

      {/* Screen Menu (NP-012: only offers screens that exist natively) */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
          onPress={() => setMenuOpen(false)}
        >
          <View
            testID="nutrition-menu-modal"
            style={{
              backgroundColor: colors.background,
              borderRadius: 16,
              padding: 20,
              width: "100%",
              maxWidth: 320,
              gap: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text className="text-foreground text-lg font-bold">Nutrition</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                onPress={() => setMenuOpen(false)}
              >
                <X size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <Button
              testID="nutrition-menu-search"
              variant="ghost"
              onPress={() => {
                setMenuOpen(false);
                openSearch();
              }}
            >
              Find a food
            </Button>
            <Button
              testID="nutrition-menu-recipes"
              variant="ghost"
              onPress={() => {
                setMenuOpen(false);
                router.push("/(tabs)/nutrition/recipes");
              }}
            >
              Recipes
            </Button>
            <Button
              testID="nutrition-menu-meal-schedule"
              variant="ghost"
              onPress={() => {
                setMenuOpen(false);
                router.push("/(tabs)/nutrition/meal-schedule");
              }}
            >
              Meal Schedule
            </Button>
          </View>
        </Pressable>
      </Modal>

      {/* Add Tag Modal */}
      <Modal
        visible={addTagOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddTagOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close add tag modal backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
          onPress={() => setAddTagOpen(false)}
        >
          <View
            testID="nutrition-add-tag-modal"
            style={{
              backgroundColor: colors.background,
              borderRadius: 16,
              padding: 20,
              width: "100%",
              maxWidth: 320,
              gap: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text className="text-foreground text-lg font-bold">
                Add Tag Section
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close add tag modal"
                onPress={() => setAddTagOpen(false)}
              >
                <X size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <Input
              testID="nutrition-add-tag-input"
              placeholder="e.g. Pre-workout, Shake"
              value={newTagInput}
              onChangeText={setNewTagInput}
            />
            <Button
              testID="nutrition-add-tag-submit"
              onPress={() => {
                const norm = newTagInput.trim().toLowerCase();
                if (norm && !sessionTags.includes(norm)) {
                  setSessionTags((prev) => [...prev, norm]);
                }
                setNewTagInput("");
                setAddTagOpen(false);
              }}
            >
              Add Tag
            </Button>
          </View>
        </Pressable>
      </Modal>

      {/* Food Search Sheet (NP-092) */}
      <FoodSearchSheet
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentTag={searchTag}
        activeDate={activeDate}
      />
    </SafeAreaView>
  );
}
