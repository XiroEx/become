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

import { ApiError, apiFetch } from "@become/api-client";
import { runAiTask } from "@/lib/ai/runClient";
import VisionDashboard from "@/components/mind/VisionDashboard";
import MindSectionRoute from "@/app/(app)/(tabs)/mind/[section]";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;
const mockedRunAiTask = runAiTask as unknown as jest.Mock;

const VISION_GATE_BODY = {
  error: "Vision is included with Plus.",
  feature: "vision",
  requiresTier: "plus",
  limit: 0,
};

function gateError(): ApiError {
  return new ApiError(403, VISION_GATE_BODY);
}

function plusEntitlements() {
  mockEntitlementsState = {
    data: {
      enforced: true,
      features: {
        vision: {
          allowed: true,
          canCreate: true,
          requiresTier: "plus",
          limit: 0,
          used: 0,
          remaining: null,
          resetsAt: null,
          window: "lifetime",
        },
      },
    },
    feature: (f: string) =>
      f === "vision"
        ? {
            allowed: true,
            canCreate: true,
            requiresTier: "plus",
            limit: 0,
            used: 0,
            remaining: null,
            resetsAt: null,
            window: "lifetime",
          }
        : null,
  };
}

function freeEntitlements() {
  mockEntitlementsState = {
    data: {
      enforced: true,
      features: {
        vision: {
          allowed: false,
          canCreate: false,
          requiresTier: "plus",
          limit: 0,
          used: 0,
          remaining: 0,
          resetsAt: null,
          window: "lifetime",
        },
      },
    },
    feature: (f: string) =>
      f === "vision"
        ? {
            allowed: false,
            canCreate: false,
            requiresTier: "plus",
            limit: 0,
            used: 0,
            remaining: 0,
            resetsAt: null,
            window: "lifetime",
          }
        : null,
  };
}

const EMPTY_VISION = {
  vision: null,
  alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false },
};

