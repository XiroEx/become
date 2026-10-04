/**
 * THE SMART-ROTATING TILE (NP-156) — the native port of
 * `webapp/components/dashboard/SmartRotatingTile.tsx`.
 *
 * It is not a card type of its own: it is a rotating window onto the cards the
 * member has NOT pinned on the grid. So it renders through the SAME renderers
 * the grid uses for fixed tiles (`StatTile`, `StatActionTile`, `MetricTile`) —
 * a rotated card is pixel-identical to a pinned one — and a small "live" dot
 * marks it as the one that moves.
 *
 * WHAT IT ROTATES, AND HOW FAST. The pool is this tile's `settings.pool`
 * (default: the 8 stat cards, `DEFAULT_SMART_POOL`) minus every card already
 * pinned on the grid, ordered by relevance with the member's tap history folded
 * in — all of that is `lib/dashboard/smartRotation.ts`, the web's numbers.
 * The cadence is this tile's `settings.intervalMs` (4s / 6s / 10s / 30s, the
 * only values the customizer offers), defaulting to
 * `DEFAULT_SMART_INTERVAL_MS`. Two smart tiles on one grid stagger via
 * `startIndex` so they never show the same card.
 *
 * TAPS. Pressing the visible card calls `onTap(key)` with `stat:<id>` /
 * `metric:<id>` — the grid posts it to `/api/dashboard/tile-tap` and folds it
 * into the ordering immediately. A stat card still performs its own action
 * (open the weigh-in sheet, the calendar, …) on the same press; a metric card
 * only records, because the web's metric drill-in is still a placeholder.
 *
 * REDUCE MOTION. The web skips auto-rotation under
 * `prefers-reduced-motion: reduce`; so does this, via `useReducedMotion()` —
 * the tile then shows the most relevant card and holds it.
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  DEFAULT_SMART_INTERVAL_MS,
  type DashboardMetricSummary,
  type DashboardTile,
  type TileEngagement,
} from "@become/api-client";
import type { DashboardStatData } from "@/lib/dashboard/types";
import type { MoodLevel } from "@/components/CheckInModal";
import {
  buildRotationItems,
  isActionStatId,
  DEFAULT_SMART_POOL,
} from "@/lib/dashboard/smartRotation";
import { StatTile } from "./StatTile";
import { StatActionTile } from "./StatActionTile";
import { MetricTile } from "./MetricTile";

export interface SmartRotatingTileProps {
  /** The layout entry — `size`, `settings.pool` and `settings.intervalMs`. */
  tile: DashboardTile;
  statData?: DashboardStatData | null;
  /** `metrics[]` from `GET /api/dashboard/tiles`, in the server's order. */
  metrics?: readonly DashboardMetricSummary[];
  /** Cards pinned on the grid — excluded so the tile never repeats one. */
  excludeKeys?: ReadonlySet<string>;
  /** Tap history (server rows + this session's taps). */
  engagement?: readonly TileEngagement[];
  /** The server's clock, so recency maths does not depend on the device's. */
  now?: Date;
  /** Offset so two smart tiles don't open on the same card. */
  startIndex?: number;
  /** Fired with the item key when the visible card is pressed. */
  onTap?: (key: string) => void;
  // Pass-through handlers so a rotated card behaves exactly like a pinned one.
  onOpenMind?: () => void;
  onOpenNutrition?: () => void;
  onOpenWorkoutNow?: () => void;
  onOpenCalendar?: () => void;
  onOpenCheckIn?: () => void;
  onOpenWeight?: () => void;
  onOpenMood?: () => void;
  onMoodChange?: (mood: MoodLevel) => Promise<void> | void;
  onOpenSettings?: () => void;
  onOpenStreaks?: () => void;
  /** Opens training history (NP-112). The This Week + Total Workouts tiles. */
  onOpenHistory?: () => void;
  testID?: string;
}

