/**
 * NP-257: Home cards visual pass — the mood chart tab.
 *
 * Web's mood chart (`webapp/components/ProgressChart.tsx`) draws:
 *   - a face icon at every y tick (`YAxis tickFormatter={(v) => moodLabels[v]}`),
 *   - one bar colour PER mood level (`moodColors`, 5 distinct hues), and
 *   - date labels that stay readable because Recharts thins its own ticks.
 *
 * The native port drew none of the above: no y-axis faces, only two distinct
 * bar colours (`destructive`/`accent`×2/`success`×2), and EVERY date label on
 * every bar, which overlaps into one unreadable run at this chart's width.
 * This pins all three.
 */
import * as fs from "fs";
import * as path from "path";
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Text as SvgText } from "react-native-svg";
import { ProgressChart } from "@/components/dashboard/ProgressChart";

const chartSrc = fs.readFileSync(
  path.join(__dirname, "..", "components", "dashboard", "ProgressChart.tsx"),
  "utf8",
);

describe("NP-257: mood chart axis faces, bar colours and date labels", () => {
  it("renders a face icon at every y-axis tick (1..5), like the web's tickFormatter", () => {
    const moodData = [
      { date: "Oct 4", value: 3 },
      { date: "Oct 5", value: 4 },
      { date: "Oct 6", value: 5 },
    ];
    const { getByTestId, UNSAFE_getAllByType } = render(
      <ProgressChart moodData={moodData} defaultChart="mood" />,
    );
    expect(getByTestId("progress-chart-tab-mood")).toBeTruthy();

    const svgTexts = UNSAFE_getAllByType(SvgText);
    const faceTexts = svgTexts
      .map((el) => el.props.children)
      .filter((c) => typeof c === "string");
    for (const face of ["😢", "😕", "😐", "🙂", "😊"]) {
      expect(faceTexts).toContain(face);
    }
  });

  it("colours each mood bar from the 5-step mood palette, not just two tones", () => {
    expect(chartSrc).toContain('colors["mood-bad"]');
    expect(chartSrc).toContain('colors["mood-low"]');
    expect(chartSrc).toContain('colors["mood-okay"]');
    expect(chartSrc).toContain('colors["mood-good"]');
    expect(chartSrc).toContain('colors["mood-great"]');
  });

  it("thins the mood chart's own date labels past 6 points instead of drawing all of them", () => {
    const moodStart = chartSrc.indexOf("Mood Bars");
    const moodEnd = chartSrc.indexOf("/* Line / Area Chart */");
    expect(moodStart).toBeGreaterThan(-1);
    expect(moodEnd).toBeGreaterThan(moodStart);
    const moodBlock = chartSrc.slice(moodStart, moodEnd);
    expect(moodBlock).toContain("showDate");

    // Behaviourally: 12 days of mood data renders far fewer than 12 date
    // labels (first / last / middle only), where it used to render all 12
    // packed into the same width.
    const moodData = Array.from({ length: 12 }, (_, i) => ({
      date: `Day ${i + 1}`,
      value: ((i % 5) + 1),
    }));
    const { UNSAFE_getAllByType } = render(
      <ProgressChart moodData={moodData} defaultChart="mood" />,
    );
    const dateTexts = UNSAFE_getAllByType(SvgText)
      .map((el) => el.props.children)
      .filter((c): c is string => typeof c === "string" && c.startsWith("Day "));
    expect(dateTexts.length).toBeLessThan(moodData.length);
    expect(dateTexts).toContain("Day 1");
    expect(dateTexts).toContain("Day 12");
  });

  it("switching tabs away from mood still renders only the line/area chart's own dots-free series", () => {
    const weightData = [
      { date: "Oct 1", value: 180 },
      { date: "Oct 2", value: 179.5 },
    ];
    const moodData = [{ date: "Oct 2", value: 4 }];
    const { getByTestId } = render(
      <ProgressChart weightData={weightData} moodData={moodData} />,
    );
    fireEvent.press(getByTestId("progress-chart-tab-mood"));
    fireEvent.press(getByTestId("progress-chart-tab-weight"));
    expect(getByTestId("progress-chart-current").props.children).toBe("179.5");
  });
});
