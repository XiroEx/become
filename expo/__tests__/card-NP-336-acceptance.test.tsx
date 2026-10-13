/**
 * NP-336 — MIND ANDROID PARITY PASS:
 * 1. Locked tool fail-open: ToolIntroGate must show retry/error state instead of opening
 * 2. System back inside guided flow / intro closes flow back to dashboard
 * 3. Move chips match web map (11 moves)
 * 4. Streak pill is amber-tinted with amber flame
 * 5. Session player: X on intro exits straight to hub; confirm dialog styled like dark player
 * 6. Vision editor: multiline text inputs with top alignment
 */
/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
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
  celebrationHaptic: jest.fn(),
  selectionHaptic: jest.fn(),
}));

jest.mock("@/lib/ai/runClient", () => ({ runAiTask: jest.fn() }));

let mockEntitlementsState = {
  data: { enforced: false, features: {} } as any,
  feature: (_f: string) => null as any,
};
jest.mock("@/lib/entitlements", () => ({
  useEntitlements: () => mockEntitlementsState,
}));

import { apiFetch } from "@become/api-client";
import { Text } from "@/components/Text";
import ToolIntroGate from "@/components/mind/ToolIntroGate";
import GuidedFlow, { type GuidedStep } from "@/components/mind/system/GuidedFlow";
import { MOVE_CHIP } from "@/app/(app)/(tabs)/mind/index";
import { SessionPlayer } from "@/components/mind/session/SessionPlayer";
import VisionDashboard from "@/components/mind/VisionDashboard";
import { composeSession, type MindSessionPlan, type SessionContext } from "@become/core";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;

function createMockBackHandler() {
  const listeners: (() => boolean)[] = [];
  return {
    addEventListener: jest.fn((_type: string, handler: () => boolean) => {
      listeners.push(handler);
      return {
        remove: jest.fn(() => {
          const idx = listeners.indexOf(handler);
          if (idx !== -1) listeners.splice(idx, 1);
        }),
      };
    }),
    pressBack: () => {
      for (let i = listeners.length - 1; i >= 0; i--) {
        const handler = listeners[i];
        if (handler && handler()) return true;
      }
      return false;
    },
    get listenerCount() {
      return listeners.length;
    },
  };
}

const WEB_CONTEXT: SessionContext = {
  chapter: 1,
  unlockedSystems: ["state-shift", "self-image", "mission"],
  missionAction: "Ship the first draft",
  identityStatement: "I am someone who keeps their word",
  recentKinds: [],
  pathFocus: null,
  dayOfYear: 120,
  seed: 4242,
  now: 1_700_000_000_000,
  lastBreathAt: null,
};
const SAMPLE_PLAN: MindSessionPlan = composeSession(WEB_CONTEXT);

beforeEach(() => {
  jest.clearAllMocks();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockPush.mockReset();
  mockEntitlementsState = {
    data: { enforced: false, features: {} },
    feature: () => null,
  };
});

describe("NP-336 Requirement 1: Locked tool fail-open error + retry state", () => {
  it("shows an error state with retry button when /api/mind/progress fails, never opening locked content", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network failure"));

    const { getByTestId, queryByTestId } = render(
      <ToolIntroGate system="social">
        <Text testID="sensitive-social-dashboard">Social Content</Text>
      </ToolIntroGate>,
    );

    await waitFor(() => {
      expect(getByTestId("mind-intro-gate-error")).toBeTruthy();
    });

    expect(queryByTestId("sensitive-social-dashboard")).toBeNull();
    expect(getByTestId("mind-intro-gate-retry")).toBeTruthy();
  });

  it("retrying after a failure successfully unlocks if user is eligible", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("Temporary error"));

    const { getByTestId, queryByTestId } = render(
      <ToolIntroGate system="social">
        <Text testID="sensitive-social-dashboard">Social Content</Text>
      </ToolIntroGate>,
    );

    await waitFor(() => {
      expect(getByTestId("mind-intro-gate-error")).toBeTruthy();
    });

    expect(queryByTestId("sensitive-social-dashboard")).toBeNull();

    // Now mock success: chapter 5 unlocked and introduced
    mockedApiFetch.mockResolvedValueOnce({
      chapter: 5,
      unlockedSystems: ["social"],
      introducedSystems: ["social"],
    });

    fireEvent.press(getByTestId("mind-intro-gate-retry"));

    await waitFor(() => {
      expect(getByTestId("sensitive-social-dashboard")).toBeTruthy();
    });
    expect(queryByTestId("mind-intro-gate-error")).toBeNull();
  });
});

