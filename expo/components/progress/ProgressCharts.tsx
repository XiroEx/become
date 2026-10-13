/**
 * THE CHART KIT (NP-130).
 *
 * The web draws its progress charts in Recharts, which does not exist on
 * native — and the web's weekly-volume and weight lines ship in a near-black
 * ink that disappears in dark mode (still open as a web bug). So native does
 * not port the ink: every colour in this kit comes from `useThemeTokens()`
 * (NP-123), which follows the system light/dark setting, and there is not one
 * hard-coded ink colour anywhere in the file.
 *
 * The kit is deliberately small — one bar chart (weekly volume) and one
 * month grid (this month) — drawn on `react-native-svg`, which is already a
 * dependency. `victory-native-xl` would have pulled in Skia; an SVG bar chart
 * needs neither.
 *
 * `__tests__/progressNP130.test.tsx` drives the kit and the screen in both
 * modes, including a computed-contrast assertion per mode (not an eyeball).
 */

import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import Svg, {
  Path,
  Rect,
  Line,
  Text as SvgText,
} from "react-native-svg";
import type {
  DashboardMetricPoint,
  ProgressWeeklyVolume,
} from "@become/api-client";

/** `1.2K` / `3.4M`, the web's `fmt()` in `ProgressClient.tsx`. */
export function formatVolume(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M`;
  if (lbs >= 1_000) return `${(lbs / 1_000).toFixed(1)}K`;
  return Math.round(lbs).toLocaleString("en-US");
}

/**
 * The largest bar value, so the chart can scale. The web plots `volume` when
 * any week has volume and `workouts` otherwise (`ProgressClient.tsx`:
 * `dataKey={hasVolume ? 'volume' : 'workouts'}`) — the same rule, so the same
 * bars.
 */
export function volumeChartMax(weeks: ProgressWeeklyVolume[]): number {
  const hasVolume = weeks.some((w) => w.volume > 0);
  const values = weeks.map((w) => (hasVolume ? w.volume : w.workouts));
  return Math.max(0, ...values);
}

/** Which field the bars plot — exported so the screen and tests agree. */
export function volumeChartField(
  weeks: ProgressWeeklyVolume[],
): "volume" | "workouts" {
  return weeks.some((w) => w.volume > 0) ? "volume" : "workouts";
}

/**
 * Round `max` UP to the nearest value whose quarter-steps are themselves
 * round thousands — the web's Recharts axis, which "nices" its domain rather
 * than drawing raw quarters of the data max (NP-314).
 *
 * Native used to divide the raw max by 4 and round EACH tick independently,
 * which keeps the steps unequal whenever the max is not itself a round
 * number: a ~23.2k max produced 0 / 6k / 12k / 17k / 23k (steps of 6, 6, 5,
 * 6) where the web draws 0 / 6k / 12k / 18k / 24k (an even 6k step). This
 * picks ONE step first — the smallest whole multiple of the max's leading
 * digit's place value whose four increments cover `max` — then builds every
 * tick from that same step, so the spacing is always even and every tick
 * lands on a round number.
 */
export function volumeChartAxisMax(max: number): number {
  if (max <= 0) return 0;
  const roughStep = max / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep) + 1e-9));
  const step = Math.ceil(roughStep / magnitude - 1e-9) * magnitude;
  return step * 4;
}

/**
 * The y-axis tick values, exported so tests pin the step count. The web's
 * `YAxis` (Recharts, default tick count) draws 5 evenly spaced ticks — e.g.
 * 0 / 6k / 12k / 18k / 24k for a ~24k max — not the 3-tick 0/half/full native
 * drew before (which showed as 0 / 12k / 23k for the same data), nor the
 * unevenly-stepped 0 / 6k / 12k / 17k / 23k a raw quarter-of-the-max produced
 * once the 3-tick bug (NP-259) was fixed.
 */
export function volumeChartYTicks(max: number): number[] {
  const axisMax = volumeChartAxisMax(max);
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(axisMax * ratio));
}

export interface VolumeBarChartProps {
  weeks: ProgressWeeklyVolume[];
  testID?: string;
}

const CHART_HEIGHT = 180;
const PAD_TOP = 12;
const PAD_BOTTOM = 30;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;

/**
 * Weekly volume for the last 12 weeks — the web's `BarChart` in
 * `ProgressClient.tsx#volume`, drawn as theme-coloured SVG bars.
 *
 * Colours: bars are the foreground ink (the web's near-black, but theme-safe:
 * near-black in light mode, near-white in dark mode), grid lines the border
 * token, axis labels the muted-foreground token. All three re-resolve on a
 * live system flip because they come from the hook.
 */
export function VolumeBarChart({
  weeks,
  testID = "volume-chart",
}: VolumeBarChartProps) {
  const { colors } = useThemeTokens();
  const [chartWidth, setChartWidth] = useState<number>(320);

  const field = volumeChartField(weeks);
  const max = volumeChartAxisMax(volumeChartMax(weeks));
  const plotWidth = Math.max(10, chartWidth - PAD_LEFT - PAD_RIGHT);
  const plotHeight = Math.max(10, CHART_HEIGHT - PAD_TOP - PAD_BOTTOM);
  const barColor = colors.foreground;
  const gridColor = colors.border;
  const labelColor = colors["muted-foreground"];

  const n = weeks.length;
  const slotWidth = n > 0 ? plotWidth / n : plotWidth;
  const barWidth = Math.min(28, Math.max(10, slotWidth * 0.55));

  const barHeightFor = (value: number): number => {
    if (max <= 0) return 2;
    return Math.max(2, (value / max) * plotHeight);
  };

  const yTickValues = volumeChartYTicks(max);

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`Weekly volume, last ${n} weeks`}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - chartWidth) > 1) setChartWidth(w);
      }}
      style={styles.chartWrapper}
    >
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        {yTickValues.map((tick) => {
          const y = PAD_TOP + plotHeight - (max > 0 ? (tick / max) * plotHeight : 0);
          return (
            <Line
              key={`grid-${tick}`}
              x1={PAD_LEFT}
              y1={y}
              x2={PAD_LEFT + plotWidth}
              y2={y}
              stroke={gridColor}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          );
        })}
        {yTickValues.map((tick) => {
          const y = PAD_TOP + plotHeight - (max > 0 ? (tick / max) * plotHeight : 0);
          return (
            <SvgText
              key={`tick-${tick}`}
              x={PAD_LEFT - 6}
              y={y + 3}
              fontSize={9}
              fill={labelColor}
              textAnchor="end"
            >
              {field === "volume"
                ? tick >= 1000
                  ? `${(tick / 1000).toFixed(0)}k`
                  : String(tick)
                : String(tick)}
            </SvgText>
          );
        })}
        {weeks.map((week, idx) => {
          const value = field === "volume" ? week.volume : week.workouts;
          const barH = barHeightFor(value);
          const barX = PAD_LEFT + idx * slotWidth + (slotWidth - barWidth) / 2;
          const barY = PAD_TOP + plotHeight - barH;
          const showLabel = n <= 6 || idx === 0 || idx === n - 1;
          return (
            <Svg
              key={`bar-${idx}`}
            >
              <Rect
                testID={`${testID}-bar-${idx}`}
                accessibilityLabel={`Week of ${week.week}: ${field === "volume" ? `${formatVolume(value)} lbs` : `${value} workouts`}`}
                x={barX}
                y={barY}
                width={barWidth}
                height={barH}
                rx={4}
                ry={4}
                fill={barColor}
              />
              {showLabel ? (
                <SvgText
                  x={barX + barWidth / 2}
                  y={PAD_TOP + plotHeight + 16}
                  fontSize={9}
                  fill={labelColor}
                  textAnchor="middle"
                >
                  {week.week}
                </SvgText>
              ) : null}
            </Svg>
          );
        })}
      </Svg>
      {n > 6 ? (
        <Text className="text-muted-foreground text-xs text-center mt-1">
          {weeks[0]?.week} – {weeks[n - 1]?.week}
        </Text>
      ) : null}
    </View>
  );
}

