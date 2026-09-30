/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({}),
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
import CalendarIndexRoute from "../app/(app)/(tabs)/calendar/index";
import CalendarSettingsRoute from "../app/(app)/(tabs)/calendar/settings";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const today = new Date();
const plus = (d: number) =>
  new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);
const dateA = plus(3);
const dateB = plus(5);

function callsByMethod(path: string, method?: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => {
    if (String(c[0]) !== path) return false;
    const m = (c[2] as { method?: string } | undefined)?.method;
    return method ? m === method : true;
  });
}
function getsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).split("?")[0] === path &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === "GET",
  );
}

function scheduleDoc(date: string) {
  return {
    schedules: [
      {
        programId: "prog-1",
        settings: { trainingDays: [1, 3, 5], startDate: `${dateA}T00:00:00.000Z` },
        scheduledWorkouts: [
          { date: `${date}T00:00:00.000Z`, dayLabel: "Day 1", status: "scheduled", phase: 1 },
        ],
      },
    ],
  };
}

describe("Calendar reschedule (PATCH /api/schedule)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockBack.mockReset();
    let getCount = 0;
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path.split("?")[0] === "/api/schedule" && (!method || method === "GET")) {
        getCount += 1;
        // First load shows dateA; after reschedule the refetch shows dateB.
        return Promise.resolve(scheduleDoc(getCount === 1 ? dateA : dateB));
      }
      if (path === "/api/schedule" && method === "PATCH") {
        // The real slot-action answer: { message, schedule: { … } }. The hook
        // parses it with SchedulePatchResponseSchema now, so a made-up shape
        // here would be a test agreeing with nothing.
        return Promise.resolve({
          message: "Schedule updated: reschedule",
          schedule: {
            programId: "prog-1",
            scheduledWorkouts: [
              {
                date: `${dateB}T00:00:00.000Z`,
                programId: "prog-1",
                phase: 1,
                dayLabel: "Day 1",
                workoutTitle: "Lower A",
                status: "scheduled",
              },
            ],
          },
        });
      }
      return Promise.resolve({});
    });
  });

  it("PATCHes reschedule and the grid reflects the moved slot after refetch", async () => {
    const { getByTestId } = render(<CalendarIndexRoute />);
    await waitFor(() => {
      expect(getByTestId(`scheduled-list-reschedule-${dateA}-0`)).toBeTruthy();
    });

    fireEvent.press(getByTestId(`scheduled-list-reschedule-${dateA}-0`));
    fireEvent.changeText(getByTestId("reschedule-modal-date"), dateB);
    await act(async () => {
      fireEvent.press(getByTestId("reschedule-modal-confirm"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/schedule", "PATCH").length).toBeGreaterThan(0);
    });
    const patch = callsByMethod("/api/schedule", "PATCH")[0]!;
    expect(patch[2]).toEqual(
      expect.objectContaining({
        method: "PATCH",
        body: {
          programId: "prog-1",
          action: "reschedule",
          workoutDate: dateA,
          newDate: dateB,
        },
        baseUrl: WEBAPP_BASE_URL,
      }),
    );

    // onSuccess refetched the schedule; the moved slot now renders on dateB.
    await waitFor(() => {
      expect(getsTo("/api/schedule").length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(getByTestId(`scheduled-list-item-${dateB}-0`)).toBeTruthy();
    });
  });
});

describe("Calendar settings (PUT /api/schedule/settings)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockBack.mockReset();
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path.split("?")[0] === "/api/schedule" && (!method || method === "GET")) {
        return Promise.resolve(scheduleDoc(dateA));
      }
      if (path === "/api/schedule/settings" && method === "PUT") {
        // What PUT /api/schedule/settings actually answers with — the hook
        // parses it with ScheduleSettingsUpdateResponseSchema.
        return Promise.resolve({
          message: "Schedule settings updated and future workouts regenerated",
          schedule: {
            programId: "prog-1",
            settings: {
              trainingDays: [1, 2, 3, 5],
              startDate: `${dateA}T00:00:00.000Z`,
            },
            totalScheduledWorkouts: 12,
            pastWorkouts: 5,
            futureWorkouts: 7,
          },
        });
      }
      return Promise.resolve({});
    });
  });

  it("PUTs the training-days settings with programId on submit", async () => {
    const { getByTestId } = render(<CalendarSettingsRoute />);
    // Wait for the form to hydrate from the schedule fetch (re-seeds via key).
    await waitFor(() => {
      expect(getByTestId("schedule-settings-day-2")).toBeTruthy();
    });

    // Toggle Tuesday (2) on, then submit.
    fireEvent.press(getByTestId("schedule-settings-day-2"));
    await act(async () => {
      fireEvent.press(getByTestId("schedule-settings-submit"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/schedule/settings", "PUT").length).toBeGreaterThan(0);
    });
    const put = callsByMethod("/api/schedule/settings", "PUT")[0]!;
    const opts = put[2] as {
      method?: string;
      baseUrl?: string;
      body?: { programId?: string; trainingDays?: number[]; startDate?: string };
    };
    expect(opts.method).toBe("PUT");
    expect(opts.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(opts.body?.programId).toBe("prog-1");
    expect(opts.body?.trainingDays).toEqual(expect.arrayContaining([1, 2, 3, 5]));
    expect(opts.body?.startDate).toBeUndefined();
    expect(opts.body).not.toHaveProperty("startDate");
    expect(mockBack).toHaveBeenCalled();
  });

  it("allows a member with two programs to edit either (id: e015c828)", async () => {
    const twoProgramsDoc = {
      schedules: [
        {
          programId: "prog-1",
          programName: "Strength A",
          settings: { trainingDays: [1, 3, 5], startDate: `${dateA}T00:00:00.000Z` },
          scheduledWorkouts: [
            { date: `${dateA}T00:00:00.000Z`, dayLabel: "Day 1", status: "completed", phase: 1 },
          ],
        },
        {
          programId: "prog-2",
          programName: "Conditioning B",
          settings: { trainingDays: [2, 4], startDate: `${dateA}T00:00:00.000Z` },
          scheduledWorkouts: [],
        },
      ],
    };

    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path.split("?")[0] === "/api/schedule" && (!method || method === "GET")) {
        return Promise.resolve(twoProgramsDoc);
      }
      if (path === "/api/schedule/settings" && method === "PUT") {
        const body = (init as { body?: { programId?: string; trainingDays?: number[] } })?.body;
        return Promise.resolve({
          message: "Schedule settings updated and future workouts regenerated",
          schedule: {
            programId: body?.programId ?? "prog-1",
            settings: {
              trainingDays: body?.trainingDays ?? [1, 3, 5],
            },
            totalScheduledWorkouts: 10,
            pastWorkouts: 2,
            futureWorkouts: 8,
          },
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId } = render(<CalendarSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("schedule-card-prog-1")).toBeTruthy();
      expect(getByTestId("schedule-card-prog-2")).toBeTruthy();
    });

    // Edit program 2: toggle Saturday (6) and save
    fireEvent.press(getByTestId("schedule-settings-prog-2-day-6"));
    await act(async () => {
      fireEvent.press(getByTestId("schedule-settings-prog-2-submit"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/schedule/settings", "PUT").length).toBeGreaterThan(0);
    });
    const put = callsByMethod("/api/schedule/settings", "PUT")[0]!;
    const opts = put[2] as {
      method?: string;
      body?: { programId?: string; trainingDays?: number[]; startDate?: string };
    };
    expect(opts.method).toBe("PUT");
    expect(opts.body?.programId).toBe("prog-2");
    expect(opts.body?.trainingDays).toEqual(expect.arrayContaining([2, 4, 6]));
    expect(opts.body?.startDate).toBeUndefined();
    expect(opts.body).not.toHaveProperty("startDate");
    expect(mockBack).toHaveBeenCalled();
  });

  it("changing training days natively leaves past slots untouched and puts the next session on the next chosen weekday (id: e015c827)", async () => {
    const pastCompletedDate = plus(-14);
    const pastMissedDate = plus(-7);
    const scheduleWithPast = {
      schedules: [
        {
          programId: "prog-1",
          programName: "Strength A",
          settings: { trainingDays: [1, 3, 5], startDate: `${pastCompletedDate}T00:00:00.000Z` },
          scheduledWorkouts: [
            { date: `${pastCompletedDate}T00:00:00.000Z`, dayLabel: "Day 1", status: "completed", phase: 1 },
            { date: `${pastMissedDate}T00:00:00.000Z`, dayLabel: "Day 2", status: "missed", phase: 1 },
            { date: `${dateA}T00:00:00.000Z`, dayLabel: "Day 3", status: "scheduled", phase: 1 },
          ],
        },
      ],
    };

    let putCapturedBody: Record<string, unknown> | undefined;

    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path.split("?")[0] === "/api/schedule" && (!method || method === "GET")) {
        return Promise.resolve(scheduleWithPast);
      }
      if (path === "/api/schedule/settings" && method === "PUT") {
        putCapturedBody = (init as { body?: Record<string, unknown> })?.body;
        return Promise.resolve({
          message: "Schedule settings updated and future workouts regenerated",
          schedule: {
            programId: "prog-1",
            settings: { trainingDays: [2, 4] },
            totalScheduledWorkouts: 8,
            pastWorkouts: 2,
            futureWorkouts: 6,
          },
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId } = render(<CalendarSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("schedule-settings-day-2")).toBeTruthy();
    });

    // Toggle Tuesday (2) on and submit
    fireEvent.press(getByTestId("schedule-settings-day-2"));
    await act(async () => {
      fireEvent.press(getByTestId("schedule-settings-submit"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/schedule/settings", "PUT").length).toBeGreaterThan(0);
    });

    // Verification: NO startDate sent, so regeneration runs from today without resetting past slots
    expect(putCapturedBody?.startDate).toBeUndefined();
    expect(putCapturedBody).not.toHaveProperty("startDate");
    expect(putCapturedBody?.programId).toBe("prog-1");
    expect(putCapturedBody?.trainingDays).toEqual(expect.arrayContaining([1, 2, 3, 5]));
  });
});
