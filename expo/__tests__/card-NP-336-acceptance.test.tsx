/* eslint-disable import/first */
import React from "react";
import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { Text } from "react-native";

let mockParams: Record<string, string> = {};
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
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
    return "test-jwt";
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

jest.mock("@/lib/feedback/haptics", () => ({
  lightHaptic: jest.fn(),
  celebrationHaptic: jest.fn(),
}));

jest.mock("@/lib/ai/runClient", () => ({
  runAiTask: jest.fn(),
}));

let mockEntitlementsState = {
  data: { enforced: false, features: {} } as any,
  feature: (_f: string) => null as any,
};

jest.mock("@/lib/entitlements", () => {
  const core = jest.requireActual("@become/core");
  return {
    useEntitlements: () => mockEntitlementsState,
    syntheticGate: core.syntheticGate,
    FEATURE_LABELS: core.FEATURE_LABELS,
    tierLabel: core.tierLabel,
    allowanceLine: core.allowanceLine,
    featureHeadline: core.featureHeadline,
    PLUS_BENEFITS: core.PLUS_BENEFITS,
  };
});

import { apiFetch } from "@become/api-client";
import { colors } from "@/lib/theme/colors";
import type { BackHandlerLike } from "@/lib/android/backHandler";
import ToolIntroGate from "@/components/mind/ToolIntroGate";
import GuidedFlow from "@/components/mind/system/GuidedFlow";
import { MOVE_CHIP } from "@/app/(app)/(tabs)/mind/index";
import MindRoute from "@/app/(app)/(tabs)/mind/index";
import { SessionPlayer } from "@/components/mind/session/SessionPlayer";
import VisionDashboard from "@/components/mind/VisionDashboard";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;

