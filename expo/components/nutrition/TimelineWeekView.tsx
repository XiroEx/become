import { useCallback, useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CopyPlus,
  ChefHat,
  Tag as TagIcon,
  Plus,
  Clock,
  Pencil,
  Trash2,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useLocalDay, withTz } from "@/lib/time/localDay";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  MealLogsRangeResponseSchema,
  TagsResponseSchema,
  type MealLogsRangeResponse,
  type MealLog,
  type TagsResponse,
} from "@become/api-client";
import {
  PlansResponseSchema,
  type MealPlan,
  type PlansResponse,
} from "@/lib/nutrition/mealPlans";
import {
  getWeekDaysRange,
  parseDateKey,
  toDateKey,
  isSameLocalDay,
} from "@/lib/nutrition/calendarDays";
import { weeklyChartBarHeightPct } from "@/lib/nutrition/weekChart";
import { titleCaseTag } from "@/lib/nutrition/mealPlanApi";
import {
  tagChipColors,
  tagAccentBorderClass,
  primaryLogTag,
  formatLogTime,
} from "@/lib/nutrition/timelinePlanning";
import { NutritionPlanCard, type MealPlanItem } from "@/components/nutrition/NutritionPlanCard";
import { CopyDaySheet } from "@/components/nutrition/CopyDaySheet";
import { ApplyMealSheet } from "@/components/nutrition/ApplyMealSheet";

/**
 * ─── Week-view plan tools, tag filter and schedule CTA (NP-260) ─────────────
 *
 * Ports the four actions the web's Week view
 * (`webapp/app/dashboard/timeline/page.tsx:1071-1169`) surfaces above the
 * stats that this screen was missing:
 *
 * - "Copy a day" / "Meal → days" — the same `CopyDaySheet` / `ApplyMealSheet`
 *   NP-177 already ported, now reused here (self-contained: this screen owns
 *   their open/close state and refetches logs + plans on `onApplied`, same
 *   as the web's `fetchData()` after a bulk op).
 * - "Filter by tag" — a collapsible chip row over `GET /api/tags` defaults +
 *   userTags (the web's `allFilterTags`); toggling a chip filters each day's
 *   logs AND recomputes that day's totals from the filtered set, exactly
 *   like the web's `matchesFilter` / `filteredDays`.
 * - "Schedule meals for this week" — the web opens `ScheduleMealsDrawer`;
 *   native has no such drawer, so this routes to the native week planner at
 *   `/(tabs)/nutrition/meal-plan` (the native port of `/dashboard/meal-plan`,
 *   which is where `CopyDaySheet` / `ApplyMealSheet` already live for the
 *   day-view's future-day tools). Shown only when the visible week contains
 *   today or a future day (the web's `weekHasFuture`).
 *
 * The per-day row's trailing control is restyled from a text "Open" button
 * to a solid square `+`, matching the web's `WeekDayGroup` add button
 * (`page.tsx:2013-2021`). It still opens the full Day view (`onOpenDay`) —
 * the day screen is where the add-food / quick-add / schedule-meals surfaces
 * actually live — rather than reopening its own sheet, but it now LOOKS and
 * reads like "add", not "open", on every row (including empty days).
 */

export interface TimelineWeekViewProps {
  selectedDate: string; // YYYY-MM-DD
  calorieGoal?: number;
  onOpenDay: (dateKey: string) => void;
  onLogPlan?: (planId: string) => void;
  onSkipPlan?: (planId: string) => void;
  onRemovePlan?: (planId: string, scope?: "one" | "series") => void;
  onEditPlanItem?: (
    planId: string,
    item: MealPlanItem,
    planItems: MealPlanItem[],
  ) => void;
  /** Edit a logged item's quantity/unit. Falls back to opening the full Day
   *  view (where the edit sheet already lives) when not provided. */
  onEditItem?: (logId: string, item: MealLog["items"][number]) => void;
  /** Delete an entire logged meal. Falls back to opening the full Day view
   *  when not provided. */
  onDeleteLog?: (logId: string, mealName?: string) => void;
  testID?: string;
}

