import { useState, useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  UtensilsCrossed,
} from "lucide-react-native";
import {
  MealLogsRangeResponseSchema,
  type MealLog,
  type MealNutrition,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useFetch } from "@/lib/hooks/useFetch";
import { localDateKey, withTz } from "@/lib/time/localDay";
import {
  PlansResponseSchema,
  type MealPlan,
} from "@/lib/nutrition/mealPlans";
import {
  getWeekRange,
  parseDateKey,
  formatDateKey,
  weeklyChartBarHeightPct,
  computeWeekSummary,
  MONTH_NAMES,
  DAY_LABELS,
} from "@/lib/nutrition/timeline";
import { PlannedMealCard } from "./PlannedMealCard";

export interface TimelineWeekViewProps {
  referenceDate: string;
  goalCalories: number;
  tzOffset?: number;
  token?: string | null;
  onOpenDay: (dateKey: string) => void;
  onLogPlan?: (planId: string) => void;
  onSkipPlan?: (planId: string) => void;
  onRemovePlan?: (planId: string) => void;
  testID?: string;
}

export interface DayBucketItem {
  date: string;
  logs: MealLog[];
  dailyTotals: MealNutrition;
  plans: MealPlan[];
}

function formatWeekRangeHeader(fromKey: string, toKey: string): string {
  const fromD = parseDateKey(fromKey);
  const toD = parseDateKey(toKey);
  const fromMonth = MONTH_NAMES[fromD.getMonth()]?.slice(0, 3) ?? "";
  const toMonth = MONTH_NAMES[toD.getMonth()]?.slice(0, 3) ?? "";

  if (fromD.getFullYear() === toD.getFullYear()) {
    if (fromD.getMonth() === toD.getMonth()) {
      return `${fromMonth} ${fromD.getDate()} – ${toD.getDate()}, ${fromD.getFullYear()}`;
    }
    return `${fromMonth} ${fromD.getDate()} – ${toMonth} ${toD.getDate()}, ${fromD.getFullYear()}`;
  }
  return `${fromMonth} ${fromD.getDate()}, ${fromD.getFullYear()} – ${toMonth} ${toD.getDate()}, ${toD.getFullYear()}`;
}

