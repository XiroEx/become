import { render } from "@testing-library/react-native";
import { GoalsWeightChart, weightChartYTicks } from "@/components/nutrition/GoalsWeightChart";

/**
 * NP-266: the Weight tab's chart is a 1:1 port of the web's PLAIN Recharts
 * `AreaChart` (one series, auto y-domain, a dashed goal line, first/last
 * date labels) — not the dashboard's multi-metric `ProgressChart` the
 * screen embedded before.
 */
describe("weightChartYTicks", () => {
  it("returns 4 evenly spaced ticks across a 10%-padded min/max", () => {
    // 173-175 lb range, like the web's goalsw-* screenshots.
    const ticks = weightChartYTicks([173, 174, 175]);
    expect(ticks.length).toBe(4);
    expect(ticks[0]).toBeLessThan(173);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(175);
    // Strictly increasing.
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it("collapses to one tick when every value is identical", () => {
    expect(weightChartYTicks([180, 180, 180])).toEqual([180]);
  });

  it("is empty with no data", () => {
    expect(weightChartYTicks([])).toEqual([]);
  });

  it("widens the domain to include the goal line, not just the series", () => {
    // A goal far outside the logged series still has to fit on the axis —
    // the same thing the web's `domain={['auto','auto']}` does once the
    // `ReferenceLine`'s value is folded into the chart's own data.
    const withoutGoal = weightChartYTicks([175, 174]);
    const withGoal = weightChartYTicks([175, 174, 160]);
    expect(Math.min(...withGoal)).toBeLessThan(Math.min(...withoutGoal));
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
      <GoalsWeightChart data={data} targetWeight={170} testID="goals-weight-chart" />,
    );
    expect(getByTestId("goals-weight-chart")).toBeTruthy();
    expect(getByTestId("goals-weight-chart-line")).toBeTruthy();
    // First/last date labels — `interval="preserveStartEnd"`, the web's rule —
    // and the goal line's label, somewhere in the drawn tree.
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain("Sep 9");
    expect(tree).toContain("Oct 6");
    expect(tree).toContain("Goal ");
    expect(tree).toContain('"170"');
  });

  it("renders with no goal line when there is no target", () => {
    const { toJSON } = render(<GoalsWeightChart data={data} targetWeight={null} />);
    expect(JSON.stringify(toJSON())).not.toContain("Goal ");
  });

  it("draws nothing for an empty series without throwing", () => {
    const { queryByTestId } = render(
      <GoalsWeightChart data={[]} targetWeight={null} testID="empty-chart" />,
    );
    expect(queryByTestId("empty-chart")).toBeTruthy();
    expect(queryByTestId("empty-chart-line")).toBeNull();
  });
});
