import { render } from "@testing-library/react-native";
import { StatTile } from "@/components/dashboard/StatTile";
import type { DashboardTile } from "@become/api-client";
import type { DashboardStatData } from "@/lib/dashboard/types";

// NP-380 — VISUAL QA: HOME - GOAL TILE VALUE TRUNCATED ("5.8 lbs to ...")
// INSTEAD OF "5.8 lbs to go".
//
// Lane run 20261012T171659Z, Android S23 Ultra, build 04f6244d: the Goal
// tile's value `<Text numberOfLines={1}>` ellipsized "5.8 lbs to go" down to
// "5.8 lbs to ..." in both themes, because the default `ellipsizeMode`
// ("tail") cuts the string once it overflows the one line it is given. The
// web never truncates this value — `webapp/components/ui/FitText.tsx`
// shrinks the font to fit one line instead. `adjustsFontSizeToFit` +
// `minimumFontScale` is React Native's equivalent: the full string stays on
// one line, shrunk as needed, never cut with an ellipsis.
//
// What this suite proves: the Goal tile's value text (both the 1x1 "square"
// layout used by default, and the 2x1 "wide" layout available via
// customization) carries `adjustsFontSizeToFit` and a `minimumFontScale`, so
// RNTL's rendered props show the shrink-to-fit behaviour is wired up and the
// full phrase is still the text content (never a pre-truncated string).

const GOAL_STAT_DATA: DashboardStatData = {
  streakDays: 5,
  thisWeekWorkouts: 2,
  fitnessGoal: "gain_muscle",
  nutritionDirection: "gain",
  targetWeightKg: 82.1,
  startWeightKg: 79.5,
  latestWeight: 175.2,
  earliestWeight: 175.2,
  weightUnit: "lbs",
  pace: { status: "on", eta: "~12 wks", behindByKg: 0 },
};

describe("NP-380: Goal tile value shrinks to fit instead of ellipsizing", () => {
  it("1x1 (default) layout: value is the full '5.8 lbs to go', with adjustsFontSizeToFit wired up", () => {
    const tile: DashboardTile = { id: "goal", kind: "stat", size: "1x1" };
    const { getByTestId } = render(
      <StatTile tile={tile} statData={GOAL_STAT_DATA} />,
    );

    const value = getByTestId("tile-goal-value");
    // The full phrase, never a pre-truncated "5.8 lbs to ..." string — an
    // ellipsis here would mean something upstream of rendering cut it.
    expect(value.props.children).toBe("5.8 lbs to go");
    // numberOfLines stays 1 (one line, like the web), but adjustsFontSizeToFit
    // means overflow shrinks the font instead of invoking ellipsizeMode.
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(value.props.minimumFontScale).toBeGreaterThan(0);
    expect(value.props.minimumFontScale).toBeLessThan(1);
  });

  it("2x1 (wide) layout: value is also the full phrase, with the same shrink-to-fit wiring", () => {
    const tile: DashboardTile = { id: "goal", kind: "stat", size: "2x1" };
    const { getByTestId } = render(
      <StatTile tile={tile} statData={GOAL_STAT_DATA} />,
    );

    const value = getByTestId("tile-goal-value");
    expect(value.props.children).toBe("5.8 lbs to go");
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(value.props.minimumFontScale).toBeGreaterThan(0);
    expect(value.props.minimumFontScale).toBeLessThan(1);
  });
});
