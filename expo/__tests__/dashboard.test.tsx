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
          { id: "mindset", kind: "stat", size: "1x1" },
          { id: "nutrition", kind: "stat", size: "1x1" },
          { id: "workoutNow", kind: "stat", size: "2x1" },
        ],
      });
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
    if (path.startsWith("/api/goals")) {
      return Promise.resolve({
        todayKey: "2026-10-01",
        nutrition: {
          target: { weight: 175, pacePerWeek: 1 },
          unit: "lbs",
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
});
