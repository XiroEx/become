/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string | undefined> = { id: "prog-1" };

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
  }),
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
import ScheduleSetupRoute from "../app/(app)/(tabs)/programming/[id]/schedule";

const mockApiFetch = apiFetch as unknown as jest.Mock;

const PROGRAM_FIXTURE = {
  program_id: "prog-1",
  name: "Strength Foundations",
  training_days_per_week: 3,
  duration_weeks: 6,
  phases: [
    {
      phase: 1,
      name: "Phase 1",
      workouts: [
        { day: "Day 1", workoutIndex: 0, title: "Workout A" },
        { day: "Day 2", workoutIndex: 1, title: "Workout B" },
        { day: "Day 3", workoutIndex: 2, title: "Workout C" },
      ],
    },
  ],
};

describe("ScheduleSetupRoute", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "prog-1" };

    mockApiFetch.mockImplementation((path: string, _schema: unknown, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      if (path.includes("/api/programs/prog-1")) {
        return Promise.resolve(PROGRAM_FIXTURE);
      }
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: [
            {
              programId: "prog-1",
              programName: "Strength Foundations",
              startDate: "2026-10-05T00:00:00.000Z",
              status: "in-progress",
            },
          ],
        });
      }
      if (path.includes("/api/schedule") && method === "GET") {
        return Promise.resolve({ schedules: [] });
      }
      if (path === "/api/schedule" && method === "POST") {
        return Promise.resolve({
          message: "Schedule created successfully",
          schedule: {
            programId: "prog-1",
            programName: "Strength Foundations",
            totalScheduledWorkouts: 18,
          },
        });
      }
      return Promise.resolve({ success: true });
    });
  });

  it("(id: e015c845) Enrolling natively creates a schedule the web calendar shows with the same dates", async () => {
    const { getByTestId } = render(<ScheduleSetupRoute />);

    // Step 1: Training days selection
    await waitFor(() => expect(getByTestId("schedule-step1-next")).toBeTruthy());

    // Suggested training days for 3 days/week is [1, 3, 5] (Mon, Wed, Fri)
    // Advance to Step 2
    await act(async () => {
      fireEvent.press(getByTestId("schedule-step1-next"));
    });

    // Step 2: Start Date selection
    await waitFor(() => expect(getByTestId("schedule-step2-next")).toBeTruthy());
    // Start date is prefilled with "2026-10-05" from active program enrollment
    await act(async () => {
      fireEvent.press(getByTestId("schedule-step2-next"));
    });

    // Step 3: Preview and Confirm
    await waitFor(() => expect(getByTestId("schedule-confirm-btn")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("schedule-confirm-btn"));
    });

    // Verify POST /api/schedule was called with expected payload
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.filter(
        (c) => c[0] === "/api/schedule" && c[2]?.method === "POST",
      );
      expect(calls.length).toBe(1);
      const postCall = calls[0]!;
      expect(postCall[2].body).toEqual(
        expect.objectContaining({
          programId: "prog-1",
          trainingDays: [1, 3, 5],
          startDate: "2026-10-05", // Exact YYYY-MM-DD date matching web calendar
        }),
      );
    });

    // After schedule creation, navigates back to program detail
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/programming/prog-1");
  });

  it("skip on Step 1 returns to program detail without posting schedule", async () => {
    const { getByTestId } = render(<ScheduleSetupRoute />);
    await waitFor(() => expect(getByTestId("schedule-skip-btn")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("schedule-skip-btn"));
    });

    const postCalls = mockApiFetch.mock.calls.filter(
      (c) => c[0] === "/api/schedule" && c[2]?.method === "POST",
    );
    expect(postCalls.length).toBe(0);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/programming/prog-1");
  });

  it("back button on Step 2 returns to Step 1", async () => {
    const { getByTestId } = render(<ScheduleSetupRoute />);
    await waitFor(() => expect(getByTestId("schedule-step1-next")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("schedule-step1-next"));
    });

    await waitFor(() => expect(getByTestId("schedule-step2-back")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("schedule-step2-back"));
    });

    await waitFor(() => expect(getByTestId("schedule-step1-next")).toBeTruthy());
  });

  it("renders existing schedule view when member already has a schedule", async () => {
    mockApiFetch.mockImplementation((path: string, _schema: unknown, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      if (path.includes("/api/programs/prog-1")) {
        return Promise.resolve(PROGRAM_FIXTURE);
      }
      if (path === "/api/programs/active") {
        return Promise.resolve({ activePrograms: [] });
      }
      if (path.includes("/api/schedule") && method === "GET") {
        return Promise.resolve({
          schedules: [
            {
              programId: "prog-1",
              programName: "Strength Foundations",
              settings: {
                trainingDays: [1, 3, 5],
                startDate: "2026-10-05T00:00:00.000Z",
              },
              scheduledWorkouts: [
                {
                  date: "2026-10-05T00:00:00.000Z",
                  status: "scheduled",
                  dayLabel: "Day 1",
                  workoutTitle: "Workout A",
                },
              ],
            },
          ],
        });
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId } = render(<ScheduleSetupRoute />);
    await waitFor(() => expect(getByTestId("recreate-schedule-btn")).toBeTruthy());

    // Clicking recreate schedule transitions to Step 1
    await act(async () => {
      fireEvent.press(getByTestId("recreate-schedule-btn"));
    });

    await waitFor(() => expect(getByTestId("schedule-step1-next")).toBeTruthy());
  });
});
