/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockToken = "test-jwt";
let mockUser: Record<string, unknown> | null = null;
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
import { AppState } from "react-native";
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
let checkinDue = false;

function wireApiFetch() {
  mockApiFetch.mockImplementation((path: string) => {
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
          { id: "streak", kind: "stat", size: "1x1" },
          { id: "mindset", kind: "stat", size: "1x1" },
          { id: "nutrition", kind: "stat", size: "1x1" },
          { id: "workoutNow", kind: "stat", size: "2x1" },
        ],
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
    if (path.startsWith("/api/goals")) {
      return Promise.resolve({
        todayKey: "2026-10-01",
        nutrition: {
          target: { weight: 175, pacePerWeek: 1 },
          unit: "lbs",
        },
      });
    }
    if (path.startsWith("/api/streaks")) {
      return Promise.resolve({
        overall: { current: 12, best: 14, activeToday: true, freezes: 1 },
        pillars: {
          workout: { current: 4, best: 8, thisWeek: 2, target: 3, weekLost: false, unit: "days" },
          nutrition: { current: 5, best: 7, activeToday: true },
          mindset: { current: 3, best: 5, activeToday: true },
          super: {
            current: 0,
            best: 0,
            activeToday: false,
            today: { trained: true, nutrition: true, mindset: true, restDay: false, weekOnTrack: true },
          },
        },
      });
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
    checkinDue = false;
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
      expect(getByTestId("tile-streak")).toBeTruthy();
    });
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
    checkinDue = true;
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
      expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
    });
    const streakCallsBefore = callsTo("/api/streak").length;

    // Pick a mood, enter a weight, submit.
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
    checkinDue = true;
    const { getByTestId, queryByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
      expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
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
    checkinDue = true;
    mockNetInfoFetch.mockResolvedValue(AIRPLANE_MODE);
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
      expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
    });

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
    checkinDue = true;
    const { getByTestId } = render(<DashboardRoute />);
    await waitFor(() => {
      expect(getByTestId("dashboard-greeting")).toBeTruthy();
      expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
    });

    fireEvent.press(getByTestId("dashboard-checkin-modal-mood-3"));
    await act(async () => {
      fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));
    });

    await waitFor(() => {
      expect(callsTo("/api/mood").length).toBeGreaterThan(0);
    });
    expect(callsTo("/api/weight").length).toBe(0);
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
      expect(getByTestId("up-next-calendar")).toBeTruthy();
    });

    fireEvent.press(getByTestId("up-next-calendar"));

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

  describe("Daily check-in parity & server gating (NP-105)", () => {
    it("(id: e015c909) auto-prompts when due: true and stamps { action: 'shown', tz }", async () => {
      mockApiFetch.mockImplementation((path: string, _schema, init) => {
        const method = (init as { method?: string } | undefined)?.method;
        if (path.startsWith("/api/checkin") && (!method || method === "GET")) {
          return Promise.resolve({
            due: true,
            reason: "due",
            daysSinceMood: 0,
            daysSinceWeight: 0,
          });
        }
        if (path === "/api/checkin" && method === "POST") {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({});
      });

      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("dashboard-checkin-modal")).toBeTruthy();
      });

      // Verify POST /api/checkin { action: 'shown', tz } was sent
      await waitFor(() => {
        const shownPost = mockApiFetch.mock.calls.find(
          (c) =>
            c[0] === "/api/checkin" &&
            (c[2] as { method?: string })?.method === "POST" &&
            (c[2] as { body?: { action?: string } })?.body?.action === "shown",
        );
        expect(shownPost).toBeTruthy();
        const body = (shownPost![2] as { body: { tz?: number } }).body;
        expect(typeof body.tz).toBe("number");
      });
    });

    it("(id: e015c90a) Skip for Today natively posts { action: 'skip', tz } to /api/checkin", async () => {
      mockApiFetch.mockImplementation((path: string, _schema, init) => {
        const method = (init as { method?: string } | undefined)?.method;
        if (path.startsWith("/api/checkin") && (!method || method === "GET")) {
          return Promise.resolve({
            due: true,
            reason: "due",
            daysSinceMood: 0,
            daysSinceWeight: 0,
          });
        }
        if (path === "/api/checkin" && method === "POST") {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({});
      });

      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("dashboard-checkin-modal")).toBeTruthy();
      });

      // Press Skip for Today
      fireEvent.press(getByTestId("dashboard-checkin-modal-skip"));

      await waitFor(() => {
        const skipPost = mockApiFetch.mock.calls.find(
          (c) =>
            c[0] === "/api/checkin" &&
            (c[2] as { method?: string })?.method === "POST" &&
            (c[2] as { body?: { action?: string } })?.body?.action === "skip",
        );
        expect(skipPost).toBeTruthy();
        const body = (skipPost![2] as { body: { tz?: number } }).body;
        expect(typeof body.tz).toBe("number");
      });
    });

    it("(id: e015c90b) A kg member sees kg on the weight field and goal line", async () => {
      mockUser = {
        _id: "u1",
        email: "jon@example.com",
        name: "Jon",
        profile: { weightUnit: "kg" },
      };

      mockApiFetch.mockImplementation((path: string) => {
        if (path.startsWith("/api/checkin")) {
          return Promise.resolve({
            due: true,
            reason: "due",
            daysSinceMood: 0,
            daysSinceWeight: 0,
            lastWeight: 75,
          });
        }
        if (path.startsWith("/api/goals")) {
          return Promise.resolve({
            todayKey: "2026-10-01",
            nutrition: {
              target: { weight: 70 },
              unit: "kg",
            },
          });
        }
        return Promise.resolve({});
      });

      const { getByTestId, getByText } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("dashboard-checkin-modal")).toBeTruthy();
      });

      expect(getByText("Current Weight (kg)")).toBeTruthy();
      const goalLine = getByTestId("checkin-goal-line");
      expect(goalLine.props.children).toBe("Goal: 70 kg — 5 kg to go");

      mockUser = null;
    });

    it("(id: e015c90c) The mood labels are the web's words", async () => {
      mockApiFetch.mockImplementation((path: string) => {
        if (path.startsWith("/api/checkin")) {
          return Promise.resolve({
            due: true,
            reason: "due",
            daysSinceMood: 0,
            daysSinceWeight: 0,
          });
        }
        return Promise.resolve({});
      });

      const { getByTestId, getByText } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("dashboard-checkin-modal")).toBeTruthy();
      });

      expect(getByText("Bad")).toBeTruthy();
      expect(getByText("Not Great")).toBeTruthy();
      expect(getByText("Okay")).toBeTruthy();
      expect(getByText("Pretty Good")).toBeTruthy();
      expect(getByText("Great")).toBeTruthy();
    });

    it("(id: e015c909) Re-read GET /api/checkin on foreground return", async () => {
      let checkinCalls = 0;
      mockApiFetch.mockImplementation((path: string) => {
        if (path.startsWith("/api/checkin")) {
          checkinCalls += 1;
          return Promise.resolve({
            due: false,
            reason: "complete",
          });
        }
        return Promise.resolve({});
      });

      render(<DashboardRoute />);

      await waitFor(() => {
        expect(checkinCalls).toBeGreaterThanOrEqual(1);
      });
      const initialCount = checkinCalls;

      // Simulate app foregrounding
      await act(async () => {
        const changeListeners = (AppState.addEventListener as jest.Mock).mock.calls
          .filter(([event]: [string]) => event === "change")
          .map(([, listener]: [string, (status: string) => void]) => listener);
        changeListeners.forEach((listener: (status: string) => void) => listener("active"));
      });

      await waitFor(() => {
        expect(checkinCalls).toBeGreaterThan(initialCount);
      });
    });
  });

  describe("Dashboard stat tiles parity (NP-107)", () => {
    it("(id: e015c916) Each tile shows the same number as the web for the same member at the same moment", async () => {
      wireApiFetch();
      mockApiFetch.mockImplementation((path: string) => {
        if (path === "/api/auth/me") {
          return Promise.resolve({
            user: { _id: "u1", email: "jon@example.com", name: "Jon" },
          });
        }
        if (path.startsWith("/api/checkin")) {
          return Promise.resolve({ due: false, reason: "complete", todaysMood: 4 });
        }
        if (path.startsWith("/api/dashboard/layout")) {
          return Promise.resolve({
            layout: [
              { id: "mood", kind: "stat", size: "1x1" },
              { id: "weekly", kind: "stat", size: "1x1" },
              { id: "goal", kind: "stat", size: "1x1" },
              { id: "calories", kind: "stat", size: "1x1" },
              { id: "water", kind: "stat", size: "1x1" },
              { id: "weight", kind: "stat", size: "1x1" },
              { id: "workouts", kind: "stat", size: "1x1" },
            ],
          });
        }
        if (path.startsWith("/api/progress")) {
          return Promise.resolve({
            moodData: [{ date: "Oct 1", value: 4 }],
            weightData: [{ date: "Oct 1", value: 175.2 }],
            stats: { thisWeekWorkouts: 2, totalWorkouts: 42, streakDays: 5 },
            weeklyAvailability: 4,
            goal: {
              fitnessGoal: "gain_muscle",
              nutritionDirection: "gain",
              targetWeightKg: 82.1,
              startWeightKg: 79.5,
              weightUnit: "lbs",
              pace: { status: "on", eta: "~12 wks", behindByKg: 0 },
            },
          });
        }
        if (path.startsWith("/api/nutrition/log")) {
          return Promise.resolve({
            dailyTotals: { calories: 1850 },
            goals: { calories: 2000 },
            water: { current: 48, goal: 64 },
          });
        }
        return Promise.resolve({});
      });

      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("tile-mood-value").props.children).toBe("Pretty Good");
        expect(getByTestId("tile-weekly-value").props.children).toBe("2/4");
        expect(getByTestId("tile-goal-value").props.children).toContain("5.8 lbs to go");
        expect(getByTestId("tile-calories-value").props.children).toBe("1850/2000");
        expect(getByTestId("tile-water-value").props.children).toBe("48/64 oz");
        expect(getByTestId("tile-weight-value").props.children).toBe("175.2 lbs");
        expect(getByTestId("tile-workouts-value").props.children).toBe("42");
      });
    });

    it("(id: e015c917) Changing mood on the mood tile updates the web's check-in state for today", async () => {
      wireApiFetch();
      let checkinFetchCount = 0;
      mockApiFetch.mockImplementation((path: string, _schema, init) => {
        const method = (init as { method?: string } | undefined)?.method;
        if (path === "/api/auth/me") {
          return Promise.resolve({
            user: { _id: "u1", email: "jon@example.com", name: "Jon" },
          });
        }
        if (path.startsWith("/api/checkin") && (!method || method === "GET")) {
          checkinFetchCount += 1;
          return Promise.resolve({
            due: false,
            reason: "complete",
            daysSinceMood: 0,
            daysSinceWeight: 0,
          });
        }
        if (path.startsWith("/api/dashboard/layout")) {
          return Promise.resolve({
            layout: [{ id: "mood", kind: "stat", size: "1x1" }],
          });
        }
        if (path.startsWith("/api/progress")) {
          return Promise.resolve({
            moodData: [{ date: "Oct 1", value: 3 }],
            stats: { streakDays: 5, thisWeekWorkouts: 2 },
          });
        }
        if (path === "/api/mood" && method === "POST") {
          return Promise.resolve({
            success: true,
            mood: 4,
            date: "2026-10-01",
            applied: true,
            streak: { streakDays: 6, streakExtended: true },
          });
        }
        return Promise.resolve({});
      });

      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("tile-mood")).toBeTruthy();
      });

      const initialCheckinCalls = checkinFetchCount;

      // Tap the mood tile to open MoodLogSheet
      fireEvent.press(getByTestId("tile-mood"));

      await waitFor(() => {
        expect(getByTestId("dashboard-mood-sheet-option-4")).toBeTruthy();
      });

      // Pick Pretty Good (4)
      await act(async () => {
        fireEvent.press(getByTestId("dashboard-mood-sheet-option-4"));
      });

      // Verify POST /api/mood was called with the selected mood
      await waitFor(() => {
        const moodCall = mockApiFetch.mock.calls.find(
          (c) =>
            c[0] === "/api/mood" &&
            (c[2] as { method?: string })?.method === "POST",
        );
        expect(moodCall).toBeTruthy();
        const body = (moodCall![2] as { body: { mood: number } }).body;
        expect(body.mood).toBe(4);
      });

      // Verify check-in was refetched (updating today's check-in state)
      await waitFor(() => {
        expect(checkinFetchCount).toBeGreaterThan(initialCheckinCalls);
      });
    });

    it("(id: e015c918) A member with no weekly target sees 'Set a weekly target', never a fraction against an invented number", async () => {
      wireApiFetch();
      mockApiFetch.mockImplementation((path: string) => {
        if (path === "/api/auth/me") {
          return Promise.resolve({
            user: { _id: "u1", email: "jon@example.com", name: "Jon" },
          });
        }
        if (path.startsWith("/api/checkin")) {
          return Promise.resolve({ due: false, reason: "complete" });
        }
        if (path.startsWith("/api/dashboard/layout")) {
          return Promise.resolve({
            layout: [{ id: "weekly", kind: "stat", size: "1x1" }],
          });
        }
        if (path.startsWith("/api/progress")) {
          return Promise.resolve({
            stats: { thisWeekWorkouts: 2 },
            // No weeklyAvailability and no goal.weeklyAvailability
            weeklyAvailability: null,
          });
        }
        if (path.startsWith("/api/goals")) {
          return Promise.resolve({
            // No training target
            training: { target: null },
          });
        }
        return Promise.resolve({});
      });

      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("tile-weekly-value").props.children).toBe("2");
        expect(getByTestId("tile-weekly-footer").props.children).toBe("Set a weekly target");
        expect(getByTestId("tile-weekly-value").props.children).not.toContain("/");
        expect(getByTestId("tile-weekly-value").props.children).not.toContain("3");
      });
    });

    it("(id: e015c919) A kg member sees kg on the weight and goal tiles", async () => {
      wireApiFetch();
      mockUser = {
        _id: "u1",
        email: "jon@example.com",
        name: "Jon",
        profile: { weightUnit: "kg" },
      };

      mockApiFetch.mockImplementation((path: string) => {
        if (path === "/api/auth/me") {
          return Promise.resolve({
            user: mockUser,
          });
        }
        if (path.startsWith("/api/checkin")) {
          return Promise.resolve({ due: false, reason: "complete" });
        }
        if (path.startsWith("/api/dashboard/layout")) {
          return Promise.resolve({
            layout: [
              { id: "weight", kind: "stat", size: "1x1" },
              { id: "goal", kind: "stat", size: "1x1" },
            ],
          });
        }
        if (path.startsWith("/api/progress")) {
          return Promise.resolve({
            weightData: [{ date: "Oct 1", value: 75.4 }],
            goal: {
              targetWeightKg: 70.0,
              startWeightKg: 78.0,
              weightUnit: "kg",
              fitnessGoal: "lose_weight",
              nutritionDirection: "lose",
            },
          });
        }
        return Promise.resolve({});
      });

      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        const weightVal = getByTestId("tile-weight-value").props.children;
        expect(weightVal).toBe("75.4 kg");
        expect(weightVal).not.toContain("lbs");

        const goalVal = getByTestId("tile-goal-value").props.children;
        expect(goalVal).toContain("5.4 kg to go");
        expect(goalVal).not.toContain("lbs");

        const goalFoot = getByTestId("tile-goal-footer").props.children;
        expect(goalFoot).toContain("70 kg");
        expect(goalFoot).not.toContain("lbs");
      });

      mockUser = null;
    });
  });

  describe("Training cards parity (NP-106)", () => {
    function scheduleFixture() {
      const now = new Date();
      const key = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const iso = (d: Date) => `${key(d)}T00:00:00.000Z`;
      const at = (deltaDays: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() + deltaDays);
        return d;
      };
      // Rest day today: no slot dated today; the next session is tomorrow.
      return {
        schedules: [
          {
            programId: "p1",
            programName: "Hypertrophy",
            programStatus: "in-progress",
            scheduledWorkouts: [
              {
                date: iso(at(-2)),
                dayLabel: "Day 1",
                workoutTitle: "Upper A",
                status: "missed",
                phase: 1,
              },
              {
                date: iso(at(1)),
                dayLabel: "Day 3",
                workoutTitle: "Upper B",
                status: "scheduled",
                phase: 1,
              },
              {
                date: iso(at(3)),
                dayLabel: "Day 4",
                workoutTitle: "Lower B",
                status: "scheduled",
                phase: 2,
              },
            ],
          },
        ],
      };
    }

    function wireSchedule(extra?: (path: string) => unknown) {
      mockApiFetch.mockImplementation((path: string) => {
        if (typeof path === "string" && path.startsWith("/api/schedule")) {
          const method = undefined;
          void method;
          return Promise.resolve(scheduleFixture());
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
        if (path === "/api/programs/active") {
          return Promise.resolve({
            activePrograms: [{ programId: "p1", programName: "Hypertrophy" }],
          });
        }
        if (path.startsWith("/api/programs/current-workout")) {
          return Promise.resolve(currentWorkout);
        }
        if (path.startsWith("/api/dashboard/layout")) {
          return Promise.resolve({ layout: [] });
        }
        if (path.startsWith("/api/checkin")) {
          return Promise.resolve({
            due: false,
            reason: "complete",
            daysSinceMood: 0,
            daysSinceWeight: 0,
            lastWeight: null,
          });
        }
        if (path.startsWith("/api/progress")) {
          return Promise.resolve({
            stats: { totalWorkouts: 3, thisWeekWorkouts: 1 },
            currentProgram: {
              programId: "p1",
              name: "Hypertrophy",
              currentPhase: 1,
              currentWeek: 2,
              totalWeeks: 4,
              completedWorkouts: 4,
              totalWorkouts: 16,
              nextWorkout: "Upper B",
              nextWorkoutDay: "Day 3",
            },
          });
        }
        if (extra) {
          const v = extra(path);
          if (v !== undefined) return Promise.resolve(v);
        }
        return Promise.resolve({});
      });
    }

    it("(id: e015c910) on a rest day Up Next names Tomorrow with the next workout", async () => {
      wireSchedule();
      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("up-next-card")).toBeTruthy();
      });
      // Rest day: no slot dated today, so the card names the next session's
      // day — Tomorrow — exactly as the web's NextWorkoutCard does.
      expect(getByTestId("up-next-day").props.children).toBe(
        "Tomorrow: Day 3",
      );

      // The schedule window matches the web: ±14 days with the caller's tz.
      const scheduleCall = mockApiFetch.mock.calls.find((c) =>
        String(c[0]).startsWith("/api/schedule"),
      );
      expect(scheduleCall).toBeTruthy();
      const url = String(scheduleCall![0]);
      expect(url).toContain("from=");
      expect(url).toContain("to=");
      expect(url).toContain("tz=");
    });

    it("(id: e015c911) skipping a missed session PATCHes { action: 'skip', workoutDate } and refetches", async () => {
      wireSchedule();
      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("missed-workouts-card")).toBeTruthy();
      });
      const scheduleCallsBefore = callsTo("/api/schedule").length;

      await act(async () => {
        fireEvent.press(
          getByTestId(
            `missed-workout-skip-${(() => {
              const d = new Date();
              d.setDate(d.getDate() - 2);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            })()}`,
          ),
        );
      });

      await waitFor(() => {
        const skipCall = mockApiFetch.mock.calls.find(
          (c) =>
            c[0] === "/api/schedule" &&
            (c[2] as { method?: string })?.method === "PATCH" &&
            (c[2] as { body?: { action?: string } })?.body?.action === "skip",
        );
        expect(skipCall).toBeTruthy();
      });
      const skipCall = mockApiFetch.mock.calls.find(
        (c) =>
          c[0] === "/api/schedule" &&
          (c[2] as { method?: string })?.method === "PATCH",
      )!;
      const body = (skipCall[2] as { body: Record<string, unknown> }).body;
      expect(body.programId).toBe("p1");
      expect(body.workoutDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // The web sends tz in the skip body (`PATCH /api/schedule
      // { action: 'skip', workoutDate, tz }`); apiFetch merges it per
      // request in the app, and the mocked apiFetch in this test does not
      // run that merge — so assert the route contract on the wire shape
      // the app hands apiFetch: programId + action + workoutDate.
      expect(body.action).toBe("skip");

      // The schedule is re-pulled so the skipped slot leaves the list —
      // which is what removes it from the web's list too (same route).
      await waitFor(() => {
        expect(callsTo("/api/schedule").length).toBeGreaterThan(
          scheduleCallsBefore,
        );
      });
    });

    it("(id: e015c912) Start opens that exact slot (Track with day + sd)", async () => {
      wireSchedule();
      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("up-next-card")).toBeTruthy();
      });

      fireEvent.press(getByTestId("up-next-card"));

      // Track (NP-087) for the exact slot: index + phase with the web's day
      // label and slot date carried through, so finishing completes THAT slot.
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const sd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      expect(mockPush).toHaveBeenCalledWith(
        `/(tabs)/programming/p1/workout/2?phase=0&day=${encodeURIComponent("Day 3")}&sd=${encodeURIComponent(sd)}`,
      );
    });

    it("shows the first-time empty state when there is no program and no workouts", async () => {
      mockApiFetch.mockImplementation((path: string) => {
        if (typeof path === "string" && path.startsWith("/api/schedule")) {
          return Promise.resolve({ schedules: [] });
        }
        if (path === "/api/auth/me") {
          return Promise.resolve({
            user: { _id: "u1", email: "jon@example.com", name: "Jon" },
          });
        }
        if (path === "/api/programs/active") {
          return Promise.resolve({ activePrograms: [] });
        }
        if (path.startsWith("/api/progress")) {
          return Promise.resolve({
            stats: { totalWorkouts: 0, thisWeekWorkouts: 0 },
            currentProgram: null,
          });
        }
        if (path.startsWith("/api/dashboard/layout")) {
          return Promise.resolve({ layout: [] });
        }
        if (path.startsWith("/api/checkin")) {
          return Promise.resolve({ due: false, reason: "complete" });
        }
        return Promise.resolve({});
      });

      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("dashboard-empty-state")).toBeTruthy();
      });
      fireEvent.press(getByTestId("dashboard-empty-state-browse"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming");
    });

    it("Progress quick link opens History (NP-112) until native progress exists", async () => {
      wireSchedule();
      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("dashboard-quick-link-progress")).toBeTruthy();
      });
      fireEvent.press(getByTestId("dashboard-quick-link-progress"));
      expect(mockPush).toHaveBeenCalledWith("/progress");
    });
  });
});
