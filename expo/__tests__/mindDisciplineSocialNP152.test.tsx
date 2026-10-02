/* eslint-disable import/first */
/**
 * NP-152 — Discipline (with the non-negotiables), Anti-Sabotage and Social,
 * ported natively on the NP-151 framework.
 *
 * The two acceptance criteria are checked against the WIRE, because that is
 * what makes the web agree: the native screens call the same routes the web
 * calls, with the same bodies, and `tz` travels as the numeric minutes-west
 * offset so a non-negotiable checked on the phone lands on the same local day
 * the web reads.
 */
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

jest.mock("@/lib/ai/runClient", () => ({
  runAiTask: jest.fn(),
}));

import { apiFetch } from "@become/api-client";
import { runAiTask } from "@/lib/ai/runClient";
import { tzOffsetMinutes } from "@/lib/time/localDay";
import DisciplineDashboard from "@/components/mind/DisciplineDashboard";
import AntiSabotageDashboard from "@/components/mind/AntiSabotageDashboard";
import SocialDashboard from "@/components/mind/SocialDashboard";
import MindSectionRoute, {
  PORTED_SECTIONS,
} from "../app/(app)/(tabs)/mind/[section]";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;
const mockedRunAiTask = runAiTask as unknown as jest.Mock;

interface Call {
  path: string;
  method: string;
  body?: Record<string, unknown> | undefined;
  tz?: number | undefined;
}

function recorder(
  handler: (path: string, opts: Record<string, unknown>) => unknown,
): Call[] {
  const calls: Call[] = [];
  mockedApiFetch.mockImplementation(
    async (path: string, _schema: unknown, opts: Record<string, unknown> = {}) => {
      calls.push({
        path,
        method: (opts.method as string) ?? "GET",
        body: opts.body as Record<string, unknown> | undefined,
        tz: opts.tz as number | undefined,
      });
      return handler(path, opts) ?? {};
    },
  );
  return calls;
}

function find(calls: Call[], path: string, method: string): Call | undefined {
  return calls.find((c) => c.path.startsWith(path) && c.method === method);
}

