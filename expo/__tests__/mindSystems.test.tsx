/* eslint-disable import/first */
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
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
  successHaptic: jest.fn(),
  selectionHaptic: jest.fn(),
}));

jest.mock("@/lib/ai/runClient", () => ({
  runAiTask: jest.fn(),
}));

import { apiFetch } from "@become/api-client";
import { runAiTask } from "@/lib/ai/runClient";
import { dayOfYear, dailyIndex, dailyPick } from "@/lib/mind/rotation";
import { recentFeelingLabel, isFallbackLabel } from "@/lib/mind/recentFeeling";
import {
  validateGuidedSteps,
  ensureStepAsks,
  stripQuotes,
} from "@/lib/ai/sanitize";
import ToolIntroGate from "@/components/mind/ToolIntroGate";
import StateShiftDashboard from "@/components/mind/StateShiftDashboard";
import SelfImageDashboard from "@/components/mind/SelfImageDashboard";
import MissionDashboard from "@/components/mind/MissionDashboard";
import GuidedFlow from "@/components/mind/system/GuidedFlow";
import { Text } from "@/components/Text";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;
const mockedRunAiTask = runAiTask as unknown as jest.Mock;

describe("Mind System Framework (NP-151)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  describe("Utility: rotation.ts", () => {
    it("computes dayOfYear deterministically", () => {
      const jan1 = new Date(Date.UTC(2026, 0, 1));
      expect(dayOfYear(jan1)).toBe(1);

      const jan15 = new Date(Date.UTC(2026, 0, 15));
      expect(dayOfYear(jan15)).toBe(15);

      const dec31 = new Date(Date.UTC(2026, 11, 31));
      expect(dayOfYear(dec31)).toBe(365);
    });

    it("computes dailyIndex with wraps and zero safe-guard", () => {
      expect(dailyIndex(0, 10)).toBe(0);
      expect(dailyIndex(5, 0)).toBe(dayOfYear() % 5);
      expect(dailyIndex(1, 4)).toBe(0);
      expect(dailyIndex(4, 0)).toBe(dayOfYear() % 4);
    });

    it("dailyPick picks items safely", () => {
      expect(dailyPick([])).toBeUndefined();
      const items = ["a", "b", "c"];
      const picked = dailyPick(items);
      expect(items).toContain(picked);
    });
  });

  describe("Utility: recentFeeling.ts", () => {
    it("maps known states to canonical labels and feelings", () => {
      expect(recentFeelingLabel("stressed")).toBe("stressed");
      expect(recentFeelingLabel("distracted")).toBe("distracted");
      expect(recentFeelingLabel("low_energy")).toBe("low energy");
      expect(recentFeelingLabel("locked_in")).toBe("locked in");

      expect(recentFeelingLabel("stressed", "Overwhelmed")).toBe("Overwhelmed");
      expect(recentFeelingLabel("locked_in", "Laser focused")).toBe(
        "Laser focused",
      );
    });

    it("handles fallback and whitespace values", () => {
      expect(recentFeelingLabel("stressed", null)).toBe("stressed");
      expect(recentFeelingLabel("stressed", "   ")).toBe("stressed");
      expect(isFallbackLabel(null)).toBe(true);
      expect(isFallbackLabel("   ")).toBe(true);
      expect(isFallbackLabel("Laser focused")).toBe(false);
    });
  });

  describe("Utility: sanitize.ts", () => {
    it("validates and cleans guided steps", () => {
      expect(validateGuidedSteps(null)).toBeNull();
      expect(validateGuidedSteps([])).toBeNull();
      expect(validateGuidedSteps("not an array")).toBeNull();

      const rawSteps = [
        {
          title: "Step 1",
          body: "Breathe deeply",
          choices: ["Option A", "Option B"],
        },
        {
          title: "Step 2",
          inputPrompt: "What are you noticing?",
          scale: { min: 1, max: 10, minLabel: "Low", maxLabel: "High" },
        },
      ];

      const validated = validateGuidedSteps(rawSteps);
      expect(validated).not.toBeNull();
      expect(validated?.length).toBe(2);
      expect(validated?.[0]?.title).toBe("Step 1");
      expect(validated?.[0]?.choices).toEqual(["Option A", "Option B"]);
      expect(validated?.[1]?.scale?.max).toBe(10);
      expect(validated?.[1]?.scale?.maxLabel).toBe("High");
    });

    it("ensureStepAsks and stripQuotes sanitize correctly", () => {
      const step = {
        title: "Focus",
        body: "Take a breath. What is coming up right now?",
        inputPrompt: "Focus",
      };
      const fixed = ensureStepAsks(step);
      expect(fixed.inputPrompt).toBe("What is coming up right now?");

      expect(stripQuotes('"Hello world"')).toBe("Hello world");
      expect(stripQuotes("'Hello world'")).toBe("Hello world");
      expect(stripQuotes("Hello world")).toBe("Hello world");
    });
  });

  describe("Chapter Gating in ToolIntroGate", () => {
    it("displays locked state and never an error when user chapter is below system unlock", async () => {
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/progress") {
          return {
            chapter: 1,
            unlockedSystems: ["state-shift", "self-image", "mission"],
            introducedSystems: [],
          };
        }
        return {};
      });

      // Discipline unlocks in chapter 3, user is in chapter 1
      const { getByTestId, queryByTestId } = render(
        <ToolIntroGate system="discipline">
          <Text testID="unlocked-content">Content</Text>
        </ToolIntroGate>,
      );

      await waitFor(() => {
        expect(getByTestId("mind-system-locked")).toBeTruthy();
      });

      expect(queryByTestId("unlocked-content")).toBeNull();
    });
  });

  describe("Acceptance Criterion e015ca13: First-time intro gate runs once and introduces system", () => {
    it("runs intro natively and calls POST /api/mind/progress/introduce and POST /api/mind/journal on completion", async () => {
      const calls: { path: string; method: string; body?: any }[] = [];
      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({ path, method: opts.method ?? "GET", body: opts.body });
          if (path === "/api/mind/progress") {
            return {
              chapter: 1,
              unlockedSystems: ["state-shift", "self-image", "mission"],
              introducedSystems: [], // not yet introduced
            };
          }
          if (path === "/api/mind/progress/introduce") {
            return { success: true };
          }
          if (path === "/api/mind/journal") {
            return { id: "journal-1" };
          }
          return {};
        },
      );

      const { getByTestId, queryByTestId } = render(
        <ToolIntroGate system="state-shift">
          <Text testID="state-shift-ready">Ready</Text>
        </ToolIntroGate>,
      );

      // Should show intro flow because state-shift is not introduced yet
      await waitFor(() => {
        expect(getByTestId("mind-intro-gate-intro")).toBeTruthy();
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });

      // INTRO_FLOWS["state-shift"] has 6 steps:
      // Step 0: Info -> Next
      fireEvent.press(getByTestId("guided-flow-next"));

      // Step 1: Scale (1 to 5) -> pick 3
      await waitFor(() => {
        expect(getByTestId("guided-flow-scale-3")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-scale-3"));

      // Step 2: Info -> Next
      await waitFor(() => {
        expect(getByTestId("guided-flow-next")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-next"));

      // Step 3: Info -> Next
      await waitFor(() => {
        expect(getByTestId("guided-flow-next")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-next"));

      // Step 4: Input prompt
      await waitFor(() => {
        expect(getByTestId("guided-flow-input")).toBeTruthy();
      });
      fireEvent.changeText(
        getByTestId("guided-flow-input"),
        "Slightly scattered after meetings",
      );
      fireEvent.press(getByTestId("guided-flow-next"));

      // Step 5: Final Info step -> Next / Enter
      await waitFor(() => {
        expect(getByTestId("guided-flow-next")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-next"));

      // Verify introduce API was called
      await waitFor(() => {
        const introCall = calls.find(
          (c) =>
            c.path === "/api/mind/progress/introduce" && c.method === "POST",
        );
        expect(introCall).toBeDefined();
        expect(introCall?.body).toEqual({ system: "state-shift" });
      });

      // Verify intro journal was called
      await waitFor(() => {
        const journalCall = calls.find(
          (c) => c.path === "/api/mind/journal" && c.method === "POST",
        );
        expect(journalCall).toBeDefined();
        expect(journalCall?.body?.system).toBe("state-shift");
        expect(journalCall?.body?.kind).toBe("intro");
      });

      // Now it unlocks and renders the children
      await waitFor(() => {
        expect(queryByTestId("state-shift-ready")).toBeTruthy();
      });
    });
  });

  describe("Acceptance Criterion e015ca14: Protocol run natively appears in web recent entries", () => {
    it("running a protocol posts to POST /api/mind/journal and displays in track record", async () => {
      const calls: { path: string; method: string; body?: any }[] = [];
      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({ path, method: opts.method ?? "GET", body: opts.body });
          if (path === "/api/mind/state") {
            return { state: "neutral", feeling: "Neutral" };
          }
          if (path.startsWith("/api/mind/journal")) {
            return {
              entries: [
                {
                  id: "entry-101",
                  system: "state-shift",
                  title: "Name the Next Action",
                  kind: "protocol",
                  createdAt: new Date().toISOString(),
                },
              ],
            };
          }
          if (path === "/api/mind/progress") {
            return {
              chapter: 1,
              unlockedSystems: ["state-shift", "self-image", "mission"],
              introducedSystems: ["state-shift"],
            };
          }
          return {};
        },
      );

      const { getByTestId } = render(<StateShiftDashboard />);

      await waitFor(() => {
        expect(getByTestId("state-shift-dashboard")).toBeTruthy();
      });

      // Verify TrackRecord initially shows the existing entry
      await waitFor(() => {
        expect(getByTestId("mind-track-record")).toBeTruthy();
        expect(getByTestId("mind-track-record-entry-entry-101")).toBeTruthy();
      });

      // Launch "Name the Next Action" protocol from toolkit card
      fireEvent.press(getByTestId("mind-toolkit-card-name-the-next-action"));

      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });

      // Step 0: Input step
      fireEvent.changeText(
        getByTestId("guided-flow-input"),
        "A cluttered mind with too many open tasks",
      );
      fireEvent.press(getByTestId("guided-flow-next"));

      // Step 1: Input step
      await waitFor(() => {
        expect(getByTestId("guided-flow-input")).toBeTruthy();
      });
      fireEvent.changeText(
        getByTestId("guided-flow-input"),
        "Ship the first feature branch",
      );
      fireEvent.press(getByTestId("guided-flow-next"));

      // Step 2: Final info step
      await waitFor(() => {
        expect(getByTestId("guided-flow-next")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-next"));

      // Verify POST /api/mind/journal was called with protocol details
      await waitFor(() => {
        const journalPost = calls.find(
          (c) => c.path === "/api/mind/journal" && c.method === "POST",
        );
        expect(journalPost).toBeDefined();
        expect(journalPost?.body?.system).toBe("state-shift");
        expect(journalPost?.body?.kind).toBe("protocol");
        expect(journalPost?.body?.title).toBe("Name the Next Action");
      });

      // Returns to dashboard and track record
      await waitFor(() => {
        expect(getByTestId("state-shift-dashboard")).toBeTruthy();
        expect(getByTestId("mind-track-record-entry-entry-101")).toBeTruthy();
      });
    });
  });

  describe("Acceptance Criterion e015ca15: AI declined falls back to static protocol without error", () => {
    it("falls back to static protocol steps when runAiTask rejects or is declined", async () => {
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/state") {
          return { state: "neutral", feeling: "Neutral" };
        }
        if (path.startsWith("/api/mind/journal")) {
          return { entries: [] };
        }
        if (path === "/api/mind/progress") {
          return {
            chapter: 1,
            unlockedSystems: ["state-shift", "self-image", "mission"],
            introducedSystems: ["state-shift"],
          };
        }
        return {};
      });

      // Mock AI failure / decline
      mockedRunAiTask.mockRejectedValue(new Error("AI declined by user"));

      const { getByTestId, getAllByTestId } = render(<StateShiftDashboard />);

      await waitFor(() => {
        expect(getByTestId("mind-adaptive-session")).toBeTruthy();
      });

      // Trigger AdaptiveSession (Personalise)
      await act(async () => {
        fireEvent.press(getByTestId("mind-adaptive-session"));
      });

      // Verify runAiTask was called
      expect(mockedRunAiTask).toHaveBeenCalled();

      // Verify it fell back smoothly to GuidedFlow with the static protocol without throwing an unhandled error
      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });

      // GuidedFlow is active and operational. The fallback protocol is the
      // day-rotated featured flow (dailyPick), so its first step may be an
      // info step (Next button), a pick-one (choices) or a scale: accept any
      // actionable control rather than pinning the test to one weekday.
      expect(getByTestId("guided-flow-step")).toBeTruthy();
      expect(
        getAllByTestId(/^guided-flow-(next|choice-\d+|scale-\d+)$/).length,
      ).toBeGreaterThan(0);
    });

    it("hides reflection in GuidedFlow cleanly when reflection AI fails", async () => {
      const mockOnReflect = jest
        .fn()
        .mockRejectedValue(new Error("AI reflection failed"));
      const mockOnComplete = jest.fn();
      const mockOnExit = jest.fn();

      const steps = [
        { title: "Step 1", inputPrompt: "How are you feeling?" },
        { title: "Review", body: "Review your answers" },
      ];

      const { getByTestId, queryByTestId } = render(
        <GuidedFlow
          title="Reflection Test"
          steps={steps}
          onComplete={mockOnComplete}
          onExit={mockOnExit}
          onReflect={mockOnReflect}
        />,
      );

      // Step 1: type input and proceed
      const input = getByTestId("guided-flow-input");
      fireEvent.changeText(input, "Feeling calm");
      fireEvent.press(getByTestId("guided-flow-next"));

      // Last step: review step triggers onReflect
      await waitFor(() => {
        expect(mockOnReflect).toHaveBeenCalled();
      });

      // Reflection view is hidden because onReflect rejected and reflection is null
      await waitFor(() => {
        expect(queryByTestId("guided-flow-reflect")).toBeNull();
        expect(queryByTestId("guided-flow-reflect-content")).toBeNull();
      });

      // Shows standard step instead
      expect(getByTestId("guided-flow-step")).toBeTruthy();
    });
  });

  describe("SelfImageDashboard & MissionDashboard Native Actions", () => {
    it("allows affirming identity streak and adding win evidence in SelfImageDashboard", async () => {
      const calls: { path: string; method: string; body?: any }[] = [];
      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({ path, method: opts.method ?? "GET", body: opts.body });
          if (path === "/api/mind/identity") {
            return {
              profile: {
                onboardingCompleted: true,
                futureSelf: "Visionary Leader",
                currentSelf: "Focused Executor",
                affirmations: ["I make hard things look simple."],
                streak: 7,
                affirmedToday: false,
              },
              wins: [],
            };
          }
          if (path.startsWith("/api/mind/journal")) {
            return { entries: [] };
          }
          if (path === "/api/mind/wins") {
            return { win: { id: "win-1", title: "Shipped v1" } };
          }
          return {};
        },
      );

      const { getByTestId } = render(<SelfImageDashboard />);

      await waitFor(() => {
        expect(getByTestId("self-image-dashboard")).toBeTruthy();
        expect(getByTestId("self-image-future-self")).toHaveTextContent(
          "Visionary Leader",
        );
      });

      // Affirm identity streak
      fireEvent.press(getByTestId("self-image-affirm-button"));

      await waitFor(() => {
        const patchCall = calls.find(
          (c) => c.path === "/api/mind/identity" && c.method === "PATCH",
        );
        expect(patchCall).toBeDefined();
        expect(patchCall?.body?.action).toBe("affirm");
      });

      // Add a win to evidence wall
      const winInput = getByTestId("self-image-win-input");
      fireEvent.changeText(winInput, "Shipped v1");
      fireEvent.press(getByTestId("self-image-win-add"));

      await waitFor(() => {
        const winCall = calls.find(
          (c) => c.path === "/api/mind/wins" && c.method === "POST",
        );
        expect(winCall).toBeDefined();
        expect(winCall?.body?.win).toBe("Shipped v1");
      });
    });

    it("allows advancing forward move streak in MissionDashboard", async () => {
      const calls: { path: string; method: string; body?: any }[] = [];
      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({ path, method: opts.method ?? "GET", body: opts.body });
          if (path === "/api/mind/mission") {
            return {
              mission: {
                purpose: "Build useful tools",
                whyItMatters: "To empower human agency",
                dailyAction: "Ship everyday",
              },
              momentum: {
                streak: 4,
                longest: 10,
                movedToday: false,
              },
            };
          }
          if (path.startsWith("/api/mind/journal")) {
            return { entries: [] };
          }
          return {};
        },
      );

      const { getByTestId } = render(<MissionDashboard />);

      await waitFor(() => {
        expect(getByTestId("mission-dashboard")).toBeTruthy();
        expect(getByTestId("mission-purpose")).toHaveTextContent(
          "Build useful tools",
        );
      });

      // Press forward move
      fireEvent.press(getByTestId("mission-move-button"));

      await waitFor(() => {
        const moveCall = calls.find(
          (c) => c.path === "/api/mind/mission" && c.method === "PATCH",
        );
        expect(moveCall).toBeDefined();
        expect(moveCall?.body?.action).toBe("move");
      });
    });
  });
});
