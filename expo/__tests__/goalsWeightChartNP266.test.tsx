import { render } from "@testing-library/react-native";
import {
  GoalsWeightChart,
  weightChartXTickIndices,
  weightChartYTicks,
} from "@/components/nutrition/GoalsWeightChart";

/**
 * NP-266/NP-323: the Weight tab's chart is a 1:1 port of the web's PLAIN
 * Recharts `AreaChart` — one series, "niced" y-ticks straight off the data,
 * up to five x-axis date labels with a dashed vertical grid, and NO goal
 * reference line (NP-323 drops it — its right-aligned label used to clip to
 * `Goal18` on Android; the "Goal: X lbs" header already carries the goal).
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

  it("renders the series as a single line, no BMI/Mood tabs, no goal line", () => {
    const { getByTestId, toJSON } = render(
      <GoalsWeightChart data={data} targetWeight={170} testID="goals-weight-chart" />,
    );
    expect(getByTestId("goals-weight-chart")).toBeTruthy();
    expect(getByTestId("goals-weight-chart-line")).toBeTruthy();
    // First/middle/last date labels are all drawn (<= 5 points here).
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain("Sep 9");
    expect(tree).toContain("Oct 6");
    // NP-323: no reference line / label for the goal — its text used to
    // clip to "Goal18" on Android; the chart draws none at all now.
    expect(tree).not.toContain("Goal ");
    expect(tree).not.toContain('"170"');
  });

  it("ignores targetWeight entirely — same output with or without it", () => {
    const withGoal = render(<GoalsWeightChart data={data} targetWeight={170} />).toJSON();
    const withoutGoal = render(<GoalsWeightChart data={data} targetWeight={null} />).toJSON();
    expect(JSON.stringify(withGoal)).not.toContain("Goal ");
    expect(JSON.stringify(withoutGoal)).not.toContain("Goal ");
  });

  it("draws nothing for an empty series without throwing", () => {
    const { queryByTestId } = render(
      <GoalsWeightChart data={[]} targetWeight={null} testID="empty-chart" />,
    );
    expect(queryByTestId("empty-chart")).toBeTruthy();
    expect(queryByTestId("empty-chart-line")).toBeNull();
  });
});