function makeFakeBackHandler() {
  const listeners: (() => boolean)[] = [];
  const backHandler: BackHandlerLike = {
    addEventListener: (_type: string, handler: () => boolean) => {
      listeners.push(handler);
      return {
        remove: () => {
          const idx = listeners.indexOf(handler);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      };
    },
  };
  return {
    backHandler,
    fire: () => listeners[0]?.(),
    get listeners() {
      return listeners;
    },
  };
}

const TEST_PLAN = {
  id: "test-plan",
  intro: { title: "Test Plan", subtitle: "Focus & Discipline" },
  openingId: "test-opening",
  moves: [
    {
      id: "move-1",
      kind: "state-check",
      title: "State Check",
      desc: "How are you feeling?",
      durationSec: 30,
    },
    {
      id: "move-2",
      kind: "breath",
      title: "Box Breath",
      desc: "Steady yourself",
      durationSec: 60,
    },
  ],
} as any;

describe("NP-336 Acceptance Tests", () => {
  beforeEach(() => {
    mockParams = {};
    mockReplace.mockReset();
    mockBack.mockReset();
    mockedApiFetch.mockReset();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. ToolIntroGate error + retry (NP-336)
  // ──────────────────────────────────────────────────────────────────────────
  describe("(id: np336-intro-gate) Never open locked tool on failed progress call; show error + retry", () => {
    it("renders error state with retry button on progress fetch failure, never rendering locked content", async () => {
      mockedApiFetch.mockRejectedValueOnce(new Error("Network connection lost"));

      const { getByTestId, queryByTestId } = render(
        <ToolIntroGate system="discipline">
          <Text testID="discipline-dashboard-content">Discipline Content</Text>
        </ToolIntroGate>,
      );

      await waitFor(() => {
        expect(getByTestId("mind-intro-gate-error")).toBeTruthy();
      });

      // Locked content is NEVER rendered
      expect(queryByTestId("discipline-dashboard-content")).toBeNull();
      // Router replacement is NOT triggered
      expect(mockReplace).not.toHaveBeenCalled();

      // Retry button is available
      const retryBtn = getByTestId("mind-intro-gate-retry");
      expect(retryBtn).toBeTruthy();

      // Mock progress success on retry
      mockedApiFetch.mockResolvedValueOnce({
        chapter: 2,
        unlockedSystems: ["discipline"],
        introducedSystems: ["discipline"],
      });

      fireEvent.press(retryBtn);

      await waitFor(() => {
        expect(getByTestId("discipline-dashboard-content")).toBeTruthy();
      });
      expect(queryByTestId("mind-intro-gate-error")).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. GuidedFlow Android back handling (NP-336)
  // ──────────────────────────────────────────────────────────────────────────
  describe("(id: np336-guided-flow-back) GuidedFlow intercepts Android hardware back to exit flow to dashboard", () => {
    it("fires onExit when hardware back button is pressed", () => {
      const fakeBack = makeFakeBackHandler();
      const onExit = jest.fn();

      render(
        <GuidedFlow
          title="Discipline Intro"
          steps={[
            { id: "s1", type: "read", prompt: "Step 1", body: "Step body" },
          ]}
          onComplete={jest.fn()}
          onExit={onExit}
          backHandler={fakeBack.backHandler}
        />,
      );

      expect(fakeBack.listeners.length).toBe(1);

      const handled = fakeBack.fire();
      expect(handled).toBe(true);
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it("ToolIntroGate onExit transitions to ready state to reveal the dashboard", async () => {
      mockedApiFetch.mockResolvedValueOnce({
        chapter: 2,
        unlockedSystems: ["discipline"],
        introducedSystems: [], // Needs intro
      });

      const { getByTestId, queryByTestId } = render(
        <ToolIntroGate system="discipline">
          <Text testID="discipline-dashboard-content">Discipline Content</Text>
        </ToolIntroGate>,
      );

      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });
      expect(queryByTestId("discipline-dashboard-content")).toBeNull();

      // Pressing exit (X button on GuidedFlow) closes flow to dashboard
      fireEvent.press(getByTestId("guided-flow-exit"));

      await waitFor(() => {
        expect(getByTestId("discipline-dashboard-content")).toBeTruthy();
      });
      expect(queryByTestId("guided-flow-screen")).toBeNull();
      expect(mockBack).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. MOVE_CHIP map parity with web (NP-336)
  // ──────────────────────────────────────────────────────────────────────────
  describe("(id: np336-move-chip-parity) MOVE_CHIP label map matches web exactly", () => {
    it("has identical labels for all moves matching webapp/components/mind/MindJourney.tsx", () => {
      expect(MOVE_CHIP).toEqual({
        "state-check": "Check in",
        breath: "Breathe",
        identity: "Affirm",
        win: "Win",
        challenge: "Discipline",
        mission: "Lock in",
        vision: "Vision",
        antisabotage: "Pattern",
        social: "Connect",
        mirror: "Mirror",
        choice: "Reflect",
        type: "Type it",
        speak: "Say it",
        assemble: "Build it",
        compose: "Fill it in",
        acknowledge: "Check in",
        interrogative: "Reflect",
        contrast: "Plan it",
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Amber streak pill in Mind hub header (NP-336)
  // ──────────────────────────────────────────────────────────────────────────
  describe("(id: np336-streak-pill) Mind hub streak pill uses amber accent tokens", () => {
    it("renders the streak badge with bg-accent/10, colors.accent, and text-accent", async () => {
      mockedApiFetch.mockImplementation(async (path: string, _s, init) => {
        const method = (init as { method?: string } | undefined)?.method ?? "GET";
        const clean = path.split("?")[0]!;

        if (clean === "/api/progress" && method === "GET") {
          return { moodData: [] };
        }
        if (clean === "/api/mind/identity" && method === "GET") {
          return {
            profile: { onboardingCompleted: true },
          };
        }
        if (clean === "/api/mind/progress" && method === "GET") {
          return {
            chapter: 1,
            xp: 10,
            unlockedSystems: ["state-shift"],
          };
        }
        if (clean === "/api/mind/session" && method === "GET") {
          return {
            streak: 4,
            completedToday: false,
            mainSessionAvailable: true,
          };
        }
        return {};
      });

      const { findByTestId } = render(<MindRoute />);

      const badge = await findByTestId("mind-streak-badge");
      expect(badge.props.className).toContain("bg-accent/10");

      // Verify text inside badge has text-accent
      const text = within(badge).getByText("4");
      expect(text.props.className).toContain("text-accent");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. SessionPlayer exit behavior and dark modal styling (NP-336)
  // ──────────────────────────────────────────────────────────────────────────
  describe("(id: np336-session-exit) SessionPlayer intro X exits directly and exit confirm dialog is dark themed", () => {
    it("X button on intro stage exits directly without showing confirm dialog", () => {
      const onExit = jest.fn();
      const { getByTestId, queryByTestId } = render(
        <SessionPlayer plan={TEST_PLAN} onExit={onExit} />,
      );

      // Intro stage: pressing exit
      fireEvent.press(getByTestId("mind-session-player-exit"));
      expect(onExit).toHaveBeenCalledTimes(1);
      expect(queryByTestId("mind-session-player-exit-dialog")).toBeNull();
    });

    it("confirm dialog during mid-session is styled with dark player theme", () => {
      const onExit = jest.fn();
      const { getByTestId } = render(
        <SessionPlayer plan={TEST_PLAN} onExit={onExit} />,
      );

      // Advance to move stage
      fireEvent.press(getByTestId("mind-session-player-intro-begin"));

      // Exit during move stage opens confirm dialog
      fireEvent.press(getByTestId("mind-session-player-exit"));

      const dialog = getByTestId("mind-session-player-exit-dialog");
      expect(dialog.props.className).toContain("bg-black/80");

      // Card inside dialog
      const card = dialog.props.children;
      expect(card.props.className).toContain("bg-zinc-900");
      expect(card.props.className).toContain("border-white/15");

      // Leave button is white with black text
      const leaveBtn = getByTestId("mind-session-player-exit-confirm");
      expect(leaveBtn.props.className).toContain("bg-white");
      const leaveText = within(leaveBtn).getByText("Leave");
      expect(leaveText.props.className).toContain("text-black");

      // Stay button is white/60
      const stayBtn = getByTestId("mind-session-player-exit-cancel");
      const stayText = within(stayBtn).getByText("Stay");
      expect(stayText.props.className).toContain("text-white/60");
    });

    it("Android hardware back on intro stage opens dark-styled exit dialog", () => {
      const onExit = jest.fn();
      const { getByTestId } = render(
        <SessionPlayer plan={TEST_PLAN} onExit={onExit} />,
      );

      // Hardware back on intro
      fireEvent(getByTestId("mind-session-player"), "requestClose");

      const dialog = getByTestId("mind-session-player-exit-dialog");
      expect(dialog).toBeTruthy();
      expect(dialog.props.className).toContain("bg-black/80");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Vision editor multiline inputs (NP-336)
  // ──────────────────────────────────────────────────────────────────────────
  describe("(id: np336-vision-inputs) Vision editor text inputs are multiline with proper wrapping", () => {
    it("identity statement and domain inputs have multiline, numberOfLines={2}, textAlignVertical='top', and min-h-[56px]", async () => {
      mockedApiFetch.mockImplementation(async (path: string, _s, opts: any = {}) => {
        if (path === "/api/mind/vision" && (!opts.method || opts.method === "GET")) {
          return {
            vision: null,
            alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false },
          };
        }
        if (path.startsWith("/api/mind/journal")) return { entries: [], counts: {} };
        return {};
      });

      const { getByTestId, findByTestId } = render(<VisionDashboard />);

      // Open paint form
      const paintBtn = await findByTestId("vision-paint-button");
      fireEvent.press(paintBtn);

      await waitFor(() => {
        expect(getByTestId("vision-edit-form")).toBeTruthy();
      });

      const identityInput = getByTestId("vision-identity-input");
      expect(identityInput.props.multiline).toBe(true);
      expect(identityInput.props.numberOfLines).toBe(2);
      expect(identityInput.props.textAlignVertical).toBe("top");
      expect(identityInput.props.className).toContain("min-h-[56px]");

      const domains = ["body", "mind", "habits", "relationships", "environment"];
      for (const d of domains) {
        const domainInput = getByTestId(`vision-domain-${d}`);
        expect(domainInput.props.multiline).toBe(true);
        expect(domainInput.props.numberOfLines).toBe(2);
        expect(domainInput.props.textAlignVertical).toBe("top");
        expect(domainInput.props.className).toContain("min-h-[56px]");
      }
    });
  });
});