export function SmartRotatingTile({
  tile,
  statData,
  metrics,
  excludeKeys,
  engagement,
  now,
  startIndex = 0,
  onTap,
  onOpenMind,
  onOpenNutrition,
  onOpenWorkoutNow,
  onOpenCalendar,
  onOpenCheckIn,
  onOpenWeight,
  onOpenMood,
  onMoodChange,
  onOpenSettings,
  onOpenStreaks,
  onOpenHistory,
  testID,
}: SmartRotatingTileProps) {
  const { colors } = useThemeTokens();
  const reduceMotion = useReducedMotion();
  const rootTestId = testID ?? `tile-${tile.id}`;

  const metricIds = useMemo(
    () => (metrics ?? []).map((m) => m.id),
    [metrics],
  );
  const poolKeys = useMemo(
    () => new Set(tile.settings?.pool ?? DEFAULT_SMART_POOL),
    [tile.settings?.pool],
  );
  const items = useMemo(
    () =>
      buildRotationItems({
        statData,
        metricIds,
        excludeKeys,
        poolKeys,
        engagement,
        now,
      }),
    [statData, metricIds, excludeKeys, poolKeys, engagement, now],
  );

  const count = items.length;
  const intervalMs = tile.settings?.intervalMs ?? DEFAULT_SMART_INTERVAL_MS;
  const [step, setStep] = useState(0);
  // Unbounded step + modulo, so the pool changing size (a metric landing, a
  // tap re-ordering it) never leaves the index out of range.
  const index = count > 0 ? (((startIndex + step) % count) + count) % count : 0;

  useEffect(() => {
    if (count <= 1) return;
    if (reduceMotion) return;
    const timer = setInterval(() => {
      setStep((prev) => prev + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [count, intervalMs, reduceMotion]);

  if (count === 0) {
    // Nothing eligible: every card in the pool is already pinned. Same copy as
    // the web's empty smart tile.
    return (
      <View
        testID={rootTestId}
        accessibilityRole="summary"
        accessibilityLabel="Smart tile: keep logging"
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text
          className="text-muted-foreground text-xs text-center"
          numberOfLines={2}
        >
          Keep logging — smart tile coming
        </Text>
      </View>
    );
  }

  const item = items[index]!;
  const cardTestId = `${rootTestId}-card`;
  const handleTap = onTap ? () => onTap(item.key) : undefined;

  let card: React.ReactNode;
  if (item.kind === "metric") {
    const metric = (metrics ?? []).find((m) => m.id === item.id) ?? null;
    card = (
      <MetricTile
        metric={metric}
        fallbackId={item.id}
        size={tile.size}
        onTap={handleTap}
        testID={cardTestId}
      />
    );
  } else if (isActionStatId(item.id)) {
    card = (
      <StatActionTile
        tile={{ id: item.id, kind: "stat", size: tile.size }}
        onOpenMind={onOpenMind}
        onOpenNutrition={onOpenNutrition}
        onOpenWorkoutNow={onOpenWorkoutNow}
        onOpenWeight={onOpenWeight}
        onTap={handleTap}
        testID={cardTestId}
      />
    );
  } else {
    card = (
      <StatTile
        tile={{ id: item.id, kind: "stat", size: tile.size }}
        statData={statData}
        onOpenCalendar={onOpenCalendar}
        onOpenNutrition={onOpenNutrition}
        onOpenCheckIn={onOpenCheckIn}
        onOpenWeight={onOpenWeight}
        onOpenMood={onOpenMood}
        onMoodChange={onMoodChange}
        onOpenSettings={onOpenSettings}
        onOpenStreaks={onOpenStreaks}
        onOpenHistory={onOpenHistory}
        onTap={handleTap}
        testID={cardTestId}
      />
    );
  }

  return (
    <View testID={rootTestId} style={styles.wrapper}>
      {card}
      {/* The "live" affordance: a small dot, non-interactive so it can never
          swallow a press on the card underneath. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.liveDot, { backgroundColor: colors.primary }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  card: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  liveDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.9,
  },
});

export default SmartRotatingTile;
