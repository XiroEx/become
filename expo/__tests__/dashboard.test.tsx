/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockToken = "test-jwt";
let mockUser: { profile?: { weightUnit?: "lbs" | "kg" }; name?: string } | null = null;
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
import { clearAll } from "@/lib/cache/lastKnown";
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
let appStateListener: ((status: AppStateStatus) => void) | null = null;
let mockCheckInResponse: Record<string, unknown> = {
  due: false,
  complete: false,
  daysSinceMood: 0,
  daysSinceWeight: 0,
  lastWeight: null,
};

function wireApiFetch() {
  mockApiFetch.mockImplementation((path: string, _s, init) => {
    const method = (init as { method?: string } | undefined)?.method;
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
      return Promise.resolve({
        layout: [
          { id: "mindset", kind: "stat", size: "1x1" },
          { id: "nutrition", kind: "stat", size: "1x1" },
          { id: "workoutNow", kind: "stat", size: "2x1" },
        ],
      });
    }
    if (path.startsWith("/api/checkin")) {
      if (method === "POST") {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve(mockCheckInResponse);
    }
    if (path.startsWith("/api/goals")) {
      return Promise.resolve({
        todayKey: "2026-10-01",
        nutrition: {
          unit: "lbs",
          status: "active",
          kind: "weight",
          direction: "lose",
          startedAt: null,
          achievedAt: null,
          baseline: { date: null, weight: 190, diff: 0 },
          journeyStart: { date: null, weight: 190, diff: 0 },
          now: { date: null, weight: 180, diff: -10, fourWeeksAgo: null },
          target: {
            weight: 170,
            paceKgPerWeek: 0.5,
            pacePerWeek: 1.1,
            bandKg: 1,
          },
          pace: null,
          adherence: null,
          proteinGoal: null,
          suggestion: {
            key: "none",
            title: "",
            sub: "",
            severity: "info",
            url: "",
          },
        },
        training: { daysPerWeek: 4, programId: null },
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
  beforeEach(async () => {
    await clearAll();
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockNetInfoFetch.mockResolvedValue(ONLINE);
    currentWorkout = DEFAULT_CURRENT_WORKOUT;
    mockUser = null;
    mockCheckInResponse = {
      due: false,
      complete: false,
      daysSinceMood: 0,
      daysSinceWeight: 0,
      lastWeight: null,
    };
    appStateListener = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation(((event: string, listener: (s: AppStateStatus) => void) => {
      if (event === "change") appStateListener = listener;
      return { remove: jest.fn() };
    }) as never);
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
  beforeEach(async () => {
    await clearAll();
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockNetInfoFetch.mockResolvedValue(ONLINE);
    currentWorkout = DEFAULT_CURRENT_WORKOUT;
    mockUser = null;
    mockCheckInResponse = {
      due: false,
      complete: false,
      daysSinceMood: 0,
      daysSinceWeight: 0,
      lastWeight: null,
    };
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
    ], mockToken);

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

  describe("Daily check-in server gating and sync (NP-105)", () => {
    it("auto-prompts when /api/checkin returns due: true and stamps shown", async () => {
      mockCheckInResponse = {
        due: true,
        daysSinceMood: 0,
        daysSinceWeight: 0,
        lastWeight: 180,
      };

      const { getByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("dashboard-checkin-modal-mood-row")).toBeTruthy();
      });

      // Stamps shown on the server
      await waitFor(() => {
        const checkinPosts = mockApiFetch.mock.calls.filter(
          (c) =>
            String(c[0]).startsWith("/api/checkin") &&
            (c[2] as { method?: string })?.method === "POST",
        );
        expect(checkinPosts.length).toBeGreaterThan(0);
        const postBody = (checkinPosts[0]![2] as { body: Record<string, unknown> }).body;
        expect(postBody.action).toBe("shown");
        expect(typeof postBody.tz).toBe("number");
      });
    });

    it("does not auto-prompt when /api/checkin returns due: false", async () => {
      mockCheckInResponse = {
        due: false,
        complete: true,
        daysSinceMood: 0,
        daysSinceWeight: 0,
      };

      const { getByTestId, queryByTestId } = render(<DashboardRoute />);
      await waitFor(() => {
        expect(getByTestId("dashboard-greeting")).toBeTruthy();
      });
      expect(queryByTestId("dashboard-checkin-modal-mood-row")).toBeNull();
    });

    it("Skip for Today posts { action: 'skip', tz } to /api/checkin", async () => {
      mockCheckInResponse = {
        due: true,
        daysSinceMood: 0,
        daysSinceWeight: 0,
        lastWeight: 180,
      };

      const { getByTestId, queryByTestId } = render(<DashboardRoute />);

      await waitFor(() => {
        expect(getByTestId("dashboard-checkin-modal-skip")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("dashboard-checkin-modal-skip"));
      });

      await waitFor(() => {
        const skipPosts = mockApiFetch.mock.calls.filter((c) => {
          if (!String(c[0]).startsWith("/api/checkin")) return false;
          if ((c[2] as { method?: string })?.method !== "POST") return false;
          return (c[2] as { body?: { action?: string } })?.body?.action === "skip";
        });
        expect(skipPosts.length).toBeGreaterThan(0);
        const postBody = (skipPosts[0]![2] as { body: Record<string, unknown> }).body;
        expect(postBody.action).toBe("skip");
        expect(typeof postBody.tz).toBe("number");
      });

      expect(queryByTestId("dashboard-checkin-modal-mood-row")).toBeNull();
    });

    it("re-reads GET /api/checkin when app returns to foreground", async () => {
      render(<DashboardRoute />);

      await waitFor(() => {
        expect(
          mockApiFetch.mock.calls.filter((c) =>
            String(c[0]).startsWith("/api/checkin"),
          ).length,
        ).toBeGreaterThan(0);
      });

      const countBefore = mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/checkin"),
      ).length;

      // Simulate app state transition to active
      await act(async () => {
        appStateListener?.("active");
      });

      await waitFor(() => {
        const countAfter = mockApiFetch.mock.calls.filter((c) =>
          String(c[0]).startsWith("/api/checkin"),
        ).length;
        expect(countAfter).toBeGreaterThan(countBefore);
      });
    });

    it("a kg member sees kg on the weight field and goal line", async () => {
      mockUser = {
        profile: { weightUnit: "kg" },
      };

      const { getByTestId, getByText } = render(<DashboardRoute />);
      await waitFor(() => {
        expect(getByTestId("dashboard-greeting")).toBeTruthy();
      });

      fireEvent.press(getByTestId("dashboard-open-checkin"));
      expect(getByText("Current Weight (kg)")).toBeTruthy();
    });
  });
});
