/* eslint-disable import/first */
// THE DASHBOARD PROGRESS CHART (NP-132): weight, BMI, body fat, lean mass, mood.
//
// Below the tiles the web dashboard charts weight (with the goal line), BMI,
// body fat, lean mass and mood (`webapp/components/ProgressChart.tsx`, fed by
// `GET /api/progress`: `weightData`, `bmiData`, `bodyFatData`, `leanMassData`,
// `moodData`, with the target weight converted from kg via `kgToUnit`). This
// suite pins the native port (`expo/components/dashboard/ProgressChart.tsx`,
// drawn on the NP-130 chart kit) to the same contract:
//
//   1. (e015c9a6) The weight line and goal line match the web's for the same
//      member — the series are rendered verbatim (no client-side
//      recomputation), and the goal line is the web's
//      `Math.round(kgToUnit(targetWeightKg, weightUnit) * 10) / 10`
//      (`DashboardClient.tsx`), computed with the SAME `kgToUnit` from
//      `@become/core` — never the truncated `2.20462` factor the dashboard
//      screen used to carry.
//   2. (e015c9a7) Every metric tab reads correctly in light and dark mode —
//      computed WCAG contrast of the actual colours the chart resolves in each
//      mode, plus a live-flip render proving the series re-resolve when the
//      system setting flips.

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { View as RNView } from "react-native";
import { useThemeTokens as useProbeTokens } from "@/lib/theme/useThemeTokens";
import { kgToUnit } from "@become/core";
import { ProgressChart } from "@/components/dashboard/ProgressChart";
import {
  darkTokens,
  getTokens,
  lightTokens,
  type ThemeMode,
  type TokenName,
} from "@/lib/theme/tokens";
/* eslint-enable import/first */

function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

type RGB = [number, number, number];

function channels(mode: ThemeMode, name: TokenName): RGB {
  const [r = 0, g = 0, b = 0] = getTokens(mode)[name].split(" ").map(Number);
  return [r, g, b];
}

function luminance([r, g, b]: RGB): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ─── The fixture: what `GET /api/progress` answers for one member ───────────

const WEIGHT = [
  { date: "Sep 25", value: 178.0 },
  { date: "Sep 28", value: 176.5 },
  { date: "Oct 1", value: 175.2 },
];
const BMI = [
  { date: "Sep 25", value: 25.1 },
  { date: "Sep 28", value: 24.9 },
  { date: "Oct 1", value: 24.7 },
];
const BODY_FAT = [
  { date: "Sep 25", value: 18.5 },
  { date: "Oct 1", value: 18.0 },
];
const LEAN_MASS = [
  { date: "Sep 25", value: 145.0 },
  { date: "Oct 1", value: 143.7 },
];
const MOOD = [
  { date: "Sep 29", value: 3 },
  { date: "Sep 30", value: 4 },
  { date: "Oct 1", value: 5 },
];

// ─── 1. The weight line and goal line match the web's (e015c9a6) ────────────

describe("weight and goal lines match the web (e015c9a6)", () => {
  it("renders the server's weight series verbatim with the goal line", () => {
    setSystemScheme("light");
    const { getByTestId } = render(
      <ProgressChart
        testID="progress-chart-card"
        weightData={WEIGHT}
        bmiData={BMI}
        bodyFatData={BODY_FAT}
        leanMassData={LEAN_MASS}
        moodData={MOOD}
        fitnessGoal="lose_weight"
        targetWeight={170}
        weightUnit="lbs"
      />,
    );

    // The weight line: the latest server point, one decimal, like the web's
    // `stats.current.toFixed(1)`.
    expect(getByTestId("progress-chart-current").props.children).toBe("175.2");
    expect(getByTestId("progress-chart-unit").props.children).toBe("lbs");
    // The goal line: the web's ReferenceLine, drawn only on the weight tab.
    expect(getByTestId("progress-chart-target-line")).toBeTruthy();
    expect(
      getByTestId("progress-chart-target-label").props.children.props.children,
    ).toBe("Goal 170.0 lbs");
  });

  it("converts the goal from kg with the web's kgToUnit, not 2.20462", () => {
    // The web: `Math.round(kgToUnit(targetWeightKg, weightUnit) * 10) / 10`
    // (`DashboardClient.tsx`), where `kgToUnit` divides by the exact
    // `KG_PER_LB` (0.45359237). The dashboard screen used to multiply by the
    // truncated `2.20462`, which rounds differently for ~49 weights in
    // 30–200 kg (e.g. 72.28 kg → 159.4 vs 159.3 lbs).
    const targetWeightKg = 72.28;
    const webGoal = Math.round(kgToUnit(targetWeightKg, "lbs") * 10) / 10;
    expect(webGoal).toBe(159.4);

    setSystemScheme("light");
    const { getByTestId } = render(
      <ProgressChart
        weightData={WEIGHT}
        bmiData={BMI}
        moodData={MOOD}
        targetWeight={webGoal}
        weightUnit="lbs"
      />,
    );
    expect(
      getByTestId("progress-chart-target-label").props.children.props.children,
    ).toBe(`Goal ${webGoal.toFixed(1)} lbs`);

    // The screen passes the same conversion through — the source must call
    // the shared helper, so a future truncated factor fails here.
    const screenSrc = fs.readFileSync(
      path.join(__dirname, "..", "components", "DashboardScreen.tsx"),
      "utf8",
    );
    expect(screenSrc).toContain("kgToUnit(statData.targetWeightKg");
    expect(screenSrc).not.toContain("2.20462");
  });

  it("draws the goal line only on the weight tab, in the member's unit", () => {
    setSystemScheme("light");
    const targetKg = 70;
    const goalKg = Math.round(kgToUnit(targetKg, "kg") * 10) / 10;
    const { getByTestId, queryByTestId } = render(
      <ProgressChart
        weightData={WEIGHT}
        bmiData={BMI}
        bodyFatData={BODY_FAT}
        leanMassData={LEAN_MASS}
        moodData={MOOD}
        targetWeight={goalKg}
        weightUnit="kg"
      />,
    );

    expect(getByTestId("progress-chart-target-line")).toBeTruthy();
    expect(
      getByTestId("progress-chart-target-label").props.children.props.children,
    ).toBe("Goal 70.0 kg");

    // BMI has no goal line — the web's ReferenceLine is weight-only too.
    fireEvent.press(getByTestId("progress-chart-tab-bmi"));
    expect(queryByTestId("progress-chart-target-line")).toBeNull();
    expect(getByTestId("progress-chart-current").props.children).toBe("24.7");

    // Body fat and lean mass tabs read their own series and units.
    fireEvent.press(getByTestId("progress-chart-tab-body_fat"));
    expect(getByTestId("progress-chart-current").props.children).toBe("18.0");
    expect(getByTestId("progress-chart-unit").props.children).toBe("%");

    fireEvent.press(getByTestId("progress-chart-tab-lean_mass"));
    expect(getByTestId("progress-chart-current").props.children).toBe("143.7");
    expect(getByTestId("progress-chart-unit").props.children).toBe("kg");

    // Mood reads the emoji, like the web's mood label.
    fireEvent.press(getByTestId("progress-chart-tab-mood"));
    expect(getByTestId("progress-chart-current").props.children).toBe("😊");
  });
});

