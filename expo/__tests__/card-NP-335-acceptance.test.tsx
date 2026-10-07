/* eslint-disable import/first */
// Android: The Becoming details - Training and Fuel tabs show '—' /
// 'No target weight yet', Mind and Story miss most web sections (NP-335).
//
// Root cause: `becoming.tsx` rendered `<BecomingDetails>` without `goals`
// (or any of the Mind sources web's own BecomingDetails fetches itself), so
// every section built from `/api/goals`, `/api/mind/progress`,
// `/api/mind/wins`, `/api/mind/state` and `/api/mind/session` was empty on
// native even though the member had real data. This suite pins:
//
//   1. becoming.tsx fetches those sources through the authenticated client,
//      alongside the journey, and never blocks it;
//   2. BecomingDetails renders Training's week/moved numbers, Fuel's weight
//      plan, Mind's streak/arc-%/shown-up/next-chapter and Story's
//      next-actions + YOU row once that data is handed to it — the demo
//      account's shape (181 lbs goal, 1 workout this week, stressed mostly).

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
import { render, waitFor, fireEvent, act, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { apiFetch } from "@become/api-client";
import { CHAPTERS } from "@become/core/mindXP";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { JourneyPayload, WeekSnapshot } from "@/lib/becoming/types";
import BecomingScreen from "../app/(app)/becoming";
import { BecomingDetails } from "@/components/becoming/BecomingDetails";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

const MOCK_WEEK: WeekSnapshot = {
  index: 0,
  weekKey: "2026-10-04",
  label: "Oct 4 – Oct 10",
  isCurrent: true,
  isFirst: false,
  daysElapsed: 3,
  score: 55,
  step: "flat",
  altitude: 1,
  subject: "training",
  days: [],
  uses: { training: true, fuel: true, mind: true, mindMode: "sessions" },
  mind: { sessions: 0, moodDays: 1, dominant: "stressed", wins: [], chapterUnlocked: null },
  nutrition: { logDays: 7, proteinDays: 5, avgCalories: 2200, weightStart: 175, weightEnd: 175, delta: 0 },
  training: { workouts: 1, target: 3, hit: false, prs: [], prCount: 0 },
  headline: "Steady but stressed",
  sub: "One workout banked, logging held",
  said: [],
  tags: [],
};

const MOCK_JOURNEY: JourneyPayload = {
  todayKey: "2026-10-06",
  identity: "Consistent, disciplined builder",
  firstActivity: "2026-09-06",
  unit: "lbs",
  target: { weight: 181, direction: "lose", pace: "on", eta: "~12 wks" },
  weeklyTarget: 3,
  weeks: [MOCK_WEEK],
  next: {
    nutrition: { key: "fuel.onpace", title: "On pace", sub: "Stay consistent", severity: "good", url: "/dashboard/nutrition/goals" },
    training: { key: "training.2more", title: "2 more by Saturday", sub: "Hit your 3/wk target", severity: "nudge", url: "/dashboard/workout" },
  },
  becomingScore: 1250,
  chapter: 3,
  weights: [
    { day: "2026-09-09", value: 173 },
    { day: "2026-10-06", value: 175 },
  ],
};

const MOCK_GOALS = {
  todayKey: "2026-10-06",
  nutrition: {
    unit: "lbs",
    status: "active",
    kind: "weight",
    direction: "lose",
    startedAt: "2026-09-30T00:00:00.000Z",
    achievedAt: null,
    baseline: { weight: 175, date: "2026-09-30T00:00:00.000Z" },
    journeyStart: { weight: 173, date: "2026-09-09T00:00:00.000Z" },
    now: { weight: 175, date: "2026-10-06T00:00:00.000Z", fourWeeksAgo: null },
    target: { weight: 181, paceKgPerWeek: 0.23, pacePerWeek: 0.5, bandKg: 1 },
    pace: { status: "on", expectedKg: 80, aheadByKg: 0, behindByKg: 0, etaWeeks: 12, remainingKg: 2.7, eta: "~12 wks", etaDate: "2026-12-29T00:00:00.000Z" },
    adherence: { logDays: 7, proteinDays: 5, totalDays: 7, logTarget: 5, proteinTarget: 5, logOk: true, proteinOk: true, proteinJudged: true },
    proteinGoal: 180,
    suggestion: { key: "fuel.onpace", title: "On pace", sub: "Stay consistent", severity: "good", url: "/dashboard/nutrition/goals" },
  },
  training: {
    status: "active",
    startedAt: "2026-09-30T00:00:00.000Z",
    target: { daysPerWeek: 3, programId: "prog-1" },
    thisWeek: { done: 1, remaining: 2, chancesLeft: 2, weekLost: false },
    avgLast4: 2,
    weeklyCounts: [2, 3, 2, 1],
    baseline: { daysPerWeek: 2, date: "2026-09-30T00:00:00.000Z", prs: [] },
    lifts: [{ slug: "back-squat", name: "Barbell Back Squat", then: 215, now: 235, delta: 20, pct: 9, target: 245, toTargetPct: 67, remaining: 10, reached: false }],
    suggestedLifts: [],
    hasLiftTargets: true,
    liftRationales: {},
    week: {
      sessions: 1,
      sets: 6,
      reps: 41,
      volume: 7800,
      workSeconds: 0,
      topSet: { name: "Barbell Back Squat", weight: 235, reps: 5, e1RM: 264 },
      exercises: 2,
      hasWeightedWork: true,
    },
    unit: "lbs",
    suggestion: { key: "training.2more", title: "2 more by Saturday", sub: "Hit your 3/wk target", severity: "nudge", url: "/dashboard/workout" },
  },
};

const MOCK_MIND_PROGRESS = {
  chapter: 3,
  xp: 180,
  xpBank: 1250,
  xpProgress: { needed: 150, current: 30, pct: 20 },
  readyToLevelUp: false,
  canSelfDeclare: false,
  selfDeclaredChapters: [],
  unlockedSystems: ["state-shift", "self-image", "mission", "vision"],
  currentChapter: CHAPTERS[2],
  nextChapter: CHAPTERS[3],
  vision: { identityStatement: "Consistent, disciplined builder", alignmentHistory: [] },
  lastBreathAt: null,
  chapterHistory: [
    { chapter: 1, unlockedAt: "2026-09-06T00:00:00.000Z" },
    { chapter: 2, unlockedAt: "2026-09-18T00:00:00.000Z" },
    { chapter: 3, unlockedAt: "2026-09-28T00:00:00.000Z" },
  ],
  currentMilestone: null,
  nextMilestone: null,
  levelXp: 180,
  level: 4,
  levelProgress: { level: 4, intoLevel: 10, span: 50, pct: 20, xpToNext: 40 },
  mainSessionCount: 12,
  sessionsIntoChapter: { done: 2, needed: 10, toNext: 8 },
  introducedSystems: [],
  mainSessionAvailable: true,
  lastMainSessionAt: null,
  nextMainSessionAt: null,
};

const MOCK_WINS: { wins: { _id: string; win: string; date: string }[] } = { wins: [] };

const MOCK_STATE_LOGS = {
  logs: [
    { _id: "l4", state: "stressed", timestamp: "2026-10-06T08:00:00.000Z" },
    { _id: "l3", state: "stressed", timestamp: "2026-10-05T08:00:00.000Z" },
    { _id: "l2", state: "stressed", timestamp: "2026-10-04T08:00:00.000Z" },
    { _id: "l1", state: "locked_in", timestamp: "2026-09-06T08:00:00.000Z" },
  ],
  todayMood: null,
};

const MOCK_SESSION_STATE = {
  dateKey: "2026-10-06",
  completedToday: false,
  streak: 1,
  lastBreathAt: null,
  recentKinds: [],
  mainSessionAvailable: true,
  lastMainSessionAt: null,
  nextMainSessionAt: null,
  resume: null,
  resumeDropped: null,
  locked: false,
  lockReason: null,
  requiresTier: null,
  sessionsUsed: 12,
  sessionsLimit: null,
};

const MOCK_PROGRESS = {
  weightData: [],
  bmiData: [],
  moodData: [],
  currentProgram: {
    programId: "p1",
    name: "Push Pull Legs",
    currentPhase: 1,
    currentWeek: 4,
    totalWeeks: 4,
    completedWorkouts: 12,
    totalWorkouts: 12,
    nextWorkout: "Day 1 - Upper",
  },
  stats: { currentWeight: 175, weightChange: 0, startWeight: 180, bmi: 24, avgMood: 4 },
};

function byPathMock(impl: (path: string) => unknown) {
  mockApiFetch.mockImplementation(async (path: string) => {
    const bare = path.split("?")[0] ?? path;
    return impl(bare);
  });
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <BecomingScreen />
    </SafeAreaProvider>,
  );
}

