import { render } from "@testing-library/react-native";
import {
  GoalsWeightChart,
  weightChartXTickIndices,
  weightChartYTicks,
} from "@/components/nutrition/GoalsWeightChart";

/**
 * `react-native-svg` normalises a `stroke`/`fill` string into
 * `{ type, payload }`, where `payload` is the processed ARGB int — so
 * `#22c55e` has to be compared as that same int, not as the hex string it
 * was passed as (see `dashboardSmartTilesNP156.test.tsx`'s own helper).
 */
function svgColorInt(value: unknown): number | unknown {
  if (value && typeof value === "object" && "payload" in value) {
    return (value as { payload: number }).payload;
  }
  return value;
}

/** ARGB int for `colors["mind-green"]` (green-500, `34 197 94`), the goal
 *  line/label colour — same raw value as the web's `stroke="#22c55e"`. */
const GREEN_ARGB = (((0xff << 24) | (34 << 16) | (197 << 8) | 94) >>> 0) as number;

/**
 * NP-266/NP-323/NP-375: the Weight tab's chart is a 1:1 port of the web's
 * PLAIN Recharts `AreaChart` — one series, "niced" y-ticks straight off the
 * data, up to five x-axis date labels with a dashed vertical grid, AND
 * (NP-375, reversing NP-323's removal) a green dashed goal reference line
 * with a right-aligned "Goal N" label when the goal falls inside the
 * chart's own data range — `textAnchor="end"` keeps the label inside the
 * canvas so it can't repeat NP-323's Android clipping bug.
 */
describe("weightChartYTicks", () => {
  it("returns nice half-step ticks across a 173-175 lb range, like the web", () => {
    // 173-175 lb range, like the web's goalsw-* screenshots.
    const ticks = weightChartYTicks([173, 174, 175]);
    expect(ticks).toEqual([173, 173.5, 174, 174.5, 175]);
  });

  it("collapses to one tick when every value is identical", () => {
    expect(weightChartYTicks([180, 180, 180])).toEqual([180]);
  });

  it("is empty with no data", () => {
    expect(weightChartYTicks([])).toEqual([]);
  });

  it("stays strictly increasing for an irregular range", () => {
    const ticks = weightChartYTicks([161.3, 188.9]);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]!);
    }
    expect(Math.min(...ticks)).toBeLessThanOrEqual(161.3);
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(188.9);
  });
});

describe("weightChartXTickIndices", () => {
  it("returns every index when there are 5 or fewer points", () => {
    expect(weightChartXTickIndices(3)).toEqual([0, 1, 2]);
  });

  it("picks 5 evenly spaced indices, always including the first and last", () => {
    // A ~4-week daily series, like the web's Sep 9 / Sep 15 / Sep 21 /
    // Sep 27 / Oct 6.
    const indices = weightChartXTickIndices(29);
    expect(indices.length).toBe(5);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(28);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it("is empty with no data", () => {
    expect(weightChartXTickIndices(0)).toEqual([]);
  });
});

describe("GoalsWeightChart", () => {
  const data = [
    { date: "Sep 9", value: 175 },
    { date: "Sep 20", value: 174.2 },
    { date: "Oct 6", value: 173.4 },
  ];

  it("renders the series as a single line, no BMI/Mood tabs", () => {
    const { getByTestId, toJSON } = render(
      <GoalsWeightChart data={data} targetWeight={null} testID="goals-weight-chart" />,
    );
    expect(getByTestId("goals-weight-chart")).toBeTruthy();
    expect(getByTestId("goals-weight-chart-line")).toBeTruthy();
    // First/middle/last date labels are all drawn (<= 5 points here).
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain("Sep 9");
    expect(tree).toContain("Oct 6");
  });

  it("draws no goal line without a target weight", () => {
    const { queryByTestId, toJSON } = render(
      <GoalsWeightChart data={data} targetWeight={null} testID="goals-weight-chart" />,
    );
    expect(queryByTestId("goals-weight-chart-goal-line")).toBeNull();
    expect(queryByTestId("goals-weight-chart-goal-label")).toBeNull();
    expect(JSON.stringify(toJSON())).not.toContain("Goal ");
  });

  // NP-375: the web's `ReferenceLine y={targetWeightLbs}` — green, dashed,
  // "Goal N" label — inside the data's own y range (173.4-175 here).
  //
  // `react-native-svg` normalises `stroke`/`fill` into `{ type, payload }`
  // (the processed ARGB int) under RNTL, not the hex string it was passed
  // as — same as `dashboardSmartTilesNP156.test.tsx`'s own `svgColorInt`
  // helper works around.
  it("draws a green dashed goal line with a 'Goal N' label when the target is inside the data range", () => {
    const { getByTestId, toJSON } = render(
      <GoalsWeightChart data={data} targetWeight={174} testID="goals-weight-chart" />,
    );
    const line = getByTestId("goals-weight-chart-goal-line");
    expect(svgColorInt(line.props.stroke)).toBe(GREEN_ARGB);
    expect(line.props.strokeDasharray).toEqual(["4", "4"]);
    const label = getByTestId("goals-weight-chart-goal-label");
    expect(svgColorInt(label.props.fill)).toBe(GREEN_ARGB);
    expect(JSON.stringify(toJSON())).toContain("Goal 174");
  });

  // The label's right edge is pinned at `width - PAD_RIGHT` (312, for the
  // component's own 320 default width under RNTL, where no `onLayout`
  // fires) — inside the <Svg> canvas, not past it — so it can't repeat
  // NP-323's Android clipping bug (a label that ran off the right edge).
  // `textAnchor="end"` (set in the source; not inspectable through RNTL's
  // native-host props here) means the text draws LEFTWARD from that `x`,
  // so anchoring `x` itself inside the canvas is enough to guarantee it.
  it("anchors the goal label's right edge inside the canvas, never past it", () => {
    const { getByTestId } = render(
      <GoalsWeightChart data={data} targetWeight={174} testID="goals-weight-chart" />,
    );
    const label = getByTestId("goals-weight-chart-goal-label");
    const line = getByTestId("goals-weight-chart-goal-line");
    expect(label.props.x).toEqual([312]);
    expect(line.props.x2).toBe(312);
  });

  // The web's `ReferenceLine` hides itself when the target falls outside
  // the chart's own auto y-domain rather than stretching the domain to
  // include it — so a goal far from the plotted range draws nothing.
  it("draws no goal line when the target is outside the data's y range", () => {
    const { queryByTestId, toJSON } = render(
      <GoalsWeightChart data={data} targetWeight={999} testID="goals-weight-chart" />,
    );
    expect(queryByTestId("goals-weight-chart-goal-line")).toBeNull();
    expect(queryByTestId("goals-weight-chart-goal-label")).toBeNull();
    expect(JSON.stringify(toJSON())).not.toContain("Goal ");
  });

  it("draws nothing for an empty series without throwing", () => {
    const { queryByTestId } = render(
      <GoalsWeightChart data={[]} targetWeight={null} testID="empty-chart" />,
    );
    expect(queryByTestId("empty-chart")).toBeTruthy();
    expect(queryByTestId("empty-chart-line")).toBeNull();
    expect(queryByTestId("empty-chart-goal-line")).toBeNull();
  });
});
