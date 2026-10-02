import { useState, useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
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
  getMonthDays,
  parseDateKey,
  formatDateKey,
  tintForCalories,
  tagDotClasses,
  MONTH_NAMES,
  DAY_LABELS,
} from "@/lib/nutrition/timeline";

export interface TimelineMonthViewProps {
  referenceDate: string;
  goalCalories: number;
  tzOffset?: number;
  token?: string | null;
  onOpenDay: (dateKey: string) => void;
  testID?: string;
}

export function TimelineMonthView({
  referenceDate,
  goalCalories,
  tzOffset,
  token,
  onOpenDay,
  testID = "nutrition-timeline-month-view",
}: TimelineMonthViewProps) {
  const { colors } = useThemeTokens();
  const todayKey = localDateKey();

  const initialD = useMemo(() => parseDateKey(referenceDate), [referenceDate]);
  const [viewYear, setViewYear] = useState<number>(() => initialD.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => initialD.getMonth());

  const days = useMemo(() => {
    return getMonthDays(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  const { from, to } = useMemo(() => {
    if (days.length === 0) {
      return { from: referenceDate, to: referenceDate };
    }
    return {
      from: formatDateKey(days[0] ?? new Date()),
      to: formatDateKey(days[days.length - 1] ?? new Date()),
    };
  }, [days, referenceDate]);

  // Fetch meal logs for the month range
  const mealLogsPath = withTz(`/api/meal-logs?from=${from}&to=${to}`, tzOffset);
  const { data: logsData } = useFetch(
    mealLogsPath,
    MealLogsRangeResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  // Fetch meal plans for the month range
  const mealPlansPath = `/api/meal-plans?from=${from}&to=${to}`;
  const { data: plansData } = useFetch(mealPlansPath, PlansResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  const { logsByDate, totalsByDate, plansByDate } = useMemo(() => {
    const lMap = new Map<string, MealLog[]>();
    const tMap = new Map<string, MealNutrition>();
    if (logsData?.days) {
      for (const d of logsData.days) {
        lMap.set(d.date, (d.logs ?? []) as MealLog[]);
        tMap.set(
          d.date,
          d.dailyTotals ?? { calories: 0, protein: 0, carbs: 0, fats: 0 },
        );
      }
    }

    const pMap = new Map<string, MealPlan[]>();
    if (plansData?.plans) {
      for (const p of plansData.plans) {
        if (p.status === "active") {
          const key = p.plannedDateKey ?? (p.plannedDate ? p.plannedDate.split("T")[0] : "");
          if (key) {
            const arr = pMap.get(key) ?? [];
            arr.push(p);
            pMap.set(key, arr);
          }
        }
      }
    }

    return { logsByDate: lMap, totalsByDate: tMap, plansByDate: pMap };
  }, [logsData, plansData]);

  const changeMonth = (delta: number) => {
    let nextM = viewMonth + delta;
    let nextY = viewYear;
    if (nextM < 0) {
      nextM = 11;
      nextY -= 1;
    } else if (nextM > 11) {
      nextM = 0;
      nextY += 1;
    }
    setViewMonth(nextM);
    setViewYear(nextY);
  };

  const jumpToToday = () => {
    const now = parseDateKey(todayKey);
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  const isShowingCurrentMonth = () => {
    const now = parseDateKey(todayKey);
    return now.getFullYear() === viewYear && now.getMonth() === viewMonth;
  };

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Month Navigation */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 4,
        }}
      >
        <Pressable
          testID="nutrition-month-prev"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => changeMonth(-1)}
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
            testID="nutrition-month-title"
            className="text-foreground font-bold text-base"
          >
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          {!isShowingCurrentMonth() && (
            <Pressable
              testID="nutrition-month-today"
              accessibilityRole="button"
              accessibilityLabel="Jump to current month"
              onPress={jumpToToday}
              style={{ marginTop: 2 }}
            >
              <Text className="text-primary text-xs font-semibold">Today</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          testID="nutrition-month-next"
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => changeMonth(1)}
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

      {/* Month Grid Card */}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        {/* Day-of-week headers */}
        <View
          className="bg-muted/40"
          style={{
            flexDirection: "row",
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          {DAY_LABELS.map((label) => (
            <View
              key={label}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                {label.slice(0, 1)}
              </Text>
            </View>
          ))}
        </View>

        {/* Calendar days grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {days.map((day: Date) => {
            const dateKey = formatDateKey(day);
            const isThisMonth = day.getMonth() === viewMonth;
            const isToday = dateKey === todayKey;
            const dayLogs = logsByDate.get(dateKey) ?? [];
            const dayPlans = plansByDate.get(dateKey) ?? [];
            const dayTotals = totalsByDate.get(dateKey);
            const cals = Math.round(dayTotals?.calories ?? 0);
            const isLogged = dayLogs.length > 0 || cals > 0;
            const tint = tintForCalories(cals, goalCalories);

            // Tags for dots
            const loggedTags = new Set<string>();
            for (const l of dayLogs) {
              for (const t of l.tags ?? []) loggedTags.add(t.toLowerCase());
              if ((l.tags ?? []).length === 0) loggedTags.add("snack");
            }
            const plannedTags = new Set<string>();
            for (const p of dayPlans) {
              if (p.status === "active") plannedTags.add(p.tag.toLowerCase());
            }

            const dots: { tag: string; planned: boolean }[] = [];
            for (const tag of loggedTags) {
              dots.push({ tag, planned: false });
            }
            for (const tag of plannedTags) {
              if (!loggedTags.has(tag)) {
                dots.push({ tag, planned: true });
              }
            }
            const visibleDots = dots.slice(0, 3);
            const overflowDots = dots.length - visibleDots.length;

            let tintClass = "bg-transparent";
            if (tint === "under") tintClass = "bg-amber-500/10";
            if (tint === "on") tintClass = "bg-emerald-500/10";
            if (tint === "over") tintClass = "bg-red-500/10";

            return (
              <Pressable
                key={dateKey}
                testID={`nutrition-month-day-${dateKey}`}
                accessibilityRole="button"
                accessibilityLabel={`${MONTH_NAMES[day.getMonth()]} ${day.getDate()}, ${day.getFullYear()}${
                  isLogged ? `: ${cals} calories logged` : ""
                }${dayPlans.length > 0 ? `, ${dayPlans.length} planned` : ""}`}
                onPress={() => onOpenDay(dateKey)}
                className={tintClass}
                style={{
                  width: "14.2857%",
                  minHeight: 58,
                  paddingVertical: 6,
                  paddingHorizontal: 2,
                  alignItems: "center",
                  justifyContent: "flex-start",
                  borderBottomWidth: 1,
                  borderRightWidth: 1,
                  borderColor: colors.border,
                  opacity: isThisMonth ? 1 : 0.35,
                }}
              >
                {/* Date number */}
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isToday ? colors.foreground : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: isToday ? "700" : "600",
                      color: isToday
                        ? colors.background
                        : isThisMonth
                        ? colors.foreground
                        : colors["muted-foreground"],
                    }}
                  >
                    {day.getDate()}
                  </Text>
                </View>

                {/* Logged Indicator & Tag Dots */}
                {isLogged && (
                  <View
                    testID={`nutrition-month-logged-${dateKey}`}
                    className="bg-emerald-500 rounded-full"
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 5,
                      height: 5,
                    }}
                  />
                )}

                {/* Dots row */}
                {dots.length > 0 ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      marginTop: 4,
                    }}
                  >
                    {visibleDots.map((d, i) => {
                      const c = tagDotClasses(d.tag);
                      return d.planned ? (
                        <View
                          key={`p-${d.tag}-${i}`}
                          className={`w-1.5 h-1.5 rounded-full border ${c.ringClass}`}
                        />
                      ) : (
                        <View
                          key={`l-${d.tag}-${i}`}
                          className={`w-1.5 h-1.5 rounded-full ${c.solidClass}`}
                        />
                      );
                    })}
                    {overflowDots > 0 && (
                      <Text
                        className="text-muted-foreground"
                        style={{
                          fontSize: 8,
                          lineHeight: 8,
                        }}
                      >
                        +{overflowDots}
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={{ height: 9 }} />
                )}

                {/* Calorie Label */}
                {cals > 0 && (
                  <Text
                    className={`mt-0.5 text-[8px] font-semibold ${
                      tint === "on"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : tint === "over"
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {cals}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Legend & Instructions */}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 12,
          gap: 8,
        }}
      >
        <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
          Legend
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View className="w-2 h-2 rounded-full bg-amber-500" />
            <Text className="text-muted-foreground text-xs">Breakfast</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View className="w-2 h-2 rounded-full bg-orange-500" />
            <Text className="text-muted-foreground text-xs">Lunch</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View className="w-2 h-2 rounded-full bg-indigo-500" />
            <Text className="text-muted-foreground text-xs">Dinner</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View className="w-2 h-2 rounded-full bg-emerald-500" />
            <Text className="text-muted-foreground text-xs">Snack</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View className="w-2 h-2 rounded-full border border-blue-500" />
            <Text className="text-muted-foreground text-xs">Planned (ring)</Text>
          </View>
        </View>
        <Text className="text-muted-foreground text-xs mt-1">
          Tap any day in the grid to view its logged food and meal plans.
        </Text>
      </View>
    </ScrollView>
  );
}
