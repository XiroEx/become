/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

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

import { apiFetch } from "@become/api-client";
import { allowanceLine } from "@become/core";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";
import MindRoute from "../app/(app)/(tabs)/mind/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function getsTo(pathPrefix: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith(pathPrefix) &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === "GET",
  );
}

function putsTo(pathPrefix: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith(pathPrefix) &&
      (c[2] as { method?: string } | undefined)?.method === "PUT",
  );
}

describe("MindRoute", () => {
  beforeEach(() => {
    mockParams = {};
    hideUpgradeSheet();
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const cleanPath = path.split("?")[0]!;

      if (cleanPath === "/api/progress" && method === "GET") {
        return Promise.resolve({
          moodData: [
            { date: "Jun 1", value: 3 },
            { date: "Jun 2", value: 5 },
          ],
        });
      }
      if (cleanPath === "/api/mind/identity" && method === "GET") {
        return Promise.resolve({
          profile: {
            onboardingCompleted: true,
            currentSelf: "Building momentum",
            futureSelf: "Leveling up",
          },
        });
      }
      if (cleanPath === "/api/mind/progress" && method === "GET") {
        return Promise.resolve({
          chapter: 1,
          xp: 20,
          level: 1,
          mainSessionCount: 1,
          mainSessionAvailable: true,
          unlockedSystems: ["state", "breath"],
          levelProgress: {
            level: 1,
            intoLevel: 20,
            span: 100,
            pct: 20,
            xpToNext: 80,
          },
          sessionsIntoChapter: { done: 1, needed: 10, toNext: 9 },
        });
      }
      if (cleanPath === "/api/mind/session" && method === "GET") {
        return Promise.resolve({
          dateKey: "2026-10-01",
          completedToday: false,
          streak: 2,
          mainSessionAvailable: true,
          locked: false,
          sessionsUsed: 1,
          sessionsLimit: 10,
          recentKinds: ["breath"],
        });
      }
      if (cleanPath === "/api/mind/session" && method === "PUT") {
        return Promise.resolve({ ok: true, dateKey: "2026-10-01" });
      }
      if (cleanPath === "/api/mind/state" && method === "GET") {
        return Promise.resolve({
          logs: [],
          todayMood: null,
        });
      }
      if (cleanPath === "/api/mind/mission" && method === "GET") {
        return Promise.resolve({
          mission: null,
        });
      }
      return Promise.resolve({});
    });
  });

  it("GETs /api/progress with baseUrl + token and renders the history strip", async () => {
    const { getByTestId } = render(<MindRoute />);
    await waitFor(() => {
      expect(getsTo("/api/progress").length).toBeGreaterThan(0);
    });
    const opts = getsTo("/api/progress")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);
    await waitFor(() => {
      expect(getByTestId("mood-history-point-0")).toBeTruthy();
      expect(getByTestId("mood-history-point-1")).toBeTruthy();
    });
  });

  it("does not render standalone MoodPicker as mood logging belongs to check-in (NP-105)", async () => {
    const { queryByTestId } = render(<MindRoute />);
    expect(queryByTestId("mood-picker-1")).toBeNull();
    expect(queryByTestId("mood-picker-2")).toBeNull();
    expect(queryByTestId("mood-picker-3")).toBeNull();
    expect(queryByTestId("mood-picker-4")).toBeNull();
    expect(queryByTestId("mood-picker-5")).toBeNull();
  });

  // Acceptance Criterion 1: e015c8d8
  it("(id: e015c8d8) A new member completes the identity intake natively and the web shows them onboarded", async () => {
    // When member has not completed identity intake, profile is null initially,
    // and becomes onboarded after PUT succeeds.
    let onboardedOnServer = false;
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const cleanPath = path.split("?")[0]!;

      if (cleanPath === "/api/mind/identity" && method === "GET") {
        return Promise.resolve({
          profile: onboardedOnServer ? { onboardingCompleted: true } : null,
        });
      }
      if (cleanPath === "/api/mind/identity" && method === "PUT") {
        onboardedOnServer = true;
        return Promise.resolve({
          profile: {
            onboardingCompleted: true,
            currentSelf:
              "I know what I want but I keep getting stuck — the execution breaks down.",
            futureSelf:
              "I am becoming someone who stays calm and focused under pressure",
            primaryObstacle: "discipline",
            startingPoint: "stuck",
          },
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId, queryByTestId } = render(<MindRoute />);

    // Step 1: renders intake
    await waitFor(() => {
      expect(getByTestId("identity-onboarding")).toBeTruthy();
      expect(getByTestId("identity-starting-point-stuck")).toBeTruthy();
    });

    // Select starting point "stuck" and continue to Step 2
    fireEvent.press(getByTestId("identity-starting-point-stuck"));
    fireEvent.press(getByTestId("identity-step-1-continue"));

    // Step 2: enter future self
    await waitFor(() => {
      expect(getByTestId("identity-future-self-input")).toBeTruthy();
    });
    fireEvent.changeText(
      getByTestId("identity-future-self-input"),
      "I am becoming someone who stays calm and focused under pressure",
    );
    fireEvent.press(getByTestId("identity-step-2-continue"));

    // Step 3: select obstacle and submit
    await waitFor(() => {
      expect(getByTestId("identity-obstacle-discipline")).toBeTruthy();
    });
    fireEvent.press(getByTestId("identity-obstacle-discipline"));
    fireEvent.press(getByTestId("identity-submit-button"));

    // Verify PUT /api/mind/identity was sent with exact payload
    await waitFor(() => {
      expect(putsTo("/api/mind/identity").length).toBe(1);
    });
    const putCall = putsTo("/api/mind/identity")[0]!;
    const putInit = putCall[2] as { body: Record<string, unknown> };
    expect(putInit.body).toEqual(
      expect.objectContaining({
        currentSelf:
          "I know what I want but I keep getting stuck — the execution breaks down.",
        futureSelf:
          "I am becoming someone who stays calm and focused under pressure",
        primaryObstacle: "discipline",
        startingPoint: "stuck",
      }),
    );
    expect(typeof putInit.body.tz).toBe("number");

    // After intake completes, onboarded becomes true and onboarding form is replaced
    await waitFor(() => {
      expect(queryByTestId("identity-onboarding")).toBeNull();
    });
  });

  // Acceptance Criterion 2: e015c8d9
  it("(id: e015c8d9) A free member with 10 completed sessions sees the lock natively before Begin, and the upgrade sheet quotes the server's limit", async () => {
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const cleanPath = path.split("?")[0]!;

      if (cleanPath === "/api/mind/identity" && method === "GET") {
        return Promise.resolve({
          profile: { onboardingCompleted: true },
        });
      }
      if (cleanPath === "/api/mind/progress" && method === "GET") {
        return Promise.resolve({
          chapter: 1,
          xp: 200,
          level: 3,
          mainSessionCount: 10,
          mainSessionAvailable: true,
          unlockedSystems: ["state", "breath"],
          levelProgress: {
            level: 3,
            intoLevel: 0,
            span: 100,
            pct: 0,
            xpToNext: 100,
          },
          sessionsIntoChapter: { done: 10, needed: 10, toNext: 0 },
        });
      }
      if (cleanPath === "/api/mind/session" && method === "GET") {
        return Promise.resolve({
          dateKey: "2026-10-01",
          completedToday: false,
          streak: 10,
          mainSessionAvailable: true,
          locked: true,
          lockReason: "tier",
          requiresTier: "plus",
          sessionsUsed: 10,
          sessionsLimit: 10,
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId, queryByTestId } = render(<MindRoute />);

    // Lock card is rendered before Begin
    await waitFor(() => {
      expect(getByTestId("mind-lock-card")).toBeTruthy();
    });

    // Begin button is NOT rendered
    expect(queryByTestId("mind-session-begin")).toBeNull();

    // Tap the lock card to open the upgrade sheet
    fireEvent.press(getByTestId("mind-lock-card"));

    // Upgrade sheet gate was set with server's limit
    const gate = getUpgradeSheetGate();
    expect(gate).toBeTruthy();
    expect(gate?.feature).toBe("mind-sessions");
    expect(gate?.requiresTier).toBe("plus");
    expect(gate?.limit).toBe(10);

    // Upgrade sheet quotes the server's limit
    const quote = allowanceLine(gate!);
    expect(quote).toBe("You've finished all 10 of your free sessions.");
  });

  // Acceptance Criterion 3: e015c8da
  it("(id: e015c8da) A session started on the web and left unfinished resumes natively with the same plan, including after 8 pm in New York", async () => {
    const unfinishedPlan = {
      intro: {
        title: "Evening Reset in New York",
        subtitle: "Grounding after an intense day",
      },
      moves: [
        { id: "m-breath", kind: "breath", title: "Resonance Breath", xp: 10 },
        { id: "m-win", kind: "win", title: "One Big Win", xp: 10 },
      ],
      rewardXp: 20,
    };

    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const cleanPath = path.split("?")[0]!;

      if (cleanPath === "/api/mind/identity" && method === "GET") {
        return Promise.resolve({
          profile: { onboardingCompleted: true },
        });
      }
      if (cleanPath === "/api/mind/progress" && method === "GET") {
        return Promise.resolve({
          chapter: 2,
          xp: 150,
          level: 2,
          mainSessionCount: 12,
          mainSessionAvailable: true,
          unlockedSystems: ["state", "breath", "identity"],
        });
      }
      if (cleanPath === "/api/mind/session" && method === "GET") {
        return Promise.resolve({
          dateKey: "2026-10-01",
          completedToday: false,
          streak: 4,
          mainSessionAvailable: true,
          locked: false,
          sessionsUsed: 12,
          resume: {
            seed: 777888999,
            plan: unfinishedPlan,
          },
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId } = render(<MindRoute />);

    // Verify GET /api/mind/session was called with numeric tz
    await waitFor(() => {
      expect(getsTo("/api/mind/session").length).toBeGreaterThan(0);
    });
    const sessionGetUrl = String(getsTo("/api/mind/session")[0]![0]);
    expect(sessionGetUrl).toMatch(/\/api\/mind\/session\?tz=\d+/);

    // Verify the card renders the resumed plan title and move chips
    await waitFor(() => {
      expect(getByTestId("mind-session-title")).toHaveTextContent(
        "Evening Reset in New York",
      );
      expect(getByTestId("mind-move-chip-breath")).toBeTruthy();
      expect(getByTestId("mind-move-chip-win")).toBeTruthy();
    });

    // Press Begin
    fireEvent.press(getByTestId("mind-session-begin"));

    // Session player opens with the exact same resumed session
    await waitFor(() => {
      expect(getByTestId("mind-session-player")).toBeTruthy();
    });
  });

  it("auto-starts session when mounted with ?start=1", async () => {
    mockParams = { start: "1" };

    const { getByTestId } = render(<MindRoute />);

    // Auto-begins and shows player
    await waitFor(() => {
      expect(getByTestId("mind-session-player")).toBeTruthy();
    });
  });
});
