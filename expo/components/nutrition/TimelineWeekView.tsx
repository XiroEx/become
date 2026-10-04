import { useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays, ExternalLink } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useLocalDay, withTz } from "@/lib/time/localDay";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  MealLogsRangeResponseSchema,
  type MealLogsRangeResponse,
  type MealLog,
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
import { NutritionPlanCard, type MealPlanItem } from "@/components/nutrition/NutritionPlanCard";

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
  testID?: string;
}

export function TimelineWeekView({
  selectedDate,
  calorieGoal = 2000,
  onOpenDay,
  onLogPlan,
  onSkipPlan,
  onRemovePlan,
  onEditPlanItem,
  testID = "timeline-week-view",
}: TimelineWeekViewProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const { day: today, tzOffset } = useLocalDay();

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
  const { data: logsData } = useFetch<MealLogsRangeResponse>(
    logsPath,
    MealLogsRangeResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const plansPath = `/api/meal-plans?from=${fromStr}&to=${toStr}`;
  const { data: plansData } = useFetch<PlansResponse>(
    plansPath,
    PlansResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const activePlans = useMemo(() => {
    return (plansData?.plans ?? []).filter((p) => p.status === "active");
  }, [plansData?.plans]);

  // Build the 7 days buckets
  const days = useMemo(() => {
    const todayObj = parseDateKey(today);
    return weekDateObjs.map((dt) => {
      const dateKey = toDateKey(dt);
      const isCurrentDay = isSameLocalDay(dt, todayObj);
      const dayBucket = logsData?.days?.find((d) => d.date === dateKey);
      const dayLogs: MealLog[] = dayBucket?.logs ?? [];
      const dailyTotals = dayBucket?.dailyTotals ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
      };
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
  }, [weekDateObjs, logsData?.days, activePlans, today]);

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

  const rangeTitle = `${from.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${to.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

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

      {/* Week day list */}
      <View className="gap-3">
        {days.map((d) => {
          const isExpanded = expandedDate === d.date;
          const activePlanCount = d.plans.length;
          const logCount = d.logs.length;
          const weekdayStr = d.dt.toLocaleDateString("en-US", { weekday: "short" });
          const dayNum = d.dt.getDate();

          return (
            <View
              key={d.date}
              testID={`timeline-week-day-group-${d.date}`}
              className="rounded-2xl border border-border bg-card overflow-hidden"
            >
              <Pressable
                testID={`timeline-week-day-${d.date}`}
                accessibilityRole="button"
                accessibilityLabel={`Day ${d.date}, ${d.calories} calories`}
                onPress={() => setExpandedDate(isExpanded ? null : d.date)}
                className="flex-row items-center justify-between p-3.5 gap-3"
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

                {/* Per-day Calories + Open Action */}
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

                  <Pressable
                    testID={`timeline-week-open-${d.date}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${d.date} in day view`}
                    onPress={() => onOpenDay(d.date)}
                    className="flex-row items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5"
                  >
                    <Text className="text-foreground text-xs font-semibold">Open</Text>
                    <ExternalLink size={12} color={colors.foreground} />
                  </Pressable>

                  <ChevronDown
                    size={16}
                    color={colors["muted-foreground"]}
                    style={{ transform: [{ rotate: isExpanded ? "180deg" : "0deg" }] }}
                  />
                </View>
              </Pressable>

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

                  {/* Logged meals */}
                  {d.logs.length > 0 ? (
                    <View className="gap-2">
                      {d.logs.map((log) => {
                        const logCals = Math.round(log.totalNutrition?.calories ?? 0);
                        const itemsCount = log.items?.length ?? 0;
                        return (
                          <View
                            key={log._id}
                            testID={`timeline-log-${log._id}`}
                            className="rounded-xl border border-border bg-card p-3 gap-1"
                          >
                            <View className="flex-row justify-between items-center">
                              <Text className="text-foreground text-sm font-semibold capitalize">
                                {log.mealName ?? log.tags?.[0] ?? "Meal"}
                              </Text>
                              <Text className="text-foreground text-xs font-bold tabular-nums">
                                {logCals} cal
                              </Text>
                            </View>
                            <Text className="text-muted-foreground text-xs">
                              {itemsCount} {itemsCount === 1 ? "item" : "items"}
                              {log.items && log.items.length > 0
                                ? `: ${log.items.map((i) => i.name).join(", ")}`
                                : ""}
                            </Text>
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
    </View>
  );
}
