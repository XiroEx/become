/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

let mockUser: Record<string, unknown> | null = null;
const mockToken = "test-jwt";
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

// Mock apiFetch; useFetch validates against the (real) schema only inside the
// real apiFetch — with apiFetch mocked, the resolved value flows straight to
// the hook, so we return schema-shaped fixtures.
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

// The check-in's two writes go through the offline queue (NP-190), which reads
// the JWT from the secure store: a replay fires on reconnect, which may be long
// after this screen was unmounted.
jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return "test-jwt";
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

import NetInfo from "@react-native-community/netinfo";
import { ApiError, apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { getOfflineWrites } from "@/lib/offline/writes";
import { localDateKey } from "@/lib/nutrition/localDay";
import { writeCachedLayout } from "@/lib/dashboard/tileLayout";
import DashboardRoute from "../app/(app)/(tabs)/dashboard/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockNetInfoFetch = NetInfo.fetch as unknown as jest.Mock;
const ONLINE = { isConnected: true, isInternetReachable: true };
const AIRPLANE_MODE = { isConnected: false, isInternetReachable: false };

const DEFAULT_CURRENT_WORKOUT: Record<string, unknown> = {
  workout: { title: "Upper A", day: "Day 3", exercises: [{}, {}, {}] },
  phase: 2,
  day: "Day 3",
  phaseInfo: { name: "Phase 2" },
};

/** Swapped by the navigation tests to change the day label / phase. */
let currentWorkout: Record<string, unknown> = DEFAULT_CURRENT_WORKOUT;
let checkInStatus: Record<string, unknown> = {
  due: false,
  reason: "complete",
  complete: true,
};
const DEFAULT_USER_GOALS: Record<string, unknown> = {
  todayKey: "2026-09-30",
  nutrition: {
    unit: "lbs",
    status: "active",
    kind: "weight",
    direction: "lose",
    startedAt: null,
    achievedAt: null,
    baseline: { weight: 185, date: "2026-09-01" },
    journeyStart: { weight: 185, date: "2026-09-01" },
    now: { weight: 182, date: "2026-09-29", fourWeeksAgo: 185 },
    target: { weight: 175, paceKgPerWeek: 0.5, pacePerWeek: 1.1, bandKg: 1 },
    pace: null,
    adherence: null,
    proteinGoal: 150,
    suggestion: { message: "Stay consistent" },
  },
  training: {
    status: "none",
    startedAt: null,
    target: { daysPerWeek: 4, programId: null },
    thisWeek: { done: 2, remaining: 2, chancesLeft: 3, weekLost: false },
    avgLast4: 3.5,
    weeklyCounts: [3, 4, 4, 3],
    baseline: { daysPerWeek: 4, date: null, prs: [] },
    lifts: [],
    suggestedLifts: [],
    hasLiftTargets: false,
  },
};
let userGoals: Record<string, unknown> = DEFAULT_USER_GOALS;

function wireApiFetch() {
  mockApiFetch.mockImplementation((path: string, _schema, init) => {
    const method = (init as { method?: string } | undefined)?.method ?? "GET";
    if (path === "/api/auth/me") {
      return Promise.resolve({
        user: mockUser ?? { _id: "u1", email: "jon@example.com", name: "Jon" },
      });
    }
    if (path === "/api/streak") {
      return Promise.resolve({
        streakDays: 5,
        longestStreak: 9,
        streakFreezes: 1,
      });
    }
    if (path === "/api/programs/active") {
      return Promise.resolve({
        activePrograms: [{ programId: "p1", programName: "Hypertrophy" }],
      });
    }
    if (path.startsWith("/api/programs/current-workout")) {
      // The shape the webapp route answers with: the workout, a 1-BASED phase
      // number, and the DAY LABEL the web addresses the session by
      // (`…/workout?day=Day 3`).
      return Promise.resolve(currentWorkout);
    }
    if (path.startsWith("/api/dashboard/layout")) {
      return Promise.resolve({
        layout: [
          { id: "mindset", kind: "stat", size: "1x1" },
          { id: "nutrition", kind: "stat", size: "1x1" },
          { id: "workoutNow", kind: "stat", size: "2x1" },
          { id: "weight", kind: "stat", size: "1x1" },
        ],
      });
    }
    if (path.startsWith("/api/checkin")) {
      if (method === "POST") return Promise.resolve({ success: true });
      return Promise.resolve(checkInStatus);
    }
    if (path.startsWith("/api/goals")) {
      return Promise.resolve(userGoals);
    }
    if (path === "/api/mood" || path === "/api/weight") {
      return Promise.resolve({ success: true });
    }
    return Promise.resolve({});
  });
}

function callsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) =>
    String(c[0]).startsWith(path),
  );
}

