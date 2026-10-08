/**
 * THE DASHBOARD PROGRESS CHART (NP-132) — the web dashboard's ProgressChart.
 *
 * Ports `webapp/components/ProgressChart.tsx` (weight with the goal line, BMI,
 * body fat, lean mass and mood) onto the NP-130 chart kit: `react-native-svg`
 * instead of Recharts, every colour from `useThemeTokens()` (NP-123) so light
 * and dark mode both read. The weight line and goal line match the web's for
 * the same member by construction: the series come straight from
 * `GET /api/progress` (`weightData`, `bmiData`, `bodyFatData`, `leanMassData`,
 * `moodData`) with no client-side recomputation, and the goal line is the
 * web's `Math.round(kgToUnit(targetWeightKg, weightUnit) * 10) / 10`
 * (`DashboardClient.tsx`), computed with the same `kgToUnit` from
 * `@become/core` — never the truncated `2.20462` factor.
 */
import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import Svg, {
  Path,
  Rect,
  Line,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { ArrowUp, ArrowDown } from "lucide-react-native";
import type { WeightUnit } from "@become/core";
import { weightChartXTickIndices } from "@/components/nutrition/GoalsWeightChart";

export type ChartType = "weight" | "bmi" | "body_fat" | "lean_mass" | "mood";

export interface MetricData {
  date: string;
  value: number;
  label?: string;
}

export interface ProgressChartProps {
  weightData?: MetricData[];
  bmiData?: MetricData[];
  bodyFatData?: MetricData[];
  leanMassData?: MetricData[];
  moodData?: MetricData[];
  fitnessGoal?: string | null;
  targetWeight?: number | null;
  weightUnit?: WeightUnit;
  defaultChart?: ChartType;
  testID?: string;
}

interface ChartMeta {
  label: string;
  unit: string;
}

const chartConfig: Record<ChartType, ChartMeta> = {
  weight: { label: "Weight", unit: "lbs" },
  bmi: { label: "BMI", unit: "" },
  body_fat: { label: "Body Fat", unit: "%" },
  lean_mass: { label: "Lean Mass", unit: "lbs" },
  mood: { label: "Mood", unit: "" },
};

const moodLabels: Record<number, string> = {
  1: "😢",
  2: "😕",
  3: "😐",
  4: "🙂",
  5: "😊",
};

function weightTrendSentiment(
  trend: "up" | "down" | "neutral",
  goal?: string | null,
): "positive" | "warning" | "neutral" {
  if (trend === "neutral") return "neutral";
  if (goal === "gain_muscle") return trend === "up" ? "positive" : "warning";
  if (goal === "lose_weight") return trend === "down" ? "positive" : "warning";
  return "neutral";
}

export function ProgressChart({
  weightData = [],
  bmiData = [],
  bodyFatData = [],
  leanMassData = [],
  moodData = [],
  fitnessGoal,
  targetWeight,
  weightUnit = "lbs",
  defaultChart,
  testID = "progress-chart",
}: ProgressChartProps) {
  const { colors } = useThemeTokens();
  const [chartWidth, setChartWidth] = useState<number>(320);

  const allTabs: ChartType[] = ["weight", "bmi"];
  if (bodyFatData.length > 0) allTabs.push("body_fat");
  if (leanMassData.length > 0) allTabs.push("lean_mass");
  allTabs.push("mood");

  const [activeChart, setActiveChart] = useState<ChartType>(() => {
    if (defaultChart && allTabs.includes(defaultChart)) return defaultChart;
    return "weight";
  });

  const getData = (): MetricData[] => {
    switch (activeChart) {
      case "weight":
        return weightData;
      case "bmi":
        return bmiData;
      case "body_fat":
        return bodyFatData;
      case "lean_mass":
        return leanMassData;
      case "mood":
        return moodData;
    }
  };

  const data = getData();
  const config =
    activeChart === "weight" || activeChart === "lean_mass"
      ? { ...chartConfig[activeChart], unit: weightUnit }
      : chartConfig[activeChart];

  const getStats = () => {
    if (data.length === 0)
      return { current: 0, change: 0, trend: "neutral" as const };
    const current = data[data.length - 1]?.value || 0;
    const previous =
      data.length > 1 ? data[data.length - 2]?.value || current : current;
    const change = current - previous;
    const trend: "up" | "down" | "neutral" =
      change > 0 ? "up" : change < 0 ? "down" : "neutral";
    return { current, change, trend };
  };

  const stats = getStats();
  const isWeightLike =
    activeChart === "weight" ||
    activeChart === "bmi" ||
    activeChart === "body_fat" ||
    activeChart === "lean_mass";

  // Matches `webapp/components/ProgressChart.tsx`'s `chartConfig` colours:
  // weight is blue, BMI green, body fat orange, lean mass purple, mood amber.
  const seriesColor: Record<ChartType, string> = {
    weight: colors.info,
    bmi: colors.success,
    body_fat: colors.accent,
    lean_mass: colors.mindset,
    mood: colors.accent,
  };
  const activeColor = seriesColor[activeChart];

  // Matches the web's flat `moodColors` — one colour per mood level that does
  // not flip with light/dark, same as the web's.
  const moodColors: Record<number, string> = {
    1: colors["mood-bad"],
    2: colors["mood-low"],
    3: colors["mood-okay"],
    4: colors["mood-good"],
    5: colors["mood-great"],
  };

  // Change color & background
  let sentimentToken: "success" | "accent" | "destructive" | "muted-foreground" =
    "muted-foreground";
  if (stats.change !== 0) {
    if (isWeightLike) {
      const sentiment = weightTrendSentiment(stats.trend, fitnessGoal);
      if (sentiment === "positive") sentimentToken = "success";
      else if (sentiment === "warning") sentimentToken = "accent";
      else sentimentToken = "muted-foreground";
    } else {
      sentimentToken = stats.trend === "up" ? "success" : "destructive";
    }
  }
  const changeColor = colors[sentimentToken];

  // Dimensions for SVG plotting
  const height = 180;
  const paddingLeft = 36;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 28;
  const plotWidth = Math.max(10, chartWidth - paddingLeft - paddingRight);
  const plotHeight = Math.max(10, height - paddingTop - paddingBottom);

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`Progress chart: ${config.label}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Segmented Tab Selector */}
      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {allTabs.map((type) => {
            const isActive = activeChart === type;
            return (
              <Pressable
                key={type}
                testID={`progress-chart-tab-${type}`}
                accessibilityRole="button"
                accessibilityLabel={`${chartConfig[type].label} chart tab`}
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveChart(type)}
                style={[
                  styles.tabButton,
                  {
                    backgroundColor: isActive
                      ? colors.foreground
                      : colors.muted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    {
                      color: isActive
                        ? colors.background
                        : colors["muted-foreground"],
                    },
                  ]}
                >
                  {chartConfig[type].label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Stats Summary Header */}
      <View style={styles.statsRow}>
        {activeChart === "mood" ? (
          <Text
            testID="progress-chart-current"
            style={[styles.currentMoodEmoji, { flexShrink: 1 }]}
          >
            {moodLabels[Math.round(stats.current)] || "—"}
          </Text>
        ) : (
          <View style={styles.valueRow}>
            <Text
              testID="progress-chart-current"
              style={{ flexShrink: 1 }}
              className="text-foreground text-3xl font-bold"
            >
              {stats.current.toFixed(1)}
            </Text>
            {config.unit ? (
              <Text
                testID="progress-chart-unit"
                style={{ flexShrink: 1 }}
                className="text-muted-foreground text-sm font-medium ml-1.5 self-end mb-1"
              >
                {config.unit}
              </Text>
            ) : null}
          </View>
        )}

        {stats.change !== 0 && activeChart !== "mood" ? (
          <View
            testID="progress-chart-change"
            accessibilityLabel={`${stats.trend === "up" ? "Up" : "Down"} ${Math.abs(stats.change).toFixed(1)} ${config.unit}`}
            style={styles.changeBadge}
          >
            {stats.trend === "up" ? (
              <ArrowUp size={12} strokeWidth={2.5} color={changeColor} />
            ) : (
              <ArrowDown size={12} strokeWidth={2.5} color={changeColor} />
            )}
            <Text
              testID="progress-chart-change-text"
              style={[styles.changeText, { color: changeColor }]}
            >
              {`${Math.abs(stats.change).toFixed(1)}${config.unit}`}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Empty State */}
      {data.length === 0 ? (
        <View
          testID="progress-chart-empty"
          style={[styles.emptyBox, { borderColor: colors.border }]}
        >
          <Text className="text-muted-foreground text-sm">
            {activeChart === "body_fat" || activeChart === "lean_mass"
              ? "Log body fat % with your weight to see this chart"
              : "No data yet"}
          </Text>
        </View>
      ) : (
        /* Chart Canvas */
        <View
          testID="progress-chart-canvas"
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - chartWidth) > 1) {
              setChartWidth(w);
            }
          }}
          style={styles.chartWrapper}
        >
          {activeChart === "mood" ? (
            /* Mood Bar Chart */
            <Svg width={chartWidth} height={height}>
              {/* Y Grid lines + face icons for 1..5, matching the web's
                  `YAxis tickFormatter={(v) => moodLabels[v]}` */}
              {[1, 2, 3, 4, 5].map((level) => {
                const y = paddingTop + plotHeight - ((level - 1) / 4) * plotHeight;
                return (
                  <React.Fragment key={`grid-${level}`}>
                    <Line
                      x1={paddingLeft}
                      y1={y}
                      x2={paddingLeft + plotWidth}
                      y2={y}
                      stroke={colors.border}
                      strokeWidth={1}
                      strokeDasharray="3,3"
                    />
                    <SvgText
                      x={paddingLeft - 8}
                      y={y + 5}
                      fontSize={12}
                      textAnchor="end"
                    >
                      {moodLabels[level]}
                    </SvgText>
                  </React.Fragment>
                );
              })}

              {/* Mood Bars. Date labels are thinned out the same way the
                  line/area chart's are (first / last / middle only beyond 6
                  points) — drawing every one overlaps into one unreadable
                  string at this chart's width. */}
              {data.map((entry, idx) => {
                const n = data.length;
                const slotWidth = plotWidth / n;
                const barWidth = Math.min(24, Math.max(12, slotWidth * 0.55));
                const barX =
                  paddingLeft + idx * slotWidth + (slotWidth - barWidth) / 2;
                const clampedVal = Math.max(1, Math.min(5, entry.value));
                const barH = ((clampedVal - 1) / 4) * plotHeight + 6;
                const barY = paddingTop + plotHeight - barH;
                const color = moodColors[entry.value] || activeColor;
                const showDate =
                  n <= 6 || idx === 0 || idx === n - 1 || idx === Math.floor(n / 2);

                return (
                  <React.Fragment key={`mood-bar-${idx}`}>
                    <Rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={barH}
                      rx={4}
                      ry={4}
                      fill={color}
                    />
                    {showDate ? (
                      <SvgText
                        x={barX + barWidth / 2}
                        y={paddingTop + plotHeight + 16}
                        fontSize={10}
                        fill={colors["muted-foreground"]}
                        textAnchor="middle"
                      >
                        {entry.date}
                      </SvgText>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </Svg>
          ) : (
            /* Line / Area Chart */
            (() => {
              const values = data.map((d) => d.value);
              const minVal = Math.min(...values);
              const maxVal = Math.max(...values);
              // NP-351: Strictly data-driven domain ['dataMin - 2', 'dataMax + 2']
              // without inflating with targetWeight.
              let yMin = minVal - 2;
              let yMax = maxVal + 2;
              if (yMax <= yMin) {
                yMin -= 1;
                yMax += 1;
              }
              const yRange = yMax - yMin;

              const getX = (idx: number) => {
                if (data.length <= 1) return paddingLeft + plotWidth / 2;
                return paddingLeft + (idx / (data.length - 1)) * plotWidth;
              };

              const getY = (val: number) => {
                return paddingTop + plotHeight - ((val - yMin) / yRange) * plotHeight;
              };

              // Compute points
              const pts = data.map((d, i) => ({
                x: getX(i),
                y: getY(d.value),
                date: d.date,
                val: d.value,
              }));

              // Build line path
              let linePath = "";
              let areaPath = "";
              if (pts.length > 0) {
                const firstPt = pts[0];
                const lastPt = pts[pts.length - 1];
                if (firstPt && lastPt) {
                  linePath = `M ${firstPt.x} ${firstPt.y}`;
                  for (let i = 1; i < pts.length; i++) {
                    const pt = pts[i];
                    if (pt) {
                      linePath += ` L ${pt.x} ${pt.y}`;
                    }
                  }
                  const groundY = paddingTop + plotHeight;
                  areaPath = `${linePath} L ${lastPt.x} ${groundY} L ${firstPt.x} ${groundY} Z`;
                }
              }

              // Target weight reference line (omit if outside data-driven domain)
              let targetY: number | null = null;
              if (
                activeChart === "weight" &&
                targetWeight != null &&
                targetWeight >= yMin &&
                targetWeight <= yMax
              ) {
                targetY = getY(targetWeight);
              }

              // 5 evenly spaced X ticks for vertical gridlines & date labels
              const xTickIndices = weightChartXTickIndices(pts.length, 5);

              return (
                <Svg width={chartWidth} height={height}>
                  <Defs>
                    <LinearGradient id="progressGradient" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={activeColor} stopOpacity="0.25" />
                      <Stop offset="100%" stopColor={activeColor} stopOpacity="0.0" />
                    </LinearGradient>
                  </Defs>

                  {/* Vertical grid lines (5 vertical gridlines at evenly spaced tick positions) */}
                  {xTickIndices.map((idx) => {
                    const pt = pts[idx];
                    if (!pt) return null;
                    return (
                      <Line
                        key={`grid-v-${idx}`}
                        x1={pt.x}
                        y1={paddingTop}
                        x2={pt.x}
                        y2={paddingTop + plotHeight}
                        stroke={colors.border}
                        strokeWidth={1}
                        strokeDasharray="3,3"
                      />
                    );
                  })}

                  {/* Horizontal grid lines (4 horizontal gridlines & numeric ticks) */}
                  {[0, 1 / 3, 2 / 3, 1].map((ratio, idx) => {
                    const y = paddingTop + plotHeight * ratio;
                    const val = yMax - ratio * yRange;
                    return (
                      <React.Fragment key={`grid-h-${idx}`}>
                        <Line
                          x1={paddingLeft}
                          y1={y}
                          x2={paddingLeft + plotWidth}
                          y2={y}
                          stroke={colors.border}
                          strokeWidth={1}
                          strokeDasharray="3,3"
                        />
                        <SvgText
                          x={paddingLeft - 6}
                          y={y + 3}
                          fontSize={9}
                          fill={colors["muted-foreground"]}
                          textAnchor="end"
                        >
                          {val.toFixed(0)}
                        </SvgText>
                      </React.Fragment>
                    );
                  })}

                  {/* Target weight line */}
                  {targetY != null && targetWeight != null ? (
                    <>
                      <Line
                        testID="progress-chart-target-line"
                        x1={paddingLeft}
                        y1={targetY}
                        x2={paddingLeft + plotWidth}
                        y2={targetY}
                        stroke={colors.success}
                        strokeDasharray="4,4"
                        strokeWidth={1.5}
                      />
                      <SvgText
                        testID="progress-chart-target-label"
                        x={paddingLeft + plotWidth - 4}
                        y={targetY - 4}
                        fontSize={9}
                        fill={colors.success}
                        textAnchor="end"
                        fontWeight="600"
                      >
                        {`Goal ${(Math.round(targetWeight * 10) / 10).toFixed(1)} ${weightUnit}`}
                      </SvgText>
                    </>
                  ) : null}

                  {/* Area fill */}
                  {areaPath ? (
                    <Path d={areaPath} fill="url(#progressGradient)" />
                  ) : null}

                  {/* Line stroke */}
                  {linePath ? (
                    <Path
                      d={linePath}
                      stroke={activeColor}
                      strokeWidth={2.5}
                      fill="none"
                    />
                  ) : null}

                  {/* 5 evenly spaced date labels */}
                  {xTickIndices.map((idx) => {
                    const pt = pts[idx];
                    if (!pt) return null;
                    return (
                      <SvgText
                        key={`date-${idx}`}
                        x={pt.x}
                        y={paddingTop + plotHeight + 16}
                        fontSize={9}
                        fill={colors["muted-foreground"]}
                        textAnchor="middle"
                      >
                        {pt.date}
                      </SvgText>
                    );
                  })}
                </Svg>
              );
            })()
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  tabsWrapper: {},
  tabsContainer: {
    flexDirection: "row",
    gap: 6,
  },
  tabButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 1,
  },
  currentMoodEmoji: {
    fontSize: 32,
    lineHeight: 38,
    flexShrink: 1,
  },
  changeBadge: {
    // Plain text + icon, no pill fill — matches the web's `<span className=
    // "flex items-center gap-1 text-sm font-medium ...">` (no background).
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  changeText: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 0,
  },
  emptyBox: {
    minHeight: 140,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  chartWrapper: {
    height: 180,
    width: "100%",
  },
});

export default ProgressChart;
