import React from "react";
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import { ForcedThemeMode } from "@/lib/theme/useThemeTokens";
import { lightTokens, darkTokens } from "@/lib/theme/tokens";
import type { GoalProgressResponse } from "@become/api-client";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const rgb = (triplet: string) => `rgb(${triplet})`;

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

describe("BecomingDoor Nutrition mini-tile pace parity", () => {
  const createGoals = (overrides?: Partial<GoalProgressResponse["nutrition"]>): GoalProgressResponse =>
    ({
      todayKey: "2026-10-16",
      nutrition: {
        unit: "lbs",
        status: "active",
        kind: "weight",
        direction: "lose",
        startedAt: "2026-10-01",
        achievedAt: null,
        baseline: { date: "2026-10-01", weight: 208 },
        journeyStart: { date: "2026-10-01", weight: 208 },
        now: { date: "2026-10-16", weight: 207 },
        target: { weight: 180, paceKgPerWeek: 0.5, pacePerWeek: 1.1, bandKg: 1 },
        pace: { status: "behind", eta: "~25 wks", behindByKg: 0.5 },
        adherence: null,
        proteinGoal: 150,
        suggestion: {
          title: "Weigh-in pace",
          sub: "1.1 lbs behind schedule",
          severity: "nudge",
        },
        ...overrides,
      },
      training: {
        target: { daysPerWeek: 1 },
        thisWeek: { done: 1, remaining: 0, weekLost: false },
        suggestion: null,
      },
    } as unknown as GoalProgressResponse);

  it("renders '1.1 lbs behind' in orange (amber-400) in dark mode, not '0 lbs behind' in white", () => {
    const goals = createGoals();
    const { getByTestId, queryByText, getByText } = render(
      <ForcedThemeMode mode="dark">
        <BecomingDoor goals={goals} mind={null} />
      </ForcedThemeMode>,
    );

    // Must NOT show 0 lbs behind
    expect(queryByText("0 lbs behind")).toBeNull();

    // Must show 1.1 lbs behind
    const nutritionVal = getByTestId("becoming-door-nutrition-value");
    expect(nutritionVal.props.children).toBe("1.1 lbs behind");
    expect(getByText("1.1 lbs behind")).toBeTruthy();

    // Color must be orange/amber (darkTokens.accent = 251 191 36), not white (darkTokens.foreground = 255 255 255)
    const style = flat(nutritionVal.props.style);
    expect(style.color).toBe(rgb(darkTokens.accent));
    expect(style.color).not.toBe(rgb(darkTokens.foreground));
  });

  it("renders '1.1 lbs behind' in orange (amber-600) in light mode, not '0 lbs behind' in dark text", () => {
    const goals = createGoals();
    const { getByTestId, queryByText, getByText } = render(
      <ForcedThemeMode mode="light">
        <BecomingDoor goals={goals} mind={null} />
      </ForcedThemeMode>,
    );

    // Must NOT show 0 lbs behind
    expect(queryByText("0 lbs behind")).toBeNull();

    // Must show 1.1 lbs behind
    const nutritionVal = getByTestId("becoming-door-nutrition-value");
    expect(nutritionVal.props.children).toBe("1.1 lbs behind");
    expect(getByText("1.1 lbs behind")).toBeTruthy();

    // Color must be orange/amber (lightTokens.accent = 217 119 6), not dark (lightTokens.foreground = 24 24 27)
    const style = flat(nutritionVal.props.style);
    expect(style.color).toBe(rgb(lightTokens.accent));
    expect(style.color).not.toBe(rgb(lightTokens.foreground));
  });

  it("formats behindByKg correctly with kg unit ('0.5 kg behind')", () => {
    const goals = createGoals({
      unit: "kg",
      pace: { status: "behind", eta: "~25 wks", behindByKg: 0.5 },
      target: { weight: 80, paceKgPerWeek: 0.5, pacePerWeek: 0.5, bandKg: 1 },
    });
    const { getByTestId } = render(
      <ForcedThemeMode mode="light">
        <BecomingDoor goals={goals} mind={null} />
      </ForcedThemeMode>,
    );

    const nutritionVal = getByTestId("becoming-door-nutrition-value");
    expect(nutritionVal.props.children).toBe("0.5 kg behind");
  });

  it("renders 'On pace' in default foreground color when on pace", () => {
    const goals = createGoals({
      pace: { status: "on", eta: "~12 wks", behindByKg: 0 },
    });
    const { getByTestId } = render(
      <ForcedThemeMode mode="dark">
        <BecomingDoor goals={goals} mind={null} />
      </ForcedThemeMode>,
    );

    const nutritionVal = getByTestId("becoming-door-nutrition-value");
    expect(nutritionVal.props.children).toBe("On pace");

    // Color is foreground, not accent
    const style = flat(nutritionVal.props.style);
    expect(style.color).toBe(rgb(darkTokens.foreground));
    expect(style.color).not.toBe(rgb(darkTokens.accent));
  });

  it("renders 'Reached ✓' when goal is reached", () => {
    const goals = createGoals({
      status: "achieved",
      pace: { status: "done", eta: "", behindByKg: 0 },
    });
    const { getByTestId } = render(
      <BecomingDoor goals={goals} mind={null} />,
    );

    const nutritionVal = getByTestId("becoming-door-nutrition-value");
    expect(nutritionVal.props.children).toBe("Reached ✓");
  });

  it("renders 'At goal' when inside band but not yet confirmed", () => {
    const goals = createGoals({
      status: "active",
      pace: { status: "done", eta: "", behindByKg: 0 },
    });
    const { getByTestId, getByText } = render(
      <BecomingDoor goals={goals} mind={null} />,
    );

    const nutritionVal = getByTestId("becoming-door-nutrition-value");
    expect(nutritionVal.props.children).toBe("At goal");
    expect(getByText("hold a week")).toBeTruthy();
  });
});
