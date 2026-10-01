import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { DashboardTile } from "@become/api-client";
import { TileErrorBoundary } from "./TileErrorBoundary";
import { StatActionTile } from "./StatActionTile";
import { StatTile } from "./StatTile";
import { SuggestionCard } from "./SuggestionCard";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { apiFetch } from "@become/api-client";
import {
  readCachedLayout,
  getCachedLayoutSync,
  writeCachedLayout,
  LayoutWireSchema,
} from "@/lib/dashboard/tileLayout";
import { useLocalDay, useOnForeground } from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  Flame,
  TrendingUp,
  Target,
  Utensils,
  Droplets,
  Scale,
  Dumbbell,
  Activity,
} from "lucide-react-native";
import { streakPages, type StreaksLite } from "@/lib/dashboard/streakTile";
import { describeGoal, formatWeight, formatWeightDelta } from "@/lib/dashboard/goalTile";
import type { DashboardTileContext, SuggestionItem } from "@/lib/dashboard/types";

export interface TileGridProps {
  /**
   * Controlled layout. When provided (incl. null while parent is loading),
   * the grid renders this layout and does not self-fetch.
   */
  layout?: DashboardTile[] | null;
  /** Live stat context supplying values for streak, mood, weekly, goal, calories etc. */
  statContext?: DashboardTileContext;
  /** Server-generated suggestions (e.g. Nudge cards) */
  suggestions?: SuggestionItem[];
  onOpenMind?: () => void;
  onOpenNutrition?: () => void;
  onOpenWorkoutNow?: () => void;
  onOpenStreak?: () => void;
  onOpenMood?: () => void;
  onOpenGoal?: () => void;
  onOpenCalories?: () => void;
  onOpenCalendar?: () => void;
  onDismissSuggestion?: (id: string) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const ACTION_STAT_IDS = new Set(["mindset", "nutrition", "workoutNow"]);

export function isActionTileId(id: string): boolean {
  return ACTION_STAT_IDS.has(id);
}

function useSafeAuth() {
  try {
    return useAuth();
  } catch {
    return { token: null, user: null };
  }
}

export function TileGrid({
  layout: layoutProp,
  statContext,
  suggestions,
  onOpenMind,
  onOpenNutrition,
  onOpenWorkoutNow,
  onOpenStreak,
  onOpenMood,
  onOpenGoal,
  onOpenCalories,
  onOpenCalendar,
  onDismissSuggestion,
  testID,
  style,
}: TileGridProps) {
  const isControlled = layoutProp !== undefined;
  const auth = useSafeAuth();
  const token = auth?.token ?? null;
  const { day: today } = useLocalDay();
  const dayRef = useRef(today);
  const { colors } = useThemeTokens();

  // Synchronous cache seed when uncontrolled
  const [internalLayout, setInternalLayout] = useState<DashboardTile[] | null>(
    () => {
      if (isControlled) return null;
      return getCachedLayoutSync();
    },
  );

  // Uncontrolled fetching and caching
  useEffect(() => {
    if (isControlled) return;
    let cancelled = false;

    async function loadLayout() {
      const cached = await readCachedLayout();
      if (!cancelled && cached) {
        setInternalLayout((prev) => prev ?? cached);
      }

      try {
        const result = await apiFetch("/api/dashboard/layout", LayoutWireSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        if (!cancelled && result && Array.isArray((result as any)?.layout)) {
          setInternalLayout((result as any).layout);
          void writeCachedLayout((result as any).layout);
        }
      } catch {
        // fail-soft: keep cached layout or empty
      }
    }

    void loadLayout();
    return () => {
      cancelled = true;
    };
  }, [isControlled, token]);

  // Refetch when local day rolls over if uncontrolled
  useEffect(() => {
    if (isControlled) return;
    if (dayRef.current !== today) {
      dayRef.current = today;
      void apiFetch("/api/dashboard/layout", LayoutWireSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
      })
        .then((result) => {
          if (result && Array.isArray((result as any)?.layout)) {
            setInternalLayout((result as any).layout);
            void writeCachedLayout((result as any).layout);
          }
        })
        .catch(() => {});
    }
  }, [today, isControlled, token]);

  // Refetch on foreground if uncontrolled
  useOnForeground(() => {
    if (isControlled) return;
    void apiFetch("/api/dashboard/layout", LayoutWireSchema, {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    })
      .then((result) => {
        if (result && Array.isArray((result as any)?.layout)) {
          setInternalLayout((result as any).layout);
          void writeCachedLayout((result as any).layout);
        }
      })
      .catch(() => {});
  });

  const layout = isControlled ? layoutProp : internalLayout;

  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);
  const availableWidth =
    measuredWidth > 0 ? measuredWidth : Math.max(0, windowWidth - 32);
  const GAP = 8;
  const col1Width = Math.floor((availableWidth - GAP) / 2);

