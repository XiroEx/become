/* eslint-disable import/first */
// NP-134 — SESSIONS HUB: saved, starred and planned sessions under the
// custom-sessions allowance.
//
// Native port of the Sessions tab in
// `webapp/app/dashboard/workout/hub/HubClient.tsx`, at
// `expo/app/(app)/(tabs)/programming/sessions.tsx` with pure helpers in
// `expo/lib/quickSession/sessionsHub.ts`.
//
// Fetch is mocked at the `apiFetch` seam (no network); the stash is
// AsyncStorage-backed (mocked) and the router is mocked. The three acceptance
// ids, each asserted on its own below.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
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

jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    __esModule: true,
    ...actual,
    useEntitlements: () => ({
      data: null,
      loading: false,
      enforced: false,
      refresh: jest.fn(),
      feature: () => null,
      canCreate: () => true,
    }),
  };
});

const upgradeSheetCalls: unknown[] = [];
jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: (gate: unknown) => {
    upgradeSheetCalls.push(gate);
    return true;
  },
  hideUpgradeSheet: jest.fn(),
  getUpgradeSheetGate: () => null,
  subscribeToUpgradeSheet: () => () => {},
}));

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, apiFetch } from "@become/api-client";
import SessionsHubRoute from "../app/(app)/(tabs)/programming/sessions";
import {
  formatPlannedDate,
  formatSessionDate,
  moveInArray,
  sortFavoritesFirst,
} from "@/lib/quickSession/sessionsHub";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const EXERCISES = [
  {
    exerciseSlug: "bench-press",
    name: "Bench Press",
    trackingType: "reps_weight",
    sets: 3,
    reps: "8-12",
    rest: "90s",
  },
];

function historyBody(
  logs: Record<string, unknown>[],
  favoriteSessionOrder: string[] = [],
) {
  return { logs, favoriteSessionOrder };
}

function logEntry(overrides: Record<string, unknown> = {}) {
  return {
    kind: "quick",
    title: "Morning Pump",
    date: "2026-10-01T12:00:00.000Z",
    duration: null,
    exerciseCount: 1,
    completedSets: 3,
    completed: true,
    skipped: false,
    favorite: false,
    sessionId: "qs-1",
    exercises: EXERCISES,
    ...overrides,
  };
}

function installHistory(
  logs: Record<string, unknown>[],
  favoriteOrder: string[] = [],
  planned: Record<string, unknown>[] = [],
) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/workouts/logs")) {
      return historyBody(logs, favoriteOrder);
    }
    if (String(path).startsWith("/api/workouts/planned")) {
      return { planned };
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  upgradeSheetCalls.length = 0;
  mockApiFetch.mockReset();
  return AsyncStorage.clear();
});

