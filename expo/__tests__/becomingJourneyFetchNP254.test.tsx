/* eslint-disable import/first */
// THE BECOMING FAILS TO LOAD FROM HOME (NP-254): `becoming.tsx` called
// `apiFetch("/api/becoming/journey", BecomingJourneyResponseSchema)` with no
// options, so the request had no base URL and no token — every other screen
// passes `{ baseUrl, getToken }`. Native showed
// `Couldn't load your Becoming / Invalid URL: /api/becoming/journey?tz=240`
// where web showed the story. This suite pins the fix: the screen fetches
// the journey through the same authenticated client as every other screen,
// and renders the story (not the error) from a mocked journey.

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "member-1" },
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

import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { JourneyPayload, WeekSnapshot } from "@/lib/becoming/types";
import BecomingScreen from "../app/(app)/becoming";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <BecomingScreen />
    </SafeAreaProvider>,
  );
}

const MOCK_WEEK: WeekSnapshot = {
  index: 0,
  weekKey: "2026-09-27",
  label: "Sep 27 – Oct 3",
  isCurrent: true,
  isFirst: false,
  daysElapsed: 5,
  score: 85,
  step: "up",
  altitude: 1,
  subject: "training",
  days: [
    { key: "2026-09-27", workout: true, workoutCount: 1, food: true, mind: true, mindSession: true, future: false },
    { key: "2026-09-28", workout: false, workoutCount: 0, food: true, mind: false, mindSession: false, future: false },
    { key: "2026-09-29", workout: true, workoutCount: 1, food: false, mind: true, mindSession: false, future: false },
    { key: "2026-09-30", workout: true, workoutCount: 1, food: true, mind: false, mindSession: false, future: false },
    { key: "2026-10-01", workout: false, workoutCount: 0, food: true, mind: true, mindSession: true, future: false },
    { key: "2026-10-02", workout: false, workoutCount: 0, food: false, mind: false, mindSession: false, future: true },
    { key: "2026-10-03", workout: false, workoutCount: 0, food: false, mind: false, mindSession: false, future: true },
  ],
  uses: { training: true, fuel: true, mind: true, mindMode: "sessions" },
  mind: { sessions: 2, moodDays: 3, dominant: "locked_in", wins: ["Kept focus under pressure"], chapterUnlocked: 2 },
  nutrition: { logDays: 4, proteinDays: 3, avgCalories: 2100, weightStart: 180, weightEnd: 179, delta: -1.0 },
  training: { workouts: 3, target: 4, hit: false, prs: [{ name: "Bench Press", e1RM: 225 }], prCount: 1 },
  headline: "Momentum build",
  sub: "Strong training rhythm with 3 sessions locked in",
  said: [],
  tags: ["training", "prs"],
  spark: [70, 75, 80, 85],
};

const MOCK_JOURNEY: JourneyPayload = {
  todayKey: "2026-10-02",
  identity: "Consistent, disciplined builder",
  firstActivity: "2026-01-01",
  unit: "lbs",
  target: { weight: 175, direction: "lose", pace: "on", eta: "Nov 15" },
  weeklyTarget: 4,
  weeks: [MOCK_WEEK],
  next: {
    nutrition: {
      key: "log-dinner",
      title: "Log your final meal",
      sub: "Lock in your protein target for the day",
      severity: "info",
      url: "/dashboard/nutrition",
    },
    training: {
      key: "finish-week",
      title: "Complete 1 more workout",
      sub: "Hit your 4 workouts/week goal",
      severity: "nudge",
      url: "/dashboard/workout",
    },
  },
  becomingScore: 1250,
  chapter: 2,
  weights: [
    { day: "2026-09-27", value: 180 },
    { day: "2026-09-29", value: 179.5 },
    { day: "2026-10-01", value: 179 },
  ],
};

function callsTo(path: string): { opts: Record<string, unknown> }[] {
  return mockApiFetch.mock.calls
    .filter((c) => String(c[0]).split("?")[0] === path)
    .map((c) => ({ opts: (c[2] ?? {}) as Record<string, unknown> }));
}

describe("The Becoming opens from Home (NP-254)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockApiFetch.mockReset();
    mockBack.mockReset();
    mockParams = {};
  });

  it("fetches the journey through the authenticated client (base URL + token), not a bare path", async () => {
    mockApiFetch.mockResolvedValue(MOCK_JOURNEY);

    renderScreen();

    await waitFor(
      () => {
        expect(callsTo("/api/becoming/journey").length).toBeGreaterThan(0);
      },
      { timeout: 10000 },
    );

    const { opts } = callsTo("/api/becoming/journey")[0]!;
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(typeof opts.getToken).toBe("function");
    expect(await (opts.getToken as () => Promise<string | undefined> | string | undefined)()).toBe(
      mockToken,
    );
  });

  it("renders the stage (chrome, week card) instead of the invalid-URL error", async () => {
    mockApiFetch.mockResolvedValue(MOCK_JOURNEY);

    const { getAllByText, queryByText, getByTestId } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("week-card-2026-09-27")).toBeTruthy();
    });

    // The stage's top chrome says it, and so does the opening's title while
    // it plays (NP-204) — at least one, never none.
    expect(getAllByText("The Becoming").length).toBeGreaterThan(0);
    expect(getByTestId("journey-stage")).toBeTruthy();
    expect(queryByText("Couldn't load your Becoming")).toBeNull();
    expect(queryByText(/Invalid URL/)).toBeNull();
  });

  it("surfaces the real error message when the authenticated fetch itself fails", async () => {
    mockApiFetch.mockRejectedValue(new Error("Network request failed"));

    const { findByText } = renderScreen();

    expect(await findByText("Couldn't load your Becoming")).toBeTruthy();
    expect(await findByText("Network request failed")).toBeTruthy();
  });
});