describe("Vision behind the native TierGate (NP-154)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    hideUpgradeSheet();
    mockEntitlementsState = {
      data: { enforced: false, features: {} } as any,
      feature: () => null as any,
    };
  });

  describe("Acceptance Criterion e015ca23: free member sees Vision locked, tap raises upgrade sheet", () => {
    it("renders the tier-gate teaser instead of the dashboard and opens the sheet on tap", async () => {
      freeEntitlements();
      mockParams = { section: "vision" };
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/progress") {
          return {
            chapter: 5,
            unlockedSystems: ["vision"],
            introducedSystems: ["vision"],
          };
        }
        return {};
      });

      const { getByTestId } = render(<MindSectionRoute />);

      await waitFor(() => {
        expect(getByTestId("tier-gate-teaser")).toBeTruthy();
      });

      fireEvent.press(getByTestId("tier-gate-teaser"));

      // TierGate owns a local UpgradeSheet for the teaser tap: assert the
      // sheet it opened, not the global host store.
      await waitFor(() => {
        expect(getByTestId("upgrade-sheet")).toBeTruthy();
      });
      expect(getByTestId("upgrade-sheet-error")).toHaveTextContent(
        "Vision is included with Plus.",
      );
    });

    it("a 403 from any of the four doors raises the sheet and never composes a vision flow for a free member", async () => {
      plusEntitlements();
      mockedApiFetch.mockImplementation(async (path: string, _s: any, opts: any = {}) => {
        if (path === "/api/mind/vision" && (!opts.method || opts.method === "GET")) {
          return EMPTY_VISION;
        }
        if (path.startsWith("/api/mind/journal") && (!opts.method || opts.method === "GET")) {
          return { entries: [], counts: {} };
        }
        // Every write door refuses like the server does for a free member.
        throw gateError();
      });
      mockedRunAiTask.mockResolvedValue({
        ok: false,
        error: "entitlement",
        gate: VISION_GATE_BODY,
      });

      const { getByTestId } = render(<VisionDashboard />);

      await waitFor(() => {
        expect(getByTestId("vision-dashboard")).toBeTruthy();
      });

      // Door 1: POST /api/mind/vision (domains form)
      fireEvent.press(getByTestId("vision-paint-button"));
      await waitFor(() => {
        expect(getByTestId("vision-edit-form")).toBeTruthy();
      });
      fireEvent.changeText(getByTestId("vision-identity-input"), "A disciplined leader");
      for (const key of ["body", "mind", "habits", "relationships", "environment"]) {
        fireEvent.changeText(getByTestId(`vision-domain-${key}`), `${key} future`);
      }
      fireEvent.press(getByTestId("vision-save-button"));
      await waitFor(() => {
        expect(getUpgradeSheetGate()).not.toBeNull();
      });
      expect(getUpgradeSheetGate()?.feature).toBe("vision");
      hideUpgradeSheet();

      // Door 2: PATCH { action: align } (alignment check)
      // Seed a vision so the alignment row renders.
      mockedApiFetch.mockImplementation(async (path: string, _s: any, opts: any = {}) => {
        if (path === "/api/mind/vision" && (!opts.method || opts.method === "GET")) {
          return {
            vision: {
              identityStatement: "A disciplined leader",
              body: "b",
              mind: "m",
              habits: "h",
              relationships: "r",
              environment: "e",
            },
            alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false },
          };
        }
        if (path.startsWith("/api/mind/journal")) return { entries: [], counts: {} };
        throw gateError();
      });
      const second = render(<VisionDashboard />);
      await waitFor(() => {
        expect(second.getByTestId("vision-align-4")).toBeTruthy();
      });
      fireEvent.press(second.getByTestId("vision-align-4"));
      await waitFor(() => {
        expect(getUpgradeSheetGate()).not.toBeNull();
      });
      expect(getUpgradeSheetGate()?.feature).toBe("vision");
      hideUpgradeSheet();

      // Door 3: POST /api/mind/journal { system: vision } (protocol save).
      // A protocol run saves through the journal door; the 403 raises the
      // sheet. Drive it through the first ("See the Future You") card, which
      // is open at 0 reps (1 + reps open). Its second step is the input step.
      mockedApiFetch.mockImplementation(async (path: string, _s: any, opts: any = {}) => {
        if (path === "/api/mind/vision" && (!opts.method || opts.method === "GET")) {
          return {
            vision: {
              identityStatement: "A disciplined leader",
              body: "b",
              mind: "m",
              habits: "h",
              relationships: "r",
              environment: "e",
            },
            alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false },
          };
        }
        if (path.startsWith("/api/mind/journal") && (!opts.method || opts.method === "GET")) {
          return { entries: [], counts: {} };
        }
        throw gateError();
      });
      const third = render(<VisionDashboard />);
      await waitFor(() => {
        expect(third.getByTestId("mind-toolkit-card-see-the-future-you")).toBeTruthy();
      });
      fireEvent.press(third.getByTestId("mind-toolkit-card-see-the-future-you"));
      await waitFor(() => {
        expect(third.getByTestId("guided-flow-screen")).toBeTruthy();
      });
      // Step 0 is info-only; advance to the input step.
      fireEvent.press(third.getByTestId("guided-flow-next"));
      await waitFor(() => {
        expect(third.getByTestId("guided-flow-input")).toBeTruthy();
      });
      fireEvent.changeText(third.getByTestId("guided-flow-input"), "Prep tomorrow's session");
      fireEvent.press(third.getByTestId("guided-flow-next"));
      // Closing step: no input, just finish.
      await waitFor(() => {
        expect(third.getByTestId("guided-flow-next")).toBeTruthy();
      });
      fireEvent.press(third.getByTestId("guided-flow-next"));
      await waitFor(() => {
        expect(getUpgradeSheetGate()).not.toBeNull();
      });
      expect(getUpgradeSheetGate()?.feature).toBe("vision");
      hideUpgradeSheet();

      // Door 4: POST /api/ai/mind/flow { system: vision } — never composes for a free member.
      // The run client raises the sheet itself for the 403; the dashboard
      // must not compose a flow from a gated run.
      mockedRunAiTask.mockClear();
      mockedRunAiTask.mockResolvedValue({
        ok: false,
        error: "entitlement",
        gate: VISION_GATE_BODY,
      });
      fireEvent.press(third.getByTestId("mind-adaptive-session"));
      await waitFor(() => {
        expect(mockedRunAiTask).toHaveBeenCalled();
      });
      expect(mockedRunAiTask.mock.calls[0]?.[1]).toMatchObject({ system: "vision" });
      // The gated run resolves with a gate and no steps: no flow is composed.
      expect(third.queryByTestId("guided-flow-screen")).toBeNull();
      await waitFor(() => {
        expect(getUpgradeSheetGate()).not.toBeNull();
      });
      expect(getUpgradeSheetGate()?.feature).toBe("vision");
    });
  });

  describe("Acceptance Criterion e015ca24: Plus member saves all five domains natively and they show on the web", () => {
    it("POSTs identity + five domains with numeric tz and the web GET reads them back", async () => {
      plusEntitlements();
      const calls: { path: string; method: string; body?: any; tz?: number }[] = [];
      let stored: any = null;

      mockedApiFetch.mockImplementation(async (path: string, _s: any, opts: any = {}) => {
        calls.push({ path, method: opts.method ?? "GET", body: opts.body, tz: opts.tz });
        if (path === "/api/mind/vision" && (!opts.method || opts.method === "GET")) {
          // What the web reads: GET /api/mind/vision returns the stored doc.
          return {
            vision: stored,
            alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false },
          };
        }
        if (path === "/api/mind/vision" && opts.method === "POST") {
          expect(typeof opts.tz).toBe("number");
          stored = { ...opts.body };
          return { vision: stored, xpGained: 75, xp: 75 };
        }
        if (path.startsWith("/api/mind/journal")) return { entries: [], counts: {} };
        return {};
      });

      const { getByTestId } = render(<VisionDashboard />);

      await waitFor(() => {
        expect(getByTestId("vision-dashboard")).toBeTruthy();
        expect(getByTestId("vision-paint-button")).toBeTruthy();
      });

      fireEvent.press(getByTestId("vision-paint-button"));
      await waitFor(() => {
        expect(getByTestId("vision-edit-form")).toBeTruthy();
      });

      fireEvent.changeText(getByTestId("vision-identity-input"), "A disciplined, present leader");
      fireEvent.changeText(getByTestId("vision-domain-body"), "Lean and energized");
      fireEvent.changeText(getByTestId("vision-domain-mind"), "Calm and focused");
      fireEvent.changeText(getByTestId("vision-domain-habits"), "Train on schedule");
      fireEvent.changeText(getByTestId("vision-domain-relationships"), "Present and dependable");
      fireEvent.changeText(getByTestId("vision-domain-environment"), "Ordered space");

      await act(async () => {
        fireEvent.press(getByTestId("vision-save-button"));
      });

      await waitFor(() => {
        const post = calls.find((c) => c.path === "/api/mind/vision" && c.method === "POST");
        expect(post).toBeDefined();
        expect(post?.body?.identityStatement).toBe("A disciplined, present leader");
        expect(post?.body?.body).toBe("Lean and energized");
        expect(post?.body?.mind).toBe("Calm and focused");
        expect(post?.body?.habits).toBe("Train on schedule");
        expect(post?.body?.relationships).toBe("Present and dependable");
        expect(post?.body?.environment).toBe("Ordered space");
        expect(typeof post?.tz).toBe("number");
      });

      // The web reads the same route: re-GET and assert all six values.
      const webRead = await mockedApiFetch("/api/mind/vision", null, { tz: 0 });
      expect(webRead.vision.identityStatement).toBe("A disciplined, present leader");
      expect(webRead.vision.body).toBe("Lean and energized");
      expect(webRead.vision.mind).toBe("Calm and focused");
      expect(webRead.vision.habits).toBe("Train on schedule");
      expect(webRead.vision.relationships).toBe("Present and dependable");
      expect(webRead.vision.environment).toBe("Ordered space");

      // Native profile renders the saved domains.
      await waitFor(() => {
        expect(getByTestId("vision-profile")).toBeTruthy();
        expect(getByTestId("vision-identity")).toHaveTextContent("A disciplined, present leader");
        expect(getByTestId("vision-domain-text-body")).toHaveTextContent("Lean and energized");
        expect(getByTestId("vision-domain-text-mind")).toHaveTextContent("Calm and focused");
        expect(getByTestId("vision-domain-text-habits")).toHaveTextContent("Train on schedule");
        expect(getByTestId("vision-domain-text-relationships")).toHaveTextContent(
          "Present and dependable",
        );
        expect(getByTestId("vision-domain-text-environment")).toHaveTextContent("Ordered space");
      });
    });
  });

  describe("Acceptance Criterion e015ca25: daily alignment score saved natively appears on the web for the same day", () => {
    it("PATCHes { action: align, score } with numeric tz and the web GET shows checkedToday + todayScore", async () => {
      plusEntitlements();
      const calls: { path: string; method: string; body?: any; tz?: number }[] = [];
      let todayScore: number | null = null;

      mockedApiFetch.mockImplementation(async (path: string, _s: any, opts: any = {}) => {
        calls.push({ path, method: opts.method ?? "GET", body: opts.body, tz: opts.tz });
        if (path === "/api/mind/vision" && (!opts.method || opts.method === "GET")) {
          return {
            vision: {
              identityStatement: "A disciplined leader",
              body: "b",
              mind: "m",
              habits: "h",
              relationships: "r",
              environment: "e",
            },
            alignment: {
              avg7: todayScore ?? 0,
              entries7: todayScore === null ? 0 : 1,
              todayScore,
              checkedToday: todayScore !== null,
            },
          };
        }
        if (path === "/api/mind/vision" && opts.method === "PATCH") {
          expect(opts.body?.action).toBe("align");
          expect(opts.body?.score).toBe(4);
          expect(typeof opts.tz).toBe("number");
          todayScore = 4;
          return {
            alignment: { avg7: 4, entries7: 1, todayScore: 4, checkedToday: true },
          };
        }
        if (path.startsWith("/api/mind/journal")) return { entries: [], counts: {} };
        return {};
      });

      const { getByTestId } = render(<VisionDashboard />);

      await waitFor(() => {
        expect(getByTestId("vision-align-4")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("vision-align-4"));
      });

      await waitFor(() => {
        const patch = calls.find((c) => c.path === "/api/mind/vision" && c.method === "PATCH");
        expect(patch).toBeDefined();
        expect(patch?.body).toMatchObject({ action: "align", score: 4 });
        expect(typeof patch?.tz).toBe("number");
      });

      // The web reads the same route for the same day.
      const webRead = await mockedApiFetch("/api/mind/vision", null, { tz: 0 });
      expect(webRead.alignment.checkedToday).toBe(true);
      expect(webRead.alignment.todayScore).toBe(4);

      // Native status line reflects the check.
      await waitFor(() => {
        expect(getByTestId("vision-align-status")).toHaveTextContent("Today’s alignment · 4/5");
      });
    });
  });
});
