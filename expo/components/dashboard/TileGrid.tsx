import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { DashboardTile, DashboardTilesResponse } from "@become/api-client";
import { TileErrorBoundary } from "./TileErrorBoundary";
import { StatActionTile } from "./StatActionTile";
import { PlaceholderTile } from "./PlaceholderTile";
import { StatTile } from "./StatTile";
import { StreakTile } from "./StreakTile";
import { SuggestionTile } from "./SuggestionTile";
import { MetricTile } from "./MetricTile";
import { SmartRotatingTile } from "./SmartRotatingTile";
import type { DashboardStatData } from "@/lib/dashboard/types";
import type { MoodLevel } from "@/components/CheckInModal";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { apiFetch, DashboardTileTapResponseSchema } from "@become/api-client";
import {
  readCachedLayout,
  getCachedLayoutSync,
  writeCachedLayout,
  LayoutWireSchema,
} from "@/lib/dashboard/tileLayout";
import {
  engagementSignature,
  isActionStatId,
  mergeEngagement,
  pinnedRotationKeys,
  type TapBump,
} from "@/lib/dashboard/smartRotation";
import { useLocalDay, useOnForeground } from "@/lib/time/localDay";

export interface TileGridProps {
  /**
   * Controlled layout. When provided (incl. null while parent is loading),
   * the grid renders this layout and does not self-fetch.
   */
  layout?: DashboardTile[] | null;
  statData?: DashboardStatData | null;
  tilesData?: DashboardTilesResponse | null;
  onDismissSuggestion?: (id: string) => Promise<void> | void;
  onOpenMind?: () => void;
  onOpenNutrition?: () => void;
  onOpenWorkoutNow?: () => void;
  onOpenCalendar?: () => void;
  onOpenCheckIn?: () => void;
  /** Opens the weigh-in sheet (NP-105); the weight tile falls back to onOpenCheckIn. */
  onOpenWeight?: () => void;
  /** Opens the mood sheet (NP-107). Falls back to onMoodChange or onOpenCheckIn. */
  onOpenMood?: () => void;
  onMoodChange?: (mood: MoodLevel) => Promise<void> | void;
  /** Opens weekly target settings (NP-127). */
  onOpenSettings?: () => void;
  /** Opens streaks detail screen (NP-108). */
  onOpenStreaks?: () => void;
  /** Opens training history (NP-112). The This Week + Total Workouts tiles. */
  onOpenHistory?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

// "weight" is a data tile (NP-210: latest weigh-in + delta); pressing it opens
// the weigh-in sheet via onOpenWeight (NP-105). The action ids live in
// lib/dashboard/smartRotation so the grid and the smart tile cannot disagree
// about which cards are action cards.
export function isActionTileId(id: string): boolean {
  return isActionStatId(id);
}

/** Stable empty bump map, so the rotation inputs don't churn every render. */
const NO_TAP_BUMPS: Record<string, TapBump> = {};

function useSafeAuth() {
  try {
    return useAuth();
  } catch {
    return { token: null, user: null };
  }
}

export function TileGrid({
  layout: layoutProp,
  statData,
  tilesData,
  onDismissSuggestion,
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
  style,
}: TileGridProps) {
  const isControlled = layoutProp !== undefined;
  const auth = useSafeAuth();
  const token = auth?.token ?? null;
  const { day: today } = useLocalDay();
  const dayRef = useRef(today);

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
      // 1. Try reading async cache if not yet loaded
      const cached = await readCachedLayout();
      if (!cancelled && cached) {
        setInternalLayout((prev) => prev ?? cached);
      }

      // 2. Fetch fresh layout without statPref
      try {
        const result = await apiFetch("/api/dashboard/layout", LayoutWireSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        if (!cancelled && result && Array.isArray(result.layout)) {
          setInternalLayout(result.layout);
          void writeCachedLayout(result.layout);
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

  // Refetch when local day rolls over (NP-035) if uncontrolled
  useEffect(() => {
    if (isControlled) return;
    if (dayRef.current !== today) {
      dayRef.current = today;
      void apiFetch("/api/dashboard/layout", LayoutWireSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
      })
        .then((result) => {
          if (result && Array.isArray(result.layout)) {
            setInternalLayout(result.layout);
            void writeCachedLayout(result.layout);
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
        if (result && Array.isArray(result.layout)) {
          setInternalLayout(result.layout);
          void writeCachedLayout(result.layout);
        }
      })
      .catch(() => {});
  });

  const layout = isControlled ? layoutProp : internalLayout;

  // ── Smart-tile inputs (NP-156) ────────────────────────────────────────────
  //
  // A smart tile rotates through what is NOT pinned, ordered by relevance with
  // the member's tap history folded in. The grid owns those two inputs because
  // only it knows the whole layout (what is pinned) and only it talks to the
  // API (what has been tapped).

  // This session's taps, stamped with the fingerprint of the tiles payload
  // they were recorded against. A payload whose clock or counts have moved
  // already includes them, so the bumps are dropped rather than double-counted
  // — derived during render, never synced in an effect.
  const tilesSignature = useMemo(
    () => engagementSignature(tilesData),
    [tilesData],
  );
  const [tapBumps, setTapBumps] = useState<{
    signature: string;
    rows: Record<string, TapBump>;
  }>(() => ({ signature: tilesSignature, rows: NO_TAP_BUMPS }));
  const activeBumps =
    tapBumps.signature === tilesSignature ? tapBumps.rows : NO_TAP_BUMPS;

  const recordTileTap = useCallback(
    (key: string) => {
      const nowIso = new Date().toISOString();
      setTapBumps((prev) => {
        const base = prev.signature === tilesSignature ? prev.rows : {};
        const existing = base[key];
        return {
          signature: tilesSignature,
          rows: {
            ...base,
            [key]: { taps: (existing?.taps ?? 0) + 1, lastTapAt: nowIso },
          },
        };
      });
      try {
        // Fire-and-forget: the optimistic bump already tuned this session, and
        // a failed tap must never surface on the dashboard.
        void Promise.resolve(
          apiFetch("/api/dashboard/tile-tap", DashboardTileTapResponseSchema, {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            method: "POST",
            body: { key },
          }),
        ).catch(() => {});
      } catch {
        // non-critical
      }
    },
    [tilesSignature, token],
  );

  const metricsById = useMemo(() => {
    const m = new Map<string, DashboardTilesResponse["metrics"][number]>();
    for (const metric of tilesData?.metrics ?? []) m.set(metric.id, metric);
    return m;
  }, [tilesData]);

  const pinnedKeys = useMemo(() => pinnedRotationKeys(layout), [layout]);

  const engagement = useMemo(
    () => mergeEngagement(tilesData?.engagement, activeBumps),
    [tilesData, activeBumps],
  );

  const rotationNow = useMemo(
    () => (tilesData?.now ? new Date(tilesData.now) : undefined),
    [tilesData],
  );

  // Ordinal of each smart tile among smart tiles only, so two of them stagger
  // their opening card instead of showing the same one.
  const smartOrdinals = useMemo(() => {
    const map = new Map<number, number>();
    let n = 0;
    (layout ?? []).forEach((t, i) => {
      if (t.kind === "smart-rotating") map.set(i, n++);
    });
    return map;
  }, [layout]);

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

  const availableSuggestions = (tilesData?.suggestions ?? []).filter((s) => {
    if (s.placement === "exercise") return false;
    const surface = (s as any).context?.surface;
    return !surface || surface === "dashboard";
  });

  return (
    <View style={style}>
      <View
        testID={testID ?? "tilegrid"}
        accessibilityRole="none"
        accessibilityLabel="Dashboard tiles"
        onLayout={(e) => setMeasuredWidth(e.nativeEvent.layout.width)}
        style={styles.gridContainer}
      >
        {layout.map((tile, idx) => {
          const isWide = tile.size === "2x1";
          const cellWidth =
            isWide ? "100%" : col1Width > 0 ? col1Width : "48.5%";
          const key = `${tile.kind}-${tile.id}-${idx}`;

          let tileContent: React.ReactNode = null;

          if (tile.kind === "stat" && isActionTileId(tile.id)) {
            tileContent = (
              <StatActionTile
                tile={tile}
                onOpenMind={onOpenMind}
                onOpenNutrition={onOpenNutrition}
                onOpenWorkoutNow={onOpenWorkoutNow}
              />
            );
          } else if (tile.kind === "stat" && tile.id === "streak") {
            tileContent = (
              <StreakTile
                tile={tile}
                statData={statData}
                size={tile.size}
                onOpenStreaks={onOpenStreaks}
              />
            );
          } else if (tile.kind === "stat") {
            tileContent = (
              <StatTile
                tile={tile}
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
              />
            );
          } else if (tile.kind === "metric") {
            // A metric number (1x1) or chart (2x1), from `metrics[]` on
            // GET /api/dashboard/tiles. While that call is still in flight the
            // metric is not missing — it just hasn't arrived (NP-156).
            tileContent = (
              <MetricTile
                metric={metricsById.get(tile.id) ?? null}
                fallbackId={tile.id}
                size={tile.size}
                loading={tilesData == null}
              />
            );
          } else if (tile.kind === "smart-rotating") {
            // No skeleton here, unlike the web: the default pool is stat cards
            // only and `statData` comes from other endpoints, so the tile has
            // something worth showing before /api/dashboard/tiles answers.
            // Metrics (and the tap history) fold in when that payload lands.
            const ordinal = smartOrdinals.get(idx) ?? 0;
            tileContent = (
              <SmartRotatingTile
                tile={tile}
                statData={statData}
                metrics={tilesData?.metrics}
                excludeKeys={pinnedKeys}
                engagement={engagement}
                now={rotationNow}
                startIndex={ordinal}
                onTap={recordTileTap}
                onOpenMind={onOpenMind}
                onOpenNutrition={onOpenNutrition}
                onOpenWorkoutNow={onOpenWorkoutNow}
                onOpenCalendar={onOpenCalendar}
                onOpenCheckIn={onOpenCheckIn}
                onOpenWeight={onOpenWeight}
                onOpenMood={onOpenMood}
                onMoodChange={onMoodChange}
                onOpenSettings={onOpenSettings}
                onOpenStreaks={onOpenStreaks}
                onOpenHistory={onOpenHistory}
              />
            );
          } else {
            tileContent = <PlaceholderTile tile={tile} />;
          }

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
                {tileContent}
              </TileErrorBoundary>
            </View>
          );
        })}
      </View>

      {/* Suggestion banners live OUTSIDE the tile grid so they don't take a stat tile's slot */}
      {availableSuggestions.length > 0 && (
        <View testID="dashboard-suggestions" style={styles.suggestionsContainer}>
          {availableSuggestions.map((s) => (
            <View key={`suggestion-${s.id}`} style={styles.suggestionItem}>
              <SuggestionTile
                tile={{
                  id: `suggestion-${s.id}`,
                  kind: "smart-rotating",
                  size: "2x1",
                }}
                suggestion={s}
                onDismissSuggestion={onDismissSuggestion}
                onOpenCalendar={onOpenCalendar}
                onOpenNutrition={onOpenNutrition}
                onOpenCheckIn={onOpenCheckIn}
              />
            </View>
          ))}
        </View>
      )}
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
  suggestionsContainer: {
    marginTop: 4,
    gap: 8,
  },
  suggestionItem: {
    width: "100%",
  },
});

export default TileGrid;