describe("NP-335: Becoming details fetch the same sources web does", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockApiFetch.mockReset();
    mockBack.mockReset();
    mockParams = {};
  });

  it("fetches goals, mind progress/wins/state/session and the active program alongside the journey", async () => {
    byPathMock((path) => {
      if (path === "/api/becoming/journey") return MOCK_JOURNEY;
      if (path === "/api/goals") return MOCK_GOALS;
      if (path === "/api/mind/progress") return MOCK_MIND_PROGRESS;
      if (path === "/api/mind/wins") return MOCK_WINS;
      if (path === "/api/mind/state") return MOCK_STATE_LOGS;
      if (path === "/api/mind/session") return MOCK_SESSION_STATE;
      if (path === "/api/progress") return MOCK_PROGRESS;
      throw new Error(`unexpected path ${path}`);
    });

    renderScreen();

    await waitFor(() => {
      const paths = mockApiFetch.mock.calls.map((c) => String(c[0]).split("?")[0]);
      expect(paths).toEqual(
        expect.arrayContaining([
          "/api/becoming/journey",
          "/api/goals",
          "/api/mind/progress",
          "/api/mind/wins",
          "/api/mind/state",
          "/api/mind/session",
          "/api/progress",
        ]),
      );
    });

    // Every call goes through the authenticated client — base URL + token —
    // not a bare path (NP-254 regressed this once already for the journey).
    for (const call of mockApiFetch.mock.calls) {
      const opts = (call[2] ?? {}) as Record<string, unknown>;
      expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
      expect(typeof opts.getToken).toBe("function");
    }
  });

  it("opens Mind's details tab showing the streak and arc fed by the fetched data, not placeholders", async () => {
    byPathMock((path) => {
      if (path === "/api/becoming/journey") return MOCK_JOURNEY;
      if (path === "/api/goals") return MOCK_GOALS;
      if (path === "/api/mind/progress") return MOCK_MIND_PROGRESS;
      if (path === "/api/mind/wins") return MOCK_WINS;
      if (path === "/api/mind/state") return MOCK_STATE_LOGS;
      if (path === "/api/mind/session") return MOCK_SESSION_STATE;
      if (path === "/api/progress") return MOCK_PROGRESS;
      throw new Error(`unexpected path ${path}`);
    });

    const { getByTestId, queryByText } = renderScreen();

    await waitFor(() => {
      expect(getByTestId("week-card-2026-10-04")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("header-details-btn"));
    });
    await act(async () => {
      fireEvent.press(getByTestId("details-tab-mind"));
    });

    await waitFor(() => {
      expect(getByTestId("mind-streak")).toBeTruthy();
    });
    expect(within(getByTestId("mind-streak")).getByText("1")).toBeTruthy();
    expect(within(getByTestId("mind-streak")).getByText("day streak")).toBeTruthy();
    // "Then" cell now has a real date instead of a dash.
    expect(queryByText("—")).toBeNull();
  });
});

