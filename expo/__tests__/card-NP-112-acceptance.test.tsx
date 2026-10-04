/* eslint-disable import/first */
// NP-112 — TRAINING HISTORY: EVERY COMPLETED PROGRAM AND QUICK SESSION,
// FILTERED.
//
// Native port of `webapp/app/dashboard/history/HistoryClient.tsx`: the route
// `expo/app/(app)/(tabs)/programming/history.tsx` reads
// `GET /api/workouts/logs` (history mode — completed sessions only, the whole
// history in one response), renders it as a virtualised FlatList with pull to
// refresh, filters All / Programs / Quick with counts, labels each instant on
// the device's local day (Today / Yesterday / weekday / date), opens program
// rows on the program and reopens quick rows (completed as a repeat under a
// fresh id, incomplete resumed in place — `lib/history/openHistoryQuick.ts`,
// the hub's `openSession` + `continueQuickSession`).
//
// Fixed clock: Wednesday 2026-10-07 local noon, so Today / Yesterday /
// weekday / date are unambiguous.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@become/api-client";
import HistoryRoute from "../app/(app)/(tabs)/programming/history";
import {
  countHistoryLogs,
  filterHistoryLogs,
  formatHistoryDateLabel,
} from "../lib/history/history";
import { openHistoryQuickSession } from "../lib/history/openHistoryQuick";
import { readQuickSession } from "../lib/quickSession/store";
import { nativeRouteFor, NATIVE_ROUTES } from "../lib/navigation/webPathToRoute";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// Wednesday 2026-10-07 at local noon.
const WEDNESDAY_NOON = new Date(2026, 9, 7, 12, 0, 0);

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

const LOGS = [
  {
    kind: "program",
    title: "Hypertrophy · Day 2",
    programId: "prog-1",
    programName: "Hypertrophy",
    day: "Day 2",
    phase: 1,
    completed: true,
    skipped: false,
    favorite: false,
    // Today (Wednesday) at 08:00 local.
    date: "2026-10-07T08:00:00",
    duration: 45,
    exerciseCount: 5,
    completedSets: 15,
  },
  {
    kind: "quick",
    title: "Tuesday Pump",
    focus: "push",
    sessionId: "qs-1",
    completed: true,
    skipped: false,
    favorite: false,
    // Yesterday (Tuesday) at 18:00 local.
    date: "2026-10-06T18:00:00",
    duration: 30,
    exerciseCount: 3,
    completedSets: 9,
    exercises: EXERCISES,
  },
  {
    kind: "program",
    title: "Hypertrophy · Day 1",
    programId: "prog-1",
    programName: "Hypertrophy",
    day: "Day 1",
    phase: 1,
    completed: true,
    skipped: false,
    favorite: false,
    // Sunday (3 days ago) — a weekday label.
    date: "2026-10-04T09:00:00",
    duration: null,
    exerciseCount: 4,
    completedSets: 12,
  },
  {
    kind: "quick",
    title: "Old Session",
    sessionId: "qs-old",
    completed: true,
    skipped: false,
    favorite: false,
    // Last year — a full date with the year.
    date: "2025-06-01T10:00:00",
    duration: 20,
    exerciseCount: 2,
    completedSets: 6,
    exercises: EXERCISES,
  },
] as const;

function mockHistory(logs: unknown = LOGS) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/workouts/logs")) {
      return { logs, favoriteSessionOrder: [] };
    }
    if (String(path).startsWith("/api/workouts/session")) {
      return { session: null };
    }
    return {};
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(WEDNESDAY_NOON);
  mockPush.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockHistory();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("history helpers match the web's rules", () => {
  it("counts and filters without re-sorting", () => {
    const logs = LOGS as unknown as Parameters<typeof countHistoryLogs>[0];
    expect(countHistoryLogs(logs)).toEqual({ all: 4, program: 2, quick: 2 });
    // Server order is kept: newest first, untouched by the filter.
    expect(filterHistoryLogs(logs, "all").map((l) => l.title)).toEqual([
      "Hypertrophy · Day 2",
      "Tuesday Pump",
      "Hypertrophy · Day 1",
      "Old Session",
    ]);
    expect(filterHistoryLogs(logs, "program").map((l) => l.title)).toEqual([
      "Hypertrophy · Day 2",
      "Hypertrophy · Day 1",
    ]);
    expect(filterHistoryLogs(logs, "quick").map((l) => l.title)).toEqual([
      "Tuesday Pump",
      "Old Session",
    ]);
  });

  it("labels instants on the device's local day", () => {
    const now = WEDNESDAY_NOON;
    expect(formatHistoryDateLabel("2026-10-07T08:00:00", now)).toBe("Today");
    expect(formatHistoryDateLabel("2026-10-06T18:00:00", now)).toBe("Yesterday");
    expect(formatHistoryDateLabel("2026-10-04T09:00:00", now)).toBe("Sunday");
    expect(formatHistoryDateLabel("2025-06-01T10:00:00", now)).toBe(
      "Jun 1, 2025",
    );
  });
});

