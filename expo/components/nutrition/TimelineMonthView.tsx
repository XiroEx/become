import { useCallback, useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  MoreVertical,
  CopyPlus,
  ChefHat,
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
  DAY_LABELS,
  MONTH_NAMES,
  getMonthDays,
  parseDateKey,
  toDateKey,
  isSameLocalDay,
} from "@/lib/nutrition/calendarDays";
import {
  tagDotColors,
  tintForCalories,
  TINT_BG_CLASSES,
} from "@/lib/nutrition/timelinePlanning";
import { CopyDaySheet } from "@/components/nutrition/CopyDaySheet";
import { ApplyMealSheet } from "@/components/nutrition/ApplyMealSheet";

/**
 * ─── Month header controls + tag-dot-only cells (NP-318) ────────────────────
 *
 * Ports the two month-header controls the web's `MonthView`
 * (`webapp/app/dashboard/timeline/MonthView.tsx:329-414`) sits between the
 * arrows — a settings gear (here: a single "Show calorie % on cells" toggle,
 * off by default like the web's mobile default) and a kebab ("Plan tools":
 * the same `CopyDaySheet` / `ApplyMealSheet` NP-260 wired into Week view) —
 * plus moves the "Today" pill back in front of the month label instead of
 * stacked underneath it. Grid cells drop the raw calorie number per cell
 * (native-only drift; the web shows only tag dots, and conditionally a %,
 * never a bare calorie count).
 */

export interface TimelineMonthViewProps {
  selectedDate: string; // YYYY-MM-DD
  calorieGoal?: number;
  onOpenDay: (dateKey: string) => void;
  onLogPlan?: (planId: string) => void;
  onSkipPlan?: (planId: string) => void;
  onRemovePlan?: (planId: string, scope?: "one" | "series") => void;
  testID?: string;
}

function buildAriaLabel(
  day: Date,
  cals: number,
  goal: number,
  logsCount: number,
  plansCount: number,
  isToday: boolean,
): string {
  const dateStr = day.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const parts: string[] = [dateStr];
  if (isToday) parts.push("Today");
  if (cals > 0 && goal > 0) {
    parts.push(`${cals} of ${goal} calories`);
  } else if (cals > 0) {
    parts.push(`${cals} calories`);
  } else if (logsCount === 0 && plansCount === 0) {
    parts.push("no entries");
  }
  if (logsCount > 0) parts.push(`${logsCount} logged`);
  if (plansCount > 0) parts.push(`${plansCount} planned`);
  return parts.join(", ");
}

