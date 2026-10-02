/* eslint-disable import/first */
import React from "react";
import { fireEvent, render, waitFor, within } from "@testing-library/react-native";

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

const mockToken = "test-jwt-token";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-123" },
    token: mockToken,
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return "test-jwt-token";
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

let mockEntitlementsState = {
  data: {
    enforced: false,
    features: {},
  } as any,
  feature: (_f: string) => null as any,
};

jest.mock("@/lib/entitlements", () => ({
  useEntitlements: () => mockEntitlementsState,
}));

import { apiFetch } from "@become/api-client";
import {
  SYSTEM_INFO,
  suggestActions,
  dayOfYear,
  type SuggestedAction,
} from "@become/core";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";
import MindRoute from "../app/(app)/(tabs)/mind/index";
import TrainingGrounds from "../components/mind/TrainingGrounds";
import SuggestedActions from "../components/mind/SuggestedActions";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;

describe("Training Grounds and Suggested Actions (NP-153)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    hideUpgradeSheet();
    mockEntitlementsState = {
      data: {
        enforced: false,
        features: {},
      },
      feature: () => null,
    };
  });

  describe("Unit: TrainingGrounds component", () => {
    it("renders unlocked tiles and locked tiles matching SYSTEM_INFO partition", () => {
      const unlocked = ["state-shift", "self-image", "mission"];
      const { getByTestId, getByText } = render(
        <TrainingGrounds
          unlocked={unlocked}
          nextInLabel="in 12h 30m"
          mainSessionCount={5}
        />,
      );

      // Header content
      expect(getByText("Training Grounds")).toBeTruthy();
      expect(getByTestId("mind-cooldown-label")).toHaveTextContent(
        "Next in 12h 30m",
      );

      // Unlocked tiles
      for (const id of unlocked) {
        const info = SYSTEM_INFO[id]!;
        expect(getByTestId(`mind-system-tile-${id}`)).toBeTruthy();
        expect(getByText(info.label)).toBeTruthy();
        expect(getByText(info.hook)).toBeTruthy();
      }

      // Locked tiles
      const lockedIds = Object.keys(SYSTEM_INFO).filter(
        (id) => !unlocked.includes(id),
      );
      expect(lockedIds).toEqual([
        "vision",
        "discipline",
        "anti-sabotage",
        "social",
      ]);

      for (const id of lockedIds) {
        const info = SYSTEM_INFO[id]!;
        expect(getByTestId(`mind-system-tile-${id}`)).toBeTruthy();
        expect(getByText(info.label)).toBeTruthy();
      }

      // Tapping an unlocked tile navigates to that system
      fireEvent.press(getByTestId("mind-system-tile-state-shift"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/mind/state-shift");
    });

    it("displays 'Plus' and opens upgrade sheet for vision when plan-locked", () => {
      mockEntitlementsState = {
        data: {
          enforced: true,
          features: {
            vision: { allowed: false, feature: "vision" },
          },
        },
        feature: (f: string) =>
          f === "vision" ? { allowed: false, feature: "vision" } : null,
      };

      const unlocked = ["state-shift"];
      const { getByTestId } = render(
        <TrainingGrounds
          unlocked={unlocked}
          nextInLabel="in 5h"
          mainSessionCount={2}
        />,
      );

      // Vision tile lock reason should display "Plus"
      expect(getByTestId("mind-system-lock-reason-vision")).toHaveTextContent(
        "Plus",
      );

      // Tapping the vision tile opens the upgrade sheet with syntheticGate('vision')
      fireEvent.press(getByTestId("mind-system-tile-vision"));
      const gate = getUpgradeSheetGate();
      expect(gate).toBeTruthy();
      expect(gate?.feature).toBe("vision");
    });

    it("displays required chapter distance for locked chapter systems", () => {
      const unlocked = ["state-shift"];
      // Discipline is Chapter 3 (needs (3-1)*10 = 20 main sessions).
      // With mainSessionCount = 8, needed = 20 - 8 = 12.
      const { getByTestId } = render(
        <TrainingGrounds
          unlocked={unlocked}
          nextInLabel="in 4h"
          mainSessionCount={8}
        />,
      );

      expect(
        getByTestId("mind-system-lock-reason-discipline"),
      ).toHaveTextContent("Unlocks in Ch.3 — 12 main sessions away");
    });
  });

  describe("Unit: SuggestedActions component", () => {
    it("renders suggested action cards and navigates to the system upon pressing", () => {
      const actions: SuggestedAction[] = [
        {
          system: "state-shift",
          id: "name-next-action",
          idx: 0,
          title: "Name the Next Action",
          blurb: "What is the next action? Only that.",
          reason: "Clear mental noise and narrow focus to one thing.",
        },
        {
          system: "mission",
          id: "daily-move",
          idx: 1,
          title: "Daily Forward Move",
          blurb: "One deliberate action.",
          reason: "Build momentum on today's priority.",
        },
        {
          system: "self-image",
          id: "affirm-identity",
          idx: 2,
          title: "Affirm Identity",
          blurb: "Reinforce who you are becoming.",
          reason: "Anchor your future self.",
        },
      ];

      const { getByTestId, getByText } = render(
        <SuggestedActions actions={actions} loading={false} />,
      );

      expect(getByTestId("mind-suggested-actions")).toBeTruthy();
      expect(getByText(/Suggested next/i)).toBeTruthy();

      // Cards are rendered
      expect(
        getByTestId("mind-suggested-action-name-next-action"),
      ).toBeTruthy();
      expect(getByText("Name the Next Action")).toBeTruthy();

      // Tapping action 1 pushes to /(tabs)/mind/state-shift
      fireEvent.press(getByTestId("mind-suggested-action-name-next-action"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/mind/state-shift");

      // Tapping action 2 pushes to /(tabs)/mind/mission
      fireEvent.press(getByTestId("mind-suggested-action-daily-move"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/mind/mission");
    });

    it("displays tuning indicator when loading is true", () => {
      const actions: SuggestedAction[] = [
        {
          system: "state-shift",
          id: "name-next-action",
          idx: 0,
          title: "Name the Next Action",
          blurb: "What is the next action?",
          reason: "Clear mental noise",
        },
      ];

      const { getByTestId } = render(
        <SuggestedActions actions={actions} loading={true} />,
      );

      expect(getByTestId("mind-sugg-loading")).toHaveTextContent("· tuning…");
    });
  });

  // Acceptance Criterion 1: e015ca1e
  describe("Acceptance Criterion (id: e015ca1e)", () => {
    it("(id: e015ca1e) After a completed session the native Mind home shows the same unlocked and locked tiles as the web", async () => {
      const unlockedSystems = ["state-shift", "self-image", "mission"];
      const nextMainSessionAt = Date.now() + 12 * 3600 * 1000 + 30 * 60 * 1000;

      mockedApiFetch.mockImplementation((path: string) => {
        const cleanPath = path.split("?")[0]!;
        if (cleanPath === "/api/mind/identity") {
          return Promise.resolve({
            profile: { onboardingCompleted: true },
          });
        }
        if (cleanPath === "/api/mind/progress") {
          return Promise.resolve({
            chapter: 1,
            xp: 50,
            level: 2,
            mainSessionCount: 5,
            mainSessionAvailable: false, // Session completed / cooldown!
            nextMainSessionAt,
            unlockedSystems,
          });
        }
        if (cleanPath === "/api/mind/session") {
          return Promise.resolve({
            dateKey: "2026-10-02",
            completedToday: true,
            streak: 3,
            mainSessionAvailable: false, // In cooldown
            nextMainSessionAt,
            locked: false,
            sessionsUsed: 5,
          });
        }
        if (cleanPath === "/api/mind/state") {
          return Promise.resolve({ logs: [], todayMood: null });
        }
        if (cleanPath === "/api/mind/mission") {
          return Promise.resolve({ mission: null });
        }
        if (cleanPath === "/api/progress") {
          return Promise.resolve({ moodData: [] });
        }
        return Promise.resolve({});
      });

      const { getByTestId, queryByTestId } = render(<MindRoute />);

      // Wait for data load
      await waitFor(() => {
        expect(getByTestId("mind-training-grounds")).toBeTruthy();
      });

      // Main session card (Begin) is NOT shown because session is completed
      expect(queryByTestId("mind-session-begin")).toBeNull();

      // Training grounds heading and cooldown label are displayed
      const grounds = within(getByTestId("mind-training-grounds"));
      expect(grounds.getByText("Training Grounds")).toBeTruthy();
      expect(grounds.getByTestId("mind-cooldown-label")).toHaveTextContent(
        /Next in 12h (?:29|30)m/,
      );

      // Exact same unlocked tiles as web: state-shift, self-image, mission
      for (const id of unlockedSystems) {
        const info = SYSTEM_INFO[id]!;
        expect(getByTestId(`mind-system-tile-${id}`)).toBeTruthy();
        expect(grounds.getByText(info.label)).toBeTruthy();
        expect(grounds.getByText(info.hook)).toBeTruthy();
      }

      // Exact same locked tiles as web: all remaining from SYSTEM_INFO
      const expectedLocked = Object.keys(SYSTEM_INFO).filter(
        (id) => !unlockedSystems.includes(id),
      );
      for (const id of expectedLocked) {
        const info = SYSTEM_INFO[id]!;
        expect(getByTestId(`mind-system-tile-${id}`)).toBeTruthy();
        expect(grounds.getByText(info.label)).toBeTruthy();
      }

      // Tapping an unlocked tile opens that system's dashboard
      fireEvent.press(getByTestId("mind-system-tile-state-shift"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/mind/state-shift");
    });
  });

  // Acceptance Criterion 2: e015ca1f
  describe("Acceptance Criterion (id: e015ca1f)", () => {
    it("(id: e015ca1f) Suggested actions natively open the same systems the web suggests for the same state", async () => {
      const unlockedSystems = ["state-shift", "self-image", "mission"];
      const testState = "stressed";

      // Calculate expected suggestions using @become/core suggestActions (the exact same logic web uses)
      const expectedSuggestions = suggestActions({
        state: testState as any,
        unlocked: unlockedSystems,
        seed: dayOfYear(),
      });

      expect(expectedSuggestions.length).toBe(3);
      const expectedSystems = expectedSuggestions.map((s) => s.system);

      mockedApiFetch.mockImplementation((path: string) => {
        const cleanPath = path.split("?")[0]!;
        if (cleanPath === "/api/mind/identity") {
          return Promise.resolve({
            profile: { onboardingCompleted: true },
          });
        }
        if (cleanPath === "/api/mind/progress") {
          return Promise.resolve({
            chapter: 1,
            xp: 50,
            level: 2,
            mainSessionCount: 3,
            mainSessionAvailable: false,
            unlockedSystems,
          });
        }
        if (cleanPath === "/api/mind/session") {
          return Promise.resolve({
            dateKey: "2026-10-02",
            completedToday: true,
            streak: 3,
            mainSessionAvailable: false,
            locked: false,
            sessionsUsed: 3,
          });
        }
        if (cleanPath === "/api/mind/state") {
          return Promise.resolve({
            logs: [{ state: testState, feeling: "Overwhelmed" }],
            todayMood: null,
          });
        }
        if (cleanPath === "/api/mind/mission") {
          return Promise.resolve({ mission: null });
        }
        if (cleanPath === "/api/progress") {
          return Promise.resolve({ moodData: [] });
        }
        return Promise.resolve({});
      });

      const { getByTestId, getByText } = render(<MindRoute />);

      // Wait for cooldown view to mount
      await waitFor(() => {
        expect(getByTestId("mind-suggested-actions")).toBeTruthy();
      });

      // Verify each suggested action matches what core/web suggested for this state
      for (const item of expectedSuggestions) {
        const actionTile = getByTestId(`mind-suggested-action-${item.id}`);
        expect(actionTile).toBeTruthy();
        expect(getByText(item.title)).toBeTruthy();

        // Tapping the action opens the system natively
        fireEvent.press(actionTile);
        expect(mockPush).toHaveBeenCalledWith(`/(tabs)/mind/${item.system}`);
      }

      // Verify the systems opened match the web expected systems
      for (const sys of expectedSystems) {
        expect(mockPush).toHaveBeenCalledWith(`/(tabs)/mind/${sys}`);
      }
    });
  });
});