describe("DashboardRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockNetInfoFetch.mockResolvedValue(ONLINE);
    currentWorkout = DEFAULT_CURRENT_WORKOUT;
    mockUser = null;
    checkInStatus = { due: false, reason: "complete", complete: true };
    userGoals = DEFAULT_USER_GOALS;
    wireApiFetch();
  });

  afterEach(async () => {
    // One queue for the app: leave nothing for the next test to replay.
    await getOfflineWrites().clear();
    mockNetInfoFetch.mockResolvedValue(ONLINE);
  });

  it("fires the user/streak/active GETs with baseUrl + token, then current-workout", async () => {
    render(<DashboardRoute />);

    await waitFor(() => {
      expect(callsTo("/api/auth/me").length).toBeGreaterThan(0);
      expect(callsTo("/api/streak").length).toBeGreaterThan(0);
      expect(callsTo("/api/programs/active").length).toBeGreaterThan(0);
    });

    for (const path of ["/api/auth/me", "/api/streak", "/api/programs/active"]) {
      const call = callsTo(path)[0]!;
      const opts = call[2] as {
        baseUrl?: string;
        getToken?: () => string | undefined;
      };
      expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
      expect(opts.getToken?.()).toBe(mockToken);
    }

    // Dependent fetch: active program id drives the current-workout call.
    await waitFor(() => {
      expect(callsTo("/api/programs/current-workout").length).toBeGreaterThan(0);
    });
    expect(String(callsTo("/api/programs/current-workout")[0]![0])).toContain(
      "programId=p1",
    );
  });

  it("passes real props through to the presentational screen", async () => {
    const { getByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-greeting").props.children).toBe("Hey, Jon");
    });
    expect(getByTestId("dashboard-streak")).toBeTruthy();
    await waitFor(() => {
      expect(getByTestId("dashboard-today-workout").props.children).toBe(
        "Upper A",
      );
    });
    // exerciseCount 3 → "3 exercise" + "s"
    const exText = getByTestId("dashboard-today-exercises").props.children;
    expect(Array.isArray(exText) ? exText.join("") : exText).toContain("3");
  });

  it("pull-to-refresh re-fires the fetches", async () => {
    const { getByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });
    const before = callsTo("/api/auth/me").length;

    await act(async () => {
      getByTestId("dashboard-scroll").props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(callsTo("/api/auth/me").length).toBeGreaterThan(before);
    });
  });

  it("surfaces an inline error when a fetch fails", async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockRejectedValue(new Error("boom"));
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-error")).toBeTruthy();
    });
  });

  it("check-in fires POST /api/mood + /api/weight with bodies+baseUrl and refreshes the streak", async () => {
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });
    const streakCallsBefore = callsTo("/api/streak").length;

    // Open the check-in modal, pick a mood, enter a weight, submit.
    fireEvent.press(getByTestId("dashboard-open-checkin"));
    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-4"));
    fireEvent.changeText(getByTestId("dashboard-checkin-modal-weight"), "183");
    await act(async () => {
      fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    });

    await waitFor(() => {
      expect(callsTo("/api/mood").length).toBeGreaterThan(0);
      expect(callsTo("/api/weight").length).toBeGreaterThan(0);
    });

    const moodCall = callsTo("/api/mood")[0]!;
    expect(moodCall[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
      }),
    );
    expect(
      (moodCall[2] as { getToken?: () => string | undefined }).getToken?.(),
    ).toBe(mockToken);

    // Each write carries the LOCAL DAY it was made on (NP-189/NP-190), so the
    // same body is correct whether it is sent now or replayed after midnight.
    const moodBody = (moodCall[2] as { body: Record<string, unknown> }).body;
    expect(moodBody.mood).toBe(4);
    expect(moodBody.date).toBe(localDateKey(new Date()));
    expect(typeof moodBody.loggedAt).toBe("string");

    const weightCall = callsTo("/api/weight")[0]!;
    expect(weightCall[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
      }),
    );
    const weightBody = (weightCall[2] as { body: Record<string, unknown> }).body;
    expect(weightBody.weight).toBe(183);
    expect(weightBody.date).toBe(localDateKey(new Date()));

    // Streak re-pulled after the check-in.
    await waitFor(() => {
      expect(callsTo("/api/streak").length).toBeGreaterThan(streakCallsBefore);
    });
  });

  // A REFUSAL, not a missing connection. Since NP-190 an unreachable server is
  // no longer an error the member sees — the write is kept and replayed (see
  // the airplane-mode test below). A 400 is the server's final answer, so
  // retrying cannot help and the modal must say so.
  it("surfaces an error in the check-in modal when the server REFUSES the write", async () => {
    const { getByTestId, queryByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });

    // Make the mood POST fail; keep the GETs succeeding.
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/mood") {
        return Promise.reject(new ApiError(400, { error: "Invalid mood value" }));
      }
      if (path === "/api/auth/me") {
        return Promise.resolve({
          user: { _id: "u1", email: "jon@example.com", name: "Jon" },
        });
      }
      if (path === "/api/streak") {
        return Promise.resolve({
          streakDays: 5,
          longestStreak: 9,
          streakFreezes: 1,
        });
      }
      return Promise.resolve({});
    });

    fireEvent.press(getByTestId("dashboard-open-checkin"));
    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-4"));
    await act(async () => {
      fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    });

    // The inline modal error appears and the modal stays open (not dismissed).
    await waitFor(() => {
      expect(getByTestId("dashboard-checkin-modal-error")).toBeTruthy();
    });
    expect(queryByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
  });

  // NP-190's first acceptance: the check-in a member makes on a plane.
  it("a check-in made in airplane mode is kept and replayed on its own day", async () => {
    mockNetInfoFetch.mockResolvedValue(AIRPLANE_MODE);
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });

    fireEvent.press(getByTestId("dashboard-open-checkin"));
    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-4"));
    fireEvent.changeText(getByTestId("dashboard-checkin-modal-weight"), "183");
    await act(async () => {
      fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    });

    // Nothing was sent, and nothing was lost — and no error was raised at the
    // member, because there is nothing for them to do about it.
    expect(callsTo("/api/mood").length).toBe(0);
    expect(callsTo("/api/weight").length).toBe(0);
    expect(getOfflineWrites().pending()).toBe(2);

    // The connection returns.
    mockNetInfoFetch.mockResolvedValue(ONLINE);
    await act(async () => {
      await getOfflineWrites().flush();
    });

    const today = localDateKey(new Date());
    expect(callsTo("/api/mood").length).toBe(1);
    expect(callsTo("/api/weight").length).toBe(1);
    expect(
      (callsTo("/api/mood")[0]![2] as { body: Record<string, unknown> }).body
        .date,
    ).toBe(today);
    expect(
      (callsTo("/api/weight")[0]![2] as { body: Record<string, unknown> }).body
        .date,
    ).toBe(today);
    expect(getOfflineWrites().pending()).toBe(0);
  });

  it("check-in logs mood only when weight is left blank", async () => {
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });

    fireEvent.press(getByTestId("dashboard-open-checkin"));
    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-3"));
    await act(async () => {
      fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    });

    await waitFor(() => {
      expect(callsTo("/api/mood").length).toBeGreaterThan(0);
    });
    expect(callsTo("/api/weight").length).toBe(0);
  });

  // ─── Acceptance Criterion 1: e015c909 ──────────────────────────────────────
  it("automatically opens check-in modal and stamps 'shown' when /api/checkin is due (id: e015c909)", async () => {
    checkInStatus = {
      due: true,
      reason: "due",
      complete: false,
      daysSinceMood: 1,
      daysSinceWeight: 1,
      lastWeight: 180,
    };

    const { getByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
    });

    // Stamped 'shown' on the server
    await waitFor(() => {
      const shownCalls = mockApiFetch.mock.calls.filter(
        (c) =>
          String(c[0]).startsWith("/api/checkin") &&
          (c[2] as { body?: { action?: string } })?.body?.action === "shown",
      );
      expect(shownCalls.length).toBeGreaterThan(0);
    });
  });

  it("does not open check-in modal when /api/checkin is already complete (checked in on web) (id: e015c909)", async () => {
    checkInStatus = {
      due: false,
      reason: "complete",
      complete: true,
    };

    const { getByTestId, queryByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });

    expect(queryByTestId("dashboard-checkin-modal-mood-row")).toBeNull();
  });

  // ─── Acceptance Criterion 2: e015c90a ──────────────────────────────────────
  it("Skip for Today posts action 'skip' to /api/checkin and keeps it closed (id: e015c90a)", async () => {
    checkInStatus = {
      due: true,
      reason: "due",
      complete: false,
      daysSinceMood: 0,
      daysSinceWeight: 0,
    };

    const { getByTestId, queryByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("dashboard-checkin-modal-skip"));
    });

    await waitFor(() => {
      const skipCalls = mockApiFetch.mock.calls.filter(
        (c) =>
          String(c[0]).startsWith("/api/checkin") &&
          (c[2] as { body?: { action?: string } })?.body?.action === "skip",
      );
      expect(skipCalls.length).toBeGreaterThan(0);
    });

    expect(queryByTestId("dashboard-checkin-modal-mood-row")).toBeNull();
  });

  // ─── Acceptance Criterion 3: e015c90b ──────────────────────────────────────
  it("shows kg for a kg member in check-in modal and live goal line (id: e015c90b)", async () => {
    mockUser = {
      _id: "u1",
      email: "jon@example.com",
      name: "Jon",
      profile: { weightUnit: "kg" },
    };
    checkInStatus = {
      due: true,
      reason: "due",
      complete: false,
      lastWeight: 80,
    };
    userGoals = {
      ...DEFAULT_USER_GOALS,
      nutrition: {
        ...(DEFAULT_USER_GOALS.nutrition as Record<string, unknown>),
        unit: "kg",
        target: { weight: 75, paceKgPerWeek: 0.5, pacePerWeek: 0.5, bandKg: 1 },
      },
    };

    const { getByTestId, getByText } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
    });

    expect(getByText("Weight (kg) — optional")).toBeTruthy();
    expect(getByTestId("dashboard-checkin-modal-goal-line").props.children).toContain("kg");
  });

  it("tapping the Weight tile opens WeightLogSheet with member unit and goal line", async () => {
    const { getByTestId } = render(<DashboardRoute />);

    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
    });

    fireEvent.press(getByTestId("tile-weight"));

    await waitFor(() => {
      expect(getByTestId("dashboard-weight-sheet-title")).toBeTruthy();
    });
  });
});

