// Card NP-354: Spacing/type: Streaks - nutrition streak badge red tint,
// super streak fire number, indicator row wrap
//
// Full visual pass (native vs web), Android S23 Ultra (One UI 7, font scale
// 0.9, logical 412x915, DPR 3.5), build 24f4e34d.
//
// 1. Nutrition Streak Badge Color: Web badge is red/coral tint `bg-red-900/30 text-red-400`.
//    Native rendered a neutral dark grey badge `bg-zinc-800 text-zinc-400` due to `primary` token.
//    Fixed to use `brand` token (`tint("brand", 0.15)`, `colors.brand`, `className="bg-red-100 dark:bg-red-900/30"`).
// 2. Super Streak Fire Number: Web renders the Super Streak number using `FireNumber` animated
//    flame gradient (`text-orange-500 dark:text-orange-400`). Native rendered static solid orange.
//    Fixed with flame gradient tongues, ember bed, and text shadow glow.
// 3. Status Indicators Row Wrap: Web displays all 4 status indicators on a single horizontal row.
//    Native wrapped the 4th indicator (`✓ Week on track`) to a second row due to tighter container
//    padding and wider font tracking. Fixed by reducing gap, adjusting card padding, setting tight
//    letter tracking, and enforcing `flexWrap: "nowrap"`.

/* eslint-disable import/first */
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { render, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { FireNumber } from "@/components/streaks/FireNumber";
import { StreaksScreen } from "@/components/streaks/StreaksScreen";
import { lightTokens } from "@/lib/theme/tokens";
import type { StreaksPayload } from "@become/api-client";

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const rgb = (triplet: string) => `rgb(${triplet})`;

const MOCK_DATA: StreaksPayload = {
  todayKey: "2026-10-08",
  minVisible: 3,
  overall: {
    current: 5,
    best: 10,
    freezes: 1,
    milestonesReached: [3],
    nextMilestone: 7,
    activeToday: true,
    lastActivityDate: "2026-10-08",
  },
  pillars: {
    workout: {
      unit: "days",
      current: 4,
      best: 8,
      thisWeek: 2,
      target: 3,
      metThisWeek: false,
      weekLost: false,
      weeksOnTarget: 2,
      remainingThisWeek: 1,
    },
    nutrition: {
      unit: "days",
      current: 6,
      best: 12,
      activeToday: true,
    },
    mindset: {
      unit: "days",
      current: 3,
      best: 7,
      activeToday: true,
    },
    super: {
      unit: "days",
      current: 4,
      best: 9,
      activeToday: true,
      today: {
        nutrition: true,
        mindset: true,
        trained: true,
        restDay: false,
        weekOnTrack: true,
      },
      freeze: {
        available: true,
        returnsOn: null,
        usedDays: [],
        frozenToday: false,
      },
    },
  },
  credits: {
    workout: [],
    nutrition: [],
    mindset: [],
  },
};

describe("NP-354: Streaks native parity pass", () => {
  describe("(id: np354-01) Nutrition streak badge red tint", () => {
    it("colours the Nutrition pillar icon with brand token (red-600 in light, red-500 in dark)", () => {
      const { getByTestId } = render(<StreaksScreen data={MOCK_DATA} />);
      const card = getByTestId("streak-nutrition");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const utensils = within(card).UNSAFE_getByType(require("lucide-react-native").UtensilsCrossed);
      expect(utensils.props.color).toBe(rgb(lightTokens.brand));
      expect(utensils.props.color).not.toBe(rgb(lightTokens.primary));
    });

    it("Nutrition pillar source code uses brand tint and coral/red classes", () => {
      const src = readExpo("components/streaks/StreaksScreen.tsx");
      const nutritionSection = src.slice(
        src.indexOf('testID="streak-nutrition"'),
        src.indexOf('testID="streak-mindset"'),
      );
      expect(nutritionSection).toContain("bg-red-100 dark:bg-red-900/30");
      expect(nutritionSection).toContain('tint("brand", 0.15)');
      expect(nutritionSection).toContain("colors.brand");
    });
  });

  describe("(id: np354-02) Super streak FireNumber flame gradient", () => {
    it("renders FireNumber with flame container, flame text shadow, and orange ink", () => {
      const { getByTestId } = render(<FireNumber>5</FireNumber>);
      const container = getByTestId("fire-number-container");
      const textNode = getByTestId("fire-number");

      expect(container).toBeTruthy();
      expect(flat(textNode.props.style)).toEqual(
        expect.objectContaining({
          color: rgb(lightTokens.orange),
          textShadowRadius: 8,
        }),
      );
    });

    it("FireNumber source defines flame tongues and embers gradient stops", () => {
      const src = readExpo("components/streaks/FireNumber.tsx");
      expect(src).toContain("LinearGradient");
      expect(src).toContain("FLAMES");
      expect(src).toContain("EMBER_GLOW");
      expect(src).toContain("FLAME_BRAND");
      expect(src).toContain("Animated");
    });
  });

  describe("(id: np354-03) Status indicators row single-line fit", () => {
    it("renders all 4 indicators inside a non-wrapping container with compact gap", () => {
      const { getByTestId } = render(<StreaksScreen data={MOCK_DATA} />);
      const indicatorsRow = getByTestId("super-streak-indicators");
      const style = flat(indicatorsRow.props.style);

      expect(style.flexDirection).toBe("row");
      expect(style.flexWrap).toBe("nowrap");
      expect(style.gap).toBeLessThanOrEqual(8);

      const superCard = getByTestId("streak-super");
      const cardStyle = flat(superCard.props.style);
      expect(cardStyle.paddingHorizontal).toBeLessThanOrEqual(14);
    });

    it("renders all four labels", () => {
      const { getByTestId } = render(<StreaksScreen data={MOCK_DATA} />);
      const indicatorsRow = getByTestId("super-streak-indicators");
      expect(within(indicatorsRow).getByText("Food")).toBeTruthy();
      expect(within(indicatorsRow).getByText("Mindset")).toBeTruthy();
      expect(within(indicatorsRow).getByText("Trained")).toBeTruthy();
      expect(within(indicatorsRow).getByText("Week on track")).toBeTruthy();
    });
  });
});