describe("NP-152 — Discipline, Anti-Sabotage and Social natively", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    // The reflect close asks the coach; a declined/failed answer must never
    // block the flow, so every test runs with the AI saying no.
    mockedRunAiTask.mockResolvedValue({ ok: false });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // e015ca19 — a non-negotiable checked off natively shows as done on the web
  // for the SAME day.
  // ─────────────────────────────────────────────────────────────────────────
  describe("Acceptance e015ca19: non-negotiable checked natively is done on the web for the same day", () => {
    const items = [
      {
        id: "nn-1",
        text: "I train even on bad days",
        currentStreak: 3,
        longestStreak: 9,
        checkedToday: false,
      },
    ];

    it("PATCHes /api/mind/non-negotiables with action=check and the numeric tz offset, then re-reads the day", async () => {
      let checked = false;
      const calls = recorder((path, opts) => {
        if (path.startsWith("/api/mind/journal")) {
          return { entries: [], counts: {} };
        }
        if (path.startsWith("/api/mind/discipline")) {
          return {
            challenge: {
              date: "2026-10-02T00:00:00.000Z",
              challenge: "Cold shower, no negotiation.",
              completed: false,
            },
          };
        }
        if (path.startsWith("/api/mind/non-negotiables")) {
          if ((opts.method as string) === "PATCH") {
            checked = true;
            return { currentStreak: 4, longestStreak: 9, checkedToday: true };
          }
          return {
            items: items.map((i) => ({
              ...i,
              checkedToday: checked,
              currentStreak: checked ? i.currentStreak + 1 : i.currentStreak,
            })),
          };
        }
        return {};
      });

      const { getByTestId } = render(<DisciplineDashboard />);

      await waitFor(() => {
        expect(getByTestId("discipline-dashboard")).toBeTruthy();
        expect(getByTestId("discipline-non-negotiable-nn-1")).toBeTruthy();
      });

      // The read is scoped to the member's local day.
      const read = find(calls, "/api/mind/non-negotiables", "GET");
      expect(read).toBeDefined();
      expect(typeof read?.tz).toBe("number");
      expect(read?.tz).toBe(new Date().getTimezoneOffset());

      await act(async () => {
        fireEvent.press(getByTestId("discipline-non-negotiable-check-nn-1"));
      });

      await waitFor(() => {
        const patch = find(calls, "/api/mind/non-negotiables", "PATCH");
        expect(patch).toBeDefined();
        expect(patch?.body?.id).toBe("nn-1");
        expect(patch?.body?.action).toBe("check");
        // The rule that travels: `tz` is the NUMERIC minutes-west offset, the
        // same value the web sends as `new Date().getTimezoneOffset()`.
        expect(typeof patch?.body?.tz).toBe("number");
        expect(patch?.body?.tz).toBe(new Date().getTimezoneOffset());
      });

      // And the dashboard re-reads, so what it draws is the SERVER's answer for
      // that day — the same row the web renders.
      await waitFor(() => {
        const reads = calls.filter(
          (c) =>
            c.path.startsWith("/api/mind/non-negotiables") &&
            c.method === "GET",
        );
        expect(reads.length).toBeGreaterThan(1);
        expect(getByTestId("discipline-held-today")).toHaveTextContent(
          "1/1 held today",
        );
      });
    });

    it("sends the same offset the web sends", () => {
      expect(tzOffsetMinutes()).toBe(new Date().getTimezoneOffset());
    });

    it("adds a non-negotiable through the guided flow and removes one", async () => {
      const calls = recorder((path) => {
        if (path.startsWith("/api/mind/journal")) {
          return { entries: [], counts: {} };
        }
        if (path.startsWith("/api/mind/discipline")) {
          return { challenge: null };
        }
        if (path.startsWith("/api/mind/non-negotiables")) {
          return { items };
        }
        return {};
      });

      const { getByTestId } = render(<DisciplineDashboard />);

      await waitFor(() => {
        expect(getByTestId("discipline-draw-line")).toBeTruthy();
      });

      // Remove the standing one.
      await act(async () => {
        fireEvent.press(getByTestId("discipline-non-negotiable-remove-nn-1"));
      });
      await waitFor(() => {
        const patch = calls.find(
          (c) =>
            c.path.startsWith("/api/mind/non-negotiables") &&
            c.method === "PATCH" &&
            c.body?.action === "deactivate",
        );
        expect(patch).toBeDefined();
        expect(patch?.body?.id).toBe("nn-1");
      });

      // Draw a new line: info → type the line → info → POST.
      fireEvent.press(getByTestId("discipline-draw-line"));
      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-next"));

      await waitFor(() => {
        expect(getByTestId("guided-flow-input")).toBeTruthy();
      });
      fireEvent.changeText(
        getByTestId("guided-flow-input"),
        "No phone before the first hour",
      );
      fireEvent.press(getByTestId("guided-flow-next"));

      await waitFor(() => {
        expect(getByTestId("guided-flow-next")).toBeTruthy();
      });
      await act(async () => {
        fireEvent.press(getByTestId("guided-flow-next"));
      });

      await waitFor(() => {
        const post = find(calls, "/api/mind/non-negotiables", "POST");
        expect(post).toBeDefined();
        expect(post?.body?.text).toBe("No phone before the first hour");
      });
    });

    it("completes today's hard thing against POST /api/mind/discipline and journals it", async () => {
      const calls = recorder((path) => {
        if (path.startsWith("/api/mind/journal")) {
          return { entries: [], counts: {} };
        }
        if (path.startsWith("/api/mind/discipline")) {
          return {
            challenge: {
              date: "2026-10-02T00:00:00.000Z",
              challenge: "Cold shower, no negotiation.",
              completed: false,
            },
          };
        }
        if (path.startsWith("/api/mind/non-negotiables")) return { items: [] };
        return {};
      });

      const { getByTestId } = render(<DisciplineDashboard />);

      await waitFor(() => {
        expect(getByTestId("discipline-hard-thing-text")).toHaveTextContent(
          "Cold shower, no negotiation.",
        );
      });

      await act(async () => {
        fireEvent.press(getByTestId("discipline-hard-thing-done-button"));
      });

      await waitFor(() => {
        const post = find(calls, "/api/mind/discipline", "POST");
        expect(post).toBeDefined();
        expect(post?.body?.action).toBe("complete");
        expect(typeof post?.body?.tz).toBe("number");

        const journal = calls.find(
          (c) =>
            c.path === "/api/mind/journal" &&
            c.method === "POST" &&
            c.body?.kind === "did-the-hard-thing",
        );
        expect(journal).toBeDefined();
        expect(journal?.body?.system).toBe("discipline");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // e015ca1a — Anti-Sabotage and Social protocols run natively and record
  // entries the web shows (the same MindJournal rows the web reads).
  // ─────────────────────────────────────────────────────────────────────────
  describe("Acceptance e015ca1a: Anti-Sabotage and Social protocols record entries the web shows", () => {
    function journalOnly(entries: unknown[] = [], counts: object = {}) {
      return recorder((path) => {
        if (path.startsWith("/api/mind/journal")) return { entries, counts };
        return {};
      });
    }

    it("runs an Anti-Sabotage interrupt protocol and POSTs it to /api/mind/journal", async () => {
      const calls = journalOnly([
        {
          id: "entry-as-1",
          system: "anti-sabotage",
          kind: "protocol",
          title: "Pattern Recognition",
          createdAt: new Date().toISOString(),
        },
      ]);

      const { getByTestId } = render(<AntiSabotageDashboard />);

      await waitFor(() => {
        expect(getByTestId("anti-sabotage-dashboard")).toBeTruthy();
        // The track record is what the web renders from the same rows.
        expect(getByTestId("mind-track-record-entry-entry-as-1")).toBeTruthy();
      });

      fireEvent.press(getByTestId("mind-toolkit-card-pattern-recognition"));
      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });

      // Step 0: choices
      fireEvent.press(getByTestId("guided-flow-choice-1"));
      // Step 1: typed answer
      await waitFor(() => {
        expect(getByTestId("guided-flow-input")).toBeTruthy();
      });
      fireEvent.changeText(
        getByTestId("guided-flow-input"),
        "I quit the second it stops being exciting",
      );
      fireEvent.press(getByTestId("guided-flow-next"));
      // Step 2: final info step
      await waitFor(() => {
        expect(getByTestId("guided-flow-next")).toBeTruthy();
      });
      await act(async () => {
        fireEvent.press(getByTestId("guided-flow-next"));
      });

      await waitFor(() => {
        const post = calls.find(
          (c) => c.path === "/api/mind/journal" && c.method === "POST",
        );
        expect(post).toBeDefined();
        expect(post?.body?.system).toBe("anti-sabotage");
        expect(post?.body?.kind).toBe("protocol");
        expect(post?.body?.title).toBe("Pattern Recognition");
        expect(
          (post?.body?.lines as { answer: string }[])?.map((l) => l.answer),
        ).toEqual([
          "The messy middle",
          "I quit the second it stops being exciting",
        ]);
      });

      // Back on the dashboard, not stranded in the flow.
      await waitFor(() => {
        expect(getByTestId("anti-sabotage-dashboard")).toBeTruthy();
      });
    });

    it("logs a one-tap pattern catch as a pattern-catch entry", async () => {
      const calls = journalOnly([], { "pattern-catch": 2 });

      const { getByTestId } = render(<AntiSabotageDashboard />);
      await waitFor(() => {
        expect(getByTestId("anti-sabotage-dashboard")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("anti-sabotage-catch-button"));
      });

      await waitFor(() => {
        const post = calls.find(
          (c) =>
            c.path === "/api/mind/journal" &&
            c.method === "POST" &&
            c.body?.kind === "pattern-catch",
        );
        expect(post).toBeDefined();
        expect(post?.body?.system).toBe("anti-sabotage");
      });
    });

    it("runs a Social protocol and POSTs it to /api/mind/journal", async () => {
      const calls = journalOnly([
        {
          id: "entry-so-1",
          system: "social",
          kind: "connect",
          title: "Reached out to someone",
          createdAt: new Date().toISOString(),
        },
      ]);

      const { getByTestId } = render(<SocialDashboard />);

      await waitFor(() => {
        expect(getByTestId("social-dashboard")).toBeTruthy();
        expect(getByTestId("mind-track-record-entry-entry-so-1")).toBeTruthy();
      });

      fireEvent.press(getByTestId("mind-toolkit-card-circle-audit"));
      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });

      // Step 0 and 1: typed answers
      fireEvent.changeText(
        getByTestId("guided-flow-input"),
        "My training partner",
      );
      fireEvent.press(getByTestId("guided-flow-next"));
      await waitFor(() => {
        expect(getByTestId("guided-flow-input")).toBeTruthy();
      });
      fireEvent.changeText(getByTestId("guided-flow-input"), "The party group");
      fireEvent.press(getByTestId("guided-flow-next"));
      // Step 2: choices
      await waitFor(() => {
        expect(getByTestId("guided-flow-choice-2")).toBeTruthy();
      });
      fireEvent.press(getByTestId("guided-flow-choice-2"));
      // Step 3: final info step
      await waitFor(() => {
        expect(getByTestId("guided-flow-next")).toBeTruthy();
      });
      await act(async () => {
        fireEvent.press(getByTestId("guided-flow-next"));
      });

      await waitFor(() => {
        const post = calls.find(
          (c) => c.path === "/api/mind/journal" && c.method === "POST",
        );
        expect(post).toBeDefined();
        expect(post?.body?.system).toBe("social");
        expect(post?.body?.kind).toBe("protocol");
        expect(post?.body?.title).toBe("Circle Audit");
      });
    });

    it("logs a one-tap reach-out as a connect entry", async () => {
      // The reach-out is reflected back from the SERVER's rows, so the mock
      // starts the day empty and grows the entry the POST creates.
      let reached = false;
      const calls = recorder((path, opts) => {
        if (path === "/api/mind/journal" && opts.method === "POST") {
          reached = true;
          return { saved: true, id: "entry-connect" };
        }
        if (path.startsWith("/api/mind/journal")) {
          return {
            entries: reached
              ? [
                  {
                    id: "entry-connect",
                    system: "social",
                    kind: "connect",
                    title: "Reached out to someone",
                    createdAt: new Date().toISOString(),
                  },
                ]
              : [],
            counts: reached ? { connect: 1 } : {},
          };
        }
        return {};
      });

      const { getByTestId } = render(<SocialDashboard />);
      await waitFor(() => {
        expect(getByTestId("social-reach-button")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("social-reach-button"));
      });

      await waitFor(() => {
        const post = calls.find(
          (c) =>
            c.path === "/api/mind/journal" &&
            c.method === "POST" &&
            c.body?.kind === "connect",
        );
        expect(post).toBeDefined();
        expect(post?.body?.system).toBe("social");
        expect(getByTestId("social-reached-today")).toBeTruthy();
      });
    });

    it("falls back to a static protocol when the AI declines, rather than dead-ending", async () => {
      journalOnly();
      mockedRunAiTask.mockRejectedValue(new Error("declined"));

      const { getByTestId } = render(<SocialDashboard />);
      await waitFor(() => {
        expect(getByTestId("mind-adaptive-session")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("mind-adaptive-session"));
      });

      expect(mockedRunAiTask).toHaveBeenCalled();
      await waitFor(() => {
        expect(getByTestId("guided-flow-screen")).toBeTruthy();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Routing: all three sections render natively — nothing opens the web.
  // ─────────────────────────────────────────────────────────────────────────
  describe("Section routing (NP-012: nothing is hidden, nothing opens the web)", () => {
    it.each([
      ["discipline", "discipline-dashboard"],
      ["anti-sabotage", "anti-sabotage-dashboard"],
      ["social", "social-dashboard"],
    ])("renders %s natively", async (section, testID) => {
      mockParams = { section };
      recorder((path) => {
        if (path === "/api/mind/progress") {
          return {
            chapter: 7,
            unlockedSystems: [
              "state-shift",
              "self-image",
              "mission",
              "discipline",
              "anti-sabotage",
              "social",
              "vision",
            ],
            introducedSystems: [section],
          };
        }
        if (path.startsWith("/api/mind/journal")) {
          return { entries: [], counts: {} };
        }
        if (path.startsWith("/api/mind/discipline")) {
          return { challenge: null };
        }
        if (path.startsWith("/api/mind/non-negotiables")) {
          return { items: [] };
        }
        return {};
      });

      const { getByTestId, queryByText } = render(<MindSectionRoute />);

      await waitFor(() => {
        expect(getByTestId(testID)).toBeTruthy();
      });
      expect(queryByText(/is coming soon/)).toBeNull();
    });

    it("lists the three new sections as ported", () => {
      expect(PORTED_SECTIONS).toEqual(
        expect.arrayContaining(["discipline", "anti-sabotage", "social"]),
      );
    });
  });
});
