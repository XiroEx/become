import { useState } from "react";
import { View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Line,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * The Weight tab's chart (NP-266) — a 1:1 port of the web's PLAIN weight line
 * in `webapp/app/dashboard/nutrition/goals/page.tsx` (a Recharts `AreaChart`):
 * one series, an auto y-domain, a dashed green goal reference line, and
 * first/last x-axis date labels (`interval="preserveStartEnd"`). Nothing
 * else — no BMI/Mood tabs, no change pill, no second series — those belong
 * to the dashboard's `ProgressChart`, which this screen no longer embeds.
 *
 * `data[].date` is already a display string (`"Sep 9"`), formatted server
 * side by `/api/progress` — the same string the web receives — so there is
 * no date parsing here, only layout.
 */
export interface GoalsWeightChartProps {
  data: { date: string; value: number }[];
  /** Already in the member's display unit, rounded — the same value the
   *  "Goal: X lbs" label above the chart shows. */
  targetWeight?: number | null;
  height?: number;
  testID?: string;
}

const PAD_TOP = 10;
const PAD_BOTTOM = 18;
const PAD_LEFT = 34;
const PAD_RIGHT = 8;

/**
 * 4 evenly spaced ticks across a 10%-padded min/max — the shape of
 * Recharts' `domain={['auto','auto']}` default axis, rounded to one decimal
 * so a 173-175 lb range reads as clean ticks instead of float noise.
 */
export function weightChartYTicks(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [Math.round(min * 10) / 10];
  const span = max - min;
  const pad = span * 0.1;
  const lo = min - pad;
  const hi = max + pad;
  return [0, 1 / 3, 2 / 3, 1].map((t) => Math.round((lo + t * (hi - lo)) * 10) / 10);
}

export function GoalsWeightChart({
  data,
  targetWeight,
  height = 180,
  testID = "goals-weight-chart",
}: GoalsWeightChartProps) {
  const { colors } = useThemeTokens();
  const [width, setWidth] = useState(320);

  const values = data.map((d) => d.value);
  const domainValues = targetWeight != null ? [...values, targetWeight] : values;
  const min = domainValues.length ? Math.min(...domainValues) : 0;
  const max = domainValues.length ? Math.max(...domainValues) : 1;
  const span = max - min || 1;
  const pad = span * 0.1 || 1;
  const lo = min - pad;
  const hi = max + pad;

  const plotW = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
  const plotH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);

  const x = (i: number): number =>
    data.length <= 1 ? PAD_LEFT + plotW / 2 : PAD_LEFT + (i / (data.length - 1)) * plotW;
  const y = (v: number): number => PAD_TOP + plotH - ((v - lo) / (hi - lo)) * plotH;

  const linePath = data.length
    ? data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ")
    : "";
  const areaPath =
    data.length > 1
      ? `${linePath} L ${x(data.length - 1).toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)} Z`
      : "";

  const yTicks = weightChartYTicks(domainValues);
  const firstLabel = data[0]?.date;
  const lastLabel = data.length > 1 ? data[data.length - 1]?.date : undefined;

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`Weight trend, ${data.length} points`}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - width) > 1) setWidth(w);
      }}
      style={{ width: "100%", height }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="goalsWeightGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="5%" stopColor={colors.foreground} stopOpacity={0.15} />
            <Stop offset="95%" stopColor={colors.foreground} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {yTicks.map((t, idx) => (
          <Line
            key={`grid-${idx}`}
            x1={PAD_LEFT}
            y1={y(t)}
            x2={width - PAD_RIGHT}
            y2={y(t)}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        ))}
        {yTicks.map((t, idx) => (
          <SvgText
            key={`ytick-${idx}`}
            x={PAD_LEFT - 6}
            y={y(t) + 3}
            fontSize={10}
            fill={colors["muted-foreground"]}
            textAnchor="end"
          >
            {t}
          </SvgText>
        ))}

        {/* Goal reference line — the web's green dashed `ReferenceLine`. */}
        {targetWeight != null ? (
          <>
            <Line
              x1={PAD_LEFT}
              y1={y(targetWeight)}
              x2={width - PAD_RIGHT}
              y2={y(targetWeight)}
              stroke={colors.success}
              strokeDasharray="4,4"
              strokeWidth={1.5}
            />
            <SvgText
              x={width - PAD_RIGHT}
              y={y(targetWeight) - 4}
              fontSize={10}
              fill={colors.success}
              textAnchor="end"
            >
              Goal {targetWeight}
            </SvgText>
          </>
        ) : null}

        {areaPath ? <Path d={areaPath} fill="url(#goalsWeightGrad)" /> : null}
        {linePath ? (
          <Path
            testID={`${testID}-line`}
            d={linePath}
            fill="none"
            stroke={colors.foreground}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {firstLabel ? (
          <SvgText
            x={x(0)}
            y={height - 4}
            fontSize={10}
            fill={colors["muted-foreground"]}
            textAnchor="start"
          >
            {firstLabel}
          </SvgText>
        ) : null}
        {lastLabel ? (
          <SvgText
            x={x(data.length - 1)}
            y={height - 4}
            fontSize={10}
            fill={colors["muted-foreground"]}
            textAnchor="end"
          >
            {lastLabel}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

export default GoalsWeightChart;
