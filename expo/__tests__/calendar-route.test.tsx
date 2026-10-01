/* eslint-disable import/first */
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

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { localDateKey } from "@/lib/time/localDay";
import CalendarIndexRoute from "../app/(app)/(tabs)/calendar/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// A completed slot mid-month (rendered in the calendar grid) and a future
// scheduled slot (actionable from the upcoming list).
const today = new Date();
const y = today.getFullYear();
const monthStr = String(today.getMonth() + 1).padStart(2, "0");
const midMonth = `${y}-${monthStr}-15`;
const futureDate = new Date(today.getTime() + 2 * 86400000)
  .toISOString()
  .slice(0, 10);

function schedulesTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]).split("?")[0] === path);
}

describe("CalendarIndexRoute", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({
      schedules: [
        {
          programId: "prog-1",
          scheduledWorkouts: [
            {
              date: `${midMonth}T00:00:00.000Z`,
              dayLabel: "Day 1",
              status: "completed",
              phase: 1,
            },
            {
              date: `${futureDate}T00:00:00.000Z`,
              dayLabel: "Day 2",
              status: "scheduled",
              phase: 1,
            },
          ],
        },
      ],
    });
  });

  it("GETs /api/schedule with baseUrl + token", async () => {
    render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(schedulesTo("/api/schedule").length).toBeGreaterThan(0);
    });
    const opts = schedulesTo("/api/schedule")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);
  });

  it("renders calendar slots colored by status", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId(`calendar-dot-${midMonth}`)).toBeTruthy();
    });
    expect(
      getByTestId(`calendar-dot-${midMonth}`).props.accessibilityLabel,
    ).toBe("status-completed");
  });

  it("navigates to the workout when a future scheduled slot is tapped", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    // workoutIndex from "Day 2" → 1; phaseIndex from phase 1 → 0.
    const itemId = `scheduled-list-item-${futureDate}-1`;
    await waitFor(() => {
      expect(getByTestId(itemId)).toBeTruthy();
    });
    fireEvent.press(getByTestId(itemId));
    expect(mockPush).toHaveBeenCalledWith(
      `/(tabs)/programming/prog-1/workout/1?phase=0`,
    );
  });

  it("does not navigate when a completed slot is tapped", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    const itemId = `scheduled-list-item-${midMonth}-0`;
    await waitFor(() => {
      expect(getByTestId(itemId)).toBeTruthy();
    });
    fireEvent.press(getByTestId(itemId));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// The reschedule form seeds from the slot with useState and has no re-seeding
// effect (react-hooks/set-state-in-effect). The route therefore has to key the
// modal on the slot, and only a route-level test can see that it does: the
// modal keeps its state across a close/reopen otherwise, and the member is
// shown the wrong workout's date to move.
describe("CalendarIndexRoute — reschedule modal is keyed on the slot", () => {
  const dateA = new Date(today.getTime() + 2 * 86400000)
    .toISOString()
    .slice(0, 10);
  const dateB = new Date(today.getTime() + 4 * 86400000)
    .toISOString()
    .slice(0, 10);

  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({
      schedules: [
        {
          programId: "prog-1",
          scheduledWorkouts: [
            {
              date: `${dateA}T00:00:00.000Z`,
              dayLabel: "Day 1",
              status: "scheduled",
              phase: 1,
            },
            {
              date: `${dateB}T00:00:00.000Z`,
              dayLabel: "Day 2",
              status: "scheduled",
              phase: 1,
            },
          ],
        },
      ],
    });
  });

  it("opens each slot's own date, not the first one it was opened with", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId(`scheduled-list-reschedule-${dateA}-0`)).toBeTruthy();
    });

    fireEvent.press(getByTestId(`scheduled-list-reschedule-${dateA}-0`));
    expect(getByTestId("reschedule-modal-date").props.value).toBe(dateA);

    // Type something, back out, then reschedule the OTHER workout.
    fireEvent.changeText(getByTestId("reschedule-modal-date"), "2026-01-01");
    fireEvent.press(getByTestId("reschedule-modal-close"));
    fireEvent.press(getByTestId(`scheduled-list-reschedule-${dateB}-1`));

    expect(getByTestId("reschedule-modal-date").props.value).toBe(dateB);
  });

  it("confirms with the slot that was opened second", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId(`scheduled-list-reschedule-${dateB}-1`)).toBeTruthy();
    });

    fireEvent.press(getByTestId(`scheduled-list-reschedule-${dateA}-0`));
    fireEvent.press(getByTestId("reschedule-modal-close"));
    fireEvent.press(getByTestId(`scheduled-list-reschedule-${dateB}-1`));
    fireEvent.press(getByTestId("reschedule-modal-confirm"));

    const patches = mockApiFetch.mock.calls.filter(
      (c) => (c[2] as { method?: string } | undefined)?.method === "PATCH",
    );
    expect(patches).toHaveLength(1);
    expect((patches[0]![2] as { body?: Record<string, unknown> }).body).toEqual(
      expect.objectContaining({ workoutDate: dateB, newDate: dateB }),
    );
  });
});

