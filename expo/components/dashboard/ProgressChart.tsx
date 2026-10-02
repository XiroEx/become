import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import Svg, {
  Path,
  Circle,
  Rect,
  Line,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { ArrowUp, ArrowDown } from "lucide-react-native";
import type { WeightUnit } from "@become/core";

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
  const { colors, tint } = useThemeTokens();
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

  const seriesColor: Record<ChartType, string> = {
    weight: colors.primary,
    bmi: colors.success,
    body_fat: colors.accent,
    lean_mass: colors.primary,
    mood: colors.accent,
  };
  const activeColor = seriesColor[activeChart];

  const moodColors: Record<number, string> = {
    1: colors.destructive,
    2: colors.accent,
    3: colors.accent,
    4: colors.success,
    5: colors.success,
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
  const changeBg =
    sentimentToken === "muted-foreground"
      ? colors.muted
      : tint(sentimentToken, 0.18);

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
            style={[styles.changeBadge, { backgroundColor: changeBg }]}
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
              {/* Y Grid lines for 1..5 */}
              {[1, 2, 3, 4, 5].map((level) => {
                const y = paddingTop + plotHeight - ((level - 1) / 4) * plotHeight;
                return (
                  <Line
                    key={`grid-${level}`}
                    x1={paddingLeft}
                    y1={y}
                    x2={paddingLeft + plotWidth}
                    y2={y}
                    stroke={colors.border}
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                );
              })}

              {/* Mood Bars */}
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
                    <SvgText
                      x={barX + barWidth / 2}
                      y={paddingTop + plotHeight + 16}
                      fontSize={10}
                      fill={colors["muted-foreground"]}
                      textAnchor="middle"
                    >
                      {entry.date}
                    </SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
          ) : (
            /* Line / Area Chart */
            (() => {
              const values = data.map((d) => d.value);
              let minVal = Math.min(...values);
              let maxVal = Math.max(...values);
              if (
                activeChart === "weight" &&
                targetWeight != null &&
                targetWeight > 0
              ) {
                minVal = Math.min(minVal, targetWeight);
                maxVal = Math.max(maxVal, targetWeight);
              }
              let yMin = minVal - 1;
              let yMax = maxVal + 1;
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

              // Target weight reference line
              let targetY: number | null = null;
              if (
                activeChart === "weight" &&
                targetWeight != null &&
                targetWeight > 0
              ) {
                targetY = getY(targetWeight);
              }

              return (
                <Svg width={chartWidth} height={height}>
                  <Defs>
                    <LinearGradient id="progressGradient" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={activeColor} stopOpacity="0.25" />
                      <Stop offset="100%" stopColor={activeColor} stopOpacity="0.0" />
                    </LinearGradient>
                  </Defs>

                  {/* Horizontal grid lines */}
                  {[0, 0.5, 1].map((ratio) => {
                    const y = paddingTop + plotHeight * ratio;
                    const val = yMax - ratio * yRange;
                    return (
                      <React.Fragment key={`grid-${ratio}`}>
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

                  {/* Points & Date labels */}
                  {pts.map((pt, i) => {
                    const showDate =
                      pts.length <= 6 ||
                      i === 0 ||
                      i === pts.length - 1 ||
                      i === Math.floor(pts.length / 2);

                    return (
                      <React.Fragment key={`point-${i}`}>
                        <Circle
                          cx={pt.x}
                          cy={pt.y}
                          r={4}
                          fill={activeColor}
                          stroke={colors.card}
                          strokeWidth={2}
                        />
                        {showDate ? (
                          <SvgText
                            x={pt.x}
                            y={paddingTop + plotHeight + 16}
                            fontSize={9}
                            fill={colors["muted-foreground"]}
                            textAnchor="middle"
                          >
                            {pt.date}
                          </SvgText>
                        ) : null}
                      </React.Fragment>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
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
