import React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import type { GoalPaceRead, GoalProgressResponse } from "@become/api-client";
import { getTokens } from "@/lib/theme/tokens";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

function createPace(overrides: Partial<GoalPaceRead> = {}): GoalPaceRead {
  return {
    status: "behind",
    expectedKg: 80,
    aheadByKg: 0,
    behindByKg: 0.5,
    etaWeeks: 2,
    remainingKg: 5,
    eta: "~2 wks",
    etaDate: "2026-10-30",
    ...overrides,
  };
}

function createGoals(nutritionOverrides: Partial<GoalProgressResponse["nutrition"]> = {}): GoalProgressResponse {
  return {
    todayKey: "2026-10-16",
    nutrition: {
      status: "active",
      kind: "weight",
      direction: "lose",
      unit: "lbs",
      startedAt: "2026-09-01",
      achievedAt: null,
      baseline: { weight: 190, date: "2026-09-01" },
      journeyStart: { weight: 190, date: "2026-09-01" },
      now: { weight: 185, date: "2026-10-16", fourWeeksAgo: 187 },
      target: { weight: 180, pacePerWeek: 0.5 },
      pace: createPace(),
      adherence: null,
      proteinGoal: null,
      suggestion: null,
      ...nutritionOverrides,
    },
    training: {
      status: "active",
      startedAt: "2026-09-01",
      target: { daysPerWeek: 4, programId: null },
      thisWeek: { done: 2, remaining: 2, weekLost: false, targetDays: 4, daysMet: 2 },
      avgLast4: 4,
      weeklyCounts: [4, 4, 4, 2],
      baseline: { daysPerWeek: 3, programId: null },
      lifts: [],
      suggestedLifts: [],
      hasLiftTargets: false,
      liftRationales: {},
      week: { totalWorkouts: 2, totalVolumeKg: 1000, daysActive: 2 },
      unit: "lbs",
      suggestion: null,
    },
  } as unknown as GoalProgressResponse;
}

const lightAccent = `rgb(${getTokens("light").accent})`;
const darkAccent = `rgb(${getTokens("dark").accent})`;
const lightFg = `rgb(${getTokens("light").foreground})`;
const darkFg = `rgb(${getTokens("dark").foreground})`;

describe("BecomingDoor Nutrition mini-tile pace rendering", () => {
  it("renders converted pace units ('1.1 lbs behind') and accent tone when behind pace in lbs", () => {
    const goals = createGoals({
      unit: "lbs",
      pace: createPace({
        status: "behind",
        behindByKg: 0.5,
        eta: "~2 wks",
      }),
    });

    const { getByText, queryByText } = render(<BecomingDoor goals={goals} />);

    // Should not render unrounded / unconverted 0 lbs behind
    expect(queryByText("0 lbs behind")).toBeNull();

    const valueEl = getByText("1.1 lbs behind");
    expect(valueEl).toBeTruthy();

    const styleObj = StyleSheet.flatten(valueEl.props.style);
    expect([lightAccent, darkAccent]).toContain(styleObj.color);
  });

  it("renders converted pace units ('0.5 kg behind') when unit is kg", () => {
    const goals = createGoals({
      unit: "kg",
      pace: createPace({
        status: "behind",
        behindByKg: 0.5,
        eta: "~2 wks",
      }),
    });

    const { getByText } = render(<BecomingDoor goals={goals} />);

    const valueEl = getByText("0.5 kg behind");
    expect(valueEl).toBeTruthy();

    const styleObj = StyleSheet.flatten(valueEl.props.style);
    expect([lightAccent, darkAccent]).toContain(styleObj.color);
  });

  it("renders 'On pace' with foreground color when status is on", () => {
    const goals = createGoals({
      pace: createPace({
        status: "on",
        behindByKg: 0,
        eta: "~4 wks",
      }),
    });

    const { getByText } = render(<BecomingDoor goals={goals} />);

    const valueEl = getByText("On pace");
    expect(valueEl).toBeTruthy();

    const styleObj = StyleSheet.flatten(valueEl.props.style);
    expect([lightFg, darkFg]).toContain(styleObj.color);
  });

  it("renders 'Ahead' with foreground color when status is ahead", () => {
    const goals = createGoals({
      pace: createPace({
        status: "ahead",
        aheadByKg: 0.8,
        behindByKg: 0,
        eta: "~1 wk",
      }),
    });

    const { getByText } = render(<BecomingDoor goals={goals} />);

    const valueEl = getByText("Ahead");
    expect(valueEl).toBeTruthy();

    const styleObj = StyleSheet.flatten(valueEl.props.style);
    expect([lightFg, darkFg]).toContain(styleObj.color);
  });

  it("renders 'At goal' when pace status is done", () => {
    const goals = createGoals({
      status: "active",
      pace: createPace({
        status: "done",
        behindByKg: 0,
        eta: "done",
      }),
    });

    const { getByText } = render(<BecomingDoor goals={goals} />);

    expect(getByText("At goal")).toBeTruthy();
    expect(getByText("hold a week")).toBeTruthy();
  });

  it("renders 'Reached ✓' when nutrition status is achieved", () => {
    const goals = createGoals({
      status: "achieved",
      pace: createPace({
        status: "done",
        behindByKg: 0,
        eta: "done",
      }),
    });

    const { getByText } = render(<BecomingDoor goals={goals} />);

    expect(getByText("Reached ✓")).toBeTruthy();
  });
});
