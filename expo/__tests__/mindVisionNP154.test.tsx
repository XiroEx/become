/* eslint-disable import/first */
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "@become/api-client";

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
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

jest.mock("@/lib/feedback/haptics", () => ({
  lightHaptic: jest.fn(),
  celebrationHaptic: jest.fn(),
  successHaptic: jest.fn(),
  selectionHaptic: jest.fn(),
}));

jest.mock("@/lib/ai/runClient", () => ({
  runAiTask: jest.fn(),
}));

let mockEntitlementsState = {
  data: {
    enforced: true,
    features: {
      vision: { allowed: false, feature: "vision", requiresTier: "plus" },
    },
  } as any,
  feature: (_f: string) => null as any,
};

jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    __esModule: true,
    ...actual,
    useEntitlements: () => mockEntitlementsState,
  };
});

import { apiFetch } from "@become/api-client";
import { runAiTask } from "@/lib/ai/runClient";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";
import VisionDashboard from "../components/mind/VisionDashboard";
import MindSectionRoute from "../app/(app)/(tabs)/mind/[section]";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;
const mockedRunAiTask = runAiTask as unknown as jest.Mock;

const VISION_GET = {
  vision: {
    identityStatement: "A disciplined, present leader",
    body: "Lean and strong",
    mind: "Calm and focused",
    habits: "Train on schedule",
    relationships: "Present and dependable",
    environment: "Ordered space",
  },
  alignment: { avg7: 4, entries7: 3, todayScore: null, checkedToday: false },
};

const EMPTY_JOURNAL = { entries: [], counts: {} };

function freeVisionState() {
  mockEntitlementsState = {
    data: {
      enforced: true,
      features: {
        vision: { allowed: false, feature: "vision", requiresTier: "plus" },
      },
    },
    feature: (f: string) =>
      f === "vision"
        ? ({ allowed: false, feature: "vision", requiresTier: "plus" } as any)
        : null,
  };
}

function plusVisionState() {
  mockEntitlementsState = {
    data: {
      enforced: true,
      features: {
        vision: { allowed: true, feature: "vision", requiresTier: "plus" },
      },
    },
    feature: (f: string) =>
      f === "vision"
        ? ({ allowed: true, feature: "vision", requiresTier: "plus" } as any)
        : null,
  };
}

const VISION_GATE_BODY = {
  error: "Vision is included with Plus.",
  feature: "vision",
  requiresTier: "plus",
  limit: 0,
  remaining: 0,
  resetsAt: null,
  window: "lifetime",
};

