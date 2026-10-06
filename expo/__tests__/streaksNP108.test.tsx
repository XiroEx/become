import React from "react";
import { render, fireEvent, within } from "@testing-library/react-native";
import { StreaksScreen } from "@/components/streaks/StreaksScreen";
import { StreakTile } from "@/components/dashboard/StreakTile";
import StreaksRoute from "@/app/(app)/(tabs)/dashboard/streaks";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";
import type { StreaksPayload } from "@become/api-client";
import { apiFetch, ApiError } from "@become/api-client";
import { lightTokens } from "@/lib/theme/tokens";

const rgb = (triplet: string) => `rgb(${triplet})`;

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({}),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "fake-token", user: { id: "u1" } }),
}));

const SAMPLE_PAYLOAD: StreaksPayload = {
  todayKey: "2026-09-30",
  minVisible: 3,
  overall: {
    current: 12,
    best: 25,
    freezes: 1,
    milestonesReached: [3, 7],
    nextMilestone: 14,
    activeToday: true,
    lastActivityDate: "2026-09-30",
  },
  pillars: {
    workout: {
      unit: "days",
      current: 4,
      best: 10,
      thisWeek: 2,
      target: 3,
      metThisWeek: false,
      weekLost: false,
      weeksOnTarget: 3,
      remainingThisWeek: 1,
    },
    nutrition: {
      unit: "days",
      current: 8,
      best: 14,
      activeToday: true,
    },
    mindset: {
      unit: "days",
      current: 5,
      best: 12,
      activeToday: true,
    },
    super: {
      unit: "days",
      current: 4,
      best: 9,
      activeToday: false,
      today: {
        nutrition: true,
        mindset: true,
        trained: false,
        restDay: false,
        weekOnTrack: true,
      },
      freeze: {
        available: true,
        returnsOn: null,
        usedDays: ["2026-09-01"],
        frozenToday: false,
      },
    },
  },
  credits: {
    workout: ["2026-09-28"],
    nutrition: [],
    mindset: ["2026-09-29"],
  },
};

