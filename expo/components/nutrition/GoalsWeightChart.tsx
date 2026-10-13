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
 * The Weight tab's chart (NP-266/NP-323/NP-375) — a 1:1 port of the web's
 * PLAIN weight line in `webapp/app/dashboard/nutrition/goals/page.tsx` (a
 * Recharts `AreaChart`): one series, a "niced" y-domain/ticks, up to five
 * x-axis date labels with a dashed vertical grid behind them, and the
 * web's green dashed `ReferenceLine y={targetWeightLbs}` with a right-hand
 * "Goal N" label. Nothing else — no BMI/Mood tabs, no change pill, no
 * second series — those belong to the dashboard's `ProgressChart`, which
 * this screen no longer embeds.
 *
 * The web's `ReferenceLine` only ever appears when the goal falls inside
 * the chart's own DATA-only y-domain (`domain={['auto','auto']}`, computed
 * from `yTicks`/`lo`/`hi` below) — it is never folded into that domain, so
 * a goal far outside the visible range draws no line, same as the web's
 * default (non-`extendDomain`) `ReferenceLine` behaviour.
 *
 * NP-323 removed this line entirely because its right-aligned label used
 * to clip to `Goal18` on Android — that was a `textAnchor="start"` label
 * placed near the right edge, which react-native-svg's Android (Skia)
 * renderer clips hard at the `<Svg>` canvas bounds. NP-375 restores the
 * line with `textAnchor="end"` anchored at `width - PAD_RIGHT` instead: the
 * anchor point itself is already inside the canvas, so the text draws
 * LEFTWARD from it and never crosses the right edge, on either platform.
 *
 * `data[].date` is already a display string (`"Sep 9"`), formatted server
 * side by `/api/progress` — the same string the web receives — so there is
 * no date parsing here, only layout.
 */
export interface GoalsWeightChartProps {
  data: { date: string; value: number }[];
  /** The weight goal, in the same unit as `data[].value`. Drawn as a green
   *  dashed reference line (NP-375) when it falls inside the chart's own
   *  data-derived y range — never expands that range, matching the web's
   *  `ReferenceLine` (see the module doc above). `null`/`undefined` draws
   *  no line, same as the web when there is no target weight. */
  targetWeight?: number | null;
  height?: number;
  testID?: string;
}

const PAD_TOP = 10;
const PAD_BOTTOM = 18;
const PAD_LEFT = 36;
const PAD_RIGHT = 8;
const MAX_X_LABELS = 5;

/** Picks a nice round step (1/2/2.5/5/10 × a power of ten) for a raw
 *  per-tick span — the same "nice numbers" shape d3 (and so Recharts'
 *  `domain={['auto','auto']}`) picks its axis ticks from. */
function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = rawStep / Math.pow(10, exponent);
  let niceBase: number;
  if (base <= 1) niceBase = 1;
  else if (base <= 2) niceBase = 2;
  else if (base <= 2.5) niceBase = 2.5;
  else if (base <= 5) niceBase = 5;
  else niceBase = 10;
  return niceBase * Math.pow(10, exponent);
}

/**
 * ~`tickCount` nice, evenly-stepped ticks spanning the data's own min/max —
 * e.g. a 173-175 lb series reads `173 / 173.5 / 174 / 174.5 / 175`, the
 * shape of the web's `YAxis domain={['auto','auto']}` (173-175 in 0.5
 * steps), not evenly-spaced floats across a 10%-padded range.
 */
export function weightChartYTicks(values: number[], tickCount = 5): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [Math.round(min * 10) / 10];
  const rawStep = (max - min) / Math.max(1, tickCount - 1);
  const step = niceStep(rawStep);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step) {
    ticks.push(Math.round(t * 1000) / 1000);
  }
  return ticks;
}

/**
 * Up to `maxTicks` evenly spaced indices into a `count`-length series,
 * always including the first and last — the web's x axis with
 * `interval="preserveStartEnd"`, which (for a ~4-week series) lands on 5
 * labels a week apart (`Sep 9 / Sep 15 / Sep 21 / Sep 27 / Oct 6`), not just
 * the two endpoints.
 */