describe("sessionsHub helpers match the web both ways", () => {
  test("moveInArray moves forward and backward", () => {
    expect(moveInArray([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveInArray([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
  });

  test("sortFavoritesFirst floats favorites in favoriteOrder, others keep order", () => {
    const sessions = [
      { sessionId: "a", favorite: true, date: "2026-01-01T12:00:00.000Z" },
      { sessionId: "b", favorite: true, date: "2026-08-01T12:00:00.000Z" },
      { sessionId: "c", favorite: false, date: "2026-09-01T12:00:00.000Z" },
    ];
    const { favorites, others } = sortFavoritesFirst(sessions, ["b", "a"]);
    expect(favorites.map((s) => s.sessionId)).toEqual(["b", "a"]);
    expect(others.map((s) => s.sessionId)).toEqual(["c"]);
  });

  test("sortFavoritesFirst without an order falls back to newest-first", () => {
    const sessions = [
      { sessionId: "a", favorite: true, date: "2026-01-01T12:00:00.000Z" },
      { sessionId: "b", favorite: true, date: "2026-08-01T12:00:00.000Z" },
    ];
    const { favorites } = sortFavoritesFirst(sessions, []);
    expect(favorites.map((s) => s.sessionId)).toEqual(["b", "a"]);
  });

  test("date labels match the web", () => {
    const now = new Date("2026-10-07T12:00:00");
    expect(formatSessionDate("2026-10-07T08:00:00", now)).toBe("Today");
    expect(formatSessionDate("2026-10-06T08:00:00", now)).toBe("Yesterday");
    expect(formatPlannedDate("2026-10-07T18:00:00", now)).toBe("Today");
    expect(formatPlannedDate("2026-10-08T18:00:00", now)).toBe("Tomorrow");
  });
});

// id: e015c9b1 — Starring a fourth session as a free member shows the upgrade
// sheet; unstarring always works.
describe("e015c9b1: star gate shows the upgrade sheet, unstar always works", () => {
  test("a 403 on star rolls back and raises the upgrade sheet", async () => {
    installHistory([logEntry({ sessionId: "qs-1", title: "Morning Pump", favorite: false })]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-favorite-qs-1")).toBeTruthy());

    const gate = {
      error: "You've starred all 3 of your free sessions.",
      feature: "custom-sessions",
      requiresTier: "plus",
      limit: 3,
    };
    mockApiFetch.mockImplementation(async (path: string, _schema: unknown, init?: { method?: string }) => {
      if (String(path).startsWith("/api/workouts/logs")) {
        return historyBody([logEntry({ sessionId: "qs-1", favorite: false })]);
      }
      if (String(path).startsWith("/api/workouts/planned")) return { planned: [] };
      if (path === "/api/workouts/session" && init?.method === "PATCH") {
        throw new ApiError(403, gate);
      }
      throw new Error(`unexpected ${path}`);
    });

    fireEvent.press(screen.getByTestId("sessions-favorite-qs-1"));
    await waitFor(() => expect(upgradeSheetCalls.length).toBe(1));
    expect(upgradeSheetCalls[0]).toMatchObject({ feature: "custom-sessions" });
    // Rolled back: still offers "Add to favorites".
    expect(screen.getByTestId("sessions-favorite-qs-1").props.accessibilityLabel).toBe("Add to favorites");
    const patch = mockApiFetch.mock.calls.find((c) => c[0] === "/api/workouts/session");
    expect(patch?.[2]).toMatchObject({ method: "PATCH", body: { id: "qs-1", favorite: true } });
  });

  test("unstarring sends favorite:false and keeps the change", async () => {
    installHistory([logEntry({ sessionId: "qs-1", title: "Morning Pump", favorite: true })]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-favorite-qs-1")).toBeTruthy());
    expect(screen.getByTestId("sessions-favorite-qs-1").props.accessibilityLabel).toBe(
      "Remove from favorites",
    );

    // The toggle is optimistic: the label flips the moment the star is
    // pressed, before the PATCH resolves. Only the PATCH mock changes here —
    // the list mock keeps answering so no refetch can overwrite the change.
    mockApiFetch.mockImplementation(async (path: string, _schema: unknown, init?: { method?: string }) => {
      if (String(path).startsWith("/api/workouts/logs")) {
        return historyBody([logEntry({ sessionId: "qs-1", favorite: true })]);
      }
      if (String(path).startsWith("/api/workouts/planned")) return { planned: [] };
      if (path === "/api/workouts/session" && init?.method === "PATCH") {
        return { success: true };
      }
      throw new Error(`unexpected ${path}`);
    });

    fireEvent.press(screen.getByTestId("sessions-favorite-qs-1"));
    await waitFor(() =>
      expect(
        mockApiFetch.mock.calls.some(
          (c) =>
            c[0] === "/api/workouts/session" &&
            (c[2] as { body?: unknown })?.body &&
            JSON.stringify((c[2] as { body: unknown }).body).includes('"favorite":false'),
        ),
      ).toBe(true),
    );
    expect(upgradeSheetCalls.length).toBe(0);
    // Optimistic unstar: the row offers "Add to favorites" again.
    await waitFor(() =>
      expect(screen.getByTestId("sessions-favorite-qs-1").props.accessibilityLabel).toBe("Add to favorites"),
    );
  });
});

// id: e015c9b2 — The favourites order matches the web both ways.
describe("e015c9b2: favourites order matches the web both ways", () => {
  test("server favoriteSessionOrder drives display order, and a move persists the FULL order", async () => {
    installHistory(
      [
        logEntry({ sessionId: "qs-a", title: "Alpha", favorite: true, date: "2026-10-01T12:00:00.000Z" }),
        logEntry({ sessionId: "qs-b", title: "Beta", favorite: true, date: "2026-10-02T12:00:00.000Z" }),
        logEntry({ sessionId: "qs-c", title: "Gamma", favorite: false, date: "2026-10-03T12:00:00.000Z" }),
      ],
      ["qs-b", "qs-a"],
    );
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-favorite-qs-a")).toBeTruthy());

    // Server order wins over date: Beta (qs-b) renders before Alpha (qs-a).
    const favA = screen.getByTestId("sessions-move-down-qs-a");
    const favB = screen.getByTestId("sessions-move-up-qs-b");
    expect(favA).toBeTruthy();
    expect(favB).toBeTruthy();

    mockApiFetch.mockImplementation(async (path: string, _schema: unknown, init?: { method?: string }) => {
      if (String(path).startsWith("/api/workouts/logs")) {
        return historyBody(
          [
            logEntry({ sessionId: "qs-a", title: "Alpha", favorite: true }),
            logEntry({ sessionId: "qs-b", title: "Beta", favorite: true }),
          ],
          ["qs-b", "qs-a"],
        );
      }
      if (String(path).startsWith("/api/workouts/planned")) return { planned: [] };
      if (path === "/api/workouts/favorite-order" && init?.method === "PATCH") {
        const body = (init as unknown as { body: { order: string[] } }).body;
        return { success: true, favoriteSessionOrder: body.order };
      }
      throw new Error(`unexpected ${path}`);
    });

    // Move Beta down: FULL new order ["qs-a", "qs-b"] goes to the server.
    fireEvent.press(screen.getByTestId("sessions-move-down-qs-b"));
    await waitFor(() =>
      expect(
        mockApiFetch.mock.calls.some(
          (c) =>
            c[0] === "/api/workouts/favorite-order" &&
            JSON.stringify((c[2] as { body: unknown }).body) === JSON.stringify({ order: ["qs-a", "qs-b"] }),
        ),
      ).toBe(true),
    );
  });
});

// id: e015c9b3 — Opening a planned session starts it under its own session id.
describe("e015c9b3: opening a planned session starts it under its own session id", () => {
  test("planned tap stashes under the plan id and pushes the saved overview", async () => {
    installHistory([], [], [
      {
        sessionId: "qs-plan-1",
        title: "Friday Lift",
        date: "2026-10-09T12:00:00.000Z",
        exerciseCount: 1,
        exercises: EXERCISES,
      },
    ]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-planned-qs-plan-1")).toBeTruthy());

    fireEvent.press(screen.getByTestId("sessions-planned-qs-plan-1"));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    // Own session id, marked saved so edits write back to the same log.
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("qs-plan-1"));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("saved=1"));
    const raw = await AsyncStorage.getItem("quick_session_qs-plan-1");
    expect(raw).toContain("Friday Lift");
  });

  test("a saved session reopens under a NEW id (history is never overwritten)", async () => {
    installHistory([logEntry({ sessionId: "qs-old", title: "Sunday Pump", favorite: true })]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-open-qs-old")).toBeTruthy());

    fireEvent.press(screen.getByTestId("sessions-open-qs-old"));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const href = String(mockPush.mock.calls[0]?.[0] ?? "");
    expect(href).toContain("session=");
    expect(href).not.toContain("qs-old");
  });
});