describe("NP-335: BecomingDetails renders Training/Fuel/Mind/Story from web's own sources", () => {
  function renderDetails(initialTab: "story" | "training" | "fuel" | "mind") {
    return render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <BecomingDetails
          open
          onClose={jest.fn()}
          weeks={[MOCK_WEEK]}
          weighIns={MOCK_JOURNEY.weights}
          todayKey={MOCK_JOURNEY.todayKey}
          unit="lbs"
          identity={MOCK_JOURNEY.identity}
          chapter={MOCK_JOURNEY.chapter}
          becomingScore={MOCK_JOURNEY.becomingScore}
          initialTab={initialTab}
          goals={MOCK_GOALS as never}
          mindProgress={MOCK_MIND_PROGRESS as never}
          wins={MOCK_WINS.wins as never}
          stateLogs={MOCK_STATE_LOGS.logs as never}
          streak={1}
          program={MOCK_PROGRESS.currentProgram as never}
        />
      </SafeAreaProvider>,
    );
  }

  it("Training: then/now/next are real numbers, what-you-moved and best set show, the week badge and next action render", () => {
    const { getByText, queryByText } = renderDetails("training");

    // BLOCKER in the card: Then/Now/Next must not be placeholders.
    expect(queryByText("—")).toBeNull();
    expect(getByText(/This week 1\/3/)).toBeTruthy();
    expect(getByText("PRs on Sep 30")).toBeTruthy();
    expect(getByText("Push Pull Legs · 100%")).toBeTruthy();

    // What you moved
    expect(getByText("6")).toBeTruthy(); // sets
    expect(getByText("7.8k lbs")).toBeTruthy(); // load moved
    expect(getByText(/Best set:/)).toBeTruthy();
    expect(getByText("Barbell Back Squat")).toBeTruthy();

    // The next action
    expect(getByText("2 more by Saturday")).toBeTruthy();
  });

  it("Fuel: the weight plan reads then/now/next from the 181 lbs goal, with pace, adherence and the macros link", () => {
    const { getByText, getAllByText, queryByText } = renderDetails("fuel");

    expect(queryByText("No target weight yet — set one in Settings and this becomes then → now → next.")).toBeNull();
    // "On pace" reads twice: the Weight plan badge AND the next-action card title.
    expect(getAllByText("On pace").length).toBeGreaterThanOrEqual(2);
    expect(getByText("181 lbs")).toBeTruthy();
    expect(getByText(/First weigh-in 173 lbs on Sep 9/)).toBeTruthy();
    expect(getByText(/\(aim 5\)/)).toBeTruthy();
    expect(getByText("Pace, targets and macros")).toBeTruthy();
  });

  it("Mind: the streak tile, Then cell, How you've shown up and the next-chapter link all render", () => {
    const { getByTestId, getByText, queryByText } = renderDetails("mind");

    expect(getByTestId("mind-streak")).toBeTruthy();
    expect(getByText("day streak")).toBeTruthy();
    expect(queryByText("—")).toBeNull();
    expect(getByText("where you started")).toBeTruthy();

    expect(getByTestId("mind-shown-up")).toBeTruthy();
    expect(getByText("25% locked in")).toBeTruthy();
    expect(getByText("Calm the storm")).toBeTruthy();
    expect(getByText(/Next: /)).toBeTruthy();
  });

  it("Story: the week line reads lowercase 'mostly stressed', a YOU streak row appears, and the evidence wall uses web's copy", () => {
    const { getByText, getByTestId } = renderDetails("story");

    expect(getByTestId("story-summary-mind")).toBeTruthy();
    expect(getByText(/mostly stressed/)).toBeTruthy();
    expect(getByTestId("story-summary-you")).toBeTruthy();
    expect(getByText(/1-day streak/)).toBeTruthy();

    expect(getByText("Evidence wall")).toBeTruthy();
    expect(
      getByText("No wins banked yet. Bank one in a session — the proof that you’re changing builds here."),
    ).toBeTruthy();
  });

  it("Strength: the help pill and empty copy say 'Est. max', not 'Est 1RM'", () => {
    const { getByTestId, getByText } = renderDetails("training");
    fireEvent.press(getByTestId("training-subswitch-strength"));
    expect(getByText("Est. max?")).toBeTruthy();
  });
});