describe("Vision native port (NP-154)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    hideUpgradeSheet();
    freeVisionState();
  });

  describe("e015ca23: free member sees Vision locked, tap raises the upgrade sheet", () => {
    it("renders the TierGate teaser instead of the dashboard for a free member", async () => {
      mockParams = { section: "vision" };
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/progress") {
          return {
            chapter: 2,
            unlockedSystems: ["state-shift", "self-image", "vision"],
            introducedSystems: ["vision"],
          };
        }
        return {};
      });

      const { getByTestId, queryByTestId } = render(<MindSectionRoute />);

      await waitFor(() => {
        expect(getByTestId("tier-gate-teaser")).toBeTruthy();
      });
      expect(queryByTestId("vision-dashboard")).toBeNull();
      expect(getByTestId("tier-gate-tier")).toHaveTextContent("Plus");
    });

    it("tapping the teaser opens the upgrade sheet", async () => {
      mockParams = { section: "vision" };
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/progress") {
          return {
            chapter: 2,
            unlockedSystems: ["state-shift", "self-image", "vision"],
            introducedSystems: ["vision"],
          };
        }
        return {};
      });

      const { getByTestId } = render(<MindSectionRoute />);

      const teaser = await waitFor(() => getByTestId("tier-gate-teaser"));
      await act(async () => {
        fireEvent.press(teaser);
      });

      const gate = getUpgradeSheetGate();
      expect(gate).toBeTruthy();
      expect(gate?.feature).toBe("vision");
    });

    it("a 403 from any of the four doors raises the upgrade sheet", async () => {
      plusVisionState();
      const calls: { path: string; method: string }[] = [];
      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({ path, method: opts.method ?? "GET" });
          if (path === "/api/mind/vision" && (!opts.method || opts.method === "GET")) {
            return VISION_GET;
          }
          if (path.startsWith("/api/mind/journal") && (!opts.method || opts.method === "GET")) {
            return EMPTY_JOURNAL;
          }
          // POST vision, PATCH align, POST journal, AI flow: all gated
          throw new ApiError(403, VISION_GATE_BODY);
        },
      );
      mockedRunAiTask.mockResolvedValue({
        ok: false,
        gate: VISION_GATE_BODY,
      });

      const { getByTestId } = render(<VisionDashboard />);

      await waitFor(() => {
        expect(getByTestId("vision-dashboard")).toBeTruthy();
      });

      // 1. POST /api/mind/vision — save the domains form
      fireEvent.press(getByTestId("vision-edit-button"));
      fireEvent.changeText(getByTestId("vision-edit-identity"), "A leader");
      for (const key of ["body", "mind", "habits", "relationships", "environment"]) {
        fireEvent.changeText(getByTestId(`vision-edit-${key}`), `${key} text`);
      }
      await act(async () => {
        fireEvent.press(getByTestId("vision-edit-save"));
      });
      await waitFor(() => {
        expect(getUpgradeSheetGate()).toBeTruthy();
      });
      expect(getUpgradeSheetGate()?.feature).toBe("vision");
      hideUpgradeSheet();

      // 2. PATCH align — daily alignment
      await act(async () => {
        fireEvent.press(getByTestId("vision-align-4"));
      });
      await waitFor(() => {
        expect(getUpgradeSheetGate()).toBeTruthy();
      });
      hideUpgradeSheet();

      // 3. POST /api/mind/journal — protocol completion (see-future-you has
      // an input step, then an info step; the last step reflects, so finish
      // through the reflect view when it appears)
      await act(async () => {
        fireEvent.press(getByTestId("mind-toolkit-card-see-future-you"));
      });
      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });
      // Step 1 is info-only: advance.
      fireEvent.press(getByTestId("guided-flow-next"));
      await waitFor(() => {
        expect(getByTestId("guided-flow-input")).toBeTruthy();
      });
      // Step 2 asks for the day: answer and advance to the close.
      fireEvent.changeText(getByTestId("guided-flow-input"), "My future day");
      fireEvent.press(getByTestId("guided-flow-next"));
      await waitFor(() => {
        expect(getByTestId("guided-flow-reflect-finish")).toBeTruthy();
      });
      await act(async () => {
        fireEvent.press(getByTestId("guided-flow-reflect-finish"));
      });
      // The done view completes 400ms later; the journal POST (gated) lands after.
      await waitFor(() => {
        expect(getUpgradeSheetGate()).toBeTruthy();
      });
      hideUpgradeSheet();

      // 4. AI flow — gated answer raises the sheet, no static fallback
      await act(async () => {
        fireEvent.press(getByTestId("mind-adaptive-session"));
      });
      await waitFor(() => {
        expect(getUpgradeSheetGate()).toBeTruthy();
      });
      expect(getUpgradeSheetGate()?.feature).toBe("vision");
    });

    it("never composes a vision flow for a free member (pre-check, no dispatch)", async () => {
      freeVisionState();
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/vision") return VISION_GET;
        if (path.startsWith("/api/mind/journal")) return EMPTY_JOURNAL;
        return {};
      });
      mockedRunAiTask.mockResolvedValue({ ok: true, result: { steps: [] } });

      const { getByTestId } = render(<VisionDashboard />);

      await waitFor(() => {
        expect(getByTestId("vision-dashboard")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("mind-adaptive-session"));
      });

      expect(mockedRunAiTask).not.toHaveBeenCalled();
      expect(getUpgradeSheetGate()).toBeTruthy();
      expect(getUpgradeSheetGate()?.feature).toBe("vision");
    });
  });

  describe("e015ca24: Plus member saves all five domains, web sees them", () => {
    it("POSTs identityStatement + all five domains and shows them after reload", async () => {
      plusVisionState();
      const calls: { path: string; method: string; body?: any; tz?: number }[] = [];
      // Server-side store: what the web GET would read back.
      let stored: any = null;

      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({
            path,
            method: opts.method ?? "GET",
            body: opts.body,
            tz: opts.tz,
          });
          if (path === "/api/mind/vision" && (!opts.method || opts.method === "GET")) {
            return stored
              ? { vision: stored, alignment: VISION_GET.alignment }
              : { vision: null, alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false } };
          }
          if (path === "/api/mind/vision" && opts.method === "POST") {
            expect(typeof opts.tz).toBe("number");
            stored = { ...opts.body };
            return { vision: stored, xpGained: 75, xp: 75 };
          }
          if (path.startsWith("/api/mind/journal")) return EMPTY_JOURNAL;
          return {};
        },
      );

      const { getByTestId } = render(<VisionDashboard />);

      // Empty state first
      await waitFor(() => {
        expect(getByTestId("vision-define-button")).toBeTruthy();
      });

      fireEvent.press(getByTestId("vision-define-button"));
      fireEvent.changeText(getByTestId("vision-edit-identity"), "A disciplined, present leader");
      fireEvent.changeText(getByTestId("vision-edit-body"), "Lean and strong");
      fireEvent.changeText(getByTestId("vision-edit-mind"), "Calm and focused");
      fireEvent.changeText(getByTestId("vision-edit-habits"), "Train on schedule");
      fireEvent.changeText(getByTestId("vision-edit-relationships"), "Present and dependable");
      fireEvent.changeText(getByTestId("vision-edit-environment"), "Ordered space");

      await act(async () => {
        fireEvent.press(getByTestId("vision-edit-save"));
      });

      await waitFor(() => {
        const post = calls.find(
          (c) => c.path === "/api/mind/vision" && c.method === "POST",
        );
        expect(post).toBeDefined();
        expect(post?.body?.identityStatement).toBe("A disciplined, present leader");
        expect(post?.body?.body).toBe("Lean and strong");
        expect(post?.body?.mind).toBe("Calm and focused");
        expect(post?.body?.habits).toBe("Train on schedule");
        expect(post?.body?.relationships).toBe("Present and dependable");
        expect(post?.body?.environment).toBe("Ordered space");
      });

      // The web reads the same route: GET returns what native saved.
      const webRead = await mockedApiFetch("/api/mind/vision", null, { tz: 0 });
      expect(webRead.vision.identityStatement).toBe("A disciplined, present leader");
      expect(webRead.vision.body).toBe("Lean and strong");
      expect(webRead.vision.mind).toBe("Calm and focused");
      expect(webRead.vision.habits).toBe("Train on schedule");
      expect(webRead.vision.relationships).toBe("Present and dependable");
      expect(webRead.vision.environment).toBe("Ordered space");

      // And the native profile shows all five domains.
      await waitFor(() => {
        expect(getByTestId("vision-profile")).toBeTruthy();
      });
      expect(getByTestId("vision-statement")).toHaveTextContent(
        "A disciplined, present leader",
      );
      for (const key of ["body", "mind", "habits", "relationships", "environment"]) {
        expect(getByTestId(`vision-domain-${key}`)).toBeTruthy();
      }
    });
  });

  describe("e015ca25: daily alignment saved natively appears on web for same day", () => {
    it("PATCHes { action: align, score } with numeric tz and web reads checkedToday", async () => {
      plusVisionState();
      const calls: { path: string; method: string; body?: any; tz?: number }[] = [];
      let todayScore: number | null = null;

      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({
            path,
            method: opts.method ?? "GET",
            body: opts.body,
            tz: opts.tz,
          });
          if (path === "/api/mind/vision" && (!opts.method || opts.method === "GET")) {
            return {
              vision: VISION_GET.vision,
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
          if (path.startsWith("/api/mind/journal")) return EMPTY_JOURNAL;
          return {};
        },
      );

      const { getByTestId } = render(<VisionDashboard />);

      await waitFor(() => {
        expect(getByTestId("vision-align-card")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("vision-align-4"));
      });

      await waitFor(() => {
        const patch = calls.find(
          (c) => c.path === "/api/mind/vision" && c.method === "PATCH",
        );
        expect(patch).toBeDefined();
        expect(patch?.body).toMatchObject({ action: "align", score: 4 });
        expect(typeof patch?.tz).toBe("number");
      });

      // The web reads the same route for the same day.
      const webRead = await mockedApiFetch("/api/mind/vision", null, { tz: 0 });
      expect(webRead.alignment.checkedToday).toBe(true);
      expect(webRead.alignment.todayScore).toBe(4);

      // Native reflects it too.
      await waitFor(() => {
        expect(getByTestId("vision-align-status")).toHaveTextContent(
          "Today’s alignment · 4/5",
        );
      });
    });
  });
});