export function TimelineMonthView({
  selectedDate,
  calorieGoal = 2000,
  onOpenDay,
  onLogPlan,
  onSkipPlan,
  onRemovePlan,
  testID = "timeline-month-view",
}: TimelineMonthViewProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const { day: today, tzOffset } = useLocalDay();

  const initialDate = useMemo(() => parseDateKey(selectedDate), [selectedDate]);
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());

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
    const t = parseDateKey(today);
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
  };

  // Header controls (NP-318) — gear toggle + kebab plan-tools menu.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showCaloriePct, setShowCaloriePct] = useState(false);
  const [planToolsOpen, setPlanToolsOpen] = useState(false);
  const [copyDayOpen, setCopyDayOpen] = useState(false);
  const [applyMealOpen, setApplyMealOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Build grid of dates for the month
  const monthDays = useMemo(() => {
    return getMonthDays(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  const fromStr = useMemo(() => {
    const first = monthDays[0];
    return first ? toDateKey(first) : "";
  }, [monthDays]);

  const toStr = useMemo(() => {
    const last = monthDays[monthDays.length - 1];
    return last ? toDateKey(last) : "";
  }, [monthDays]);

  // Fetch logs & plans for the visible month range
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

  // Tag choices for `ApplyMealSheet` — the same `/api/tags` source Week
  // view's plan tools use.
  const { data: tagsData } = useFetch<TagsResponse>(
    "/api/tags",
    TagsResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

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

  // Map data by dateKey
  const logsByDate = useMemo(() => {
    const map = new Map<string, MealLog[]>();
    for (const d of logsData?.days ?? []) {
      map.set(d.date, d.logs ?? []);
    }
    return map;
  }, [logsData?.days]);

  const calsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of logsData?.days ?? []) {
      map.set(d.date, Math.round(d.dailyTotals?.calories ?? 0));
    }
    return map;
  }, [logsData?.days]);

  const plansByDate = useMemo(() => {
    const map = new Map<string, MealPlan[]>();
    for (const p of activePlans) {
      const key = p.plannedDateKey ?? p.plannedDate?.split("T")[0];
      if (key) {
        const arr = map.get(key) ?? [];
        arr.push(p);
        map.set(key, arr);
      }
    }
    return map;
  }, [activePlans]);

  // Month stats
  const monthSummary = useMemo(() => {
    let daysLogged = 0;
    let totalCalories = 0;
    for (const d of monthDays) {
      if (d.getMonth() === viewMonth) {
        const key = toDateKey(d);
        const cals = calsByDate.get(key) ?? 0;
        const logs = logsByDate.get(key) ?? [];
        if (logs.length > 0) {
          daysLogged += 1;
        }
        totalCalories += cals;
      }
    }
    return { daysLogged, totalCalories };
  }, [monthDays, viewMonth, calsByDate, logsByDate]);

  const todayObj = useMemo(() => parseDateKey(today), [today]);
  const monthLabel = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  return (
    <View testID={testID} className="gap-4 px-4 pb-12">
      {/* Month Navigation Header */}
      <View className="flex-row items-center justify-between py-2">
        <Pressable
          testID="timeline-month-prev"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => changeMonth(-1)}
          className="h-10 w-10 items-center justify-center rounded-xl bg-card border border-border"
        >
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>

        {/* Today pill, month label, gear and kebab — one row, the web's
            order (`MonthView.tsx:340-406`), not "Today" stacked under the
            month name with no gear/kebab at all. */}
        <View className="flex-row items-center gap-1.5">
          <Pressable
            testID="timeline-month-today"
            accessibilityRole="button"
            accessibilityLabel="Current month"
            onPress={jumpToToday}
            className="rounded-full bg-muted px-2.5 py-0.5"
          >
            <Text className="text-muted-foreground text-[11px] font-semibold">
              Today
            </Text>
          </Pressable>

          <Text className="text-foreground text-sm font-bold">
            {monthLabel}
          </Text>

          <Pressable
            testID="timeline-month-settings"
            accessibilityRole="button"
            accessibilityLabel="Month view settings"
            accessibilityState={{ expanded: settingsOpen }}
            onPress={() => {
              setPlanToolsOpen(false);
              setSettingsOpen((o) => !o);
            }}
            className="h-8 w-8 items-center justify-center rounded-lg"
          >
            <Settings size={16} color={colors["muted-foreground"]} />
          </Pressable>

          <View>
            <Pressable
              testID="timeline-month-kebab"
              accessibilityRole="button"
              accessibilityLabel="Plan tools"
              accessibilityState={{ expanded: planToolsOpen }}
              onPress={() => {
                setSettingsOpen(false);
                setPlanToolsOpen((o) => !o);
              }}
              className="h-8 w-8 items-center justify-center rounded-lg"
            >
              <MoreVertical size={16} color={colors["muted-foreground"]} />
            </Pressable>

            {planToolsOpen ? (
              <View
                testID="timeline-month-plan-tools-menu"
                className="absolute right-0 top-9 z-40 min-w-[190px] gap-0.5 rounded-lg border border-border bg-card p-1"
              >
                <Pressable
                  testID="timeline-month-copy-day"
                  accessibilityRole="button"
                  accessibilityLabel="Copy a day forward"
                  onPress={() => {
                    setPlanToolsOpen(false);
                    setToast(null);
                    setCopyDayOpen(true);
                  }}
                  className="flex-row items-center gap-2 rounded px-2 py-1.5"
                >
                  <CopyPlus size={14} color={colors.primary} />
                  <Text className="text-foreground text-xs font-medium">
                    Copy a day forward…
                  </Text>
                </Pressable>
                <Pressable
                  testID="timeline-month-apply-meal"
                  accessibilityRole="button"
                  accessibilityLabel="Apply meal to days"
                  onPress={() => {
                    setPlanToolsOpen(false);
                    setToast(null);
                    setApplyMealOpen(true);
                  }}
                  className="flex-row items-center gap-2 rounded px-2 py-1.5"
                >
                  <ChefHat size={14} color={colors.accent} />
                  <Text className="text-foreground text-xs font-medium">
                    Apply meal to days…
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          testID="timeline-month-next"
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => changeMonth(1)}
          className="h-10 w-10 items-center justify-center rounded-xl bg-card border border-border"
        >
          <ChevronRight size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Settings panel — the gear's one toggle (NP-318). Off by default,
          matching the web's mobile default (`MonthView.tsx:90-97`). */}
      {settingsOpen ? (
        <View
          testID="timeline-month-settings-panel"
          className="rounded-xl border border-border bg-card p-3"
        >
          <Pressable
            testID="timeline-month-settings-calorie-pct"
            accessibilityRole="switch"
            accessibilityState={{ checked: showCaloriePct }}
            onPress={() => setShowCaloriePct((v) => !v)}
            className="flex-row items-center justify-between py-1"
          >
            <Text className="text-foreground text-sm">Show calorie % on cells</Text>
            <View
              className={`h-5 w-9 justify-center rounded-full px-0.5 ${
                showCaloriePct ? "items-end bg-foreground" : "items-start bg-muted"
              }`}
            >
              <View className="h-4 w-4 rounded-full bg-card" />
            </View>
          </Pressable>
        </View>
      ) : null}

      {toast ? (
        <Pressable
          testID="timeline-month-toast"
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

      {/* Month Calendar Grid Card */}
      <View
        testID="timeline-month-grid-card"
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
        {/* Day-of-week headers */}
        <View className="flex-row border-b border-border bg-muted/30">
          {DAY_LABELS.map((dayLabel) => (
            <View key={dayLabel} className="flex-1 py-2.5 items-center">
              <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                {dayLabel}
              </Text>
            </View>
          ))}
        </View>

        {/* Calendar cells grid */}
        <View className="flex-row flex-wrap" testID="timeline-month-grid">
          {monthDays.map((d) => {
            const key = toDateKey(d);
            const isThisMonth = d.getMonth() === viewMonth;
            const isToday = isSameLocalDay(d, todayObj);
            const dayLogs = logsByDate.get(key) ?? [];
            const dayPlans = plansByDate.get(key) ?? [];
            const cals = calsByDate.get(key) ?? 0;
            const isLogged = dayLogs.length > 0;
            const tint = tintForCalories(cals, calorieGoal);
            const tintClass = TINT_BG_CLASSES[tint];
            const ariaLabel = buildAriaLabel(
              d,
              cals,
              calorieGoal,
              dayLogs.length,
              dayPlans.length,
              isToday,
            );

            // Tags for dots
            const loggedTags = Array.from(
              new Set(
                dayLogs.flatMap((l) => (l.tags && l.tags.length > 0 ? l.tags : ["snack"])),
              ),
            );
            const plannedTags = Array.from(
              new Set(dayPlans.map((p) => p.tag)),
            ).filter((t) => !loggedTags.includes(t));

            return (
              <Pressable
                key={key}
                testID={`timeline-month-cell-${key}`}
                accessibilityRole="button"
                accessibilityLabel={ariaLabel}
                onPress={() => onOpenDay(key)}
                style={{ width: "14.2857%" }}
                className={`min-h-[56px] border-b border-r border-border/40 p-1 items-center justify-between ${
                  !isThisMonth ? "opacity-30" : ""
                } ${tintClass}`}
              >
                {/* Date number */}
                <View
                  className={`h-6 w-6 rounded-full items-center justify-center ${
                    isToday ? "bg-primary" : ""
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      isToday ? "text-primary-foreground font-bold" : "text-foreground"
                    }`}
                  >
                    {d.getDate()}
                  </Text>
                </View>

                {/* Logged / Planned dots indicator */}
                <View className="flex-row items-center justify-center gap-0.5 min-h-[8px]">
                  {isLogged ? (
                    <View
                      testID={`timeline-month-logged-${key}`}
                      className="flex-row items-center gap-0.5"
                    >
                      {loggedTags.slice(0, 3).map((tag, idx) => {
                        const { solid } = tagDotColors(tag);
                        return (
                          <View
                            key={`${tag}-${idx}`}
                            className={`h-1.5 w-1.5 rounded-full ${solid}`}
                          />
                        );
                      })}
                    </View>
                  ) : null}

                  {plannedTags.length > 0 ? (
                    <View
                      testID={`timeline-month-planned-${key}`}
                      className="flex-row items-center gap-0.5"
                    >
                      {plannedTags.slice(0, 2).map((tag, idx) => {
                        const { ring } = tagDotColors(tag);
                        return (
                          <View
                            key={`plan-${tag}-${idx}`}
                            className={`h-1.5 w-1.5 rounded-full border ${ring} bg-transparent`}
                          />
                        );
                      })}
                    </View>
                  ) : null}
                </View>

                {/* Calorie % micro-label — gear-toggled, off by default, and
                    a PERCENT of goal when on, never a bare calorie count
                    (the web shows tag dots and, optionally, a %; it never
                    shows raw calories on a cell — `MonthView.tsx:530-535`). */}
                {showCaloriePct && cals > 0 && isThisMonth && calorieGoal > 0 ? (
                  <Text className="text-[9px] font-medium text-muted-foreground tabular-nums">
                    {Math.round((cals / calorieGoal) * 100)}%
                  </Text>
                ) : (
                  <View className="h-3" />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Month Summary Bar */}
      <View
        testID="timeline-month-summary"
        className="rounded-2xl border border-border bg-card p-4 flex-row justify-between items-center"
      >
        <View className="gap-0.5">
          <Text className="text-foreground text-sm font-semibold">
            {monthSummary.daysLogged} days logged
          </Text>
          <Text className="text-muted-foreground text-xs">
            {monthSummary.totalCalories.toLocaleString()} total calories
          </Text>
        </View>

        <View className="bg-muted px-3 py-1.5 rounded-xl">
          <Text className="text-muted-foreground text-xs font-medium">
            Tap a day to open
          </Text>
        </View>
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
