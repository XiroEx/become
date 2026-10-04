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
import CalendarIndexRoute from "../app/(app)/(tabs)/calendar/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function patchBodies(): Array<Record<string, unknown>> {
  return mockApiFetch.mock.calls
    .filter((c) => (c[2] as { method?: string } | undefined)?.method === "PATCH")
    .map((c) => (c[2] as { body?: Record<string, unknown> }).body ?? {});
}

describe("CalendarIndexRoute — day actions (NP-110)", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
    mockParams = {};
  });

  function mockSchedule(scheduledWorkouts: Array<Record<string, unknown>>) {
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/schedule")) {
        return Promise.resolve({
          schedules: [
            {
              programId: "prog-1",
              programName: "Program 1",
              programStatus: "in-progress",
              scheduledWorkouts,
            },
          ],
        });
      }
      return Promise.resolve({ logs: [] });
    });
  }

  it("(id: e015c92a) starting a slot opens Track for that slot's dayLabel + marker date", async () => {
    const future = new Date(Date.now() + 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    mockParams = { date: future };
    mockSchedule([
      { date: `${future}T00:00:00.000Z`, dayLabel: "Day 5", status: "scheduled", phase: 1 },
    ]);

    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-start-prog-1-4")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-start-prog-1-4"));
    // Day 5 → workoutIndex 4, and sd names the exact marker date so the
    // completion resolves THAT slot, not a neighbouring same-label one.
    expect(mockPush).toHaveBeenCalledWith(
      `/(tabs)/programming/prog-1/workout/4/live?phase=0&sd=${encodeURIComponent(future)}&day=Day%205`,
    );
  });

  it("(id: e015c929) skip asks first, then PATCHes skip for the slot's marker date", async () => {
    const future = new Date(Date.now() + 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    mockParams = { date: future };
    mockSchedule([
      { date: `${future}T00:00:00.000Z`, dayLabel: "Day 5", status: "scheduled", phase: 1 },
    ]);

    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-manage-prog-1-4")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-manage-prog-1-4"));
    fireEvent.press(getByTestId("slot-menu-skip"));

    // The confirm gate opens first — nothing is sent yet.
    expect(getByTestId("slot-confirm-skip-confirm")).toBeTruthy();
    expect(patchBodies()).toHaveLength(0);

    fireEvent.press(getByTestId("slot-confirm-skip-confirm"));
    await waitFor(() => {
      expect(patchBodies()).toHaveLength(1);
    });
    expect(patchBodies()[0]).toEqual(
      expect.objectContaining({
        action: "skip",
        programId: "prog-1",
        workoutDate: future,
      }),
    );
  });

  it("(id: e015c92b) un-complete asks first and PATCHes uncomplete for that day", async () => {
    const past = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    mockParams = { date: past };
    mockSchedule([
      {
        date: `${past}T00:00:00.000Z`,
        dayLabel: "Day 3",
        status: "completed",
        completedAt: `${past}T10:00:00.000Z`,
        phase: 1,
      },
    ]);

    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-uncomplete-prog-1-2")).toBeTruthy();
    });
    fireEvent.press(getByTestId("day-detail-uncomplete-prog-1-2"));

    // Asks first — the web's confirm message, natively.
    expect(getByTestId("slot-confirm-uncomplete-confirm")).toBeTruthy();
    expect(patchBodies()).toHaveLength(0);

    fireEvent.press(getByTestId("slot-confirm-uncomplete-confirm"));
    await waitFor(() => {
      expect(patchBodies()).toHaveLength(1);
    });
    expect(patchBodies()[0]).toEqual(
      expect.objectContaining({
        action: "uncomplete",
        programId: "prog-1",
        workoutDate: past,
      }),
    );
  });

  it("(id: e015c929) unskip, next-day, shift and pause/resume PATCH the web's bodies", async () => {
    const future = new Date(Date.now() + 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    mockParams = { date: future };
    mockSchedule([
      { date: `${future}T00:00:00.000Z`, dayLabel: "Day 6", status: "skipped", phase: 1 },
    ]);

    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("day-detail-unskip-prog-1-5")).toBeTruthy();
    });

    // Un-skip (no confirm on web either).
    fireEvent.press(getByTestId("day-detail-unskip-prog-1-5"));
    await waitFor(() => {
      expect(patchBodies()).toHaveLength(1);
    });
    expect(patchBodies()[0]).toEqual(
      expect.objectContaining({
        action: "unskip",
        programId: "prog-1",
        workoutDate: future,
      }),
    );

    // Move to next day from the Manage sheet.
    fireEvent.press(getByTestId("day-detail-manage-prog-1-5"));
    fireEvent.press(getByTestId("slot-menu-next-day"));
    await waitFor(() => {
      expect(patchBodies()).toHaveLength(2);
    });
    const next = new Date(
      Number(future.slice(0, 4)),
      Number(future.slice(5, 7)) - 1,
      Number(future.slice(8, 10)),
      12,
      0,
      0,
    );
    next.setDate(next.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const nextKey = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
    expect(patchBodies()[1]).toEqual(
      expect.objectContaining({
        action: "reschedule",
        programId: "prog-1",
        workoutDate: future,
        newDate: nextKey,
      }),
    );

    // Shift via the shift modal (web default 7 days).
    fireEvent.press(getByTestId("day-detail-manage-prog-1-5"));
    fireEvent.press(getByTestId("slot-menu-shift"));
    expect(getByTestId("shift-days-input").props.value).toBe("7");
    fireEvent.press(getByTestId("shift-confirm"));
    await waitFor(() => {
      expect(patchBodies()).toHaveLength(3);
    });
    expect(patchBodies()[2]).toEqual(
      expect.objectContaining({ action: "shift", programId: "prog-1", days: 7 }),
    );

    // Pause asks first, like the web.
    fireEvent.press(getByTestId("day-detail-manage-prog-1-5"));
    fireEvent.press(getByTestId("slot-menu-pause"));
    expect(getByTestId("slot-confirm-pause-confirm")).toBeTruthy();
    fireEvent.press(getByTestId("slot-confirm-pause-confirm"));
    await waitFor(() => {
      expect(patchBodies()).toHaveLength(4);
    });
    expect(patchBodies()[3]).toEqual(
      expect.objectContaining({ action: "pause", programId: "prog-1" }),
    );
  });
});
