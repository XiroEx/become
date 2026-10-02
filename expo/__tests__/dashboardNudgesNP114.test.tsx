import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ProgramNudgeModal, offersDontShowAgain, DONT_SHOW_AGAIN_THRESHOLD } from "@/components/ProgramNudgeModal";
import { SuggestionTile } from "@/components/dashboard/SuggestionTile";
import { TileGrid } from "@/components/dashboard/TileGrid";
import type { DashboardSuggestion, DashboardTile, DashboardTilesResponse } from "@become/api-client";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockOpenWebSignedIn = jest.fn().mockResolvedValue("signed-in");
jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: (path: string) => mockOpenWebSignedIn(path),
}));

const mockToken = "test-jwt";
const mockUser: Record<string, unknown> = {
  _id: "u1",
  email: "jon@example.com",
  name: "Jon",
  profile: { fitnessGoal: "gain_muscle" },
};

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
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

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import DashboardRoute from "../app/(app)/(tabs)/dashboard/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

describe("ProgramNudgeModal component", () => {
  it("renders goal-specific copy for each fitnessGoal", () => {
    const goals = [
      { goal: "lose_weight", headline: "Ready to build your fat loss plan?" },
      { goal: "gain_muscle", headline: "Ready to build serious muscle?" },
      { goal: "maintain", headline: "Keep what you've built." },
      { goal: "improve_performance", headline: "Ready to train with purpose?" },
      { goal: "general_health", headline: "Start building the habit." },
    ] as const;

    for (const { goal, headline } of goals) {
      const { getByText, unmount } = render(
        <ProgramNudgeModal
          visible={true}
          fitnessGoal={goal}
          priorShowings={0}
          onExplore={jest.fn()}
          onDismissForever={jest.fn()}
        />,
      );
      expect(getByText(headline)).toBeTruthy();
      unmount();
    }
  });

  it("renders default copy when no fitnessGoal is set", () => {
    const { getByText } = render(
      <ProgramNudgeModal
        visible={true}
        priorShowings={0}
        onExplore={jest.fn()}
        onDismissForever={jest.fn()}
      />,
    );
    expect(getByText("Ready to start a training program?")).toBeTruthy();
    expect(getByText("A structured plan gets you from where you are to where you want to be.")).toBeTruthy();
  });

  it("does not offer 'Don’t show this again' on first showing (priorShowings = 0)", () => {
    expect(offersDontShowAgain(0)).toBe(false);
    expect(DONT_SHOW_AGAIN_THRESHOLD).toBe(1);

    const { queryByTestId, getByTestId } = render(
      <ProgramNudgeModal
        visible={true}
        priorShowings={0}
        onExplore={jest.fn()}
        onDismissForever={jest.fn()}
      />,
    );

    expect(queryByTestId("program-nudge-dismiss-forever")).toBeNull();
    expect(getByTestId("program-nudge-find-program")).toBeTruthy();
    expect(getByTestId("program-nudge-explore")).toBeTruthy();
  });

  it("offers 'Don’t show this again' from second showing onward (priorShowings >= 1)", () => {
    expect(offersDontShowAgain(1)).toBe(true);
    expect(offersDontShowAgain(2)).toBe(true);

    const onDismissForever = jest.fn();
    const { getByTestId, getByText } = render(
      <ProgramNudgeModal
        visible={true}
        priorShowings={1}
        onExplore={jest.fn()}
        onDismissForever={onDismissForever}
      />,
    );

    const optOutBtn = getByTestId("program-nudge-dismiss-forever");
    expect(optOutBtn).toBeTruthy();
    expect(getByText("Don’t show this again")).toBeTruthy();

    fireEvent.press(optOutBtn);
    expect(onDismissForever).toHaveBeenCalledTimes(1);
  });

  it("handles Explore first, Find My Program, and backdrop taps", () => {
    const onExplore = jest.fn();
    const onFindProgram = jest.fn();
    const { getByTestId } = render(
      <ProgramNudgeModal
        visible={true}
        priorShowings={0}
        onExplore={onExplore}
        onFindProgram={onFindProgram}
        onDismissForever={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId("program-nudge-explore"));
    expect(onExplore).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("program-nudge-find-program"));
    expect(onFindProgram).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("program-nudge-modal-backdrop"));
    expect(onExplore).toHaveBeenCalledTimes(2);
  });
});

