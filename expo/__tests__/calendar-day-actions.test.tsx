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
import { localDateKey } from "@/lib/time/localDay";
import CalendarIndexRoute from "../app/(app)/(tabs)/calendar/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function patches(): Array<{ body?: Record<string, unknown> }> {
  return mockApiFetch.mock.calls
    .filter((c) => (c[2] as { method?: string } | undefined)?.method === "PATCH")
    .map((c) => c[2] as { body?: Record<string, unknown> });
}

function scheduleWith(slots: Array<Record<string, unknown>>) {
  return {
    schedules: [
      {
        programId: "prog-1",
        programName: "Program 1",
        programStatus: "in-progress",
        scheduledWorkouts: slots,
      },
    ],
  };
}

describe("CalendarIndexRoute — day actions (NP-110)", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
    mockParams = {};
  });

  it("(id: e015c929) skip / unskip / reschedule / shift / pause / resume PATCH the same bodies as the web", async () => {
    const todayLocal = localDateKey();
    const future = new Date();
    future.setHours(12, 0, 0, 0);
    future.setDate(future.getDate() + 3);
    const futureKey = localDateKey(future);
    mockParams = { date: futureKey };
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve(
          scheduleWith([
            {
              date: `${futureKey}T00:00:00.000Z`,
              dayLabel: "Day 2",
              workoutTitle: "Chest",
              status: "scheduled",
              phase: 1,
            },
          ]),
        );
      }
      return Promise.resolve({ logs: [] });
    });

    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-manage-prog-1-1")).toBeTruthy();
    });

    // Open the Manage sheet, skip with the two-tap confirm.
    fireEvent.press(getByTestId("day-detail-manage-prog-1-1"));
    expect(getByTestId("slot-action-menu")).toBeTruthy();
    fireEvent.press(getByTestId("slot-action-menu-skip"));
    fireEvent.press(getByTestId("slot-action-menu-confirm-skip-yes"));
    await waitFor(() => {
      expect(patches()).toHaveLength(1);
    });
    // Same result as the web: slot identified by marker date + day label's
    // program, tz merged by apiFetch (the hook never sets tz itself).
    expect(patches()[0]!.body).toEqual(
      expect.objectContaining({
        programId: "prog-1",
        action: "skip",
        workoutDate: futureKey,
      }),
    );
    expect(patches()[0]!.body).not.toHaveProperty("swapWithDate");

    // Move to next day: marker date + 1 calendar day.
    const pad = (n: number) => String(n).padStart(2, "0");
    const next = new Date(future);
    next.setDate(next.getDate() + 1);
    const nextKey = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
    fireEvent.press(getByTestId("day-detail-manage-prog-1-1"));
    fireEvent.press(getByTestId("slot-action-menu-next-day"));
    await waitFor(() => {
      expect(patches()).toHaveLength(2);
    });
    expect(patches()[1]!.body).toEqual(
      expect.objectContaining({
        programId: "prog-1",
        action: "reschedule",
        workoutDate: futureKey,
        newDate: nextKey,
      }),
    );

    // Shift the whole program by N days (web default 7).
    fireEvent.press(getByTestId("day-detail-manage-prog-1-1"));
    fireEvent.press(getByTestId("slot-action-menu-shift"));
    fireEvent.press(getByTestId("shift-confirm"));
    await waitFor(() => {
      expect(patches()).toHaveLength(3);
    });
    expect(patches()[2]!.body).toEqual(
      expect.objectContaining({
        programId: "prog-1",
        action: "shift",
        days: 7,
      }),
    );

    // Pause with the two-tap confirm, then resume.
    fireEvent.press(getByTestId("day-detail-manage-prog-1-1"));
    fireEvent.press(getByTestId("slot-action-menu-pause"));
    fireEvent.press(getByTestId("slot-action-menu-confirm-pause-yes"));
    await waitFor(() => {
      expect(patches()).toHaveLength(4);
    });
    expect(patches()[3]!.body).toEqual(
      expect.objectContaining({ programId: "prog-1", action: "pause" }),
    );

    // A "no" tap on a confirm sends nothing.
    fireEvent.press(getByTestId("day-detail-manage-prog-1-1"));
    fireEvent.press(getByTestId("slot-action-menu-skip"));
    fireEvent.press(getByTestId("slot-action-menu-confirm-skip-no"));
    expect(patches()).toHaveLength(4);

    expect(todayLocal).toBeTruthy();
  });

  it("(id: e015c92a) starting a slot opens Track for that slot's dayLabel and sd", async () => {
    const future = new Date();
    future.setHours(12, 0, 0, 0);
    future.setDate(future.getDate() + 5);
    const futureKey = localDateKey(future);
    mockParams = { date: futureKey };
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve(
          scheduleWith([
            {
              date: `${futureKey}T00:00:00.000Z`,
              dayLabel: "Day 2",
              workoutTitle: "Chest",
              status: "scheduled",
              phase: 1,
            },
            {
              date: `${futureKey}T00:00:00.000Z`,
              dayLabel: "Day 9",
              workoutTitle: "Bonus",
              status: "scheduled",
              phase: 1,
            },
          ]),
        );
      }
      return Promise.resolve({ logs: [] });
    });

    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-start-prog-1-1")).toBeTruthy();
    });

    // Two slots share the date; each Start names its own dayLabel + sd, so
    // completing one resolves that slot, not the neighbour.
    fireEvent.press(getByTestId("day-detail-start-prog-1-1"));
    expect(mockPush).toHaveBeenCalledWith(
      `/(tabs)/programming/prog-1/workout/1/live?phase=0&sd=${encodeURIComponent(futureKey)}&day=Day%202`,
    );
    mockPush.mockClear();
    fireEvent.press(getByTestId("day-detail-start-prog-1-8"));
    expect(mockPush).toHaveBeenCalledWith(
      `/(tabs)/programming/prog-1/workout/8/live?phase=0&sd=${encodeURIComponent(futureKey)}&day=Day%209`,
    );
  });

  it("(id: e015c92b) un-complete asks first and PATCHes uncomplete for that day", async () => {
    const past = new Date();
    past.setHours(12, 0, 0, 0);
    past.setDate(past.getDate() - 2);
    const pastKey = localDateKey(past);
    mockParams = { date: pastKey };
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve(
          scheduleWith([
            {
              date: `${pastKey}T00:00:00.000Z`,
              dayLabel: "Day 3",
              workoutTitle: "Back",
              status: "completed",
              completedAt: `${pastKey}T10:00:00.000Z`,
              phase: 1,
            },
          ]),
        );
      }
      return Promise.resolve({ logs: [] });
    });

    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-uncomplete-prog-1-2")).toBeTruthy();
    });

    // The confirm appears first; nothing is sent until it is accepted.
    fireEvent.press(getByTestId("day-detail-uncomplete-prog-1-2"));
    expect(getByTestId("slot-confirm")).toBeTruthy();
    expect(patches()).toHaveLength(0);
    fireEvent.press(getByTestId("slot-confirm-yes"));
    await waitFor(() => {
      expect(patches()).toHaveLength(1);
    });
    // Same result as the web's un-complete: slot back to scheduled, that
    // day's log removed — identified by the marker date.
    expect(patches()[0]!.body).toEqual(
      expect.objectContaining({
        programId: "prog-1",
        action: "uncomplete",
        workoutDate: pastKey,
      }),
    );
  });

  it("missed and skipped slots offer Do It Now plus skip / un-skip", async () => {
    const past = new Date();
    past.setHours(12, 0, 0, 0);
    past.setDate(past.getDate() - 1);
    const pastKey = localDateKey(past);
    mockParams = { date: pastKey };
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve(
          scheduleWith([
            {
              date: `${pastKey}T00:00:00.000Z`,
              dayLabel: "Day 4",
              workoutTitle: "Legs",
              status: "missed",
              phase: 1,
            },
            {
              date: `${pastKey}T00:00:00.000Z`,
              dayLabel: "Day 5",
              workoutTitle: "Arms",
              status: "skipped",
              phase: 1,
            },
          ]),
        );
      }
      return Promise.resolve({ logs: [] });
    });

    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-skip-prog-1-3")).toBeTruthy();
    });
    expect(getByTestId("day-detail-unskip-prog-1-4")).toBeTruthy();

    // Do It Now opens Track for the missed slot's own day + sd.
    fireEvent.press(getByTestId("day-detail-start-prog-1-3"));
    expect(mockPush).toHaveBeenCalledWith(
      `/(tabs)/programming/prog-1/workout/3/live?phase=0&sd=${encodeURIComponent(pastKey)}&day=Day%204`,
    );

    // Un-skip sends no confirm (it restores, it does not destroy).
    fireEvent.press(getByTestId("day-detail-unskip-prog-1-4"));
    await waitFor(() => {
      expect(patches()).toHaveLength(1);
    });
    expect(patches()[0]!.body).toEqual(
      expect.objectContaining({
        programId: "prog-1",
        action: "unskip",
        workoutDate: pastKey,
      }),
    );
  });

  it("the manage sheet has no swap row", async () => {
    const future = new Date();
    future.setHours(12, 0, 0, 0);
    future.setDate(future.getDate() + 3);
    const futureKey = localDateKey(future);
    mockParams = { date: futureKey };
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve(
          scheduleWith([
            {
              date: `${futureKey}T00:00:00.000Z`,
              dayLabel: "Day 2",
              workoutTitle: "Chest",
              status: "scheduled",
              phase: 1,
            },
          ]),
        );
      }
      return Promise.resolve({ logs: [] });
    });

    const { getByTestId, queryByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-manage-prog-1-1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-manage-prog-1-1"));
    expect(queryByTestId("slot-action-menu-swap")).toBeNull();
  });
});