export interface MonthGridProps {
  /** `YYYY-MM-DD` keys with at least one completed workout. */
  workoutDays: Set<string> | string[];
  /** The month to draw. Defaults to the current local month. */
  now?: Date;
  testID?: string;
}

/**
 * This month — the web's `ActivityCalendar` in `ProgressClient.tsx`: a 7-column
 * grid where a workout day is a filled disc in the foreground ink and today is
 * an outlined disc. The web's filled disc is near-black in both modes (its
 * dark-mode variant flips to white-on-dark); here both come from tokens so
 * both modes read.
 */
export function MonthGrid({
  workoutDays,
  now = new Date(),
  testID = "month-grid",
}: MonthGridProps) {
  const { colors } = useThemeTokens();
  const days: Set<string> =
    workoutDays instanceof Set ? workoutDays : new Set(workoutDays);

  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthCount = [...days].filter((k) => k.startsWith(monthKey)).length;

  const cells: (number | null)[] = [
    ...Array<number | null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`${monthLabel}, ${monthCount} workouts`}
      style={[styles.monthCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.monthHeader}>
        <Text className="text-foreground text-sm font-semibold">{monthLabel}</Text>
        <Text
          testID={`${testID}-count`}
          className="text-muted-foreground text-xs"
        >
          {monthCount} {monthCount === 1 ? "workout" : "workouts"} this month
        </Text>
      </View>
      <View style={styles.weekdayRow}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <View key={d} style={styles.monthCell}>
            <Text className="text-muted-foreground text-xs font-medium text-center">
              {d}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.monthGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`blank-${i}`} style={styles.monthCell} />;
          const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
          const isToday = day === now.getDate();
          const hasWorkout = days.has(dateStr);
          return (
            <View key={`day-${i}`} style={styles.monthCell}>
              <View
                testID={`${testID}-day-${day}`}
                accessibilityLabel={`${dateStr}${hasWorkout ? ", workout" : ""}${isToday ? ", today" : ""}`}
                style={[
                  styles.monthDot,
                  hasWorkout
                    ? {
                        backgroundColor: colors.foreground,
                      }
                    : isToday
                      ? {
                          borderWidth: 1,
                          borderColor: colors.border,
                        }
                      : undefined,
                ]}
              >
                <Text
                  style={{ color: hasWorkout ? colors.background : colors["muted-foreground"] }}
                  className="text-xs font-medium text-center"
                >
                  {day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ========================================================================== *
 * Tile-sized charts — the body of a 2x1 metric tile (NP-156).
 *
 * The web draws these with Recharts in a fixed ink (`LineTileChart` strokes
 * `#22d3ee`, `BarTileChart` fills `#a855f7` — leftovers from the old dark-only
 * intelligence tiles). This kit does not port an ink: the line is the `primary`
 * token and the bars the `accent` token, so both read in light and dark mode.
 * Everything else matches the web: no axes, no dots, no tooltip, points evenly
 * spaced (the web's hidden `XAxis` is a category axis), and a point whose `t`
 * or `value` is unusable is dropped rather than drawn at NaN.
 * ========================================================================== */

/**
 * The plottable values of a metric series, in order — the web's
 * `data.map(…).filter(Number.isFinite)` in `LineTileChart` / `BarTileChart`.
 * `t` arrives as an ISO string over JSON (it is a `Date` on the server), so it
 * is coerced defensively and an unparseable point is dropped.
 */
export function metricChartValues(
  data: readonly DashboardMetricPoint[] | undefined,
): number[] {
  const out: number[] = [];
  for (const p of data ?? []) {
    if (!p) continue;
    const t: unknown = p.t;
    const ms = t instanceof Date ? t.getTime() : new Date(String(t)).getTime();
    const value = typeof p.value === "number" ? p.value : Number.NaN;
    if (Number.isFinite(ms) && Number.isFinite(value)) out.push(value);
  }
  return out;
}

export interface MetricTileChartProps {
  data: readonly DashboardMetricPoint[];
  /** Fixed height in px; the tile gives the chart the room it has left. */
  height?: number;
  /** Overrides the token colour (tests resolve the token themselves). */
  color?: string;
  testID?: string;
}

const TILE_CHART_HEIGHT = 44;
const TILE_CHART_PAD = 3;

/** `M x y L x y …` for evenly-spaced values inside `width` × `height`. */
export function sparklinePath(
  values: readonly number[],
  width: number,
  height: number,
  pad = TILE_CHART_PAD,
): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const plotW = Math.max(1, width - pad * 2);
  const plotH = Math.max(1, height - pad * 2);
  const x = (i: number): number =>
    values.length <= 1 ? pad + plotW / 2 : pad + (i / (values.length - 1)) * plotW;
  const y = (v: number): number => pad + plotH - ((v - min) / span) * plotH;
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(" ");
}

/** A metric's series as a theme-coloured line — the web's `LineTileChart`. */
export function MetricLineChart({
  data,
  height = TILE_CHART_HEIGHT,
  color,
  testID = "metric-line-chart",
}: MetricTileChartProps) {
  const { colors } = useThemeTokens();
  const [width, setWidth] = useState<number>(140);
  const values = metricChartValues(data);
  const stroke = color ?? colors.primary;
  const d = sparklinePath(values, width, height);

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`Trend line, ${values.length} points`}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - width) > 1) setWidth(w);
      }}
      style={{ width: "100%", height }}
    >
      <Svg width={width} height={height}>
        {d ? (
          <Path
            testID={`${testID}-path`}
            d={d}
            stroke={stroke}
            strokeWidth={2}
            fill="none"
          />
        ) : null}
      </Svg>
    </View>
  );
}