describe("Suggestion cards and web-path resolver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens card primaryAction.href through webPathToRoute (native path)", () => {
    const tile: DashboardTile = { id: "sug-1", kind: "smart-rotating", size: "2x1" };
    const suggestion: DashboardSuggestion = {
      id: "s1",
      severity: "info",
      title: "Review records",
      body: "Check your progress",
      dismissible: true,
      source: "workout",
      primaryAction: {
        label: "Open progress",
        href: "/dashboard/progress/bench-press",
      },
    };

    const { getByTestId } = render(
      <SuggestionTile tile={tile} suggestion={suggestion} />,
    );

    fireEvent.press(getByTestId("suggestion-primary-action"));
    // /dashboard/progress/<slug> maps to native workout tab /(tabs)/programming
    // (records are NP-131 — the Training Log has no per-exercise view yet).
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming");
  });

  it("falls back to opening web signed-in for web-only paths like /dashboard/admin", () => {
    const tile: DashboardTile = { id: "sug-2", kind: "smart-rotating", size: "2x1" };
    const suggestion: DashboardSuggestion = {
      id: "s2",
      severity: "nudge",
      title: "Admin Tools",
      body: "Manage dashboard",
      dismissible: true,
      source: "workout",
      primaryAction: {
        label: "Open admin",
        href: "/dashboard/admin",
      },
    };

    const { getByTestId } = render(
      <SuggestionTile tile={tile} suggestion={suggestion} />,
    );

    fireEvent.press(getByTestId("suggestion-primary-action"));
    expect(mockOpenWebSignedIn).toHaveBeenCalledWith("/dashboard/admin");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("exercise-placement suggestions never show on the dashboard", () => {
    const tilesData = {
      suggestions: [
        {
          id: "s-exercise",
          severity: "nudge",
          title: "Exercise swap",
          body: "Swap bench press",
          placement: "exercise",
          dismissible: true,
          source: "workout",
        },
        {
          id: "s-other-surface",
          severity: "info",
          title: "Workout note",
          body: "Inside session",
          context: { surface: "workout" },
          dismissible: true,
          source: "workout",
        } as unknown as DashboardSuggestion,
        {
          id: "s-dashboard",
          severity: "celebration",
          title: "Good job",
          body: "You hit your goal",
          placement: "dashboard",
          context: { surface: "dashboard" },
          dismissible: true,
          source: "workout",
        } as unknown as DashboardSuggestion,
      ],
    } as unknown as DashboardTilesResponse;

    const { getByText, queryByText } = render(
      <TileGrid
        layout={[{ id: "streak", kind: "stat", size: "1x1" }]}
        tilesData={tilesData}
      />,
    );

    expect(queryByText("Exercise swap")).toBeNull();
    expect(queryByText("Workout note")).toBeNull();
    expect(getByText("Good job")).toBeTruthy();
  });
});

