/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
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

jest.mock("@/lib/quickSession/store", () => {
  const actual = jest.requireActual("@/lib/quickSession/store");
  return {
    __esModule: true,
    ...actual,
    stashQuickSessionWithId: jest.fn(async () => "q-1"),
  };
});

import { apiFetch } from "@become/api-client";
import { stashQuickSessionWithId } from "@/lib/quickSession/store";
import { localDateKey } from "@/lib/time/localDay";
import CalendarIndexRoute from "../app/(app)/(tabs)/calendar/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockStash = stashQuickSessionWithId as unknown as jest.Mock;

const PAST = "2026-03-10";
const FUTURE = "2026-12-18";

function callsTo(path: string): { opts: Record<string, unknown> }[] {
  return mockApiFetch.mock.calls
    .filter((c) => String(c[0]).split("?")[0] === path)
    .map((c) => ({ opts: (c[2] ?? {}) as Record<string, unknown> }));
}

function paths(): string[] {
  return mockApiFetch.mock.calls.map((c) => String(c[0]));
}

describe("Calendar past days + quick sessions (NP-115)", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    mockApiFetch.mockReset();
    mockStash.mockClear();
    mockParams = { date: PAST };
    mockApiFetch.mockImplementation((path: string, _schema: unknown, init?: { method?: string }) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve({
          schedules: [
            {
              programId: "prog-1",
              programName: "Program 1",
              programStatus: "in-progress",
              scheduledWorkouts: [
                {
                  date: `${PAST}T00:00:00.000Z`,
                  dayLabel: "Day 1",
                  workoutTitle: "Push A",
                  status: "completed",
                  phase: 1,
                  completedAt: `${PAST}T14:00:00.000Z`,
                },
              ],
            },
          ],
        });
      }
      if (url.startsWith("/api/workouts/logs")) {
        return Promise.resolve({
          logs: [
            {
              kind: "quick",
              sessionId: "q-done",
              title: "Morning Lift",
              date: `${PAST}T08:00:00.000Z`,
              completed: true,
              exerciseCount: 2,
              duration: 30,
            },
            {
              kind: "quick",
              sessionId: "q-plan",
              title: "Evening Core",
              date: `${FUTURE}T18:00:00.000Z`,
              completed: false,
              skipped: false,
              exerciseCount: 3,
              duration: 20,
            },
          ],
          favoriteSessionOrder: [],
        });
      }
      if (url.startsWith("/api/workouts/log")) {
        return Promise.resolve({
          log: {
            date: `${PAST}T14:00:00.000Z`,
            kind: "program",
            programId: "prog-1",
            completed: true,
            duration: 40,
            exercises: [
              {
                name: "Bench",
                sets: [
                  { setNumber: 1, reps: 5, weight: 135, completed: true },
                  { setNumber: 2, reps: 5, weight: 135, completed: true },
                ],
              },
            ],
          },
          exerciseHistory: {},
        });
      }
      if (url.startsWith("/api/workouts/session")) {
        if (init?.method === "PATCH" || init?.method === "DELETE") {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({
          session: {
            sessionId: "q-done",
            title: "Morning Lift",
            date: `${PAST}T08:00:00.000Z`,
            completed: true,
            duration: 30,
            exercises: [
              {
                name: "Bench",
                exerciseSlug: "bench",
                trackingType: "reps_weight",
                sets: [
                  {
                    setNumber: 1,
                    reps: 5,
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
        });
      }
      return Promise.resolve({});
    });
  });

  it("(id: e015c945) tapping a past completed day shows its summary with the web's numbers", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-summary-prog-1-0")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-summary-prog-1-0"));
    await waitFor(() => {
      expect(getByTestId("day-summary-program-summary-sets")).toBeTruthy();
    });
    // Web math: 2 completed sets, 135x5 + 135x5 = 1350 volume.
    expect(getByTestId("day-summary-program-sets").props.children).toEqual(
      expect.arrayContaining([2, " sets logged"]),
    );
    expect(getByTestId("day-summary-program-volume").props.children).toEqual(
      expect.arrayContaining(["1,350", " lb volume"]),
    );
    // Looked up on the completion date, like the web.
    expect(paths().some((p) => p.includes("/api/workouts/log?"))).toBe(true);
    const logPath = paths().find((p) => p.includes("/api/workouts/log?")) ?? "";
    expect(logPath).toContain("programId=prog-1");
    expect(logPath).toContain(`date=${PAST}`);
  });

  it("a completed quick session opens its summary with the session numbers", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-summary-q-done")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-summary-q-done"));
    await waitFor(() => {
      expect(getByTestId("day-summary-quick-meta")).toBeTruthy();
    });
    expect(getByTestId("day-summary-quick-exercise-0").props.children).toBe(
      "Bench",
    );
    expect(
      getByTestId("day-summary-quick-exercise-0-set-0").props.children,
    ).toBe("5 reps · 135 lb");
  });

  it("(id: e015c946) moving a quick session PATCHes { id, date } so it shows on Friday on the web", async () => {
    mockParams = { date: FUTURE };
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-manage-q-plan")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-manage-q-plan"));
    expect(getByTestId("quick-menu")).toBeTruthy();
    fireEvent.press(getByTestId("quick-menu-next-day"));
    await waitFor(() => {
      expect(callsTo("/api/workouts/session").length).toBeGreaterThan(0);
    });
    const patch = callsTo("/api/workouts/session").find(
      (c) => (c.opts as { method?: string }).method === "PATCH",
    );
    expect(patch).toBeTruthy();
    const body = (patch as { opts: { body: Record<string, unknown> } }).opts
      .body;
    // A move re-dates the log only: { id, date }, never startedAt.
    expect(body).toEqual(
      expect.objectContaining({ id: "q-plan", date: "2026-12-19" }),
    );
    expect(body).not.toHaveProperty("startedAt");
    expect(body).not.toHaveProperty("skipped");
  });

  it("(id: e015c947) deleting a quick session asks first and DELETEs by id", async () => {
    mockParams = { date: FUTURE };
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-manage-q-plan")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-manage-q-plan"));
    fireEvent.press(getByTestId("quick-menu-delete"));
    // The confirm gate opens first — nothing is sent yet.
    expect(getByTestId("quick-confirm-delete")).toBeTruthy();
    expect(
      mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/workouts/session"),
      ),
    ).toHaveLength(0);
    fireEvent.press(getByTestId("quick-confirm-delete-confirm"));
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.filter(
          (c) =>
            String(c[0]).startsWith("/api/workouts/session") &&
            (c[2] as { method?: string } | undefined)?.method === "DELETE",
        ).length,
      ).toBeGreaterThan(0);
    });
    const del = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]).startsWith("/api/workouts/session") &&
        (c[2] as { method?: string } | undefined)?.method === "DELETE",
    ) as unknown as [string, unknown, unknown];
    expect(String(del[0])).toContain("id=q-plan");
  });

  it("skipping a quick session asks first and PATCHes { id, skipped: true }", async () => {
    mockParams = { date: FUTURE };
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-manage-q-plan")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-manage-q-plan"));
    fireEvent.press(getByTestId("quick-menu-skip"));
    expect(getByTestId("quick-confirm-skip")).toBeTruthy();
    fireEvent.press(getByTestId("quick-confirm-skip-confirm"));
    await waitFor(() => {
      expect(callsTo("/api/workouts/session").length).toBeGreaterThan(0);
    });
    const patch = callsTo("/api/workouts/session").find(
      (c) => (c.opts as { method?: string }).method === "PATCH",
    );
    expect(
      (patch as { opts: { body: Record<string, unknown> } }).opts.body,
    ).toEqual(expect.objectContaining({ id: "q-plan", skipped: true }));
  });

  it("continuing a quick session keeps its own sessionId into the NP-227 overview", async () => {
    mockParams = { date: FUTURE };
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) return Promise.resolve({ schedules: [] });
      if (url.startsWith("/api/workouts/logs")) {
        return Promise.resolve({
          logs: [
            {
              kind: "quick",
              sessionId: "q-plan",
              title: "Evening Core",
              date: `${FUTURE}T18:00:00.000Z`,
              completed: false,
              skipped: false,
              exerciseCount: 1,
              duration: 20,
            },
          ],
          favoriteSessionOrder: [],
        });
      }
      if (url.startsWith("/api/workouts/session")) {
        return Promise.resolve({
          session: {
            sessionId: "q-plan",
            title: "Evening Core",
            date: `${FUTURE}T18:00:00.000Z`,
            completed: false,
            exercises: [
              {
                name: "Plank",
                exerciseSlug: "plank",
                trackingType: "time",
                sets: [
                  {
                    setNumber: 1,
                    reps: null,
                    weight: null,
                    duration: 60,
                    distance: null,
                    speed: null,
                    completed: false,
                  },
                ],
              },
            ],
          },
        });
      }
      return Promise.resolve({});
    });
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-quick-continue-q-plan")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-quick-continue-q-plan"));
    await waitFor(() => {
      expect(mockStash).toHaveBeenCalled();
    });
    // Stashed under its OWN id, so finishing completes the same log.
    expect(mockStash.mock.calls[0]?.[1]).toBe("q-plan");
    expect(mockPush).toHaveBeenCalledWith(
      "/(tabs)/programming/quick?session=q-plan&saved=1&started=1",
    );
  });

  it("(id: e015c948) Workout Now opened from an empty future day plans the session for that day", async () => {
    const emptyFuture = localDateKey(
      new Date(Date.now() + 9 * 86400000),
    );
    mockParams = { date: emptyFuture };
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) return Promise.resolve({ schedules: [] });
      if (url.startsWith("/api/workouts/logs")) {
        return Promise.resolve({ logs: [], favoriteSessionOrder: [] });
      }
      return Promise.resolve({});
    });
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-rest")).toBeTruthy();
    });
    // A future rest day only offers "Schedule a Workout" (web's canPlan-only
    // case) — no "Log a Workout" and no generic "Workout Now" (NP-292).
    fireEvent.press(getByTestId("day-detail-schedule-workout"));
    await waitFor(() => {
      expect(getByTestId("calendar-workout-now-sheet")).toBeTruthy();
    });
    // The sheet carries the day through as its Log/Plan date.
    expect(getByTestId("calendar-workout-now-sheet-title").props.children).toBe(
      "Schedule a Workout",
    );
  });
});
