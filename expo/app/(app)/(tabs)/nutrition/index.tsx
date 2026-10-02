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
  Camera,
  ChefHat,
  ChevronDown,
  Clock,
  History,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  Zap,
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
import { WaterTracker } from "@/components/nutrition/WaterTracker";
import { QuickAddSheet, type QuickAddData } from "@/components/nutrition/QuickAddSheet";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

const EMPTY_PLANS: any[] = [];
const OCCURRENCE_OPTS = { includePlans: false } as const;
const EMPTY_LOGS: MealLog[] = [];

export default function NutritionIndexRoute() {
  const { colors, scrim, tint } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ date?: string; quickAdd?: string }>();

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
  const [timelineMenuOpen, setTimelineMenuOpen] = useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTag, setSearchTag] = useState<string | undefined>(undefined);
  const [copyingYesterday, setCopyingYesterday] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(
    () => params.quickAdd === "true",
  );

  useEffect(() => {
    if (params.quickAdd === "true") {
      // Sync quickAdd query param from route when navigating from dashboard
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuickAddOpen(true);
    }
  }, [params.quickAdd]);
  const [submittingQuickAdd, setSubmittingQuickAdd] = useState(false);

  const handleEditGoals = useCallback(() => {
    // TODO(NP-148): Nutrition goals editor screen (/dashboard/nutrition/goals) is NP-148.
    router.push("/(tabs)/nutrition/goals" as any);
  }, [router]);

  const copyYesterday = useCallback(async () => {
    if (copyingYesterday) return;
    setCopyingYesterday(true);
    try {
      const yest = new Date(activeDateObj);
      yest.setDate(yest.getDate() - 1);
      const yestKey = localDateKey(yest);
      const res = await apiFetch(
        withTz(`/api/meal-logs?date=${yestKey}`, tzOffset),
        MealLogsDayResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      );
      const logs = (res?.logs ?? []).filter((l) => (l.items?.length ?? 0) > 0);
      if (logs.length === 0) {
        return;
      }
      const base = new Date(activeDateObj);
      base.setHours(12, 0, 0, 0);
      let i = 0;
      for (const log of logs) {
        await apiFetch(
          withTz("/api/meal-logs", tzOffset),
          z.any(),
          {
            method: "POST",
            body: {
              items: log.items,
              tags: log.tags ?? [],
              loggedAt: new Date(base.getTime() + i * 60_000).toISOString(),
            },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        i++;
      }
      await invalidateMindSession();
      await Promise.all([refetchMealLogs(), refetchSideTables()]);
    } catch {
      // ignore
    } finally {
      setCopyingYesterday(false);
    }
  }, [activeDateObj, copyingYesterday, refetchMealLogs, refetchSideTables, tzOffset, token]);

  const handleAddWater = useCallback(
    async (amount: number) => {
      try {
        await apiFetch(
          withTz("/api/nutrition/water", tzOffset),
          z.any(),
          {
            method: "POST",
            body: { amount, date: activeDate, tz: tzOffset },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await refetchSideTables();
      } catch (err) {
        console.error("Failed to add water:", err);
      }
    },
    [activeDate, tzOffset, token, refetchSideTables],
  );

  const handleQuickAdd = useCallback(
    async (data: QuickAddData) => {
      if (isFuture) return;
      setSubmittingQuickAdd(true);
      try {
        await apiFetch(
          withTz("/api/nutrition/quick-add", tzOffset),
          z.any(),
          {
            method: "POST",
            body: {
              calories: data.calories,
              protein: data.protein ?? 0,
              carbs: data.carbs ?? 0,
              fats: data.fats ?? 0,
              note: data.note,
              date: activeDate,
              tz: tzOffset,
            },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await invalidateMindSession();
        await refetchSideTables();
      } catch (err) {
        console.error("Failed to quick add:", err);
      } finally {
        setSubmittingQuickAdd(false);
        setQuickAddOpen(false);
      }
    },
    [activeDate, isFuture, tzOffset, token, refetchSideTables],
  );

  const handleDeleteQuickAdd = useCallback(
    async (quickAddId: string) => {
      try {
        await apiFetch(
          withTz("/api/nutrition/quick-add", tzOffset),
          z.any(),
          {
            method: "DELETE",
            body: { quickAddId, date: activeDate, tz: tzOffset },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await refetchSideTables();
      } catch (err) {
        console.error("Failed to delete quick add:", err);
      }
    },
    [activeDate, tzOffset, token, refetchSideTables],
  );

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
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text className="text-foreground text-2xl font-bold">Nutrition</Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
            Track your food, macros, and hydration
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {/* My Stuff header action */}
          <Pressable
            testID="nutrition-my-stuff-button"
            accessibilityRole="button"
            accessibilityLabel="My Stuff"
            onPress={() => {
              // TODO(NP-142): My Stuff (meals, recipes, saved foods tabs) is NP-142. Currently wired to existing recipes screen.
              router.push("/(tabs)/nutrition/recipes");
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <ChefHat size={16} color={colors.foreground} />
            <Text className="text-xs font-semibold text-foreground">My Stuff</Text>
          </Pressable>

          {/* Timeline toggle header action */}
          <Pressable
            testID="nutrition-timeline-button"
            accessibilityRole="button"
            accessibilityLabel="Timeline"
            onPress={() => setTimelineMenuOpen((o) => !o)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <Clock size={16} color={colors.foreground} />
            <Text className="text-xs font-semibold text-foreground">Timeline</Text>
            <ChevronDown size={14} color={colors["muted-foreground"]} />
          </Pressable>

          {/* Kebab Menu */}
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
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 80 }}
        >
          {/* Search row: input + camera + upload */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              testID="nutrition-search-bar"
              accessibilityRole="button"
              accessibilityLabel="Search foods"
              onPress={() => openSearch()}
              style={{
                flex: 1,
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

            {/* Camera button (photo log) */}
            <Pressable
              testID="nutrition-camera-button"
              accessibilityRole="button"
              accessibilityLabel="Camera options"
              onPress={() => setCameraMenuOpen((o) => !o)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Camera size={18} color={colors.foreground} />
            </Pressable>

            {/* Upload button */}
            <Pressable
              testID="nutrition-upload-button"
              accessibilityRole="button"
              accessibilityLabel="Upload options"
              onPress={() => setUploadMenuOpen((o) => !o)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Upload size={18} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Date Navigator */}
          <DateNav
            dateKey={activeDate}
            isToday={isToday}
            onPrev={() => shiftDay(-1)}
            onNext={() => shiftDay(1)}
            onToday={() => setExplicitDate(null)}
            onSelectDate={(newDateKey) => setExplicitDate(newDateKey)}
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
            onEditGoals={handleEditGoals}
          />

          {/* Quick Adds (visible entries with delete) */}
          {quickAdds.length > 0 ? (
            <Card testID="nutrition-quick-adds-section">
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: tint("accent", 0.15),
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Zap size={15} color={colors.accent} />
                  </View>
                  <Text className="text-foreground text-sm font-semibold">
                    Quick Adds
                  </Text>
                </View>
                <Text className="text-muted-foreground text-xs font-medium tabular-nums">
                  {quickAddCalories} cal
                </Text>
              </View>
              <View>
                {quickAdds.map((qa, idx) => (
                  <View
                    key={qa.id ?? `qa-${idx}`}
                    testID={`nutrition-quick-add-item-${qa.id}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      {qa.note ? (
                        <Text
                          className="text-foreground text-sm font-medium"
                          numberOfLines={1}
                        >
                          {qa.note}
                        </Text>
                      ) : (
                        <Text className="text-foreground text-sm font-medium">
                          Quick Add
                        </Text>
                      )}
                      <Text className="text-muted-foreground text-xs font-medium tabular-nums">
                        {qa.calories} cal
                        {((qa.protein ?? 0) > 0 ||
                          (qa.carbs ?? 0) > 0 ||
                          (qa.fats ?? 0) > 0) && (
                          <Text className="text-muted-foreground text-xs">
                            {` · P ${qa.protein ?? 0}g · C ${qa.carbs ?? 0}g · F ${qa.fats ?? 0}g`}
                          </Text>
                        )}
                      </Text>
                    </View>
                    <Pressable
                      testID={`nutrition-delete-quick-add-${qa.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete quick add ${qa.note ?? `${qa.calories} cal`}`}
                      hitSlop={8}
                      onPress={() => handleDeleteQuickAdd(qa.id)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Trash2 size={16} color={colors.destructive} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {/* Water Tracker */}
          <WaterTracker
            current={sideTablesData?.water?.current ?? 0}
            goal={sideTablesData?.water?.goal ?? goalsData?.waterGoal ?? 96}
            onAddWater={handleAddWater}
          />

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
            <Card testID="nutrition-empty-state">
              <View style={{ alignItems: "center", paddingVertical: 12, gap: 12 }}>
                <Text className="text-foreground text-lg font-bold text-center">
                  {isFuture ? "Nothing planned yet" : "Nothing logged yet"}
                </Text>
                <Text className="text-muted-foreground text-sm text-center px-4">
                  {isFuture
                    ? "Plan ahead — schedule meals for this day so they're ready when it arrives."
                    : "Add your first food of the day to start tracking."}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  {!isFuture && (
                    <>
                      <Button
                        testID="nutrition-empty-add-food"
                        size="sm"
                        onPress={() => openSearch()}
                      >
                        Add food
                      </Button>
                      <Button
                        testID="nutrition-empty-quick-add"
                        variant="secondary"
                        size="sm"
                        onPress={() => setQuickAddOpen(true)}
                      >
                        Quick Add
                      </Button>
                      <Button
                        testID="nutrition-copy-yesterday"
                        variant="secondary"
                        size="sm"
                        disabled={copyingYesterday}
                        onPress={copyYesterday}
                      >
                        {copyingYesterday ? "Copying…" : "Copy yesterday"}
                      </Button>
                    </>
                  )}
                  <Button
                    testID="nutrition-empty-browse-my-stuff"
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push("/(tabs)/nutrition/recipes")}
                  >
                    Browse My Stuff
                  </Button>
                </View>
              </View>
            </Card>
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
              testID="nutrition-quick-add-button"
              variant="secondary"
              disabled={isFuture}
              onPress={() => {
                if (!isFuture) setQuickAddOpen(true);
              }}
            >
              Quick Add
            </Button>
            {!isFuture && (
              <Button
                testID="nutrition-action-copy-yesterday"
                variant="secondary"
                disabled={copyingYesterday}
                onPress={copyYesterday}
              >
                {copyingYesterday ? "Copying…" : "Copy yesterday"}
              </Button>
            )}
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
              testID="nutrition-menu-sheet"
              style={{
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
          </View>
        </Pressable>
      </Modal>

      {/* Timeline Dropdown Menu */}
      <Modal
        visible={timelineMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTimelineMenuOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close timeline menu backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "flex-start",
            alignItems: "flex-end",
            paddingTop: 60,
            paddingRight: 16,
          }}
          onPress={() => setTimelineMenuOpen(false)}
        >
          <Pressable
            testID="nutrition-timeline-menu"
            accessibilityRole="none"
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              minWidth: 180,
              overflow: "hidden",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Pressable
              testID="nutrition-timeline-item"
              accessibilityRole="button"
              accessibilityLabel="Timeline"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
              onPress={() => {
                setTimelineMenuOpen(false);
                // TODO(NP-177): Eating timeline (day, week and month views) is NP-177.
                router.push("/(tabs)/calendar");
              }}
            >
              <Clock size={16} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground">Timeline</Text>
            </Pressable>
            <Pressable
              testID="nutrition-timeline-meal-schedule"
              accessibilityRole="button"
              accessibilityLabel="Meal Schedule"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
              onPress={() => {
                setTimelineMenuOpen(false);
                router.push("/(tabs)/nutrition/meal-schedule");
              }}
            >
              <Clock size={16} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground">Meal Schedule</Text>
            </Pressable>
            <Pressable
              testID="nutrition-timeline-scans"
              accessibilityRole="button"
              accessibilityLabel="Estimate history"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
              onPress={() => {
                setTimelineMenuOpen(false);
                // TODO(NP-140): Estimate history (/dashboard/nutrition/scans) is NP-140.
                router.push("/(tabs)/nutrition/recipes");
              }}
            >
              <History size={16} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground">Estimate history</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Camera Options Modal */}
      <Modal
        visible={cameraMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCameraMenuOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close camera menu backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
          onPress={() => setCameraMenuOpen(false)}
        >
          <Pressable
            testID="nutrition-camera-menu"
            accessibilityRole="none"
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 20,
              width: "100%",
              maxWidth: 300,
              gap: 10,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-foreground text-base font-bold mb-1">
              Camera options
            </Text>
            <Button
              testID="nutrition-camera-take-photo"
              variant="secondary"
              onPress={() => {
                setCameraMenuOpen(false);
                // TODO(NP-060, NP-089): AI meal photo capture & estimation flow is NP-060/NP-089.
                router.push("/(tabs)/nutrition/recipes");
              }}
            >
              Take photo
            </Button>
            <Button
              testID="nutrition-camera-scan-barcode"
              variant="secondary"
              onPress={() => {
                setCameraMenuOpen(false);
                // TODO(NP-059, NP-088): Barcode scanner is NP-059/NP-088.
                openSearch();
              }}
            >
              Scan barcode
            </Button>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Upload Options Modal */}
      <Modal
        visible={uploadMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUploadMenuOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close upload menu backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
          onPress={() => setUploadMenuOpen(false)}
        >
          <Pressable
            testID="nutrition-upload-menu"
            accessibilityRole="none"
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 20,
              width: "100%",
              maxWidth: 300,
              gap: 10,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-foreground text-base font-bold mb-1">
              Upload options
            </Text>
            <Button
              testID="nutrition-upload-photo"
              variant="secondary"
              onPress={() => {
                setUploadMenuOpen(false);
                // TODO(NP-059): Photo upload and blob intake is NP-059.
                router.push("/(tabs)/nutrition/recipes");
              }}
            >
              Upload photo
            </Button>
            <Button
              testID="nutrition-upload-describe"
              variant="secondary"
              onPress={() => {
                setUploadMenuOpen(false);
                // TODO(NP-089): Describe meal estimation flow is NP-089.
                openSearch();
              }}
            >
              Describe
            </Button>
          </Pressable>
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

      {/* Quick Add Sheet */}
      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSubmit={handleQuickAdd}
        loading={submittingQuickAdd}
      />

      {/* Floating Add Food Button (FAB) */}
      <Pressable
        testID="nutrition-fab-add"
        accessibilityRole="button"
        accessibilityLabel={isFuture ? "Schedule food" : "Add food"}
        onPress={() => openSearch()}
        style={{
          position: "absolute",
          bottom: 24,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.foreground,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.foreground,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 6,
          zIndex: 40,
        }}
      >
        <Plus size={28} color={colors.background} />
      </Pressable>
    </SafeAreaView>
  );
}
