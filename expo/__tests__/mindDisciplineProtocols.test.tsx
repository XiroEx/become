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

import { apiFetch } from "@become/api-client";
import { runAiTask } from "@/lib/ai/runClient";
import DisciplineDashboard from "@/components/mind/DisciplineDashboard";
import AntiSabotageDashboard from "@/components/mind/AntiSabotageDashboard";
import SocialDashboard from "@/components/mind/SocialDashboard";
import MindSectionRoute from "@/app/(app)/(tabs)/mind/[section]";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;
const mockedRunAiTask = runAiTask as unknown as jest.Mock;

describe("Mind Discipline, Anti-Sabotage and Social (NP-152)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  describe("Acceptance Criterion e015ca19: Non-negotiable checked off natively shows as done on web for same day", () => {
    it("checks off non-negotiable with numeric tz offset and reflects checkedToday on web read", async () => {
      const calls: { path: string; method: string; body?: any; tz?: number }[] = [];
      let lastCheckedKey: string | null = null;
      let currentStreak = 3;

      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({
            path,
            method: opts.method ?? "GET",
            body: opts.body,
            tz: opts.tz,
          });

          if (path === "/api/mind/non-negotiables" && (!opts.method || opts.method === "GET")) {
            // Emulate what web GET /api/mind/non-negotiables?tz= returns based on stored doc
            const todayKey = "2026-10-02";
            return {
              items: [
                {
                  id: "nonneg-1",
                  text: "Train even on bad days",
                  currentStreak,
                  longestStreak: 5,
                  checkedToday: lastCheckedKey === todayKey,
                },
              ],
            };
          }

          if (
            path === "/api/mind/non-negotiables" &&
            opts.method === "PATCH" &&
            opts.body?.action === "check"
          ) {
            // Server updates doc with today's key using the passed numeric tz
            expect(typeof opts.tz).toBe("number");
            lastCheckedKey = "2026-10-02";
            currentStreak += 1;
            return {
              currentStreak,
              longestStreak: 5,
              checkedToday: true,
            };
          }

          if (path.startsWith("/api/mind/journal")) {
            return { entries: [], counts: {} };
          }

          if (path === "/api/mind/discipline") {
            return {
              challenge: {
                date: "2026-10-02",
                challenge: "Take a cold shower for 2 minutes",
                completed: false,
              },
            };
          }

          return {};
        },
      );

      const { getByTestId } = render(<DisciplineDashboard />);

      // Wait for dashboard to load
      await waitFor(() => {
        expect(getByTestId("discipline-dashboard")).toBeTruthy();
        expect(getByTestId("mind-nonneg-item-nonneg-1")).toBeTruthy();
        expect(getByTestId("mind-nonneg-text-nonneg-1")).toHaveTextContent(
          "Train even on bad days",
        );
      });

      // Press check button
      fireEvent.press(getByTestId("mind-nonneg-check-nonneg-1"));

      // Verify PATCH was called with id, action check, and numeric tz offset
      await waitFor(() => {
        const patchCall = calls.find(
          (c) =>
            c.path === "/api/mind/non-negotiables" &&
            c.method === "PATCH" &&
            c.body?.action === "check",
        );
        expect(patchCall).toBeDefined();
        expect(patchCall?.body?.id).toBe("nonneg-1");
        expect(typeof patchCall?.tz).toBe("number");
      });

      // Simulate web client reading GET /api/mind/non-negotiables?tz= for the same day
      const webResult = await mockedApiFetch("/api/mind/non-negotiables", null, {
        method: "GET",
        tz: calls[0]?.tz,
      });

      expect(webResult.items[0]?.checkedToday).toBe(true);
      expect(webResult.items[0]?.currentStreak).toBe(4);
    });

    it("supports adding and removing non-negotiables natively", async () => {
      const calls: { path: string; method: string; body?: any; tz?: number }[] = [];
      const items = [
        {
          id: "nonneg-1",
          text: "First standard",
          currentStreak: 1,
          longestStreak: 1,
          checkedToday: false,
        },
      ];

      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({
            path,
            method: opts.method ?? "GET",
            body: opts.body,
            tz: opts.tz,
          });

          if (path === "/api/mind/non-negotiables" && (!opts.method || opts.method === "GET")) {
            return { items };
          }
          if (path === "/api/mind/non-negotiables" && opts.method === "POST") {
            const newItem = {
              id: "nonneg-2",
              text: opts.body.text,
              currentStreak: 0,
              longestStreak: 0,
              checkedToday: false,
            };
            items.push(newItem);
            return { id: "nonneg-2", text: opts.body.text };
          }
          if (
            path === "/api/mind/non-negotiables" &&
            opts.method === "PATCH" &&
            opts.body?.action === "deactivate"
          ) {
            const idx = items.findIndex((x) => x.id === opts.body.id);
            if (idx >= 0) items.splice(idx, 1);
            return { ok: true };
          }
          if (path.startsWith("/api/mind/journal")) {
            return { entries: [], counts: {} };
          }
          if (path === "/api/mind/discipline") {
            return { challenge: null };
          }
          return {};
        },
      );

      const { getByTestId, queryByTestId } = render(<DisciplineDashboard />);

      await waitFor(() => {
        expect(getByTestId("mind-nonneg-item-nonneg-1")).toBeTruthy();
      });

      // Add new non-negotiable using input
      fireEvent.changeText(
        getByTestId("mind-nonneg-input"),
        "No sugar after 8pm",
      );
      fireEvent.press(getByTestId("mind-nonneg-add"));

      await waitFor(() => {
        const postCall = calls.find(
          (c) => c.path === "/api/mind/non-negotiables" && c.method === "POST",
        );
        expect(postCall).toBeDefined();
        expect(postCall?.body?.text).toBe("No sugar after 8pm");
      });

      // Remove existing non-negotiable
      fireEvent.press(getByTestId("mind-nonneg-remove-nonneg-1"));

      await waitFor(() => {
        const deactivateCall = calls.find(
          (c) =>
            c.path === "/api/mind/non-negotiables" &&
            c.method === "PATCH" &&
            c.body?.action === "deactivate",
        );
        expect(deactivateCall).toBeDefined();
        expect(deactivateCall?.body?.id).toBe("nonneg-1");
      });

      // Should be removed optimistically
      expect(queryByTestId("mind-nonneg-item-nonneg-1")).toBeNull();
    });

    it("completes today's hard thing challenge", async () => {
      const calls: { path: string; method: string; body?: any }[] = [];
      let challengeCompleted = false;
      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({ path, method: opts.method ?? "GET", body: opts.body });
          if (path === "/api/mind/non-negotiables") {
            return { items: [] };
          }
          if (path.startsWith("/api/mind/journal")) {
            return { entries: [], counts: {} };
          }
          if (path === "/api/mind/discipline" && (!opts.method || opts.method === "GET")) {
            return {
              challenge: {
                date: "2026-10-02",
                challenge: "Finish the hardest workout first thing",
                completed: challengeCompleted,
              },
            };
          }
          if (path === "/api/mind/discipline" && opts.method === "POST") {
            challengeCompleted = true;
            return {
              challenge: {
                date: "2026-10-02",
                challenge: "Finish the hardest workout first thing",
                completed: true,
              },
            };
          }
          return {};
        },
      );

      const { getByTestId } = render(<DisciplineDashboard />);

      await waitFor(() => {
        expect(getByTestId("mind-hard-thing-card")).toBeTruthy();
        expect(getByTestId("mind-hard-thing-done-btn")).toBeTruthy();
      });

      fireEvent.press(getByTestId("mind-hard-thing-done-btn"));

      await waitFor(() => {
        const completeCall = calls.find(
          (c) =>
            c.path === "/api/mind/discipline" &&
            c.method === "POST" &&
            c.body?.action === "complete",
        );
        expect(completeCall).toBeDefined();

        const journalCall = calls.find(
          (c) =>
            c.path === "/api/mind/journal" &&
            c.method === "POST" &&
            c.body?.kind === "did-the-hard-thing",
        );
        expect(journalCall).toBeDefined();
        expect(journalCall?.body?.system).toBe("discipline");
      });

      await waitFor(() => {
        expect(getByTestId("mind-hard-thing-done")).toBeTruthy();
      });
    });
  });

  describe("Acceptance Criterion e015ca1a: Anti-Sabotage and Social protocols run natively and record entries web shows", () => {
    it("runs Anti-Sabotage protocol natively and logs journal entry that appears in track record", async () => {
      const calls: { path: string; method: string; body?: any }[] = [];
      const journalEntries: {
        id: string;
        system: string;
        title: string;
        kind: string;
        createdAt: string;
      }[] = [];

      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({ path, method: opts.method ?? "GET", body: opts.body });

          if (path.startsWith("/api/mind/journal") && (!opts.method || opts.method === "GET")) {
            return {
              entries: journalEntries,
              counts: { "pattern-recognition": journalEntries.length },
            };
          }

          if (path === "/api/mind/journal" && opts.method === "POST") {
            const entry = {
              id: `as-${Date.now()}`,
              system: opts.body.system,
              title: opts.body.title,
              kind: opts.body.kind,
              createdAt: new Date().toISOString(),
            };
            journalEntries.push(entry);
            return { id: entry.id };
          }

          return {};
        },
      );

      const { getByTestId } = render(<AntiSabotageDashboard />);

      await waitFor(() => {
        expect(getByTestId("anti-sabotage-dashboard")).toBeTruthy();
        expect(
          getByTestId("mind-toolkit-card-pattern-recognition"),
        ).toBeTruthy();
      });

      // Start Pattern Recognition protocol
      fireEvent.press(getByTestId("mind-toolkit-card-pattern-recognition"));

      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });

      // Step 0: Choice -> "The messy middle"
      await waitFor(() => {
        expect(getByTestId("guided-flow-choice-1")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-choice-1"));

      // Step 1: Input step
      await waitFor(() => {
        expect(getByTestId("guided-flow-input")).toBeTruthy();
      });
      fireEvent.changeText(
        getByTestId("guided-flow-input"),
        "I slow down right when routine gets boring",
      );
      fireEvent.press(getByTestId("guided-flow-next"));

      // Step 2: Final info step
      await waitFor(() => {
        expect(getByTestId("guided-flow-next")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-next"));

      // Verify POST /api/mind/journal was called
      await waitFor(() => {
        const postCall = calls.find(
          (c) =>
            c.path === "/api/mind/journal" &&
            c.method === "POST" &&
            c.body?.system === "anti-sabotage",
        );
        expect(postCall).toBeDefined();
        expect(postCall?.body?.title).toBe("Pattern Recognition");
        expect(postCall?.body?.kind).toBe("protocol");
      });

      // Web read verification: GET /api/mind/journal?system=anti-sabotage returns the entry
      const webJournal = await mockedApiFetch(
        "/api/mind/journal?system=anti-sabotage&limit=8",
      );
      expect(webJournal.entries.length).toBe(1);
      expect(webJournal.entries[0]?.title).toBe("Pattern Recognition");
    });

    it("records Anti-Sabotage one-tap pattern catch", async () => {
      const calls: { path: string; method: string; body?: any }[] = [];
      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({ path, method: opts.method ?? "GET", body: opts.body });
          if (path.startsWith("/api/mind/journal")) {
            return { entries: [], counts: {} };
          }
          return {};
        },
      );

      const { getByTestId } = render(<AntiSabotageDashboard />);

      await waitFor(() => {
        expect(getByTestId("mind-anti-sabotage-catch-button")).toBeTruthy();
      });

      fireEvent.press(getByTestId("mind-anti-sabotage-catch-button"));

      await waitFor(() => {
        const catchCall = calls.find(
          (c) =>
            c.path === "/api/mind/journal" &&
            c.method === "POST" &&
            c.body?.kind === "pattern-catch",
        );
        expect(catchCall).toBeDefined();
        expect(catchCall?.body?.system).toBe("anti-sabotage");
      });
    });

    it("runs Social protocol natively and records connection outreach", async () => {
      const calls: { path: string; method: string; body?: any }[] = [];
      const socialEntries: {
        id: string;
        system: string;
        title: string;
        kind: string;
        createdAt: string;
      }[] = [];

      mockedApiFetch.mockImplementation(
        async (path: string, _schema: any, opts: any = {}) => {
          calls.push({ path, method: opts.method ?? "GET", body: opts.body });

          if (path.startsWith("/api/mind/journal") && (!opts.method || opts.method === "GET")) {
            return {
              entries: socialEntries,
              counts: { connect: socialEntries.filter((e) => e.kind === "connect").length },
            };
          }

          if (path === "/api/mind/journal" && opts.method === "POST") {
            const entry = {
              id: `soc-${Date.now()}`,
              system: opts.body.system,
              title: opts.body.title,
              kind: opts.body.kind,
              createdAt: new Date().toISOString(),
            };
            socialEntries.push(entry);
            return { id: entry.id };
          }

          return {};
        },
      );

      const { getByTestId } = render(<SocialDashboard />);

      await waitFor(() => {
        expect(getByTestId("social-dashboard")).toBeTruthy();
        expect(getByTestId("mind-social-reached-button")).toBeTruthy();
      });

      // Press "I reached out"
      fireEvent.press(getByTestId("mind-social-reached-button"));

      await waitFor(() => {
        const connectCall = calls.find(
          (c) =>
            c.path === "/api/mind/journal" &&
            c.method === "POST" &&
            c.body?.kind === "connect",
        );
        expect(connectCall).toBeDefined();
        expect(connectCall?.body?.system).toBe("social");
      });

      // Run Circle Audit protocol
      fireEvent.press(getByTestId("mind-toolkit-card-circle-audit"));

      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });

      // Step 0: Input "Who pulls you UP?"
      fireEvent.changeText(
        getByTestId("guided-flow-input"),
        "My workout partner and coach",
      );
      fireEvent.press(getByTestId("guided-flow-next"));

      // Step 1: Input "Who pulls you DOWN?"
      await waitFor(() => {
        expect(getByTestId("guided-flow-input")).toBeTruthy();
      });
      fireEvent.changeText(
        getByTestId("guided-flow-input"),
        "The group chat that only complains",
      );
      fireEvent.press(getByTestId("guided-flow-next"));

      // Step 2: Choice step
      await waitFor(() => {
        expect(getByTestId("guided-flow-choice-0")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-choice-0"));

      // Step 3: Final step
      await waitFor(() => {
        expect(getByTestId("guided-flow-next")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-next"));

      // Verify journal post for Circle Audit
      await waitFor(() => {
        const auditCall = calls.find(
          (c) =>
            c.path === "/api/mind/journal" &&
            c.method === "POST" &&
            c.body?.title === "Circle Audit",
        );
        expect(auditCall).toBeDefined();
        expect(auditCall?.body?.system).toBe("social");
      });

      // Verify web read sees both entries
      const webJournal = await mockedApiFetch("/api/mind/journal?system=social&limit=8");
      expect(webJournal.entries.length).toBe(2);
    });
  });

  describe("Mind Section Route [section].tsx Native Parity", () => {
    it("renders DisciplineDashboard when section is discipline", async () => {
      mockParams = { section: "discipline" };
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/progress") {
          return {
            chapter: 5,
            unlockedSystems: ["discipline", "anti-sabotage", "social"],
            introducedSystems: ["discipline", "anti-sabotage", "social"],
          };
        }
        if (path === "/api/mind/non-negotiables") return { items: [] };
        if (path.startsWith("/api/mind/journal")) return { entries: [] };
        if (path === "/api/mind/discipline") return { challenge: null };
        return {};
      });

      const { getByTestId } = render(<MindSectionRoute />);

      await waitFor(() => {
        expect(getByTestId("discipline-dashboard")).toBeTruthy();
      });
    });

    it("renders AntiSabotageDashboard when section is anti-sabotage", async () => {
      mockParams = { section: "anti-sabotage" };
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/progress") {
          return {
            chapter: 5,
            unlockedSystems: ["discipline", "anti-sabotage", "social"],
            introducedSystems: ["discipline", "anti-sabotage", "social"],
          };
        }
        if (path.startsWith("/api/mind/journal")) return { entries: [] };
        return {};
      });

      const { getByTestId } = render(<MindSectionRoute />);

      await waitFor(() => {
        expect(getByTestId("anti-sabotage-dashboard")).toBeTruthy();
      });
    });

    it("renders SocialDashboard when section is social", async () => {
      mockParams = { section: "social" };
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/progress") {
          return {
            chapter: 5,
            unlockedSystems: ["discipline", "anti-sabotage", "social"],
            introducedSystems: ["discipline", "anti-sabotage", "social"],
          };
        }
        if (path.startsWith("/api/mind/journal")) return { entries: [] };
        return {};
      });

      const { getByTestId } = render(<MindSectionRoute />);

      await waitFor(() => {
        expect(getByTestId("social-dashboard")).toBeTruthy();
      });
    });
  });

  describe("AI Flow Fallback in Discipline, Anti-Sabotage and Social", () => {
    it("falls back to static protocol in Discipline when AI task fails", async () => {
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/mind/non-negotiables") return { items: [] };
        if (path.startsWith("/api/mind/journal")) return { entries: [] };
        if (path === "/api/mind/discipline") return { challenge: null };
        return {};
      });
      mockedRunAiTask.mockRejectedValue(new Error("AI service unavailable"));

      const { getByTestId } = render(<DisciplineDashboard />);

      await waitFor(() => {
        expect(getByTestId("mind-adaptive-session")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("mind-adaptive-session"));
      });

      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
        expect(getByTestId("guided-flow-choice-0")).toBeTruthy();
      });
    });

    it("falls back to static protocol in Anti-Sabotage when AI task fails", async () => {
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path.startsWith("/api/mind/journal")) return { entries: [] };
        return {};
      });
      mockedRunAiTask.mockRejectedValue(new Error("AI service unavailable"));

      const { getByTestId, getAllByTestId } = render(<AntiSabotageDashboard />);

      await waitFor(() => {
        expect(getByTestId("mind-adaptive-session")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("mind-adaptive-session"));
      });

      // The fallback is the day-rotated featured protocol (dailyPick), so its
      // first step may be an info/input step (Next), a pick-one (choices) or a
      // scale: accept any actionable control rather than pinning to one day.
      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
        expect(getByTestId("guided-flow-step")).toBeTruthy();
        expect(
          getAllByTestId(/^guided-flow-(next|choice-\d+|scale-\d+)$/).length,
        ).toBeGreaterThan(0);
      });
    });

    it("falls back to static protocol in Social when AI task fails", async () => {
      mockedApiFetch.mockImplementation(async (path: string) => {
        if (path.startsWith("/api/mind/journal")) return { entries: [] };
        return {};
      });
      mockedRunAiTask.mockRejectedValue(new Error("AI service unavailable"));

      const { getByTestId, getAllByTestId } = render(<SocialDashboard />);

      await waitFor(() => {
        expect(getByTestId("mind-adaptive-session")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("mind-adaptive-session"));
      });

      // The fallback is the day-rotated featured protocol (dailyPick), so its
      // first step may be an info/input step (Next), a pick-one (choices) or a
      // scale: accept any actionable control rather than pinning to one day.
      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
        expect(getByTestId("guided-flow-step")).toBeTruthy();
        expect(
          getAllByTestId(/^guided-flow-(next|choice-\d+|scale-\d+)$/).length,
        ).toBeGreaterThan(0);
      });
    });
  });
});