const BUILDING_PAYLOAD: StreaksPayload = {
  todayKey: "2026-09-30",
  minVisible: 3,
  overall: {
    current: 1,
    best: 1,
    freezes: 0,
    milestonesReached: [],
    nextMilestone: 3,
    activeToday: true,
    lastActivityDate: "2026-09-30",
  },
  pillars: {
    workout: {
      unit: "days",
      current: 2,
      best: 2,
      thisWeek: 1,
      target: null, // No target -> settings link
      metThisWeek: false,
      weekLost: false,
      weeksOnTarget: 0,
      remainingThisWeek: 0,
    },
    nutrition: {
      unit: "days",
      current: 1,
      best: 1,
      activeToday: false,
    },
    mindset: {
      unit: "days",
      current: 2,
      best: 2,
      activeToday: false,
    },
    super: {
      unit: "days",
      current: 1,
      best: 1,
      activeToday: false,
      today: {
        nutrition: false,
        mindset: false,
        trained: false,
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

describe("NP-108: Streaks Tile and Streaks Screen Parity", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockReplace.mockReset();
    mockCanGoBack.mockReturnValue(true);
    mockApiFetch.mockReset();
  });

  describe("(id: e015c91d) Streaks screen web parity and Building states", () => {
    it("renders all five pillar cards with populated streak numbers when >= 3", () => {
      const { getByTestId, getByText } = render(
        <StreaksScreen data={SAMPLE_PAYLOAD} />,
      );

      // Verify all 5 cards exist
      expect(getByTestId("streak-overall")).toBeTruthy();
      expect(getByTestId("streak-workout")).toBeTruthy();
      expect(getByTestId("streak-nutrition")).toBeTruthy();
      expect(getByTestId("streak-mindset")).toBeTruthy();
      expect(getByTestId("streak-super")).toBeTruthy();

      // Overall: 12 days, Best: 25 days
      expect(getByText("12")).toBeTruthy();
      expect(getByText("25 days")).toBeTruthy();

      // Workout: 4 days, Best: 10 days
      expect(within(getByTestId("streak-workout")).getByText("4")).toBeTruthy();
      expect(getByText("10 days")).toBeTruthy();
      expect(getByTestId("workout-target-info")).toBeTruthy();

      // Nutrition: 8 days, Best: 14 days
      expect(getByText("8")).toBeTruthy();
      expect(getByText("14 days")).toBeTruthy();

      // Mindset: 5 days, Best: 12 days
      expect(getByText("5")).toBeTruthy();
      expect(getByText("12 days")).toBeTruthy();

      // Super: 4 days, Best: 9 days
      expect(within(getByTestId("streak-super")).getByText("4")).toBeTruthy();
      expect(getByText("9 days")).toBeTruthy();
      // Super streak today dots
      expect(getByText("Food")).toBeTruthy();
      expect(getByText("Mindset")).toBeTruthy();
      expect(getByText("Trained")).toBeTruthy();
      expect(getByText("Week on track")).toBeTruthy();
    });

    it("renders Building state and 'x/3 days · y more to start' when streaks < 3", () => {
      const onOpenSettings = jest.fn();
      const { getByTestId, getAllByText } = render(
        <StreaksScreen data={BUILDING_PAYLOAD} onOpenSettings={onOpenSettings} />,
      );

      // When < 3, 'Building' is shown
      const buildingLabels = getAllByText("Building");
      expect(buildingLabels.length).toBeGreaterThanOrEqual(4);

      // Overall building helper text: 1/3 days · 2 more to start
      expect(getAllByText(/1\/3 days · 2 more to start/).length).toBeGreaterThanOrEqual(1);

      // Workout has target: null -> Settings link rendered
      const settingsLink = getByTestId("workout-settings-link");
      expect(settingsLink).toBeTruthy();
      fireEvent.press(settingsLink);
      expect(onOpenSettings).toHaveBeenCalled();
    });

    it("StreakTile pages through streaks with super streak leading when >= 3", () => {
      const onOpenStreaks = jest.fn();
      const { getByTestId, getByText } = render(
        <StreakTile streaks={SAMPLE_PAYLOAD} onOpenStreaks={onOpenStreaks} />,
      );

      expect(getByTestId("streak-tile")).toBeTruthy();
      // Super leads: value 4, Super Streak label
      expect(getByTestId("streak-super-value")).toBeTruthy();
      expect(getByText("Super Streak")).toBeTruthy();

      // Dots are rendered for paging
      const dots = getByTestId("streak-tile-dots");
      expect(dots).toBeTruthy();

      // Tapping tile opens streaks
      fireEvent.press(getByTestId("streak-tile"));
      expect(onOpenStreaks).toHaveBeenCalled();
    });

    it("StreakTile falls back to overall streak leading when super streak < 3", () => {
      const { getByTestId, getByText } = render(
        <StreakTile streaks={BUILDING_PAYLOAD} />,
      );

      expect(getByTestId("streak-tile")).toBeTruthy();
      // Overall leads when super < 3
      expect(getByText("Day Streak")).toBeTruthy();
      // Building is shown for overall streak = 1
      expect(getByTestId("tile-streak-value").props.children).toBe("Building");
    });
  });

  describe("(id: e015c91e) Super streak freeze and refusal handling", () => {
    it("renders 'Today is frozen — the streak holds' when today is already frozen", () => {
      const frozenPayload: StreaksPayload = {
        ...SAMPLE_PAYLOAD,
        pillars: {
          ...SAMPLE_PAYLOAD.pillars,
          super: {
            ...SAMPLE_PAYLOAD.pillars.super,
            freeze: {
              available: false,
              returnsOn: "2026-10-30",
              usedDays: ["2026-09-30"],
              frozenToday: true,
            },
          },
        },
      };

      const { getByTestId, getByText, queryByTestId } = render(
        <StreaksScreen data={frozenPayload} />,
      );

      expect(getByTestId("super-freeze")).toBeTruthy();
      expect(getByText("Today is frozen — the streak holds")).toBeTruthy();
      expect(getByText("It comes back in a month.")).toBeTruthy();
      // Use button must not be visible
      expect(queryByTestId("use-freeze")).toBeNull();
    });

    it("renders 'Freeze spent' and 'Back on <UTC Date>' when freeze is recharging", () => {
      const spentPayload: StreaksPayload = {
        ...SAMPLE_PAYLOAD,
        pillars: {
          ...SAMPLE_PAYLOAD.pillars,
          super: {
            ...SAMPLE_PAYLOAD.pillars.super,
            freeze: {
              available: false,
              returnsOn: "2026-10-31",
              usedDays: ["2026-10-01"],
              frozenToday: false,
            },
          },
        },
      };

      const { getByTestId, getByText, queryByTestId } = render(
        <StreaksScreen data={spentPayload} />,
      );

      expect(getByTestId("super-freeze")).toBeTruthy();
      expect(getByText("Freeze spent")).toBeTruthy();
      // UTC formatted date
      expect(getByText("Back on Oct 31.")).toBeTruthy();
      expect(queryByTestId("use-freeze")).toBeNull();
    });

    it("renders 'One freeze, in hand' and 'Use it' button when available and streak is at risk", () => {
      const onUseFreeze = jest.fn();
      const { getByTestId, getByText } = render(
        <StreaksScreen data={SAMPLE_PAYLOAD} onUseFreeze={onUseFreeze} />,
      );

      expect(getByTestId("super-freeze")).toBeTruthy();
      expect(getByText("One freeze, in hand")).toBeTruthy();

      const useBtn = getByTestId("use-freeze");
      expect(useBtn).toBeTruthy();
      fireEvent.press(useBtn);
      expect(onUseFreeze).toHaveBeenCalledTimes(1);
    });

    it("surfaces server refusal message when freeze call is rejected with 409", async () => {
      // Mock initial GET /api/streaks
      mockApiFetch.mockImplementation(async (url: string, _schema: any, opts: any) => {
        if (url.startsWith("/api/streaks/freeze")) {
          const body = {
            error: "Streak is not at risk: all three pillars are complete today",
            reason: "not_at_risk",
            streaks: SAMPLE_PAYLOAD,
          };
          const err = new ApiError(
            409,
            body,
            body.error,
          );
          throw err;
        }
        if (url.startsWith("/api/streaks")) {
          return SAMPLE_PAYLOAD;
        }
        return {};
      });

      const { getByTestId, findByTestId, findByText } = render(<StreaksRoute />);

      // Wait for streaks to load
      await findByTestId("super-freeze");

      const useBtn = getByTestId("use-freeze");
      fireEvent.press(useBtn);

      // Verify the refusal message from server is surfaced
      const errorElem = await findByTestId("freeze-error");
      expect(errorElem).toBeTruthy();
      expect(
        await findByText("Streak is not at risk: all three pillars are complete today"),
      ).toBeTruthy();
    });
  });

  describe("(id: e015c91f) Routing and deep link navigation for /dashboard/streaks", () => {
    it("resolves /dashboard/streaks to /(tabs)/dashboard/streaks with exact match", () => {
      const result = resolveWebPath("/dashboard/streaks");
      expect(result).toMatchObject({
        kind: "native",
        pathname: "/(tabs)/dashboard/streaks",
        fallback: "exact",
      });
    });

    it("resolves full web URLs with /dashboard/streaks path", () => {
      const result = resolveWebPath("https://become.redbtn.io/dashboard/streaks");
      expect(result).toMatchObject({
        kind: "native",
        pathname: "/(tabs)/dashboard/streaks",
        fallback: "exact",
      });
    });

    it("resolves app scheme become://dashboard/streaks", () => {
      const result = resolveWebPath("become://dashboard/streaks");
      expect(result).toMatchObject({
        kind: "native",
        pathname: "/(tabs)/dashboard/streaks",
        fallback: "exact",
      });
    });

    it("back button on StreaksScreen navigates back", () => {
      const onBack = jest.fn();
      const { getByTestId } = render(
        <StreaksScreen data={SAMPLE_PAYLOAD} onBack={onBack} />,
      );

      const backBtn = getByTestId("streaks-back-button");
      fireEvent.press(backBtn);
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("(id: NP-258) freeze and Mindset icon colours match the web", () => {
    it("colours the day-streak freeze snowflake blue, not orange", () => {
      const { getByTestId } = render(<StreaksScreen data={SAMPLE_PAYLOAD} />);

      const snowflake = within(getByTestId("streak-overall")).UNSAFE_getByType(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("lucide-react-native").Snowflake,
      );
      // `info` (blue-600/blue-400) — the web's `text-blue-500` freeze badge.
      // `accent` (amber) is the native bug this card fixes.
      expect(snowflake.props.color).not.toBe(rgb(lightTokens.accent));
      expect(snowflake.props.color).toBe(rgb(lightTokens.info));
    });

    it("colours the Mindset pillar icon and badge purple, not orange", () => {
      const { getByTestId } = render(<StreaksScreen data={SAMPLE_PAYLOAD} />);

      const brain = within(getByTestId("streak-mindset")).UNSAFE_getByType(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("lucide-react-native").Brain,
      );
      expect(brain.props.color).not.toBe(rgb(lightTokens.accent));
      expect(brain.props.color).toBe(rgb(lightTokens.mindset));
    });

    it("colours the super-streak freeze snowflake blue when a freeze is in hand", () => {
      const { getByTestId } = render(<StreaksScreen data={SAMPLE_PAYLOAD} />);

      // Two snowflakes live in this box when the "Use it" button is showing
      // (the status icon, then the button's own icon) — the status icon is
      // the first one rendered.
      const snowflakes = within(getByTestId("super-freeze")).UNSAFE_getAllByType(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("lucide-react-native").Snowflake,
      );
      expect(snowflakes[0]!.props.color).not.toBe(rgb(lightTokens.accent));
      expect(snowflakes[0]!.props.color).toBe(rgb(lightTokens.info));
    });
  });
});