// THE TWO BUTTONS THAT DID NOTHING.
//
// `DashboardScreen` shipped with `onPress={onStartWorkout ?? (() => {})}` and
// this route never passed one, so Start workout rendered, pressed, animated —
// and went nowhere. The prop is required now; these assertions are about WHERE
// it goes.
describe("DashboardRoute navigation", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    currentWorkout = DEFAULT_CURRENT_WORKOUT;
    wireApiFetch();
  });

  it("Start workout opens the current workout's overview, by day label and phase", async () => {
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-start-workout")).toBeTruthy();
    });

    fireEvent.press(getByTestId("dashboard-start-workout"));

    // The web opens `…/workout?day=Day 3`; the native route addresses the
    // workout by index, so "Day 3" → 2 (workoutIndexFromDayLabel) and the
    // 1-based phase 2 → `?phase=1`.
    expect(mockPush).toHaveBeenCalledWith(
      "/(tabs)/programming/p1/workout/2?phase=1",
    );
  });

  it("falls back to the first workout of phase 1 when the response has no day", async () => {
    currentWorkout = {
      workout: { title: "Upper A", exercises: [{}] },
      phaseInfo: { name: "Phase 1" },
    };
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-start-workout")).toBeTruthy();
    });

    fireEvent.press(getByTestId("dashboard-start-workout"));

    expect(mockPush).toHaveBeenCalledWith(
      "/(tabs)/programming/p1/workout/0?phase=0",
    );
  });

  it("Calendar opens the calendar screen", async () => {
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-open-calendar")).toBeTruthy();
    });

    fireEvent.press(getByTestId("dashboard-open-calendar"));

    expect(mockPush).toHaveBeenCalledWith("/(tabs)/calendar");
  });

  it("still opens settings from the gear — the store's deletion path", async () => {
    // storeReadiness.test.tsx (webapp) string-matches this wiring, because it
    // is the only way to Delete account in a store build.
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-open-settings")).toBeTruthy();
    });

    fireEvent.press(getByTestId("dashboard-open-settings"));

    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("fires the layout GET with baseUrl + token, and NEVER sends statPref", async () => {
    render(<DashboardRoute />);
    await waitFor(() => {
      expect(callsTo("/api/dashboard/layout").length).toBeGreaterThan(0);
    });

    const call = callsTo("/api/dashboard/layout")[0]!;
    const url = String(call[0]);
    expect(url).toBe("/api/dashboard/layout");
    expect(url).not.toContain("statPref");

    const opts = call[2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);
  });

  it("action tiles from layout trigger navigation to Mind, Nutrition, and Workout Now", async () => {
    const { getByTestId, queryByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("tilegrid")).toBeTruthy();
      expect(getByTestId("tile-mindset")).toBeTruthy();
    });

    // Mindset opens Mind tab and auto-starts (?start=1)
    fireEvent.press(getByTestId("tile-mindset"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/mind?start=1");

    // Nutrition opens Nutrition tab
    fireEvent.press(getByTestId("tile-nutrition"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition");

    // Workout Now opens NP-076's sheet
    expect(queryByTestId("dashboard-workout-now-sheet-start")).toBeNull();
    fireEvent.press(getByTestId("tile-workoutNow"));
    expect(getByTestId("dashboard-workout-now-sheet-start")).toBeTruthy();
  });

  it("relaunching with no network renders the cached layout", async () => {
    await writeCachedLayout([
      { id: "mindset", kind: "stat", size: "1x1" },
      { id: "workoutNow", kind: "stat", size: "2x1" },
    ]);

    // Force network fetch to reject (offline)
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/dashboard/layout") {
        return Promise.reject(new Error("Network unavailable"));
      }
      if (path === "/api/auth/me") {
        return Promise.resolve({
          user: { _id: "u1", email: "jon@example.com", name: "Jon" },
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("tilegrid")).toBeTruthy();
      expect(getByTestId("tile-mindset")).toBeTruthy();
      expect(getByTestId("tile-workoutNow")).toBeTruthy();
    });
  });
});