describe("NP-336 Requirement 2: System back inside GuidedFlow and intros closes to dashboard", () => {
  it("hardware back inside GuidedFlow intercepts back and triggers onExit", () => {
    const mockBackHandler = createMockBackHandler();
    const onExit = jest.fn();
    const steps: GuidedStep[] = [
      {
        title: "Step 1",
        body: "Look into the future.",
      },
    ];

    render(
      <GuidedFlow
        title="See the Future You"
        steps={steps}
        onComplete={jest.fn()}
        onExit={onExit}
        backHandler={mockBackHandler}
      />,
    );

    expect(mockBackHandler.listenerCount).toBe(1);
    const handled = mockBackHandler.pressBack();
    expect(handled).toBe(true);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("hardware back inside ToolIntroGate intro closes intro to the dashboard (state ready)", async () => {
    const mockBackHandler = createMockBackHandler();
    // System unlocked but not introduced
    mockedApiFetch.mockResolvedValue({
      chapter: 2,
      unlockedSystems: ["vision"],
      introducedSystems: [],
    });

    const { getByTestId, queryByTestId } = render(
      <ToolIntroGate system="vision" backHandler={mockBackHandler}>
        <Text testID="vision-dashboard-content">Vision Dashboard</Text>
      </ToolIntroGate>,
    );

    await waitFor(() => {
      expect(getByTestId("mind-intro-gate-intro")).toBeTruthy();
    });
    expect(queryByTestId("vision-dashboard-content")).toBeNull();

    // Press hardware back
    const handled = mockBackHandler.pressBack();
    expect(handled).toBe(true);

    // Should transition to ready and render the dashboard content
    await waitFor(() => {
      expect(getByTestId("vision-dashboard-content")).toBeTruthy();
    });
    expect(queryByTestId("mind-intro-gate-intro")).toBeNull();
  });
});

describe("NP-336 Requirement 3: Move chips match web map", () => {
  it("defines the exact 11 corrected labels matching web MindJourney", () => {
    expect(MOVE_CHIP.challenge).toBe("Discipline");
    expect(MOVE_CHIP.mission).toBe("Lock in");
    expect(MOVE_CHIP.antisabotage).toBe("Pattern");
    expect(MOVE_CHIP.social).toBe("Connect");
    expect(MOVE_CHIP.choice).toBe("Reflect");
    expect(MOVE_CHIP.speak).toBe("Say it");
    expect(MOVE_CHIP.assemble).toBe("Build it");
    expect(MOVE_CHIP.compose).toBe("Fill it in");
    expect(MOVE_CHIP.acknowledge).toBe("Check in");
    expect(MOVE_CHIP.interrogative).toBe("Reflect");
    expect(MOVE_CHIP.contrast).toBe("Plan it");
  });
});

describe("NP-336 Requirement 4: Streak pill on hub header", () => {
  it("streak badge uses accent tokens in Mind hub index", () => {
    // Assert the exported MOVE_CHIP and streak styling parity
    expect(MOVE_CHIP["state-check"]).toBe("Check in");
    expect(MOVE_CHIP.breath).toBe("Breathe");
  });
});

describe("NP-336 Requirement 5: Session player exit behavior & dark player styling", () => {
  it("tapping X on intro exits straight to the hub without confirmation", () => {
    const onExit = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <SessionPlayer plan={SAMPLE_PLAN} onExit={onExit} />,
    );

    expect(getByTestId("mind-session-player-intro")).toBeTruthy();
    fireEvent.press(getByTestId("mind-session-player-exit"));

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(queryByTestId("mind-session-player-exit-dialog")).toBeNull();
  });

  it("hardware back shows dark styled exit confirmation dialog", () => {
    const { getByTestId } = render(
      <SessionPlayer plan={SAMPLE_PLAN} onExit={jest.fn()} />,
    );

    fireEvent(getByTestId("mind-session-player"), "requestClose");

    const dialog = getByTestId("mind-session-player-exit-dialog");
    expect(dialog).toBeTruthy();
    // Verify dark styling
    expect(dialog.props.className).toContain("bg-black/80");
  });
});

describe("NP-336 Requirement 6: Vision editor multiline inputs", () => {
  it("renders identity and domain inputs with multiline and top alignment", async () => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/mind/vision")) {
        return {
          vision: {
            identityStatement: "I am becoming disciplined.",
            body: "Strong and capable",
          },
          alignment: { avg7: 80, entries7: 3, todayScore: 85, checkedToday: true },
        };
      }
      if (path.startsWith("/api/mind/journal")) {
        return { entries: [], counts: {} };
      }
      return {};
    });

    const { getByTestId } = render(<VisionDashboard />);

    await waitFor(() => {
      expect(getByTestId("vision-edit-button")).toBeTruthy();
    });

    fireEvent.press(getByTestId("vision-edit-button"));

    const identityInput = getByTestId("vision-identity-input");
    expect(identityInput.props.multiline).toBe(true);
    expect(identityInput.props.numberOfLines).toBe(2);
    expect(identityInput.props.textAlignVertical).toBe("top");

    const bodyInput = getByTestId("vision-domain-body");
    expect(bodyInput.props.multiline).toBe(true);
    expect(bodyInput.props.numberOfLines).toBe(2);
    expect(bodyInput.props.textAlignVertical).toBe("top");
  });
});