/** A metric's series as theme-coloured bars — the web's `BarTileChart`. */
export function MetricBarChart({
  data,
  height = TILE_CHART_HEIGHT,
  color,
  testID = "metric-bar-chart",
}: MetricTileChartProps) {
  const { colors } = useThemeTokens();
  const [width, setWidth] = useState<number>(140);
  const values = metricChartValues(data);
  const fill = color ?? colors.accent;

  const pad = TILE_CHART_PAD;
  const plotW = Math.max(1, width - pad * 2);
  const plotH = Math.max(1, height - pad * 2);
  // Bars read from zero when the series is non-negative (the web's bar chart
  // does), so the baseline is 0 unless the data goes below it.
  const max = values.length > 0 ? Math.max(...values, 0) : 0;
  const min = values.length > 0 ? Math.min(...values, 0) : 0;
  const span = max - min || 1;
  const slot = values.length > 0 ? plotW / values.length : plotW;
  const barWidth = Math.max(2, Math.min(14, slot * 0.7));

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`Bar chart, ${values.length} bars`}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - width) > 1) setWidth(w);
      }}
      style={{ width: "100%", height }}
    >
      <Svg width={width} height={height}>
        {values.map((v, i) => {
          const zeroY = pad + plotH - ((0 - min) / span) * plotH;
          const valueY = pad + plotH - ((v - min) / span) * plotH;
          const barH = Math.max(1, Math.abs(zeroY - valueY));
          const barY = Math.min(zeroY, valueY);
          const barX = pad + i * slot + (slot - barWidth) / 2;
          return (
            <Rect
              key={`metric-bar-${i}`}
              testID={`${testID}-bar-${i}`}
              x={barX}
              y={barY}
              width={barWidth}
              height={barH}
              rx={2}
              ry={2}
              fill={fill}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  chartWrapper: {
    height: CHART_HEIGHT + 24,
    width: "100%",
  },
  monthCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  monthCell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  monthDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default VolumeBarChart;
