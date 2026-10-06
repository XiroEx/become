/**
 * THE METRIC TILE (NP-156) — the native port of `MetricTileCard` in
 * `webapp/components/dashboard/TileGrid.tsx`.
 *
 * A metric tile renders one entry of `metrics[]` from `GET
 * /api/dashboard/tiles` (label, unit, latest point, series):
 *
 *   - 1x1 → the number alone, so it carries a stat tile's visual weight in the
 *     uniform grid;
 *   - 2x1 → label + latest on one row and a LINE or BAR chart filling the rest,
 *     drawn on the NP-130 chart kit (`MetricLineChart` / `MetricBarChart` in
 *     `components/progress/ProgressCharts.tsx`, `react-native-svg` + theme
 *     tokens — never Recharts' fixed ink);
 *   - `metric.error` → the web's one-line degraded card. The tiles route
 *     degrades a single metric rather than failing the dashboard, so `latest`
 *     is null and `data` empty whenever that happens.
 *
 * WHICH CHART, AND WHY NOTHING IS A LINK. `metricChartKind` is the web's
 * `chartKindFor`, unchanged: fewer than two points is a number, a `volume`/
 * `bar` id is bars, everything else is a line. And a chart tile goes NOWHERE:
 * the web's drill-in (`/dashboard/insights/[metricId]`) is still a placeholder
 * page, so NP-156 renders the data and links nothing — pressing a metric card
 * inside a smart tile records the tap (the rotation's adaptive signal) and does
 * not navigate.
 */

import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { usePressed } from "@/lib/a11y/usePressed";
import type {
  DashboardMetricSummary,
  DashboardTileSize,
} from "@become/api-client";
import {
  MetricBarChart,
  MetricLineChart,
} from "@/components/progress/ProgressCharts";

export type MetricChartKind = "bar" | "line" | "number";

/**
 * Chart type from the metric's own shape — the web's `chartKindFor`. Prefers
 * the data shape over id-substring guessing, then falls back to the id for
 * volume-like series.
 */
export function metricChartKind(metric: {
  id: string;
  data: readonly unknown[];
}): MetricChartKind {
  if (metric.data.length < 2) return "number";
  if (metric.id.includes("volume") || metric.id.includes("bar")) return "bar";
  return "line";
}

/** The web's `formatValue`: integers bare, everything else trimmed to 2dp. */
export function formatMetricValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/** The web's `latestText`: `"<value> <unit>"`, or an em dash when there is none. */
export function metricLatestText(metric: DashboardMetricSummary): string {
  if (metric.latest == null) return "—";
  return `${formatMetricValue(metric.latest.value)} ${metric.unit}`.trim();
}

/** A metric id as a human label, for the states that have no metric yet. */
export function metricFallbackLabel(id: string): string {
  return id
    ? id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Metric";
}

export interface MetricTileProps {
  /** The resolved metric. Omit with `loading` for the first-load skeleton. */
  metric?: DashboardMetricSummary | null;
  size: DashboardTileSize;
  /** `/api/dashboard/tiles` has not answered yet — skeleton, not "missing". */
  loading?: boolean;
  /** Used by the skeleton / missing states, which have no metric label. */
  fallbackId?: string;
  /** Records a smart-tile tap. Absent ⇒ the card is not pressable at all. */
  onTap?: () => void;
  testID?: string;
}

