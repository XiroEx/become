/**
 * NP-257: home cards visual pass — the remaining style-vs-web mismatches that
 * are not the Mindset CTA or the mood chart (covered elsewhere):
 *
 *   - StatTile's wide (2x1) layout drew a chevron and a short fixed-width bar
 *     the web's `ui/StatTile.tsx` never draws — just a bar that fills the
 *     space beside the value column.
 *   - The Calories tile's icon/badge was flat red regardless of state; the
 *     web's `renderCalories` is green while under goal, red only over (or
 *     with no goal set).
 *   - The mood tile's value/face were one flat accent for every level; the
 *     web's `MoodCard` colours each level (`moodConfig`).
 *   - `SmartRotatingTile`'s "live" dot was the brand red; the web's is
 *     indigo (`bg-indigo-500`).
 *   - `DashboardQuickLinks`'s flexing grid let the odd third link stretch to
 *     the full row width instead of staying in its own 2-column cell
 *     (web: `grid grid-cols-2`).
 *   - `PlanCard`'s Plus sparkle was amber inside its own purple badge.
 *   - `CurrentProgramCard`'s program name was bold (web: `font-medium`) and
 *     its Continue label was truncated to one line instead of wrapping.
 */
import * as fs from "fs";
import * as path from "path";
import React from "react";
import { act, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { Utensils } from "lucide-react-native";
import { StatTile } from "@/components/dashboard/StatTile";
import { DashboardQuickLinks } from "@/components/dashboard/DashboardQuickLinks";
import { CurrentProgramCard } from "@/components/dashboard/CurrentProgramCard";
import { darkTokens } from "@/lib/theme/tokens";
import type { DashboardStatData } from "@/lib/dashboard/types";

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

function readSrc(file: string): string {
  return fs.readFileSync(
    path.join(__dirname, "..", "components", "dashboard", file),
    "utf8",
  );
}

describe("NP-257: StatTile's wide layout has no chevron and a full-width bar", () => {
  it("never renders a ChevronRight in the wide variant (the web's StatTile never does)", () => {
    const src = readSrc("StatTile.tsx");
    expect(src).not.toContain("ChevronRight");
  });

  it("the wide bar track stretches (flex: 1) instead of a fixed 80px width", () => {
    const src = readSrc("StatTile.tsx");
    expect(src).not.toContain("width: 80");
  });
});

describe("NP-257: the Calories tile is green under goal, red only over/unset", () => {
  const base: DashboardStatData = { streakDays: 1, thisWeekWorkouts: 0 };

  it("colours the icon green while under the calorie goal", () => {
    setSystemScheme("dark");
    const statData: DashboardStatData = {
      ...base,
      caloriesConsumed: 1200,
      caloriesGoal: 2000,
    };
    const { UNSAFE_getByType } = render(
      <StatTile tile={{ id: "calories", kind: "stat", size: "1x1" }} statData={statData} />,
    );
    expect(UNSAFE_getByType(Utensils).props.color).toBe(`rgb(${darkTokens.success})`);
  });

  it("colours the icon red when over the calorie goal", () => {
    setSystemScheme("dark");
    const statData: DashboardStatData = {
      ...base,
      caloriesConsumed: 2200,
      caloriesGoal: 2000,
    };
    const { UNSAFE_getByType } = render(
      <StatTile tile={{ id: "calories", kind: "stat", size: "1x1" }} statData={statData} />,
    );
    expect(UNSAFE_getByType(Utensils).props.color).toBe(`rgb(${darkTokens.destructive})`);
  });
});

describe("NP-257: the mood tile colours the value per mood level, not one flat accent", () => {
  it("colours 'Not Great' (2) with the mood-low token, not the generic accent", () => {
    setSystemScheme("dark");
    const statData: DashboardStatData = {
      streakDays: 0,
      thisWeekWorkouts: 0,
      todaysMood: 2,
    };
    const { getByTestId } = render(
      <StatTile tile={{ id: "mood", kind: "stat", size: "1x1" }} statData={statData} />,
    );
    const valueText = getByTestId("tile-mood-value");
    const color = [valueText.props.style]
      .flat(Infinity)
      .find((s) => s?.color)?.color;
    expect(color).toBe(`rgb(${darkTokens["mood-low"]})`);
  });
});

describe("NP-257: SmartRotatingTile's live dot is indigo-ish (info), not the brand red", () => {
  it("never paints the live dot with colors.primary", () => {
    const src = readSrc("SmartRotatingTile.tsx");
    expect(src).not.toContain('backgroundColor: colors.primary');
    expect(src).toContain("colors.info");
  });
});

describe("NP-257: DashboardQuickLinks keeps a fixed 2-column grid", () => {
  it("renders the three links without stretching the odd one full-width", () => {
    const { getByTestId } = render(<DashboardQuickLinks />);
    const progress = getByTestId("dashboard-quick-link-progress");
    const flat = [progress.props.style].flat();
    expect(flat.some((s) => s?.flexGrow === 1)).toBe(false);
    expect(flat.some((s) => s?.flexBasis === "48%")).toBe(true);
  });
});

describe("NP-257: PlanCard's Plus sparkle matches its own purple badge", () => {
  it("never paints the sparkle with the amber accent token", () => {
    const src = readSrc("PlanCard.tsx");
    expect(src).toContain("color={colors.mindset}");
    expect(src).not.toContain("<Sparkles size={20} color={colors.accent} />");
  });
});

describe("NP-257: CurrentProgramCard's name is regular weight and Continue wraps", () => {
  const program = {
    programId: "p1",
    name: "Hypertrophy Foundations",
    currentPhase: 2,
    currentWeek: 3,
    totalWeeks: 8,
    nextWorkout: "Upper Body Day",
  };

  it("renders the program name as font-medium, not font-semibold", () => {
    const { getByTestId } = render(<CurrentProgramCard program={program} />);
    const name = getByTestId("current-program-name");
    expect(name.props.className).toContain("font-medium");
    expect(name.props.className).not.toContain("font-semibold");
  });

  it("does not clip the Continue label to one line", () => {
    const { getByText } = render(<CurrentProgramCard program={program} />);
    const label = getByText("Continue: Upper Body Day");
    expect(label.props.numberOfLines).toBeUndefined();
  });
});