export function TimelineWeekView({
  referenceDate,
  goalCalories,
  tzOffset,
  token,
  onOpenDay,
  onLogPlan,
  onSkipPlan,
  onRemovePlan,
  testID = "nutrition-timeline-week-view",
}: TimelineWeekViewProps) {
  const { colors } = useThemeTokens();
  const todayKey = localDateKey();

  const [anchorDate, setAnchorDate] = useState<string>(() => referenceDate);

  const { from, to, days } = useMemo(() => {
    return getWeekRange(anchorDate);
  }, [anchorDate]);

  // Fetch meal logs for this week
  const mealLogsPath = withTz(`/api/meal-logs?from=${from}&to=${to}`, tzOffset);
  const {
    data: logsData,
    refetch: refetchLogs,
  } = useFetch(mealLogsPath, MealLogsRangeResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  // Fetch meal plans for this week
  const mealPlansPath = `/api/meal-plans?from=${from}&to=${to}`;
  const {
    data: plansData,
    refetch: refetchPlans,
  } = useFetch(mealPlansPath, PlansResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  // Combine logs and active plans by date
  const normalizedDays = useMemo<DayBucketItem[]>(() => {
    const logsDaysMap = new Map<string, { logs: MealLog[]; dailyTotals: MealNutrition }>();
    if (logsData?.days) {
      for (const d of logsData.days) {
        logsDaysMap.set(d.date, {
          logs: (d.logs ?? []) as MealLog[],
          dailyTotals: d.dailyTotals ?? { calories: 0, protein: 0, carbs: 0, fats: 0 },
        });
      }
    }

    const plansByDate = new Map<string, MealPlan[]>();
    if (plansData?.plans) {
      for (const p of plansData.plans) {
        // Only active plans render (NP-147, NP-178)
        if (p.status === "active") {
          const key = p.plannedDateKey ?? (p.plannedDate ? p.plannedDate.split("T")[0] : "");
          if (key) {
            const arr = plansByDate.get(key) ?? [];
            arr.push(p);
            plansByDate.set(key, arr);
          }
        }
      }
    }

    return days.map((dateKey: string) => {
      const logEntry = logsDaysMap.get(dateKey);
      return {
        date: dateKey,
        logs: logEntry?.logs ?? [],
        dailyTotals: logEntry?.dailyTotals ?? { calories: 0, protein: 0, carbs: 0, fats: 0 },
        plans: plansByDate.get(dateKey) ?? [],
      };
    });
  }, [days, logsData, plansData]);

  const summary = useMemo(() => {
    return computeWeekSummary(normalizedDays);
  }, [normalizedDays]);

  const navigateWeek = (deltaDays: number) => {
    const cur = parseDateKey(anchorDate);
    cur.setDate(cur.getDate() + deltaDays);
    setAnchorDate(formatDateKey(cur));
  };

  const handleLogPlan = async (planId: string) => {
    if (onLogPlan) {
      await onLogPlan(planId);
      void refetchLogs();
      void refetchPlans();
    }
  };

  const handleSkipPlan = async (planId: string) => {
    if (onSkipPlan) {
      await onSkipPlan(planId);
      void refetchPlans();
    }
  };

  const handleRemovePlan = async (planId: string) => {
    if (onRemovePlan) {
      await onRemovePlan(planId);
      void refetchPlans();
    }
  };

  const [userToggled, setUserToggled] = useState<Record<string, boolean>>({});

  const toggleExpand = (dateKey: string, currentExpanded: boolean) => {
    setUserToggled((prev) => ({
      ...prev,
      [dateKey]: !currentExpanded,
    }));
  };

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Week Navigation Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 4,
        }}
      >
        <Pressable
          testID="nutrition-week-prev"
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={() => navigateWeek(-7)}
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <ChevronLeft size={18} color={colors.foreground} />
        </Pressable>

        <View style={{ alignItems: "center" }}>
          <Text
            testID="nutrition-week-range-title"
            className="text-foreground font-bold text-sm sm:text-base"
          >
            {formatWeekRangeHeader(from, to)}
          </Text>
          {anchorDate !== todayKey && (
            <Pressable
              testID="nutrition-week-today"
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
              onPress={() => setAnchorDate(todayKey)}
              style={{ marginTop: 2 }}
            >
              <Text className="text-primary text-xs font-semibold">Today</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          testID="nutrition-week-next"
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={() => navigateWeek(7)}
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <ChevronRight size={18} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Week Summary Card */}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          gap: 16,
        }}
      >
        {/* Top 3 Stats */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-around",
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingBottom: 12,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Text className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
              Total
            </Text>
            <Text
              testID="nutrition-week-summary-total"
              className="text-foreground text-lg font-bold tabular-nums mt-0.5"
            >
              {summary.total.toLocaleString()}
            </Text>
            <Text className="text-muted-foreground text-[10px]">cal</Text>
          </View>

          <View style={{ alignItems: "center" }}>
            <Text className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
              Daily avg
            </Text>
            <Text
              testID="nutrition-week-summary-avg"
              className="text-foreground text-lg font-bold tabular-nums mt-0.5"
            >
              {summary.avg.toLocaleString()}
            </Text>
            <Text className="text-muted-foreground text-[10px]">cal</Text>
          </View>

          <View style={{ alignItems: "center" }}>
            <Text className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
              Days logged
            </Text>
            <Text
              testID="nutrition-week-summary-days"
              className="text-foreground text-lg font-bold tabular-nums mt-0.5"
            >
              {summary.daysLogged}
            </Text>
            <Text className="text-muted-foreground text-[10px]">of 7</Text>
          </View>
        </View>

        {/* Calories per day Bar Chart (oldest -> newest, Sun -> Sat) */}
        <View style={{ gap: 8 }}>
          <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
            Calories per day
          </Text>
          <View
            style={{
              flexDirection: "row",
              height: 100,
              alignItems: "flex-end",
              justifyContent: "space-between",
              paddingHorizontal: 4,
            }}
          >
            {normalizedDays.map((item: DayBucketItem) => {
              const dt = parseDateKey(item.date);
              const isToday = item.date === todayKey;
              const cal = Math.round(item.dailyTotals.calories || 0);
              const heightPct = weeklyChartBarHeightPct(cal, summary.max);
              const label = DAY_LABELS[dt.getDay()]?.slice(0, 1) ?? "";

              return (
                <Pressable
                  key={item.date}
                  testID={`nutrition-week-bar-${item.date}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.date} in day view: ${cal} calories`}
                  onPress={() => onOpenDay(item.date)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "flex-end",
                    height: "100%",
                    paddingHorizontal: 3,
                  }}
                >
                  <View
                    style={{
                      width: "100%",
                      height: `${heightPct}%`,
                      minHeight: cal > 0 ? 4 : 0,
                      backgroundColor: isToday
                        ? colors.success
                        : cal > 0
                        ? colors.primary
                        : colors.muted,
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                    }}
                  />
                  <Text
                    className={`mt-1 text-[10px] ${
                      isToday
                        ? "font-bold text-emerald-600 dark:text-emerald-400"
                        : "font-medium text-muted-foreground"
                    }`}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Week Day Strips */}
      <View style={{ gap: 10 }}>
        {normalizedDays.map((item: DayBucketItem) => {
          const dt = parseDateKey(item.date);
          const isToday = item.date === todayKey;
          const calories = Math.round(item.dailyTotals.calories || 0);
          const activePlans = item.plans;
          const plannedCals = Math.round(
            activePlans.reduce((s: number, p: MealPlan) => s + (p.expectedNutrition?.calories ?? 0), 0),
          );
          const isDefaultExpanded = Boolean(
            isToday || item.logs.length > 0 || activePlans.length > 0,
          );
          const isExpanded: boolean =
            userToggled[item.date] ?? isDefaultExpanded;
          const dayName = dt.toLocaleDateString("en-US", { weekday: "short" });
          const monthDay = dt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

          return (
            <View
              key={item.date}
              testID={`nutrition-week-day-${item.date}`}
              style={{
                backgroundColor: colors.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
              }}
            >
              {/* Day Row Header */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 12,
                  gap: 12,
                }}
              >
                {/* Date Badge / Tap to open day */}
                <Pressable
                  testID={`nutrition-week-open-${item.date}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open day ${item.date}`}
                  onPress={() => onOpenDay(item.date)}
                  className="bg-muted"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text className="text-muted-foreground text-[10px] font-bold uppercase">
                    {dayName}
                  </Text>
                  <Text className="text-foreground text-base font-bold leading-none">
                    {dt.getDate()}
                  </Text>
                </Pressable>

                {/* Info */}
                <Pressable
                  onPress={() => toggleExpand(item.date, isExpanded)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text className="text-foreground text-sm font-semibold">
                      {monthDay}
                    </Text>
                    {isToday && (
                      <View className="bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                        <Text className="text-emerald-700 dark:text-emerald-300 text-[9px] font-bold uppercase">
                          Today
                        </Text>
                      </View>
                    )}
                    {activePlans.length > 0 && (
                      <View className="bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full flex-row items-center gap-1">
                        <CalendarDays size={10} color={colors.primary} />
                        <Text className="text-blue-700 dark:text-blue-300 text-[9px] font-bold">
                          {activePlans.length}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {item.logs.length === 0 && activePlans.length === 0
                      ? "No entries"
                      : [
                          item.logs.length > 0
                            ? `${item.logs.length} ${
                                item.logs.length === 1 ? "entry" : "entries"
                              }`
                            : null,
                          activePlans.length > 0
                            ? `${activePlans.length} planned${
                                plannedCals > 0 ? ` · ${plannedCals} cal` : ""
                              }`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </Text>
                </Pressable>

                {/* Calories vs Goal & Expand Button */}
                <Pressable
                  testID={`nutrition-week-day-cals-${item.date}`}
                  onPress={() => onOpenDay(item.date)}
                  style={{ alignItems: "flex-end", marginRight: 4 }}
                >
                  <Text className="text-foreground text-base font-bold tabular-nums">
                    {calories.toLocaleString()}
                  </Text>
                  <Text className="text-muted-foreground text-[10px]">
                    cal / {goalCalories}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => toggleExpand(item.date, isExpanded)}
                  accessibilityRole="button"
                  accessibilityLabel={isExpanded ? "Collapse day" : "Expand day"}
                  hitSlop={8}
                >
                  <ChevronDown
                    size={18}
                    color={colors["muted-foreground"]}
                    style={{
                      transform: [{ rotate: isExpanded ? "180deg" : "0deg" }],
                    }}
                  />
                </Pressable>
              </View>

              {/* Expanded details: logs & planned meals */}
              {isExpanded && (
                <View
                  className="bg-muted/30"
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    padding: 12,
                    gap: 10,
                  }}
                >
                  {/* Logged meals */}
                  {item.logs.length > 0 ? (
                    <View style={{ gap: 6 }}>
                      <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                        Logged food
                      </Text>
                      {item.logs.map((log: MealLog) => {
                        const logCals = Math.round(
                          log.totalNutrition?.calories || 0,
                        );
                        const firstItemName =
                          log.mealName ??
                          log.items?.[0]?.name ??
                          log.tags?.[0] ??
                          "Meal";
                        return (
                          <Pressable
                            key={String(log._id)}
                            onPress={() => onOpenDay(item.date)}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              paddingVertical: 4,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                flex: 1,
                                marginRight: 8,
                              }}
                            >
                              <UtensilsCrossed
                                size={14}
                                color={colors["muted-foreground"]}
                              />
                              <Text
                                className="text-foreground text-xs font-medium flex-1"
                                numberOfLines={1}
                              >
                                {firstItemName}
                                {log.items && log.items.length > 1
                                  ? ` +${log.items.length - 1} more`
                                  : ""}
                              </Text>
                            </View>
                            <Text className="text-muted-foreground text-xs tabular-nums">
                              {logCals} cal
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {/* Planned meals */}
                  {activePlans.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                        Planned meals
                      </Text>
                      {activePlans.map((plan: MealPlan) => (
                        <PlannedMealCard
                          key={String(plan._id)}
                          plan={plan}
                          isToday={isToday}
                          onLogPlan={handleLogPlan}
                          onSkipPlan={handleSkipPlan}
                          onRemovePlan={handleRemovePlan}
                        />
                      ))}
                    </View>
                  ) : null}

                  {item.logs.length === 0 && activePlans.length === 0 && (
                    <View style={{ paddingVertical: 8, alignItems: "center" }}>
                      <Text className="text-muted-foreground text-xs">
                        No entries for this day
                      </Text>
                    </View>
                  )}

                  {/* Button to open day */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View full details for ${monthDay}`}
                    onPress={() => onOpenDay(item.date)}
                    style={{
                      alignItems: "center",
                      paddingVertical: 6,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      marginTop: 4,
                    }}
                  >
                    <Text className="text-primary text-xs font-semibold">
                      View day details →
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