  if (layout === null) {
    return (
      <View
        testID={testID ? `${testID}-loading` : "tilegrid-loading"}
        style={[styles.gridContainer, style]}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading dashboard tiles"
      >
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.cell1x1,
              { width: col1Width > 0 ? col1Width : "48.5%" },
            ]}
          >
            <View className="h-24 bg-card rounded-2xl border border-border opacity-60" />
          </View>
        ))}
      </View>
    );
  }

  if (layout.length === 0) {
    return null;
  }

  const renderTile = (tile: DashboardTile, size: "1x1" | "2x1") => {
    // 1. Action tiles: mindset, nutrition, workoutNow
    if (tile.kind === "stat" && isActionTileId(tile.id)) {
      return (
        <StatActionTile
          tile={tile}
          onOpenMind={onOpenMind}
          onOpenNutrition={onOpenNutrition}
          onOpenWorkoutNow={onOpenWorkoutNow}
        />
      );
    }

    // 2. Smart / Smart-rotating tiles: render suggestion / nudge card or rotator
    if (tile.kind === "smart-rotating" || tile.id === "smart") {
      const topSuggestion = suggestions?.[0] ?? null;
      return (
        <SuggestionCard
          tile={tile}
          suggestion={topSuggestion}
          onDismiss={onDismissSuggestion}
          onAction={(href) => {
            if (href.includes("nutrition")) onOpenNutrition?.();
            else if (href.includes("mind")) onOpenMind?.();
            else if (href.includes("workout")) onOpenWorkoutNow?.();
          }}
        />
      );
    }

    // 3. Stat tiles
    if (tile.id === "streak") {
      const fallback: StreaksLite | null =
        statContext?.streaks ??
        (statContext?.streakData
          ? {
              overall: {
                current: statContext.streakData.streakDays,
                best: statContext.streakData.longestStreak,
                nextMilestone: statContext.streakData.nextMilestone,
                activeToday: statContext.streakData.activityToday,
                freezes: statContext.streakData.streakFreezes,
              },
              pillars: {
                workout: {
                  unit: "days",
                  current: 0,
                  best: 0,
                  thisWeek: 0,
                  target: null,
                  weekLost: false,
                },
                nutrition: { current: 0, best: 0, activeToday: false },
                mindset: { current: 0, best: 0, activeToday: false },
                super: {
                  current: 0,
                  best: 0,
                  activeToday: false,
                  today: {
                    nutrition: false,
                    mindset: false,
                    trained: false,
                    restDay: false,
                    weekOnTrack: true,
                  },
                },
              },
            }
          : null);

      const pages = streakPages(fallback);
      const lead = pages[0];

      return (
        <StatTile
          id={tile.id}
          label={lead ? lead.label : "Day Streak"}
          value={lead ? lead.value : "—"}
          unit={lead?.unit}
          subline={lead?.footer}
          progressPct={lead?.pct}
          progressColor={colors.accent}
          accent="amber"
          size={size}
          Icon={Flame}
          onPress={onOpenStreak ?? onOpenCalendar}
        />
      );
    }

    if (tile.id === "mood") {
      const recent =
        statContext?.data?.moodData?.slice(-7).map((m) => m.value) ?? [];
      const todaysMood = statContext?.todaysMood ?? null;
      const moodLabels: Record<number, string> = {
        1: "Bad",
        2: "Not Great",
        3: "Okay",
        4: "Pretty Good",
        5: "Great",
      };
      const moodVal = todaysMood ? (moodLabels[todaysMood] ?? "Set") : "Set";

      let pct: number | null = null;
      let barColor = colors["muted-foreground"];
      let subline = "No entries yet";

      if (recent.length > 0) {
        const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
        pct = Math.round((avg / 5) * 100);
        subline = `Last ${recent.length} ${recent.length === 1 ? "day" : "days"}`;
        barColor =
          avg >= 3.5
            ? colors.success
            : avg >= 2.5
              ? colors.accent
              : colors.destructive;
      }

      return (
        <StatTile
          id={tile.id}
          label="Today's Mood"
          value={moodVal}
          subline={subline}
          progressPct={pct}
          progressColor={barColor}
          accent="zinc"
          size={size}
          Icon={Flame}
          onPress={onOpenMood ?? statContext?.onOpenCheckIn}
        />
      );
    }

    if (tile.id === "weekly") {
      const done = statContext?.data?.stats?.thisWeekWorkouts ?? 0;
      const target =
        statContext?.data?.goal?.weeklyAvailability ??
        statContext?.weeklyAvailability ??
        null;

      const val = target ? `${done}/${target}` : `${done}`;
      const pct = target ? Math.min(100, Math.round((done / target) * 100)) : null;
      const remaining = target ? Math.max(0, target - done) : 0;
      const subline = target
        ? remaining === 0
          ? "Weekly target hit 🎉"
          : `${remaining} to weekly target`
        : "Set a weekly target";

      return (
        <StatTile
          id={tile.id}
          label="This Week"
          value={val}
          subline={subline}
          progressPct={pct}
          progressColor={colors.success}
          accent="green"
          size={size}
          Icon={TrendingUp}
          onPress={onOpenWorkoutNow ?? onOpenCalendar}
        />
      );
    }

    if (tile.id === "goal") {
      const unit =
        statContext?.data?.goal?.weightUnit ?? statContext?.weightUnit ?? "lbs";
      const weights = statContext?.data?.weightData ?? [];
      const view = describeGoal({
        fitnessGoal: statContext?.data?.goal?.fitnessGoal,
        nutritionDirection: statContext?.data?.goal?.nutritionDirection,
        targetWeightKg: statContext?.data?.goal?.targetWeightKg,
        startWeightKg: statContext?.data?.goal?.startWeightKg,
        latestWeight: weights.length ? weights[weights.length - 1]?.value : null,
        earliestWeight: weights.length ? weights[0]?.value : null,
        weightUnit: unit,
        pace: statContext?.data?.goal?.pace ?? null,
        program: statContext?.data?.currentProgram ?? null,
      });

      return (
        <StatTile
          id={tile.id}
          label={view.label}
          value={view.value}
          subline={view.footer}
          progressPct={view.pct}
          progressColor={view.atTarget ? colors.success : colors.accent}
          accent="amber"
          size={size}
          Icon={Target}
          onPress={onOpenGoal ?? onOpenNutrition}
        />
      );
    }

    if (tile.id === "calories") {
      const cal = statContext?.nutritionData?.calories;
      if (cal && cal.goal) {
        const consumed = Math.round(cal.consumed);
        const goal = Math.round(cal.goal);
        const pct =
          goal > 0 ? Math.min(100, Math.max(0, Math.round((consumed / goal) * 100))) : 0;
        const over = consumed > goal;
        const near = !over && pct >= 90;
        const remaining = Math.max(0, goal - consumed);
        const overBy = consumed - goal;
        const subline = over ? `${overBy} over` : `${remaining} cal left`;

        return (
          <StatTile
            id={tile.id}
            label="Calories"
            value={`${consumed}/${goal}`}
            subline={subline}
            progressPct={pct}
            progressColor={
              over ? colors.destructive : near ? colors.accent : colors.success
            }
            accent={over ? "red" : "green"}
            size={size}
            Icon={Utensils}
            onPress={onOpenCalories ?? onOpenNutrition}
          />
        );
      }

      return (
        <StatTile
          id={tile.id}
          label="Calories"
          value="0/--"
          subline="Set a calorie goal"
          progressPct={0}
          accent="red"
          size={size}
          Icon={Utensils}
          onPress={onOpenCalories ?? onOpenNutrition}
        />
      );
    }

    if (tile.id === "water") {
      const water = statContext?.nutritionData?.water;
      if (water && water.goal) {
        const consumed = Math.round(water.consumed);
        const goal = Math.round(water.goal);
        const pct =
          goal > 0 ? Math.min(100, Math.max(0, Math.round((consumed / goal) * 100))) : 0;

        return (
          <StatTile
            id={tile.id}
            label="Water"
            value={`${consumed}/${goal}`}
            subline={consumed >= goal ? "Goal hit 🎉" : `${Math.max(0, goal - consumed)} left`}
            progressPct={pct}
            progressColor={colors.primary}
            accent="blue"
            size={size}
            Icon={Droplets}
            onPress={onOpenNutrition}
          />
        );
      }

      return (
        <StatTile
          id={tile.id}
          label="Water"
          value="0/--"
          subline="Track water"
          progressPct={0}
          accent="blue"
          size={size}
          Icon={Droplets}
          onPress={onOpenNutrition}
        />
      );
    }

    if (tile.id === "weight") {
      const weights = statContext?.data?.weightData ?? [];
      const latest = weights.length ? weights[weights.length - 1]?.value : null;
      const prev = weights.length > 1 ? weights[weights.length - 2]?.value : null;
      const delta = latest != null && prev != null ? latest - prev : null;
      const unit =
        statContext?.data?.goal?.weightUnit ?? statContext?.weightUnit ?? "lbs";

      return (
        <StatTile
          id={tile.id}
          label="Weight"
          value={latest != null ? `${formatWeight(latest, unit)}` : "—"}
          unit={unit}
          subline={
            delta != null
              ? `${delta >= 0 ? "+" : ""}${formatWeightDelta(delta, unit)} vs last`
              : "Latest weigh-in"
          }
          accent="zinc"
          size={size}
          Icon={Scale}
          onPress={statContext?.onOpenCheckIn}
        />
      );
    }

    if (tile.id === "workouts") {
      const total = statContext?.data?.stats?.totalWorkouts ?? 0;
      return (
        <StatTile
          id={tile.id}
          label="Total Workouts"
          value={String(total)}
          subline="Lifetime sessions"
          accent="zinc"
          size={size}
          Icon={Dumbbell}
          onPress={onOpenWorkoutNow ?? onOpenCalendar}
        />
      );
    }

    // 4. Metric tile fallback
    const metricLabel = tile.id
      ? tile.id.replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "Metric";

    return (
      <StatTile
        id={tile.id}
        label={metricLabel}
        value="—"
        subline="Metric tracking"
        accent="blue"
        size={size}
        Icon={Activity}
      />
    );
  };

  return (
    <View
      testID={testID ?? "tilegrid"}
      accessibilityRole="none"
      accessibilityLabel="Dashboard tiles"
      onLayout={(e) => setMeasuredWidth(e.nativeEvent.layout.width)}
      style={[styles.gridContainer, style]}
    >
      {layout.map((tile, idx) => {
        const isWide = tile.size === "2x1";
        const cellWidth =
          isWide ? "100%" : col1Width > 0 ? col1Width : "48.5%";
        const key = `${tile.kind}-${tile.id}-${idx}`;

        return (
          <View
            key={key}
            style={[
              styles.cell,
              isWide ? styles.cell2x1 : styles.cell1x1,
              { width: cellWidth },
            ]}
          >
            <TileErrorBoundary
              label={tile.id}
              testID={`tile-error-${tile.id}`}
            >
              {renderTile(tile, isWide ? "2x1" : "1x1")}
            </TileErrorBoundary>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  cell: {
    marginBottom: 8,
  },
  cell1x1: {},
  cell2x1: {},
});

export default TileGrid;