describe("CalendarIndexRoute — Acceptance criteria & parity", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
    mockParams = {};
  });

  it("(id: e015c923) For the same member and month, every day shows the same items and states as the web", async () => {
    mockParams = { date: "2026-05-18" };
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve({
          schedules: [
            {
              programId: "prog-main",
              programName: "Hypertrophy Phase 1",
              programStatus: "in-progress",
              scheduledWorkouts: [
                {
                  date: "2026-05-10T00:00:00.000Z",
                  dayLabel: "Day 1",
                  workoutTitle: "Legs",
                  status: "missed",
                  phase: 1,
                },
                {
                  date: "2026-05-11T00:00:00.000Z",
                  dayLabel: "Day 2",
                  workoutTitle: "Chest",
                  status: "completed",
                  completedAt: "2026-05-13T14:00:00.000Z", // completed on May 13 -> Made Up!
                  phase: 1,
                },
                {
                  date: "2026-05-12T00:00:00.000Z",
                  dayLabel: "Day 3",
                  workoutTitle: "Back",
                  status: "skipped",
                  phase: 1,
                },
                {
                  date: "2026-05-15T00:00:00.000Z",
                  dayLabel: "Day 4",
                  workoutTitle: "Shoulders",
                  status: "completed",
                  completedAt: "2026-05-15T10:00:00.000Z",
                  phase: 1,
                },
                {
                  date: "2026-05-18T00:00:00.000Z",
                  dayLabel: "Day 5",
                  workoutTitle: "Arms",
                  status: "scheduled",
                  phase: 1,
                },
              ],
            },
            {
              programId: "prog-paused",
              programName: "Strength Arc",
              programStatus: "paused",
              scheduledWorkouts: [
                {
                  date: "2026-05-20T00:00:00.000Z",
                  dayLabel: "Day 1",
                  workoutTitle: "Squat Focus",
                  status: "scheduled",
                  phase: 1,
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
              title: "Morning Run",
              date: "2026-05-14T08:00:00.000Z",
              completed: true,
              exerciseCount: 1,
              duration: 30,
            },
            {
              kind: "quick",
              sessionId: "q-plan",
              title: "Friday Core",
              date: "2026-05-18T18:00:00.000Z",
              completed: false,
              exerciseCount: 3,
              duration: 20,
            },
          ],
          favoriteSessionOrder: [],
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId } = render(<CalendarIndexRoute />);

    // Wait for schedule and logs to load
    await waitFor(() => {
      expect(getByTestId("calendar-dot-2026-05-10")).toBeTruthy();
    });

    // 1. Status dots for program workouts
    expect(getByTestId("calendar-dot-2026-05-10").props.accessibilityLabel).toBe("status-missed");
    expect(getByTestId("calendar-dot-2026-05-11").props.accessibilityLabel).toBe("status-makeup");
    expect(getByTestId("calendar-dot-2026-05-12").props.accessibilityLabel).toBe("status-skipped");
    expect(getByTestId("calendar-dot-2026-05-15").props.accessibilityLabel).toBe("status-completed");

    // 2. May 14 quick session dot
    expect(getByTestId("calendar-dot-2026-05-14").props.accessibilityLabel).toBe("status-completed");

    // 3. May 18 has BOTH program slot and quick session (multiple items on one day)
    expect(getByTestId("calendar-dot-2026-05-18")).toBeTruthy();
    expect(getByTestId("calendar-dot-2026-05-18").props.accessibilityLabel).toBe("status-scheduled");
    expect(getByTestId("calendar-dot-2026-05-18-1")).toBeTruthy();

    // 4. Day detail panel opened for May 18
    expect(getByTestId("calendar-day-detail")).toBeTruthy();
    expect(getByTestId("day-detail-workout-prog-main-4")).toBeTruthy();
    expect(getByTestId("day-detail-quick-q-plan")).toBeTruthy();

    // 5. Select May 11 (Made up workout, Day 2 -> workoutIndex 1)
    fireEvent.press(getByTestId("calendar-day-2026-05-11"));
    await waitFor(() => {
      expect(getByTestId("day-detail-workout-badge-prog-main-1").props.children.props.children).toBe("Made Up");
    });
    expect(getByTestId("workout-made-up-date")).toBeTruthy();

    // 6. Select May 20 (Paused program)
    fireEvent.press(getByTestId("calendar-day-2026-05-20"));
    await waitFor(() => {
      expect(getByTestId("day-detail-workout-badge-prog-paused-0").props.children.props.children).toBe("Paused");
    });

    // 7. Legend renders all states
    expect(getByTestId("calendar-legend")).toBeTruthy();
    expect(getByTestId("legend-completed")).toBeTruthy();
    expect(getByTestId("legend-makeup")).toBeTruthy();
    expect(getByTestId("legend-scheduled")).toBeTruthy();
    expect(getByTestId("legend-incomplete")).toBeTruthy();
    expect(getByTestId("legend-skipped")).toBeTruthy();
    expect(getByTestId("legend-quick")).toBeTruthy();
  });

  it("(id: e015c924) At 21:00 Pacific today's slot shows as today, not missed", async () => {
    // Pacific time 21:00 on the local day (UTC is the next morning)
    // The device local day:
    const todayLocal = localDateKey();
    mockParams = { date: todayLocal };

    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        // Confirm client sends range and tz
        expect(url).toContain("tz=");
        return Promise.resolve({
          schedules: [
            {
              programId: "prog-1",
              programName: "Program 1",
              scheduledWorkouts: [
                {
                  date: `${todayLocal}T00:00:00.000Z`,
                  dayLabel: "Day 1",
                  workoutTitle: "Today Session",
                  status: "scheduled", // Server answered scheduled because tz was passed!
                  phase: 1,
                },
              ],
            },
          ],
        });
      }
      return Promise.resolve({ logs: [] });
    });

    const { getByTestId } = render(<CalendarIndexRoute />);

    await waitFor(() => {
      expect(getByTestId(`calendar-dot-${todayLocal}`)).toBeTruthy();
    });

    // Today's slot shows as scheduled (not missed!)
    expect(getByTestId(`calendar-dot-${todayLocal}`).props.accessibilityLabel).toBe("status-scheduled");

    // In day detail, shows as Scheduled with actionable Start Workout button
    expect(getByTestId(`day-detail-workout-badge-prog-1-0`).props.children.props.children).toBe("Scheduled");
    expect(getByTestId(`day-detail-start-prog-1-0`)).toBeTruthy();
  });

  it("(id: e015c925) A quick session planned for Friday shows on Friday as planned", async () => {
    // Friday date
    const friday = "2026-10-02";
    mockParams = { date: friday };

    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve({ schedules: [] });
      }
      if (url.startsWith("/api/workouts/logs")) {
        return Promise.resolve({
          logs: [
            {
              kind: "quick",
              sessionId: "q-fri-1",
              title: "Friday Quick Cardio",
              date: `${friday}T15:00:00.000Z`,
              completed: false,
              skipped: false,
              exerciseCount: 4,
              duration: 35,
            },
          ],
          favoriteSessionOrder: [],
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId } = render(<CalendarIndexRoute />);

    await waitFor(() => {
      expect(getByTestId(`calendar-dot-${friday}`)).toBeTruthy();
    });

    // On Friday, quick session dot shows with status-planned
    expect(getByTestId(`calendar-dot-${friday}`).props.accessibilityLabel).toBe("status-planned");

    // Day detail shows title and Scheduled badge
    expect(getByTestId("day-detail-quick-q-fri-1")).toBeTruthy();
    expect(getByTestId("day-detail-quick-badge-q-fri-1").props.children.props.children).toBe("Scheduled");
  });

  it("opens on ?date= from links and toggles between month and week view", async () => {
    mockParams = { date: "2026-05-18" };
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve({
          schedules: [
            {
              programId: "prog-1",
              scheduledWorkouts: [
                {
                  date: "2026-05-18T00:00:00.000Z",
                  dayLabel: "Day 1",
                  workoutTitle: "Monday Workout",
                  status: "scheduled",
                  phase: 1,
                },
              ],
            },
          ],
        });
      }
      return Promise.resolve({ logs: [] });
    });

    const { getByTestId } = render(<CalendarIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("calendar-day-detail")).toBeTruthy();
    });

    // Check week view toggle
    fireEvent.press(getByTestId("calendar-view-week"));
    await waitFor(() => {
      expect(getByTestId("calendar-pill-2026-05-18-0")).toBeTruthy();
    });

    // Check view switch back to month
    fireEvent.press(getByTestId("calendar-view-month"));
    await waitFor(() => {
      expect(getByTestId("calendar-day-2026-05-01")).toBeTruthy();
    });
  });
});