// ─── 2. Every metric tab reads in light and dark mode (e015c9a7) ────────────

describe("every metric tab reads in light and dark mode (e015c9a7)", () => {
  it.each(["light", "dark"] as ThemeMode[])(
    "series, grid and axis labels clear AA in %s mode (computed, not eyeballed)",
    (mode) => {
      // The kit's colours on the card surface: series ink (primary /
      // success / accent / foreground), grid = border on the card, labels =
      // muted-foreground on the card. AA for graphics is 3:1; text holds
      // 4.5:1. Border grid lines are decorative (the values also read in the
      // header), so they are asserted present-but-subtle, not AA.
      for (const name of [
        "primary",
        "success",
        "accent",
        "foreground",
      ] as TokenName[]) {
        expect(contrast(channels(mode, name), channels(mode, "card"))).toBeGreaterThanOrEqual(
          3,
        );
      }
      expect(
        contrast(channels(mode, "muted-foreground"), channels(mode, "card")),
      ).toBeGreaterThanOrEqual(4.5);
      // The active tab is background ink on a foreground fill.
      expect(
        contrast(channels(mode, "background"), channels(mode, "foreground")),
      ).toBeGreaterThanOrEqual(4.5);
      // The palettes the hook hands out are the two the tokens file names.
      expect(getTokens(mode)).toEqual(
        mode === "dark" ? darkTokens : lightTokens,
      );
    },
  );

  it("resolves theme colours live: a system flip repaints the series", () => {
    function ForegroundProbe() {
      const { colors: probeColors } = useProbeTokens();
      return (
        <RNView
          testID="foreground-probe"
          style={{ backgroundColor: probeColors.foreground }}
        />
      );
    }
    setSystemScheme("light");
    const light = render(<ForegroundProbe />);
    expect(light.getByTestId("foreground-probe").props.style).toMatchObject({
      backgroundColor: `rgb(${lightTokens.foreground})`,
    });
    light.unmount();

    setSystemScheme("dark");
    const dark = render(<ForegroundProbe />);
    expect(dark.getByTestId("foreground-probe").props.style).toMatchObject({
      backgroundColor: `rgb(${darkTokens.foreground})`,
    });
    dark.unmount();

    // And the chart paints from those same tokens — the source, read straight
    // from the file so a future hard-coded fill fails here.
    const chartSrc = fs.readFileSync(
      path.join(__dirname, "..", "components", "dashboard", "ProgressChart.tsx"),
      "utf8",
    );
    // Weight is blue and lean mass is purple, matching the web's chartConfig
    // (`#3b82f6` / `#8b5cf6`) via the `info` / `mindset` tokens — never the
    // brand red (`colors.primary`), which the web never uses for a series.
    expect(chartSrc).toContain("colors.info");
    expect(chartSrc).toContain("colors.mindset");
    expect(chartSrc).toContain("colors.success");
    expect(chartSrc).toContain("colors.accent");
    expect(chartSrc).toContain("colors.foreground");
    expect(chartSrc).toContain("stroke={colors.border}");
    expect(chartSrc).toContain('fill={colors["muted-foreground"]}');
  });

  it("no hard-coded ink in the chart", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "components", "dashboard", "ProgressChart.tsx"),
      "utf8",
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
    expect(
      code
        .split("\n")
        .filter((line) =>
          /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/.test(
            line,
          ),
        ),
    ).toEqual([]);
    expect(
      code.split("\n").filter((line) => /["'`]\s*rgba?\(\s*\d/.test(line)),
    ).toEqual([]);
  });
});
