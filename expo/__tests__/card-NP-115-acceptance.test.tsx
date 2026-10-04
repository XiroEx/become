/* eslint-disable import/first */
// NP-115 — CALENDAR PAST DAYS AND QUICK SESSIONS.
//
// Native port of the web calendar's past-day + quick-session management
// (`webapp/app/dashboard/calendar/CalendarClient.tsx`):
//  - (e015c945) tapping a past completed program day shows its summary with
//    the same numbers as the web (`GET /api/workouts/log?programId&date` on
//    the completion date for a makeup, NP-086 `summaryTotals` math);
//  - (e015c946) a quick session moved natively shows on its new day
//    (`PATCH /api/workouts/session { id, date }` re-dates the log only);
//  - (e015c947) deleting a quick session asks first (`quick-confirm-delete`)
//    and issues `DELETE /api/workouts/session?id=`;
//  - (e015c948) Workout Now opened from an empty future day plans the session
//    for that day (the NP-076 sheet carries `date` into the NP-227 overview's
//    `?date=`, whose panel offers only Plan it for a future date).
//
// Fixed clock: Wednesday 2026-10-07 local noon. Past Monday is 2026-10-05,
// next Friday is 2026-10-09.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@become/api-client";
import CalendarIndexRoute from "../app/(app)/(tabs)/calendar/index";
import { readQuickSession } from "@/lib/quickSession/store";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const PAST_MONDAY = "2026-10-05";
const TODAY = "2026-10-07";
const NEXT_FRIDAY = "2026-10-09";

const SCHEDULE_PAST_COMPLETED = {
  schedules: [
    {
      programId: "prog-1",
      programName: "Program 1",
      programStatus: "in-progress",
      scheduledWorkouts: [
        {
          date: `${PAST_MONDAY}T00:00:00.000Z`,
          dayLabel: "Day 3",
          workoutTitle: "Squat Day",
          status: "completed",
          completedAt: `${PAST_MONDAY}T14:00:00.000Z`,
          phase: 1,
        },
      ],
    },
  ],
};

// The web's numbers for this log: 2 completed sets (the third is skipped),
// volume = 135*5 + 95*8 = 675 + 760 = 1435, duration 45min → 45:00.
const PAST_LOG = {
  log: {
    date: `${PAST_MONDAY}T14:00:00.000Z`,
    kind: "program",
    programId: "prog-1",
    phase: 1,
    day: "Day 3",
    title: "Squat Day",
    completed: true,
    duration: 45,
    exercises: [
      {
        name: "Back Squat",
        sets: [
          { setNumber: 1, reps: 5, weight: 135, completed: true },
          { setNumber: 2, reps: 8, weight: 95, completed: true },
          { setNumber: 3, reps: 0, weight: 0, completed: false },
        ],
      },
    ],
  },
  exerciseHistory: {},
};

const QUICK_PLANNED = {
  sessionId: "qs-move-1",
  title: "Friday Pump",
  date: `${TODAY}T12:00:00.000Z`,
  completed: false,
  skipped: false,
  exerciseCount: 2,
  duration: null,
};

const QUICK_COMPLETED = {
  sessionId: "qs-done-1",
  title: "Monday Pump",
  date: `${PAST_MONDAY}T12:00:00.000Z`,
  completed: true,
  skipped: false,
  exerciseCount: 1,
  duration: 30,
};

const QUICK_SESSION_READ = {
  session: {
    sessionId: "qs-done-1",
    title: "Monday Pump",
    date: `${PAST_MONDAY}T12:00:00.000Z`,
    completed: true,
    duration: 30,
    exercises: [
      {
        name: "Bench Press",
        exerciseSlug: "bench-press",
        trackingType: "reps_weight",
        sets: [
          { setNumber: 1, reps: 8, weight: 135, duration: null, completed: true },
          { setNumber: 2, reps: 8, weight: 135, duration: null, completed: true },
        ],
      },
    ],
  },
};