export function weightChartXTickIndices(count: number, maxTicks = MAX_X_LABELS): number[] {
  if (count <= 0) return [];
  if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i);
  const indices = new Set<number>();
  for (let i = 0; i < maxTicks; i++) {
    indices.add(Math.round((i * (count - 1)) / (maxTicks - 1)));
  }
  return Array.from(indices).sort((a, b) => a - b);
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
  const yTicks = weightChartYTicks(values);
  const lo = yTicks.length > 1 ? yTicks[0]! : (values[0] ?? 0) - 1;
  const hi = yTicks.length > 1 ? yTicks[yTicks.length - 1]! : (values[0] ?? 1) + 1;

  const plotW = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
  const plotH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);

  const x = (i: number): number =>
    data.length <= 1 ? PAD_LEFT + plotW / 2 : PAD_LEFT + (i / (data.length - 1)) * plotW;
  const y = (v: number): number => PAD_TOP + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  const linePath = data.length
    ? data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ")
    : "";
  const areaPath =
    data.length > 1
      ? `${linePath} L ${x(data.length - 1).toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)} Z`
      : "";

  const xTickIndices = weightChartXTickIndices(data.length);

  // NP-375: the goal reference line — green, dashed, with a right-hand
  // "Goal N" label — drawn ONLY when the target falls inside the chart's
  // own data-derived [lo, hi], matching the web's `ReferenceLine` (its
  // default `ifOverflow` hides it outside the auto y-domain rather than
  // stretching the domain to fit it). Colour is `colors["mind-green"]`
  // (green-500, `34 197 94` — see `lib/theme/tokens.ts`), the SAME raw
  // value the web's `stroke="#22c55e"` is (NP-123 bans a new hex literal
  // here; this reuses the existing mode-invariant token for that hue
  // rather than adding a duplicate one, same as `mind-violet`/`orange`
  // already get reused across unrelated screens for their hue).
  const hasGoalLine =
    typeof targetWeight === "number" && Number.isFinite(targetWeight) && targetWeight >= lo && targetWeight <= hi;
  const goalY = hasGoalLine ? y(targetWeight) : 0;
  // The label sits above the line, UNLESS the line is close enough to the
  // top of the plot that an above label would run past PAD_TOP — then it
  // drops below instead. Either way `textAnchor="end"` keeps its right
  // edge at `width - PAD_RIGHT`, inside the canvas, so it can never clip
  // past the right edge the way the pre-NP-375 label used to on Android.
  const goalLabelY = hasGoalLine ? (goalY - PAD_TOP >= 12 ? goalY - 4 : goalY + 12) : 0;

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

        {/* Horizontal grid — one dashed line per y tick. */}
        {yTicks.map((t, idx) => (
          <Line
            key={`grid-y-${idx}`}
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

        {/* Vertical grid — one dashed line per visible x label, the web's
            `CartesianGrid` drawing both axes, not just the horizontal one. */}
        {xTickIndices.map((i) => (
          <Line
            key={`grid-x-${i}`}
            x1={x(i)}
            y1={PAD_TOP}
            x2={x(i)}
            y2={PAD_TOP + plotH}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        ))}

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

        {/* NP-375: the goal reference line — web's green dashed
            `ReferenceLine y={targetWeightLbs}` with a "Goal N" label,
            drawn on top of the area/line so it stays visible over the
            gradient fill. */}
        {hasGoalLine ? (
          <>
            <Line
              testID={`${testID}-goal-line`}
              x1={PAD_LEFT}
              y1={goalY}
              x2={width - PAD_RIGHT}
              y2={goalY}
              stroke={colors["mind-green"]}
              strokeWidth={1.5}
              strokeDasharray="4,4"
            />
            <SvgText
              testID={`${testID}-goal-label`}
              x={width - PAD_RIGHT}
              y={goalLabelY}
              fontSize={10}
              fontWeight="600"
              fill={colors["mind-green"]}
              textAnchor="end"
            >
              {`Goal ${targetWeight}`}
            </SvgText>
          </>
        ) : null}

        {xTickIndices.map((i, pos) => {
          const label = data[i]?.date;
          if (!label) return null;
          const isFirst = pos === 0;
          const isLast = pos === xTickIndices.length - 1;
          return (
            <SvgText
              key={`xtick-${i}`}
              x={x(i)}
              y={height - 4}
              fontSize={10}
              fill={colors["muted-foreground"]}
              textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

export default GoalsWeightChart;
