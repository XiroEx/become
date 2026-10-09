/**
 * NP-352: Home (Dashboard) spacing/type diff pass — metric tile grid equal
 * heights & horizontal 1x1 layout, chart gridlines, Current Program link
 * colour.
 *
 * Scope note: two diffs from the card are deliberately NOT applied here
 * because the repo already carries an explicit, tested decision that
 * contradicts them:
 *   - Quick Links "Connect" card — chat is hidden behind
 *     `EXPO_PUBLIC_COMMUNITY_ENABLED` for the v1 store build (NP-032,
 *     `app/(app)/(tabs)/_layout.tsx`); adding a Connect tile here would
 *     surface a feature the store build intentionally hides.
 *   - SmartRotatingTile always drawing a 2x1 stat tile as a square — fixed
 *     deliberately under NP-316 (text collision at larger font scales);
 *     reverting it reintroduces that bug.
 * Both are called out in the PR body instead of silently dropped.
 */
import * as fs from "fs";
import * as path from "path";
import React from "react";
import { render } from "@testing-library/react-native";
import { StatTile } from "@/components/dashboard/StatTile";
import { CurrentProgramCard } from "@/components/dashboard/CurrentProgramCard";
import { ProgressChart, evenlySpacedIndices } from "@/components/dashboard/ProgressChart";
import { Text } from "@/components/Text";
import type { DashboardTile } from "@become/api-client";
import type { DashboardStatData } from "@/lib/dashboard/types";

function readSrc(file: string): string {
  return fs.readFileSync(
    path.join(__dirname, "..", "components", "dashboard", file),
    "utf8",
  );
}

describe("NP-352 (1): the tile grid gives every cell a fixed, equal height", () => {
  it("TileGrid's cell is a fixed 96px `height`, not a `minHeight` that lets content grow", () => {
    const src = readSrc("TileGrid.tsx");
    expect(src).toMatch(/cell:\s*{\s*height:\s*96,/);
    expect(src).not.toMatch(/cell:\s*{\s*marginBottom/);
  });

  it.each(["StatTile.tsx", "StreakTile.tsx", "StatActionTile.tsx", "MetricTile.tsx", "PlaceholderTile.tsx"])(
    "%s fills its cell with `height: \"100%\"`, never a `minHeight` that can outgrow a row-mate",
    (file) => {
      const src = readSrc(file);
      expect(src).toContain('height: "100%"');
      expect(src).not.toContain("minHeight: 96");
    },
  );
});

describe("NP-352 (2): the 1x1 tile layout is horizontal — circular badge left, label+value stacked beside it", () => {
  const statData: DashboardStatData = {
    streakDays: 5,
    thisWeekWorkouts: 2,
    caloriesConsumed: 1200,
    caloriesGoal: 2000,
  };

  it("StatTile's square (1x1) badge is a circle (borderRadius 18 on a 36x36 box), not a rounded square above the label", () => {
    const src = readSrc("StatTile.tsx");
    expect(src).toMatch(/circleBadge:\s*{\s*width:\s*36,\s*height:\s*36,\s*borderRadius:\s*18,/);
  });

  it("StatTile and StreakTile value text is extrabold/tracking-tight/leading-none, matching the web's StatTile", () => {
    for (const file of ["StatTile.tsx", "StreakTile.tsx"]) {
      const src = readSrc(file);
      expect(src).toContain("font-extrabold tracking-tight leading-none");
    }
  });

  it("renders the Calories value and footer inside the new horizontal layout without losing content", () => {
    const tile: DashboardTile = { id: "calories", kind: "stat", size: "1x1" };
    const { getByTestId } = render(<StatTile tile={tile} statData={statData} />);
    expect(getByTestId("tile-calories-value").props.children).toBe("1200/2000");
  });
});

describe("NP-352 (3): the weight chart draws both axes' gridlines, 4 horizontal ticks, up to 5 date ticks", () => {
  it("evenlySpacedIndices returns at most `max` indices spanning the full range, inclusive of both ends", () => {
    expect(evenlySpacedIndices(0, 5)).toEqual([]);
    expect(evenlySpacedIndices(3, 5)).toEqual([0, 1, 2]);
    expect(evenlySpacedIndices(10, 5)).toEqual([0, 2, 5, 7, 9]);
    const idx = evenlySpacedIndices(20, 5);
    expect(idx.length).toBeLessThanOrEqual(5);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(19);
  });

  it("draws 4 horizontal gridlines (not the old hardcoded 3) and vertical gridlines at the date ticks", () => {
    const weightData = [
      { date: "Sep 25", value: 178.0 },
      { date: "Sep 28", value: 176.5 },
      { date: "Oct 1", value: 175.2 },
    ];
    const { getAllByTestId } = render(
      <ProgressChart weightData={weightData} bmiData={[]} moodData={[]} />,
    );
    expect(getAllByTestId("progress-chart-hgrid")).toHaveLength(4);
    // 3 points ≤ 5, so every point gets a vertical gridline.
    expect(getAllByTestId("progress-chart-vgrid")).toHaveLength(3);
  });
});

describe("NP-352 (4): Current Program's Progress link is subtle grey, matching the web, not bright blue", () => {
  it("renders `text-muted-foreground`, never a blue className, on the Progress link", () => {
    const program = {
      programId: "p1",
      name: "Hypertrophy Foundations",
      currentPhase: 2,
      currentWeek: 3,
      totalWeeks: 8,
    };
    const { getByTestId } = render(<CurrentProgramCard program={program} />);
    const link = getByTestId("current-program-progress-link");
    const text = link.findByType(Text);
    expect(String(text.props.className)).toContain("text-muted-foreground");
    expect(String(text.props.className)).not.toContain("text-blue");
  });
});