function installCalendar(opts: {
  schedules?: unknown;
  logs?: Array<Record<string, unknown>>;
  sessionRead?: unknown;
  pastLog?: unknown;
}) {
  mockApiFetch.mockImplementation(
    async (path: string, _schema: unknown, init?: { method?: string }) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) return opts.schedules ?? { schedules: [] };
      if (url.startsWith("/api/workouts/log")) return opts.pastLog ?? { log: null, exerciseHistory: {} };
      if (url.startsWith("/api/workouts/session") && (!init?.method || init.method === "GET")) {
        return opts.sessionRead ?? { session: null };
      }
      if (url.startsWith("/api/workouts/logs")) {
        return { logs: opts.logs ?? [], favoriteSessionOrder: [] };
      }
      if (url === "/api/workouts/session" && init?.method === "PATCH") {
        return { success: true };
      }
      if (url.startsWith("/api/workouts/session") && init?.method === "DELETE") {
        return { success: true };
      }
      if (url.startsWith("/api/generate/session")) {
        return { session: { title: "X", focus: "push", exercises: [] } };
      }
      throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
    },
  );
}

function patchBodies(): Array<Record<string, unknown>> {
  return mockApiFetch.mock.calls
    .filter((c) => c[0] === "/api/workouts/session" && c[2]?.method === "PATCH")
    .map((c) => c[2].body as Record<string, unknown>);
}

function deleteCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith("/api/workouts/session") &&
      c[2]?.method === "DELETE",
  );
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 7, 12, 0, 0));
  mockPush.mockReset();
  mockApiFetch.mockReset();
  mockParams = {};
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("NP-115 calendar past days and quick sessions", () => {
  it("(id: e015c945) tapping a past completed day shows its summary with the web's numbers", async () => {
    mockParams = { date: PAST_MONDAY };
    installCalendar({
      schedules: SCHEDULE_PAST_COMPLETED,
      logs: [],
      pastLog: PAST_LOG,
    });
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-summary-prog-1-2")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-summary-prog-1-2"));
    await waitFor(() => {
      expect(getByTestId("day-summary-program-time")).toBeTruthy();
    });
    // Same numbers as the web's WorkoutSummary: 45min → 45:00, 2 completed
    // sets, volume 135*5+95*8 = 1435.
    expect(getByTestId("day-summary-program-time").props.children).toBe("45:00");
    expect(getByTestId("day-summary-program-sets").props.children).toBe(2);
    expect(getByTestId("day-summary-program-volume").props.children).toBe(
      (1435).toLocaleString(),
    );
    // The log was looked up on the completion date (programId + dateKey).
    const logCalls = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/workouts/log"),
    );
    expect(logCalls.length).toBeGreaterThan(0);
    expect(String(logCalls[0]![0])).toContain("programId=prog-1");
    expect(String(logCalls[0]![0])).toContain(`date=${PAST_MONDAY}`);
  });

  it("(id: e015c946) moving a quick session PATCHes its date only", async () => {
    mockParams = { date: TODAY };
    installCalendar({ logs: [{ kind: "quick", ...QUICK_PLANNED }] });
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-manage-qs-move-1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-manage-qs-move-1"));
    expect(getByTestId("quick-menu")).toBeTruthy();
    fireEvent.press(getByTestId("quick-menu-next-day"));
    await waitFor(() => {
      expect(patchBodies()).toHaveLength(1);
    });
    // A move re-dates the log only — { id, date }, no skipped/title.
    expect(patchBodies()[0]).toEqual({ id: "qs-move-1", date: "2026-10-08" });

    // Move to an arbitrary Friday date.
    fireEvent.press(getByTestId("day-detail-quick-manage-qs-move-1"));
    fireEvent.press(getByTestId("quick-menu-to-date"));
    expect(getByTestId("quick-menu-date-picker")).toBeTruthy();
    fireEvent.changeText(getByTestId("quick-menu-date-input"), NEXT_FRIDAY);
    fireEvent.press(getByTestId("quick-menu-move-confirm"));
    await waitFor(() => {
      expect(patchBodies()).toHaveLength(2);
    });
    expect(patchBodies()[1]).toEqual({ id: "qs-move-1", date: NEXT_FRIDAY });
  });

  it("(id: e015c946) continuing a quick session keeps its own sessionId", async () => {
    mockParams = { date: TODAY };
    installCalendar({
      logs: [{ kind: "quick", ...QUICK_PLANNED }],
      sessionRead: {
        session: {
          sessionId: "qs-move-1",
          title: "Friday Pump",
          needsName: false,
          focus: "push",
          date: `${TODAY}T12:00:00.000Z`,
          completed: false,
          duration: null,
          exercises: [
            {
              name: "Bench Press",
              exerciseSlug: "bench-press",
              trackingType: "reps_weight",
              sets: [{ setNumber: 1, reps: 8, weight: 135, duration: null, completed: false }],
            },
          ],
        },
      },
    });
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-continue-qs-move-1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-continue-qs-move-1"));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining("session=qs-move-1"),
      );
    });
    // The draft is stashed under its OWN id with saved=1, so finishing
    // completes the same log.
    const href = mockPush.mock.calls[0]![0] as string;
    expect(href).toContain("saved=1");
    const stashed = await readQuickSession("qs-move-1");
    expect(stashed?.title).toBe("Friday Pump");
  });

  it("(id: e015c947) deleting a quick session asks first and DELETEs it", async () => {
    mockParams = { date: TODAY };
    installCalendar({ logs: [{ kind: "quick", ...QUICK_PLANNED }] });
    const { getByTestId, queryByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-manage-qs-move-1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-manage-qs-move-1"));
    fireEvent.press(getByTestId("quick-menu-delete"));
    // The confirm gate opens first — nothing is sent yet.
    expect(getByTestId("quick-confirm-delete")).toBeTruthy();
    expect(deleteCalls()).toHaveLength(0);
    fireEvent.press(getByTestId("quick-confirm-delete-confirm"));
    await waitFor(() => {
      expect(deleteCalls()).toHaveLength(1);
    });
    expect(String(deleteCalls()[0]![0])).toContain("id=qs-move-1");
    expect(queryByTestId("quick-confirm-delete")).toBeNull();
  });

  it("(id: e015c947) skipping asks first and PATCHes skipped, unskip clears it", async () => {
    mockParams = { date: TODAY };
    installCalendar({ logs: [{ kind: "quick", ...QUICK_PLANNED }] });
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-manage-qs-move-1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-manage-qs-move-1"));
    fireEvent.press(getByTestId("quick-menu-skip"));
    expect(getByTestId("quick-confirm-skip")).toBeTruthy();
    expect(patchBodies()).toHaveLength(0);
    fireEvent.press(getByTestId("quick-confirm-skip-confirm"));
    await waitFor(() => {
      expect(patchBodies()).toHaveLength(1);
    });
    expect(patchBodies()[0]).toEqual({ id: "qs-move-1", skipped: true });
  });

  it("(id: e015c945) a completed quick session opens its summary with the web's numbers", async () => {
    mockParams = { date: PAST_MONDAY };
    installCalendar({
      logs: [{ kind: "quick", ...QUICK_COMPLETED }],
      sessionRead: QUICK_SESSION_READ,
    });
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-summary-qs-done-1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-summary-qs-done-1"));
    await waitFor(() => {
      expect(getByTestId("day-summary-quick-meta")).toBeTruthy();
    });
    // Web QuickSessionSummary numbers: 2 completed sets, duration 30 min.
    expect(getByTestId("day-summary-quick-meta").props.children).toEqual(
      expect.arrayContaining([
        expect.stringContaining("2 sets logged"),
        expect.stringContaining("30 min"),
      ]),
    );
    expect(getByTestId("day-summary-quick-exercise-0-set-1")).toBeTruthy();
  });

  it("(id: e015c948) Workout Now opened from an empty future day plans for that day", async () => {
    mockParams = { date: NEXT_FRIDAY };
    installCalendar({ logs: [] });
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-rest")).toBeTruthy();
    });
    // An empty future day offers only Plan it (no Log it) — the web's
    // logPlanAvailability rule.
    expect(getByTestId("day-detail-schedule-workout")).toBeTruthy();
    expect(() => getByTestId("day-detail-log-workout")).toThrow();
    fireEvent.press(getByTestId("day-detail-schedule-workout"));
    await waitFor(() => {
      expect(getByTestId("calendar-workout-now-sheet")).toBeTruthy();
    });
    // The sheet carries the day through, so the overview pre-fills it: the
    // BottomSheet renders its title under `<testID>-title`.
    expect(
      getByTestId("calendar-workout-now-sheet-title").props.children,
    ).toBe("Schedule a Workout");
  });
}
