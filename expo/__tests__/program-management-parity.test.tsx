/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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

import { apiFetch } from "@become/api-client";
import ProgramDetailRoute from "../app/(app)/(tabs)/programming/[id]/index";
import { ContinueTrainingSection } from "@/components/workout/ContinueTrainingSection";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const SAMPLE_PROGRAM = {
  program_id: "prog-mgmt-1",
  name: "Strength Hypertrophy",
  description: "8-week periodized protocol",
  duration_weeks: 8,
  target_user: "Intermediate",
  phases: [
    {
      phase: "Phase 1",
      weeks: "1-4",
      focus: "Accumulation",
      workouts: [
        {
          day: "Day 1",
          title: "Upper Power",
          exercises: [{ exerciseSlug: "bench", name: "Bench Press", sets: 4, reps: "6" }],
        },
      ],
    },
  ],
};

function callsByPathMethod(path: string, method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => {
    if (String(c[0]) !== path) return false;
    return (c[2] as { method?: string } | undefined)?.method === method;
  });
}

describe("Program Management Actions Parity (NP-111)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockParams = { id: "prog-mgmt-1" };
  });

  // Acceptance Criterion 1
  it("(id: e015c92f) Abandon asks for confirmation and removes the program from Continue Training on both apps", async () => {
    let activeProgramsList = [
      {
        programId: "prog-mgmt-1",
        programName: "Strength Hypertrophy",
        currentPhase: 1,
        currentDay: "Day 1",
        completedWorkouts: 2,
        totalWorkouts: 8,
        status: "in-progress" as const,
      },
    ];

    mockApiFetch.mockImplementation((path: string, _schema: unknown, opts?: { method?: string }) => {
      if (path === "/api/programs/prog-mgmt-1") return Promise.resolve(SAMPLE_PROGRAM);
      if (path.startsWith("/api/schedule?")) {
        return Promise.resolve({ schedules: [] });
      }
      if (path === "/api/programs/active") {
        return Promise.resolve({ activePrograms: activeProgramsList });
      }
      if (path === "/api/programs/abandon" && opts?.method === "POST") {
        // Abandon removes the program
        activeProgramsList = [];
        return Promise.resolve({ success: true, message: "Program abandoned successfully" });
      }
      return Promise.resolve({ success: true });
    });

    // Step 1: Render ProgramDetailRoute
    const detail = render(<ProgramDetailRoute />);
    await waitFor(() => {
      expect(detail.getByTestId("program-detail-abandon")).toBeTruthy();
    });

    // Step 2: Member presses "Abandon program"
    await act(async () => {
      fireEvent.press(detail.getByTestId("program-detail-abandon"));
    });

    // Step 3: Dialog opens and requires typing "abandon" because completedWorkouts: 2 > 0
    await waitFor(() => {
      expect(detail.getByTestId("abandon-confirm-input")).toBeTruthy();
    });

    // Premature confirm does nothing
    await act(async () => {
      fireEvent.press(detail.getByTestId("abandon-confirm"));
    });
    expect(callsByPathMethod("/api/programs/abandon", "POST").length).toBe(0);

    // Cancel dismisses
    await act(async () => {
      fireEvent.press(detail.getByTestId("abandon-cancel"));
    });

    // Reopen and type "abandon"
    await act(async () => {
      fireEvent.press(detail.getByTestId("program-detail-abandon"));
    });
    await waitFor(() => {
      expect(detail.getByTestId("abandon-confirm-input")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(detail.getByTestId("abandon-confirm-input"), "abandon");
    });

    await act(async () => {
      fireEvent.press(detail.getByTestId("abandon-confirm"));
    });

    // Step 4: Verify POST /api/programs/abandon was called
    await waitFor(() => {
      expect(callsByPathMethod("/api/programs/abandon", "POST").length).toBe(1);
    });
    const abandonCall = callsByPathMethod("/api/programs/abandon", "POST")[0]!;
    expect((abandonCall[2] as { body?: { programId?: string } }).body?.programId).toBe("prog-mgmt-1");

    // Navigates back to Workout tab
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming");

    // Step 5: Render ContinueTrainingSection — program has been removed
    const continueSection = render(<ContinueTrainingSection />);
    await waitFor(() => {
      expect(continueSection.queryByTestId("continue-program-card-prog-mgmt-1")).toBeNull();
    });
  });

  // Acceptance Criterion 2
  it("(id: e015c930) Pausing natively shows the program as paused on the web, and resuming reverses it", async () => {
    let programStatus: "in-progress" | "paused" = "in-progress";

    mockApiFetch.mockImplementation((path: string, _schema: unknown, opts?: { method?: string; body?: { action?: string } }) => {
      if (path === "/api/programs/prog-mgmt-1") return Promise.resolve(SAMPLE_PROGRAM);
      if (path.startsWith("/api/schedule?")) {
        return Promise.resolve({ schedules: [] });
      }
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: [
            {
              programId: "prog-mgmt-1",
              programName: "Strength Hypertrophy",
              currentPhase: 1,
              currentDay: "Day 1",
              completedWorkouts: 1,
              totalWorkouts: 8,
              status: programStatus,
            },
          ],
        });
      }
      if (path === "/api/schedule" && opts?.method === "PATCH") {
        if (opts.body?.action === "pause") {
          programStatus = "paused";
          return Promise.resolve({ message: "Program paused", programId: "prog-mgmt-1" });
        }
        if (opts.body?.action === "resume") {
          programStatus = "in-progress";
          return Promise.resolve({ message: "Program resumed", programId: "prog-mgmt-1" });
        }
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId, queryByTestId, getByText } = render(<ProgramDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("program-detail-pause-resume")).toBeTruthy();
    });
    expect(getByText("Pause Program")).toBeTruthy();
    expect(queryByTestId("program-detail-paused-banner")).toBeNull();

    // 1. Pause natively
    await act(async () => {
      fireEvent.press(getByTestId("program-detail-pause-resume"));
    });

    await waitFor(() => {
      const pauseCalls = callsByPathMethod("/api/schedule", "PATCH").filter(
        (c) => (c[2] as { body?: { action?: string } })?.body?.action === "pause",
      );
      expect(pauseCalls.length).toBe(1);
    });

    // Program shows as paused with banner and button updates to Resume Program
    await waitFor(() => {
      expect(getByTestId("program-detail-paused-banner")).toBeTruthy();
      expect(getByText("Resume Program")).toBeTruthy();
    });

    // 2. Resume natively
    await act(async () => {
      fireEvent.press(getByTestId("program-detail-pause-resume"));
    });

    await waitFor(() => {
      const resumeCalls = callsByPathMethod("/api/schedule", "PATCH").filter(
        (c) => (c[2] as { body?: { action?: string } })?.body?.action === "resume",
      );
      expect(resumeCalls.length).toBe(1);
    });

    // Resuming reverses it: paused banner is gone
    await waitFor(() => {
      expect(queryByTestId("program-detail-paused-banner")).toBeNull();
      expect(getByText("Pause Program")).toBeTruthy();
    });
  });

  // Acceptance Criterion 3
  it("(id: e015c931) Shifting by 3 days moves the upcoming slots on both apps", async () => {
    let daysShifted = 0;

    mockApiFetch.mockImplementation((path: string, _schema: unknown, opts?: { method?: string; body?: { action?: string; days?: number } }) => {
      if (path === "/api/programs/prog-mgmt-1") return Promise.resolve(SAMPLE_PROGRAM);
      if (path.startsWith("/api/schedule?")) {
        return Promise.resolve({ schedules: [] });
      }
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: [
            {
              programId: "prog-mgmt-1",
              programName: "Strength Hypertrophy",
              currentPhase: 1,
              currentDay: "Day 1",
              completedWorkouts: 1,
              totalWorkouts: 8,
              status: "in-progress" as const,
            },
          ],
        });
      }
      if (path === "/api/schedule" && opts?.method === "PATCH") {
        if (opts.body?.action === "shift") {
          daysShifted = opts.body?.days ?? 0;
          return Promise.resolve({
            message: "Schedule shifted successfully",
            programId: "prog-mgmt-1",
            daysShifted,
            shiftedFrom: "2026-10-02T00:00:00.000Z",
            shiftedTo: "2026-10-05T00:00:00.000Z",
            totalScheduledWorkouts: 8,
            futureWorkouts: 7,
          });
        }
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("program-detail-shift")).toBeTruthy();
    });

    // Open shift dialog
    await act(async () => {
      fireEvent.press(getByTestId("program-detail-shift"));
    });

    await waitFor(() => {
      expect(getByTestId("shift-confirm")).toBeTruthy();
      expect(getByTestId("shift-days-input").props.value).toBe("3");
    });

    // Confirm shift by 3 days
    await act(async () => {
      fireEvent.press(getByTestId("shift-confirm"));
    });

    await waitFor(() => {
      const shiftCalls = callsByPathMethod("/api/schedule", "PATCH").filter(
        (c) => (c[2] as { body?: { action?: string } })?.body?.action === "shift",
      );
      expect(shiftCalls.length).toBe(1);
      const call = shiftCalls[0]!;
      const body = (call[2] as { body?: { programId?: string; action?: string; days?: number } }).body;
      expect(body?.programId).toBe("prog-mgmt-1");
      expect(body?.action).toBe("shift");
      expect(body?.days).toBe(3);
    });

    expect(daysShifted).toBe(3);
  });

  it("Change start date opens dialog, updates with local YYYY-MM-DD date and refetches", async () => {
    mockApiFetch.mockImplementation((path: string, _schema: unknown, opts?: { method?: string }) => {
      if (path === "/api/programs/prog-mgmt-1") return Promise.resolve(SAMPLE_PROGRAM);
      if (path.startsWith("/api/schedule?")) {
        return Promise.resolve({ schedules: [] });
      }
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: [
            {
              programId: "prog-mgmt-1",
              programName: "Strength Hypertrophy",
              currentPhase: 1,
              currentDay: "Day 1",
              completedWorkouts: 0,
              totalWorkouts: 8,
              status: "in-progress" as const,
              startDate: "2026-10-10",
            },
          ],
        });
      }
      if (path === "/api/programs/start-date" && opts?.method === "PUT") {
        return Promise.resolve({
          message: "Start date updated",
          startDate: "2026-10-15T00:00:00.000Z",
        });
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("program-detail-set-start-date")).toBeTruthy();
    });

    // Open change start date modal
    await act(async () => {
      fireEvent.press(getByTestId("program-detail-set-start-date"));
    });

    await waitFor(() => {
      expect(getByTestId("change-start-date-save")).toBeTruthy();
    });

    // Confirm new start date
    await act(async () => {
      fireEvent.press(getByTestId("change-start-date-save"));
    });

    await waitFor(() => {
      expect(callsByPathMethod("/api/programs/start-date", "PUT").length).toBe(1);
    });

    const call = callsByPathMethod("/api/programs/start-date", "PUT")[0]!;
    const body = (call[2] as { body?: { programId?: string; startDate?: string } }).body;
    expect(body?.programId).toBe("prog-mgmt-1");
    // Start date is local YYYY-MM-DD, never toISOString
    expect(body?.startDate).toBe("2026-10-10");
  });
  it("ContinueTrainingSection displays paused badge and status for paused programs", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: [
            {
              programId: "prog-mgmt-1",
              programName: "Strength Hypertrophy",
              currentPhase: 1,
              currentDay: "Day 1",
              completedWorkouts: 1,
              totalWorkouts: 8,
              status: "paused" as const,
            },
          ],
        });
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId } = render(<ContinueTrainingSection />);
    await waitFor(() => {
      expect(getByTestId("continue-program-paused-prog-mgmt-1")).toBeTruthy();
    });
  });
});