describe("DashboardRoute integration: Acceptance criteria (NP-114)", () => {
  let programNudgeDue = false;
  let programNudgeShowings = 0;
  let checkinDue = false;
  let hasActiveProgram = false;
  let apiCalls: { path: string; body?: unknown }[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    programNudgeDue = false;
    programNudgeShowings = 0;
    checkinDue = false;
    hasActiveProgram = false;
    apiCalls = [];

    mockApiFetch.mockImplementation((path: string, _schema: unknown, opts?: { method?: string; body?: unknown }) => {
      apiCalls.push({ path, body: opts?.body });

      if (path === "/api/auth/me") {
        return Promise.resolve({
          user: {
            _id: "u1",
            email: "jon@example.com",
            name: "Jon",
            profile: { fitnessGoal: "gain_muscle" },
          },
        });
      }
      if (path === "/api/streak") {
        return Promise.resolve({ streakDays: 5, longestStreak: 9, streakFreezes: 1 });
      }
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: hasActiveProgram
            ? [{ programId: "p1", programName: "Hypertrophy" }]
            : [],
        });
      }
      if (path.startsWith("/api/dashboard/layout")) {
        return Promise.resolve({
          layout: [{ id: "streak", kind: "stat", size: "1x1" }],
        });
      }
      if (path.startsWith("/api/checkin")) {
        return Promise.resolve({
          due: checkinDue,
          reason: checkinDue ? "time" : "complete",
          daysSinceMood: 0,
          daysSinceWeight: 0,
          lastWeight: null,
        });
      }
      if (path.startsWith("/api/program-nudge")) {
        return Promise.resolve({
          due: programNudgeDue,
          showings: programNudgeShowings,
          dismissCount: 0,
          dontShowAgain: false,
          hasServerState: true,
        });
      }
      if (path.startsWith("/api/goals")) {
        return Promise.resolve({
          todayKey: "2026-10-01",
          nutrition: { target: { weight: 175, pacePerWeek: 1 }, unit: "lbs" },
        });
      }
      if (path.startsWith("/api/streaks")) {
        return Promise.resolve({
          overall: { current: 12, best: 14, activeToday: true, freezes: 1 },
          pillars: {
            workout: { current: 4, best: 8, thisWeek: 2, target: 3, weekLost: false, unit: "days" },
            nutrition: { current: 5, best: 7, activeToday: true },
            mindset: { current: 3, best: 5, activeToday: true },
            super: { current: 0, best: 0, activeToday: false, today: { trained: true, nutrition: true, mindset: true, restDay: false, weekOnTrack: true } },
          },
        });
      }
      if (path.startsWith("/api/dashboard/tiles")) {
        return Promise.resolve({
          suggestions: [
            {
              id: "s-test",
              severity: "nudge",
              title: "Test suggestion",
              body: "Test body",
              dismissible: true,
              source: "workout",
            },
          ],
        });
      }
      if (path === "/api/suggestions/dismiss") {
        return Promise.resolve({ success: true, id: (opts?.body as any)?.id, count: 1 });
      }
      return Promise.resolve({});
    });
  });

  // Acceptance Criterion: (id: e015c93f) Don't show this again natively stops the nudge on the web too
  it("(id: e015c93f) Don't show this again natively stops the nudge on the web too", async () => {
    programNudgeDue = true;
    programNudgeShowings = 1; // 2nd showing -> offers opt out
    hasActiveProgram = false;

    const { getByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-program-nudge-modal")).toBeTruthy();
    });

    // Check that shown was recorded once
    const shownCall = apiCalls.find(
      (c) => c.path === "/api/program-nudge" && (c.body as any)?.action === "shown",
    );
    expect(shownCall).toBeDefined();

    // Verify adopt is never sent
    const adoptCall = apiCalls.find(
      (c) => c.path === "/api/program-nudge" && (c.body as any)?.action === "adopt",
    );
    expect(adoptCall).toBeUndefined();

    // Opt-out button is present
    const optOutBtn = getByTestId("program-nudge-dismiss-forever");
    expect(optOutBtn).toBeTruthy();

    await act(async () => {
      fireEvent.press(optOutBtn);
    });

    // Verifies action: 'dismiss_forever' is posted to /api/program-nudge
    // which persists dontShowAgain: true on the account and stops it on the web
    const dismissForeverCall = apiCalls.find(
      (c) => c.path === "/api/program-nudge" && (c.body as any)?.action === "dismiss_forever",
    );
    expect(dismissForeverCall).toBeDefined();
  });

  // Acceptance Criterion: (id: e015c940) A suggestion dismissed natively is gone on the web
  it("(id: e015c940) A suggestion dismissed natively is gone on the web", async () => {
    const { getByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("suggestion-dismiss")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("suggestion-dismiss"));
    });

    // Verifies POST /api/suggestions/dismiss is called with the suggestion id
    const dismissCall = apiCalls.find(
      (c) => c.path === "/api/suggestions/dismiss" && (c.body as any)?.id === "s-test",
    );
    expect(dismissCall).toBeDefined();
  });

  // Acceptance Criterion: (id: e015c941) The nudge and the check-in never appear at the same time
  it("(id: e015c941) The nudge and the check-in never appear at the same time", async () => {
    programNudgeDue = true;
    programNudgeShowings = 0;
    checkinDue = true;
    hasActiveProgram = false;

    const { getByTestId, queryByTestId, getByText } = render(<DashboardRoute />);

    // 1. Nudge opens first
    await waitFor(() => {
      expect(getByTestId("dashboard-program-nudge-modal")).toBeTruthy();
      expect(getByText("Ready to build serious muscle?")).toBeTruthy();
    });

    // 2. Check-in modal is NOT displayed while nudge is visible
    expect(queryByTestId("dashboard-checkin-modal")).toBeNull();

    // 3. User dismisses the nudge via "Explore first"
    const exploreBtn = getByTestId("program-nudge-explore");
    await act(async () => {
      fireEvent.press(exploreBtn);
    });

    // Verifies action: 'dismiss' was posted
    const dismissCall = apiCalls.find(
      (c) => c.path === "/api/program-nudge" && (c.body as any)?.action === "dismiss",
    );
    expect(dismissCall).toBeDefined();

    // 4. Now that the nudge is closed, check-in opens next
    await waitFor(() => {
      expect(getByTestId("dashboard-checkin-modal")).toBeTruthy();
    });
  });
});