export function MetricTile({
  metric,
  size,
  loading = false,
  fallbackId,
  onTap,
  testID,
}: MetricTileProps) {
  const { colors } = useThemeTokens();
  const tilePress = usePressed();
  const rootTestId = testID ?? `tile-${metric?.id ?? fallbackId ?? "metric"}`;
  const cardStyle = [
    styles.card,
    { backgroundColor: colors.card, borderColor: colors.border },
  ];

  // ── Shimmer-equivalent: label-over-value shape at the same height, so real
  //    data landing does not shift the grid (the web's TileSkeletonCard).
  if (!metric && loading) {
    return (
      <View
        testID={rootTestId}
        accessibilityRole="progressbar"
        accessibilityLabel={`Loading ${metricFallbackLabel(fallbackId ?? "")}`}
        style={cardStyle}
      >
        <View style={styles.body}>
          <View
            style={[styles.skeletonLabel, { backgroundColor: colors.muted }]}
          />
          <View
            style={[styles.skeletonValue, { backgroundColor: colors.muted }]}
          />
        </View>
      </View>
    );
  }

  // ── The metric is not in the payload at all (the web's MissingTileCard).
  if (!metric) {
    const label = metricFallbackLabel(fallbackId ?? "");
    return (
      <View
        testID={rootTestId}
        accessibilityRole="summary"
        accessibilityLabel={`${label}: no data`}
        style={cardStyle}
      >
        <View style={styles.body}>
          <Text className="text-muted-foreground text-xs" numberOfLines={2}>
            {label}
          </Text>
        </View>
      </View>
    );
  }

  const latestText = metricLatestText(metric);
  const kind = metricChartKind(metric);
  // Charts render in the wide slot only; a square is number-only so its weight
  // matches the stat tiles around it.
  const showChart = size === "2x1" && !metric.error && kind !== "number";

  let content: React.ReactNode;
  let a11yLabel: string;

  if (metric.error) {
    a11yLabel = `${metric.label}: data temporarily unavailable`;
    content = (
      <View style={styles.body}>
        <Text
          className="text-muted-foreground text-xs font-medium uppercase"
          numberOfLines={1}
        >
          {metric.label}
        </Text>
        <Text
          testID={`${rootTestId}-error`}
          style={{ color: colors.accent }}
          className="text-sm mt-1"
          numberOfLines={2}
        >
          Data temporarily unavailable.
        </Text>
      </View>
    );
  } else if (showChart) {
    a11yLabel = `${metric.label}: ${latestText}`;
    content = (
      <View style={styles.wideBody}>
        <View style={styles.wideHeader}>
          <Text
            className="text-muted-foreground text-xs font-medium uppercase flex-1 mr-2"
            numberOfLines={1}
          >
            {metric.label}
          </Text>
          <Text
            testID={`${rootTestId}-value`}
            className="text-foreground text-base font-bold"
            numberOfLines={1}
          >
            {latestText}
          </Text>
        </View>
        <View style={styles.chartSlot}>
          {kind === "bar" ? (
            <MetricBarChart
              data={metric.data}
              testID={`${rootTestId}-bar-chart`}
            />
          ) : (
            <MetricLineChart
              data={metric.data}
              testID={`${rootTestId}-line-chart`}
            />
          )}
        </View>
      </View>
    );
  } else {
    a11yLabel = `${metric.label}: ${latestText}`;
    content = (
      <View style={styles.body}>
        <Text
          className="text-muted-foreground text-xs font-medium uppercase"
          numberOfLines={1}
        >
          {metric.label}
        </Text>
        <Text
          testID={`${rootTestId}-value`}
          className="text-foreground text-2xl font-bold mt-1"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {latestText}
        </Text>
      </View>
    );
  }

  // Pressable ONLY to record a tap (the smart tile's adaptive signal). A metric
  // card never navigates: see the file header.
  if (onTap) {
    return (
      <Pressable
        testID={rootTestId}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        onPress={onTap}
        onPressIn={tilePress.onPressIn}
        onPressOut={tilePress.onPressOut}
        style={[...cardStyle, { opacity: tilePress.pressed ? 0.85 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      testID={rootTestId}
      accessibilityRole="summary"
      accessibilityLabel={a11yLabel}
      style={cardStyle}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    minHeight: 96,
    justifyContent: "center",
  },
  body: {
    flex: 1,
    justifyContent: "center",
  },
  wideBody: {
    flex: 1,
    justifyContent: "center",
  },
  wideHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  chartSlot: {
    marginTop: 4,
  },
  skeletonLabel: {
    height: 10,
    width: "60%",
    borderRadius: 4,
    opacity: 0.8,
  },
  skeletonValue: {
    height: 20,
    width: "45%",
    borderRadius: 4,
    marginTop: 8,
    opacity: 0.8,
  },
});

export default MetricTile;