const DEFAULT_FILTER_TAGS = ["breakfast", "lunch", "dinner", "snack"];

export function TimelineWeekView({
  selectedDate,
  calorieGoal = 2000,
  onOpenDay,
  onLogPlan,
  onSkipPlan,
  onRemovePlan,
  onEditPlanItem,
  onEditItem,
  onDeleteLog,
  testID = "timeline-week-view",
}: TimelineWeekViewProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const { day: today, tzOffset } = useLocalDay();
  const router = useRouter();

  // Internal week reference date (defaults to selectedDate)
  const [weekRefDate, setWeekRefDate] = useState<string>(selectedDate);

  const refDateObj = useMemo(() => parseDateKey(weekRefDate), [weekRefDate]);
  const { from, to, fromStr, toStr, days: weekDateObjs } = useMemo(
    () => getWeekDaysRange(refDateObj),
    [refDateObj],
  );

  const shiftWeek = (deltaDays: number) => {
    const next = new Date(refDateObj);
    next.setDate(next.getDate() + deltaDays);
    setWeekRefDate(toDateKey(next));
  };

  // Fetch range data
  const logsPath = withTz(`/api/meal-logs?from=${fromStr}&to=${toStr}`, tzOffset);
  const { data: logsData, refetch: refetchLogs } = useFetch<MealLogsRangeResponse>(
    logsPath,
    MealLogsRangeResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const plansPath = `/api/meal-plans?from=${fromStr}&to=${toStr}`;
  const { data: plansData, refetch: refetchPlans } = useFetch<PlansResponse>(
    plansPath,
    PlansResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  // Tag choices for the filter row — `/api/tags` defaults + userTags, the
  // same source the web's `allFilterTags` reads (NP-260).
  const { data: tagsData } = useFetch<TagsResponse>(
    "/api/tags",
    TagsResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const allFilterTags = useMemo<string[]>(() => {
    const out: string[] = [
      ...(tagsData?.defaults?.length ? tagsData.defaults : DEFAULT_FILTER_TAGS),
    ];
    for (const t of tagsData?.userTags ?? []) {
      const norm = String(t).toLowerCase();
      if (!out.includes(norm)) out.push(norm);
    }
    return out;
  }, [tagsData]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const toggleFilter = useCallback((tag: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      const norm = tag.toLowerCase();
      if (next.has(norm)) next.delete(norm);
      else next.add(norm);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => setActiveFilters(new Set()), []);

  const matchesFilter = useCallback(
    (log: MealLog): boolean => {
      if (activeFilters.size === 0) return true;
      const tags = (log.tags ?? []).map((t) => String(t).toLowerCase());
      return tags.some((t) => activeFilters.has(t));
    },
    [activeFilters],
  );

  // Plan tools (NP-177 sheets, reused here) + Schedule-meals CTA state.
  const [copyDayOpen, setCopyDayOpen] = useState(false);
  const [applyMealOpen, setApplyMealOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleBulkApplied = useCallback(
    (toastText: string) => {
      setToast(toastText);
      void refetchLogs();
      void refetchPlans();
    },
    [refetchLogs, refetchPlans],
  );

  const activePlans = useMemo(() => {
    return (plansData?.plans ?? []).filter((p) => p.status === "active");
  }, [plansData?.plans]);

  // Build the 7 days buckets — logs filtered by the active tag set, totals
  // recomputed from the filtered set, exactly like the web's `filteredDays`.
  const days = useMemo(() => {
    const todayObj = parseDateKey(today);
    return weekDateObjs.map((dt) => {
      const dateKey = toDateKey(dt);
      const isCurrentDay = isSameLocalDay(dt, todayObj);
      const dayBucket = logsData?.days?.find((d) => d.date === dateKey);
      const rawLogs: MealLog[] = dayBucket?.logs ?? [];
      const dayLogs: MealLog[] =
        activeFilters.size === 0 ? rawLogs : rawLogs.filter(matchesFilter);
      let dailyTotals = dayBucket?.dailyTotals ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
      };
      if (activeFilters.size > 0) {
        const totals = dayLogs.reduce(
          (acc, log) => {
            const n = log.totalNutrition;
            return {
              calories: acc.calories + (n?.calories ?? 0),
              protein: acc.protein + (n?.protein ?? 0),
              carbs: acc.carbs + (n?.carbs ?? 0),
              fats: acc.fats + (n?.fats ?? 0),
            };
          },
          { calories: 0, protein: 0, carbs: 0, fats: 0 },
        );
        dailyTotals = {
          calories: Math.round(totals.calories),
          protein: Math.round(totals.protein),
          carbs: Math.round(totals.carbs),
          fats: Math.round(totals.fats),
        };
      }
      const dayPlans: MealPlan[] = activePlans.filter((p) => {
        const pKey = p.plannedDateKey ?? p.plannedDate?.split("T")[0];
        return pKey === dateKey;
      });
      const calories = Math.round(dailyTotals.calories || 0);

      return {
        date: dateKey,
        dt,
        isToday: isCurrentDay,
        logs: dayLogs,
        dailyTotals,
        plans: dayPlans,
        calories,
      };
    });
  }, [weekDateObjs, logsData?.days, activePlans, today, activeFilters, matchesFilter]);

  // Week summary
  const summary = useMemo(() => {
    const totalCals = days.reduce((sum, d) => sum + d.calories, 0);
    const daysWithFood = days.filter((d) => d.logs.length > 0).length;
    const avg = daysWithFood > 0 ? totalCals / daysWithFood : 0;
    const max = Math.max(0, ...days.map((d) => d.calories));
    return {
      total: Math.round(totalCals),
      avg: Math.round(avg),
      max: Math.round(max),
      daysLogged: daysWithFood,
    };
  }, [days]);

  // Expand state per day — default today or first day
  const [expandedDate, setExpandedDate] = useState<string | null>(() => {
    return days.find((d) => d.isToday)?.date ?? days[0]?.date ?? null;
  });

  // Per-log expand overrides — the web's `TimelineLogCard` defaults only the
  // FIRST log in a day's list expanded (`page.tsx:2050`); every log after it
  // starts collapsed until tapped. Keyed by log id so toggling one log in an
  // expanded day doesn't disturb the others.
  const [logOverrides, setLogOverrides] = useState<Record<string, boolean>>({});
  const isLogExpanded = useCallback(
    (logId: string, idx: number) => logOverrides[logId] ?? idx === 0,
    [logOverrides],
  );
  const toggleLogExpanded = useCallback(
    (logId: string, idx: number) => {
      setLogOverrides((prev) => ({
        ...prev,
        [logId]: !(prev[logId] ?? idx === 0),
      }));
    },
    [],
  );

  const rangeTitle = `${from.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${to.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  // Does the visible week contain today or a future day? Decides whether the
  // "Schedule meals for this week" CTA shows — the web's `weekHasFuture`
  // (`page.tsx:710`). Date keys are `YYYY-MM-DD`, so string comparison is
  // calendar-correct.
  const weekHasFuture = toStr >= today;

  const allFilterActiveEmpty =
    activeFilters.size > 0 &&
    days.every((d) => d.logs.length === 0 && d.plans.length === 0);

  return (
    <View testID={testID} className="gap-4 px-4 pb-12">
      {/* Week Navigation Header */}
      <View className="flex-row items-center justify-between py-2">
        <Pressable
          testID="timeline-week-prev"
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={() => shiftWeek(-7)}
          className="h-10 w-10 items-center justify-center rounded-xl bg-card border border-border"
        >
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>

        <View className="items-center gap-1">
          <Text className="text-foreground text-sm font-bold">
            {rangeTitle}
          </Text>
          <Pressable
            testID="timeline-week-today"
            accessibilityRole="button"
            accessibilityLabel="Current week"
            onPress={() => setWeekRefDate(today)}
            className="rounded-full bg-muted px-2.5 py-0.5"
          >
            <Text className="text-muted-foreground text-[11px] font-semibold">
              Current Week
            </Text>
          </Pressable>
        </View>

        <Pressable
          testID="timeline-week-next"
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={() => shiftWeek(7)}
          className="h-10 w-10 items-center justify-center rounded-xl bg-card border border-border"
        >
          <ChevronRight size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Plan tools — copy a day forward / apply a meal to days (NP-260,
          matching `page.tsx:1071-1088`). Self-contained: this screen owns
          the sheets and refetches on apply. */}
      <View className="flex-row gap-2" testID="timeline-week-plan-tools">
        <Pressable
          testID="timeline-week-copy-day"
          accessibilityRole="button"
          accessibilityLabel="Copy a day"
          onPress={() => {
            setToast(null);
            setCopyDayOpen(true);
          }}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5"
        >
          <CopyPlus size={14} color={colors["muted-foreground"]} />
          <Text className="text-muted-foreground text-xs font-semibold">
            Copy a day
          </Text>
        </Pressable>
        <Pressable
          testID="timeline-week-apply-meal"
          accessibilityRole="button"
          accessibilityLabel="Meal to days"
          onPress={() => {
            setToast(null);
            setApplyMealOpen(true);
          }}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5"
        >
          <ChefHat size={14} color={colors["muted-foreground"]} />
          <Text className="text-muted-foreground text-xs font-semibold">
            Meal → days
          </Text>
        </Pressable>
      </View>

      {toast ? (
        <Pressable
          testID="timeline-week-toast"
          accessibilityRole="button"
          accessibilityLabel={`${toast}. Dismiss`}
          onPress={() => setToast(null)}
          className="rounded-xl bg-muted px-3 py-2"
        >
          <Text className="text-foreground text-xs font-medium text-center">
            {toast}
          </Text>
        </Pressable>
      ) : null}

      {/* Tag filter — collapsible chip row over /api/tags, matching
          `page.tsx:1091-1155`. */}
      <View
        testID="timeline-week-filter"
        className="rounded-xl border border-border bg-card p-3"
      >
        <Pressable
          testID="timeline-week-filter-toggle"
          accessibilityRole="button"
          accessibilityLabel="Filter by tag"
          onPress={() => setFiltersOpen((o) => !o)}
          className="flex-row items-center justify-between"
        >
          <View className="flex-row items-center gap-2 flex-1 min-w-0">
            <TagIcon size={16} color={colors["muted-foreground"]} />
            <Text className="text-foreground text-xs font-semibold">
              Filter by tag
            </Text>
            {activeFilters.size > 0 ? (
              <View className="rounded-full bg-foreground px-1.5 py-0.5">
                <Text className="text-background text-[10px] font-bold">
                  {activeFilters.size}
                </Text>
              </View>
            ) : null}
          </View>
          <View className="flex-row items-center gap-2 shrink-0">
            {activeFilters.size > 0 ? (
              <Pressable
                testID="timeline-week-filter-clear"
                accessibilityRole="button"
                accessibilityLabel="Clear tag filters"
                onPress={(e) => {
                  e?.stopPropagation?.();
                  clearFilters();
                }}
              >
                <Text className="text-muted-foreground text-[11px] font-medium">
                  Clear
                </Text>
              </Pressable>
            ) : null}
            <ChevronDown
              size={16}
              color={colors["muted-foreground"]}
              style={{ transform: [{ rotate: filtersOpen ? "0deg" : "-90deg" }] }}
            />
          </View>
        </Pressable>

        {filtersOpen ? (
          <View className="flex-row flex-wrap gap-1.5 mt-3" testID="timeline-week-filter-chips">
            {allFilterTags.map((tag) => {
              const active = activeFilters.has(tag.toLowerCase());
              return (
                <Pressable
                  key={tag}
                  testID={`timeline-week-filter-tag-${tag}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Filter by tag ${tag}`}
                  onPress={() => toggleFilter(tag)}
                  className={`rounded-full px-2.5 py-1 ${
                    active ? "bg-foreground" : "bg-muted"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      active ? "text-background" : "text-foreground"
                    }`}
                  >
                    {titleCaseTag(tag)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* Schedule meals for this week — the web opens `ScheduleMealsDrawer`;
          native routes to the week planner, matching `page.tsx:1160-1169`. */}
      {weekHasFuture ? (
        <Pressable
          testID="timeline-week-schedule-meals"
          accessibilityRole="button"
          accessibilityLabel="Schedule meals for this week"
          onPress={() => router.push("/(tabs)/nutrition/meal-plan")}
          className="bg-blue-600 flex-row items-center justify-center gap-1.5 rounded-xl py-3"
        >
          <CalendarDays size={16} color={colors["primary-foreground"]} />
          <Text className="text-white text-sm font-semibold">
            Schedule meals for this week
          </Text>
        </Pressable>
      ) : null}

      {/* Summary card */}
      <View
        testID="timeline-week-summary"
        className="rounded-2xl border border-border bg-card p-4 gap-4"
      >
        <View className="flex-row justify-between border-b border-border pb-3">
          <View className="flex-1 items-center">
            <Text className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
              Total
            </Text>
            <Text
              testID="timeline-week-total-cals"
              className="text-foreground text-base font-bold tabular-nums mt-0.5"
            >
              {summary.total.toLocaleString()}
            </Text>
            <Text className="text-muted-foreground text-[10px]">cal</Text>
          </View>
          <View className="flex-1 items-center border-x border-border">
            <Text className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
              Daily Avg
            </Text>
            <Text
              testID="timeline-week-avg-cals"
              className="text-foreground text-base font-bold tabular-nums mt-0.5"
            >
              {summary.avg.toLocaleString()}
            </Text>
            <Text className="text-muted-foreground text-[10px]">cal</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
              Days Logged
            </Text>
            <Text
              testID="timeline-week-days-logged"
              className="text-foreground text-base font-bold tabular-nums mt-0.5"
            >
              {summary.daysLogged}
            </Text>
            <Text className="text-muted-foreground text-[10px]">of 7</Text>
          </View>
        </View>

        {/* Calories per day bar chart */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
              Calories per day
            </Text>
            {calorieGoal > 0 ? (
              <Text className="text-muted-foreground text-[11px]">
                Goal: {calorieGoal.toLocaleString()} cal
              </Text>
            ) : null}
          </View>

          <View className="flex-row items-end justify-between h-28 pt-2 pb-1 gap-1">
            {days.map((d) => {
              const heightPct = weeklyChartBarHeightPct(d.calories, summary.max || calorieGoal);
              const dayLetter = d.dt.toLocaleDateString("en-US", { weekday: "narrow" });

              return (
                <Pressable
                  key={d.date}
                  testID={`timeline-week-bar-${d.date}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${d.date} in day view: ${d.calories} calories`}
                  onPress={() => onOpenDay(d.date)}
                  className="flex-1 items-center h-full justify-end gap-1.5"
                >
                  <View className="w-full flex-1 justify-end items-center px-1">
                    <View
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                      className={`w-full max-w-[28px] rounded-t-md ${
                        d.isToday ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    />
                  </View>
                  <Text
                    className={`text-[11px] font-bold uppercase tabular-nums ${
                      d.isToday ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    }`}
                  >
                    {dayLetter}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {allFilterActiveEmpty ? (
        <Text
          testID="timeline-week-filter-empty"
          className="text-muted-foreground text-xs text-center py-2"
        >
          No entries match the active tag filter for this week.
        </Text>
      ) : null}

      {/* Week day list */}
      <View className="gap-3">
        {days.map((d) => {
          const isExpanded = expandedDate === d.date;
          const activePlanCount = d.plans.length;
          const logCount = d.logs.length;
          const weekdayStr = d.dt.toLocaleDateString("en-US", { weekday: "short" });
          const dayNum = d.dt.getDate();
          const addLabel = d.date >= today ? "Plan food" : "Add food";

          return (
            <View
              key={d.date}
              testID={`timeline-week-day-group-${d.date}`}
              className="rounded-2xl border border-border bg-card overflow-hidden"
            >
              <View className="flex-row items-center gap-2 p-3.5">
              <Pressable
                testID={`timeline-week-day-${d.date}`}
                accessibilityRole="button"
                accessibilityLabel={`Day ${d.date}, ${d.calories} calories`}
                onPress={() => setExpandedDate(isExpanded ? null : d.date)}
                className="flex-1 flex-row items-center justify-between gap-3 min-w-0"
              >
                <View className="flex-row items-center gap-3 flex-1 min-w-0">
                  <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Text className="text-muted-foreground text-[10px] font-bold uppercase">
                      {weekdayStr}
                    </Text>
                    <Text className="text-foreground text-base font-bold leading-none">
                      {dayNum}
                    </Text>
                  </View>

                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1.5 flex-wrap">
                      <Text className="text-foreground text-sm font-semibold">
                        {d.dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Text>
                      {d.isToday ? (
                        <View className="bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full">
                          <Text className="text-emerald-700 dark:text-emerald-300 text-[9px] font-bold uppercase">
                            Today
                          </Text>
                        </View>
                      ) : null}
                      {activePlanCount > 0 ? (
                        <View className="flex-row items-center gap-0.5 bg-blue-100 dark:bg-blue-950/40 px-1.5 py-0.5 rounded-full">
                          <CalendarDays size={10} color={colors.primary} />
                          <Text className="text-blue-700 dark:text-blue-300 text-[9px] font-bold">
                            {activePlanCount}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-muted-foreground text-xs mt-0.5 truncate">
                      {logCount === 0 && activePlanCount === 0
                        ? "No entries"
                        : [
                            logCount > 0
                              ? `${logCount} ${logCount === 1 ? "entry" : "entries"}`
                              : null,
                            activePlanCount > 0
                              ? `${activePlanCount} planned`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </Text>
                  </View>
                </View>

                {/* Per-day Calories + chevron */}
                <View className="flex-row items-center gap-3 shrink-0">
                  <View className="items-end">
                    <Text
                      testID={`timeline-week-day-cals-${d.date}`}
                      className="text-foreground text-base font-bold tabular-nums"
                    >
                      {d.calories.toLocaleString()}
                    </Text>
                    <Text className="text-muted-foreground text-[10px]">cal</Text>
                  </View>

                  <ChevronDown
                    size={16}
                    color={colors["muted-foreground"]}
                    style={{ transform: [{ rotate: isExpanded ? "180deg" : "0deg" }] }}
                  />
                </View>
              </Pressable>

              {/* Add button — a solid square `+`, matching the web's
                  `WeekDayGroup` trailing control (`page.tsx:2013-2021`):
                  INSIDE the same row as the day content, not wrapped onto a
                  second line underneath it (that wrap doubled every row's
                  height and let the floating Day-view FAB sit directly on
                  top of the first visible day's own `+`). Opens the full Day
                  view, where the add-food / schedule-meals surfaces live. */}
              <Pressable
                testID={`timeline-week-open-${d.date}`}
                accessibilityRole="button"
                accessibilityLabel={`${addLabel} for ${d.date}`}
                onPress={() => onOpenDay(d.date)}
                className="h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground"
              >
                <Plus size={16} color={colors.background} />
              </Pressable>
              </View>

              {/* Expanded details */}
              {isExpanded ? (
                <View className="border-t border-border p-3.5 gap-2.5 bg-muted/30">
                  {/* Planned meals */}
                  {d.plans.length > 0 ? (
                    <View className="gap-2">
                      {d.plans.map((plan) => (
                        <NutritionPlanCard
                          key={plan._id}
                          plan={plan}
                          isToday={d.isToday}
                          onLogPlan={onLogPlan}
                          onSkipPlan={onSkipPlan}
                          onRemovePlan={onRemovePlan}
                          onEditPlanItem={onEditPlanItem}
                        />
                      ))}
                    </View>
                  ) : null}

                  {/* Logged meals — the web's `TimelineLogCard`
                      (`page.tsx:2107-2261`): a time pill, the log's tag
                      chips, an orange/per-tag left accent bar, an expandable
                      item list with a pencil per row, and a P/C/F + Delete
                      footer. Native used to render a plain card with no
                      time, tags, item rows or actions at all. */}
                  {d.logs.length > 0 ? (
                    <View className="gap-2">
                      {d.logs.map((log, logIdx) => {
                        const totals = {
                          calories: Math.round(log.totalNutrition?.calories ?? 0),
                          protein: Math.round(log.totalNutrition?.protein ?? 0),
                          carbs: Math.round(log.totalNutrition?.carbs ?? 0),
                          fats: Math.round(log.totalNutrition?.fats ?? 0),
                        };
                        const time = log.untimed ? "No time" : formatLogTime(log.loggedAt);
                        const accentTag = primaryLogTag(log.tags);
                        const accentBorderClass = tagAccentBorderClass(accentTag);
                        const logExpanded = isLogExpanded(log._id, logIdx);

                        return (
                          <View
                            key={log._id}
                            testID={`timeline-log-${log._id}`}
                            className={`rounded-xl border border-border bg-card overflow-hidden border-l-4 ${accentBorderClass}`}
                          >
                            <Pressable
                              testID={`timeline-log-toggle-${log._id}`}
                              accessibilityRole="button"
                              accessibilityLabel={logExpanded ? "Collapse entry" : "Expand entry"}
                              onPress={() => toggleLogExpanded(log._id, logIdx)}
                              className="flex-row items-center gap-2 p-3"
                            >
                              <View
                                testID={`timeline-log-time-${log._id}`}
                                className="flex-row items-center gap-1 shrink-0 rounded-full bg-muted px-2 py-1"
                              >
                                <Clock size={11} color={colors["muted-foreground"]} />
                                <Text className="text-muted-foreground text-[11px] font-semibold tabular-nums">
                                  {time}
                                </Text>
                              </View>

                              <View className="flex-row flex-wrap items-center gap-1 flex-1 min-w-0">
                                {(log.tags ?? []).map((tag) => {
                                  const chip = tagChipColors(tag);
                                  return (
                                    <View
                                      key={tag}
                                      testID={`timeline-log-tag-${log._id}-${tag}`}
                                      className={`rounded px-1.5 py-0.5 ${chip.bg}`}
                                    >
                                      <Text className={`text-[10px] font-bold uppercase tracking-wider ${chip.text}`}>
                                        {titleCaseTag(tag)}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>

                              <Text className="shrink-0 rounded-md bg-muted px-2 py-1 text-foreground text-xs font-semibold tabular-nums">
                                {totals.calories} cal
                              </Text>

                              <ChevronDown
                                size={14}
                                color={colors["muted-foreground"]}
                                style={{ transform: [{ rotate: logExpanded ? "0deg" : "-90deg" }] }}
                              />
                            </Pressable>

                            {log.mealName ? (
                              <View className="flex-row flex-wrap items-center gap-1.5 px-3 pb-2 -mt-1">
                                <View className="flex-row items-center gap-1 rounded-md bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5">
                                  <ChefHat size={11} color={colors.accent} />
                                  <Text className="text-orange-700 dark:text-orange-300 text-[9px] font-bold uppercase tracking-wider">
                                    Recipe
                                  </Text>
                                  <Text className="text-orange-700 dark:text-orange-300 text-[11px]">
                                    · {log.mealName}
                                  </Text>
                                </View>
                              </View>
                            ) : null}

                            {logExpanded ? (
                              <>
                                <View className="border-t border-border">
                                  {(log.items ?? []).map((item, itemIdx) => {
                                    const itemCal = Math.round(
                                      (item.nutrition?.calories ?? 0) * (item.servings ?? 1),
                                    );
                                    return (
                                      <View
                                        key={item._id ?? itemIdx}
                                        testID={`timeline-log-item-${log._id}-${itemIdx}`}
                                        className={`flex-row items-center gap-2 px-3 py-2 ${
                                          itemIdx < (log.items?.length ?? 0) - 1
                                            ? "border-b border-border"
                                            : ""
                                        }`}
                                      >
                                        <View className="flex-1 min-w-0">
                                          <Text
                                            numberOfLines={1}
                                            className="text-foreground text-xs font-medium"
                                          >
                                            {item.name}
                                          </Text>
                                          <Text
                                            numberOfLines={1}
                                            className="text-muted-foreground text-[10px]"
                                          >
                                            {item.brand ? `${item.brand} · ` : ""}
                                            {item.servings} × {item.servingSize}
                                            {item.servingUnit}
                                          </Text>
                                        </View>
                                        <Text className="shrink-0 text-foreground text-[11px] font-semibold tabular-nums">
                                          {itemCal}
                                        </Text>
                                        <Pressable
                                          testID={`timeline-log-item-edit-${log._id}-${itemIdx}`}
                                          accessibilityRole="button"
                                          accessibilityLabel="Edit item"
                                          onPress={() =>
                                            onEditItem
                                              ? onEditItem(log._id, item)
                                              : onOpenDay(d.date)
                                          }
                                          className="h-6 w-6 shrink-0 items-center justify-center rounded-md"
                                        >
                                          <Pencil size={12} color={colors["muted-foreground"]} />
                                        </Pressable>
                                      </View>
                                    );
                                  })}
                                </View>
                                <View className="flex-row items-center justify-between border-t border-border px-3 py-2">
                                  <View className="flex-row gap-2.5">
                                    <Text className="text-muted-foreground text-[11px] tabular-nums">
                                      P: {totals.protein}g
                                    </Text>
                                    <Text className="text-muted-foreground text-[11px] tabular-nums">
                                      C: {totals.carbs}g
                                    </Text>
                                    <Text className="text-muted-foreground text-[11px] tabular-nums">
                                      F: {totals.fats}g
                                    </Text>
                                  </View>
                                  <Pressable
                                    testID={`timeline-log-delete-${log._id}`}
                                    accessibilityRole="button"
                                    accessibilityLabel="Delete entire log"
                                    onPress={() =>
                                      onDeleteLog
                                        ? onDeleteLog(log._id, log.mealName)
                                        : onOpenDay(d.date)
                                    }
                                    className="flex-row items-center gap-1 rounded-lg px-2 py-1"
                                  >
                                    <Trash2 size={12} color={colors.destructive} />
                                    <Text className="text-destructive text-[11px] font-semibold">
                                      Delete
                                    </Text>
                                  </Pressable>
                                </View>
                              </>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  {d.logs.length === 0 && d.plans.length === 0 ? (
                    <Text className="text-muted-foreground text-xs py-2 text-center">
                      No food logged for this day.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <CopyDaySheet
        visible={copyDayOpen}
        defaultSourceDate={selectedDate}
        onClose={() => setCopyDayOpen(false)}
        onApplied={handleBulkApplied}
      />
      <ApplyMealSheet
        visible={applyMealOpen}
        defaultFromDate={selectedDate}
        defaultToDate={selectedDate}
        availableTags={
          tagsData
            ? { defaults: tagsData.defaults ?? [], userTags: tagsData.userTags ?? [] }
            : undefined
        }
        onClose={() => setApplyMealOpen(false)}
        onApplied={handleBulkApplied}
      />
    </View>
  );
}