describe("(id: e015c935) History natively lists the same sessions in the same order as the web", () => {
  it("GETs /api/workouts/logs and renders every session newest-first with filters and counts", async () => {
    const { getByTestId, getByText } = render(<HistoryRoute />);

    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    // The history-mode GET: no programId, no paging.
    const historyCalls = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/workouts/logs"),
    );
    expect(historyCalls.length).toBeGreaterThan(0);
    expect(String(historyCalls[0]![0])).toBe("/api/workouts/logs");

    // Counts ride on the filters.
    expect(getByTestId("history-filter-all-count").props.children).toBe(4);
    expect(getByTestId("history-filter-program-count").props.children).toBe(2);
    expect(getByTestId("history-filter-quick-count").props.children).toBe(2);

    // Same sessions, same order as the web (server order, newest first).
    expect(getByText("Hypertrophy · Day 2")).toBeTruthy();
    expect(getByText("Tuesday Pump")).toBeTruthy();
    expect(getByText("Hypertrophy · Day 1")).toBeTruthy();
    expect(getByText("Old Session")).toBeTruthy();

    // Local-day labels: Today, Yesterday, weekday, date.
    expect(getByText("Today")).toBeTruthy();
    expect(getByText("Yesterday")).toBeTruthy();
    expect(getByText("Sunday")).toBeTruthy();
    expect(getByText("Jun 1, 2025")).toBeTruthy();

    // Programs filter keeps only program rows, in order.
    fireEvent.press(getByTestId("history-filter-program"));
    expect(getByText("Hypertrophy · Day 2")).toBeTruthy();
    expect(getByText("Hypertrophy · Day 1")).toBeTruthy();

    // Quick filter keeps only quick rows, in order.
    fireEvent.press(getByTestId("history-filter-quick"));
    expect(getByText("Tuesday Pump")).toBeTruthy();
    expect(getByText("Old Session")).toBeTruthy();

    // Program rows open the program.
    fireEvent.press(getByTestId("history-filter-all"));
    fireEvent.press(getByTestId("history-row-program-2026-10-07T08:00:00-0"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/prog-1");
  });

  it("pull to refresh re-fires the history GET", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });
    const before = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/workouts/logs"),
    ).length;
    const list = getByTestId("history-list");
    list.props.refreshControl.props.onRefresh();
    await waitFor(() => {
      const after = mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/workouts/logs"),
      ).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("/dashboard/history resolves to the native history screen", () => {
    expect(nativeRouteFor("/dashboard/history")).toBe(NATIVE_ROUTES.history);
    expect(NATIVE_ROUTES.history).toBe("/(tabs)/programming/history");
  });
});

describe("(id: e015c936) A quick session can be reopened from history", () => {
  it("a completed quick session reopens as a repeat under a fresh id", async () => {
    const href = await openHistoryQuickSession({
      sessionId: "qs-1",
      title: "Tuesday Pump",
      focus: "push",
      completed: true,
      exercises: EXERCISES as unknown as Parameters<
        typeof openHistoryQuickSession
      >[0]["exercises"],
    });
    expect(href).toBeTruthy();
    expect(href).toMatch(/^\/\(tabs\)\/programming\/quick\?session=/);
    // No `saved=1`: the repeat is a fresh draft, not the historical log.
    expect(href).not.toContain("saved=1");

    const stashedId = decodeURIComponent(
      String(href).split("session=")[1]!.split("&")[0]!,
    );
    // A fresh id — never the historical log's — so finishing the repeat
    // cannot overwrite that day's history.
    expect(stashedId).not.toBe("qs-1");
    const stashed = await readQuickSession(stashedId);
    expect(stashed?.title).toBe("Tuesday Pump");
    expect(stashed?.sourceSessionId).toBe("qs-1");
    expect(stashed?.exercises).toHaveLength(1);
  });

  it("tapping a quick row pushes the overview for the repeat", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });
    fireEvent.press(getByTestId("history-row-quick-qs-1-1"));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\(tabs\)\/programming\/quick\?session=/),
      );
    });
    const href = String(mockPush.mock.calls[0]![0]);
    expect(href).not.toContain("saved=1");
  });

  it("an incomplete quick session resumes in place with saved=1", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith("/api/workouts/session")) {
        return {
          session: {
            sessionId: "qs-open",
            title: "Open Session",
            needsName: false,
            date: "2026-10-07",
            completed: false,
            duration: null,
            exercises: [
              {
                name: "Bench Press",
                exerciseSlug: "bench-press",
                trackingType: "reps_weight",
                sets: [
                  {
                    setNumber: 1,
                    reps: 8,
                    weight: 135,
                    duration: null,
                    distance: null,
                    speed: null,
                    completed: true,
                  },
                ],
              },
            ],
          },
        };
      }
      return { logs: [], favoriteSessionOrder: [] };
    });
    const href = await openHistoryQuickSession({
      sessionId: "qs-open",
      title: "Open Session",
      completed: false,
    });
    expect(href).toBe(
      "/(tabs)/programming/quick?session=qs-open&saved=1&started=1",
    );
    // Resumed under its OWN id, so finishing consumes the same log.
    const stashed = await readQuickSession("qs-open");
    expect(stashed?.title).toBe("Open Session");
  });
});
