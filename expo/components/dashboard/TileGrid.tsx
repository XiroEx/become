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
import { PlaceholderTile } from "./PlaceholderTile";
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

export interface TileGridProps {
  /**
   * Controlled layout. When provided (incl. null while parent is loading),
   * the grid renders this layout and does not self-fetch.
   */
  layout?: DashboardTile[] | null;
  onOpenMind?: () => void;
  onOpenNutrition?: () => void;
  onOpenWorkoutNow?: () => void;
  onOpenWeightSheet?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const ACTION_STAT_IDS = new Set(["mindset", "nutrition", "workoutNow", "weight"]);

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
  onOpenMind,
  onOpenNutrition,
  onOpenWorkoutNow,
  onOpenWeightSheet,
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
              {tile.kind === "stat" && isActionTileId(tile.id) ? (
                <StatActionTile
                  tile={tile}
                  onOpenMind={onOpenMind}
                  onOpenNutrition={onOpenNutrition}
                  onOpenWorkoutNow={onOpenWorkoutNow}
                  onOpenWeightSheet={onOpenWeightSheet}
                />
              ) : (
                <PlaceholderTile tile={tile} />
              )}
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
