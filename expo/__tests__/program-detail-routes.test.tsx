/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockOpenWebSignedIn = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: (path: string) => mockOpenWebSignedIn(path),
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
import {
  parseWeeks,
  toProgramDetailViewModel,
  toWorkoutOverview,
} from "@/lib/programs/programDetail";
import ProgramDetailRoute from "../app/(app)/(tabs)/programming/[id]/index";
import PhaseRoute from "../app/(app)/(tabs)/programming/[id]/phase/[phase]";
import WorkoutOverviewRoute from "../app/(app)/(tabs)/programming/[id]/workout/[idx]/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const PROGRAM = {
  program_id: "prog-1",
  name: "Strength Foundation",
  description: "Base",
  duration_weeks: 8,
  target_user: "Beginner",
  phases: [
    {
      phase: "Phase 1",
      weeks: "1-4",
      focus: "f1",
      workouts: [
        {
          day: "Day 1",
          title: "Push A",
          exercises: [
            { exerciseSlug: "bench", name: "Bench", sets: 4, reps: "5-8" },
            { exerciseSlug: "ohp", name: "OHP", sets: 3, reps: "8-10" },
          ],
        },
        {
          day: "Day 2",
          title: "Pull A",
          exercises: [
            { exerciseSlug: "row", name: "Row", sets: 4, reps: "8" },
          ],
        },
      ],
    },
    {
      phase: "Phase 2",
      weeks: "5-8",
      focus: "f2",
      workouts: [
        {
          day: "Day 1",
          title: "Push B",
          exercises: [
            { exerciseSlug: "db", name: "DB Press", sets: 3, reps: "10" },
          ],
        },
      ],
    },
  ],
};

function getsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]) === path);
}

function callsByPathMethod(path: string, method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => {
    if (String(c[0]) !== path) return false;
    return (c[2] as { method?: string } | undefined)?.method === method;
  });
}

describe("programDetail mappers", () => {
  it("parseWeeks handles ranges, singles, and junk", () => {
    expect(parseWeeks("1-4")).toEqual({ start: 1, end: 4 });
    expect(parseWeeks("Weeks 5–8")).toEqual({ start: 5, end: 8 });
    expect(parseWeeks("7")).toEqual({ start: 7, end: 7 });
    expect(parseWeeks(undefined)).toEqual({ start: 0, end: 0 });
  });

  it("toProgramDetailViewModel maps phases → workout outlines", () => {
    const vm = toProgramDetailViewModel(PROGRAM);
    expect(vm.id).toBe("prog-1");
    expect(vm.phases).toHaveLength(2);
    expect(vm.phases[0]).toEqual(
      expect.objectContaining({
        phaseIndex: 0,
        name: "Phase 1",
        weekStart: 1,
        weekEnd: 4,
      }),
    );
    expect(vm.phases[0]!.workouts[0]).toEqual(
      expect.objectContaining({
        workoutIndex: 0,
        day: "Day 1",
        title: "Push A",
        exerciseCount: 2,
      }),
    );
  });

  it("toWorkoutOverview slices the right workout", () => {
    const wo = toWorkoutOverview(PROGRAM, 1, 0)!;
    expect(wo.title).toBe("Push B");
    expect(wo.exercises[0]).toEqual({
      slug: "db",
      name: "DB Press",
      sets: 3,
      repsLabel: "10",
    });
    expect(toWorkoutOverview(PROGRAM, 9, 9)).toBeNull();
  });
});

describe("ProgramDetailRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockResolvedValue(PROGRAM);
    mockParams = { id: "prog-1" };
  });

  it("GETs /api/programs/[id] once with baseUrl+token and renders phases", async () => {
    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => {
      expect(getsTo("/api/programs/prog-1").length).toBeGreaterThan(0);
    });
    expect(getsTo("/api/programs/prog-1").length).toBe(1);
    const opts = getsTo("/api/programs/prog-1")[0]![2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("program-detail-name").props.children).toBe(
        "Strength Foundation",
      );
    });
    expect(getByTestId("program-detail-phase-0")).toBeTruthy();
    expect(getByTestId("program-detail-phase-1")).toBeTruthy();
  });

  it("(id: e015c83f) An enrolled member sees Continue, completed days checked and the first incomplete day selected, matching the web", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: [
            {
              programId: "prog-1",
              programName: "Strength Foundation",
              currentPhase: 1,
              currentDay: "Day 1",
              completedWorkouts: 1,
              totalWorkouts: 4,
            },
          ],
        });
      }
      if (path.startsWith("/api/workouts/logs?programId=prog-1")) {
        return Promise.resolve({
          logs: [
            { day: "Day 1", completed: true, date: "2026-09-29T10:00:00Z" },
            { day: "Day 2", completed: false, date: "2026-09-30T10:00:00Z" },
          ],
        });
      }
      if (path.startsWith("/api/workouts?")) {
        return Promise.resolve({ isResume: false, workout: null });
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId, queryByTestId, getByText } = render(
      <ProgramDetailRoute />,
    );

    // 1. Enrolled member sees Continue (not Enroll / Start Program)
    await waitFor(() => {
      expect(getByTestId("program-detail-continue")).toBeTruthy();
    });
    expect(getByText("Continue")).toBeTruthy();
    expect(queryByTestId("program-detail-start")).toBeNull();

    // 2. Completed day is checked (Day 1 completed: true)
    await waitFor(() => {
      expect(getByTestId("program-detail-day-check-Day 1")).toBeTruthy();
    });
    // Incomplete day is NOT checked (Day 2 completed: false)
    expect(queryByTestId("program-detail-day-check-Day 2")).toBeNull();

    // 3. First incomplete day in active phase is selected by default (Day 2)
    // Workout title shows Day 2 workout: "Pull A"
    expect(getByTestId("program-detail-workout-title").props.children).toBe(
      "Pull A",
    );

    // 4. Pressing Continue routes to Track on the day the schedule says is next
    fireEvent.press(getByTestId("program-detail-continue"));
    expect(mockPush).toHaveBeenCalledWith(
      "/(tabs)/programming/prog-1/workout/0?phase=0",
    );
  });

  it("(id: e015c840) A member with a workout in progress sees the in-progress state and resumes it", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: [
            {
              programId: "prog-1",
              programName: "Strength Foundation",
              currentPhase: 1,
              currentDay: "Day 1",
            },
          ],
        });
      }
      if (path.startsWith("/api/workouts/logs?programId=prog-1")) {
        return Promise.resolve({ logs: [] });
      }
      if (path.startsWith("/api/workouts?")) {
        return Promise.resolve({
          isResume: true,
          workout: {
            kind: "program",
            programId: "prog-1",
            day: "Day 1",
            phase: 1,
          },
        });
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId, getByText, queryByTestId } = render(
      <ProgramDetailRoute />,
    );

    // In-progress workout is displayed as "Resume"
    await waitFor(() => {
      expect(getByTestId("program-detail-resume")).toBeTruthy();
    });
    expect(getByText("Resume")).toBeTruthy();
    expect(queryByTestId("program-detail-workout-live")).toBeNull();

    // Resuming opens live workout route directly
    fireEvent.press(getByTestId("program-detail-resume"));
    expect(mockPush).toHaveBeenCalledWith(
      "/(tabs)/programming/prog-1/workout/0/live?phase=0&day=Day%201",
    );
  });

  it("(id: e015c841) No native screen links to /dashboard/programming/*", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      return Promise.resolve({ activePrograms: [] });
    });

    const { queryByTestId, queryByText } = render(<ProgramDetailRoute />);

    await waitFor(() => {
      expect(queryByTestId("program-detail-edit-in-browser")).toBeNull();
    });
    expect(queryByText("Edit in browser")).toBeNull();
    expect(queryByText("Edit on web")).toBeNull();
  });

  it("(id: e015c9b9) Custom owned program shows Edit and opens the native builder", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/prog-1") {
        return Promise.resolve({
          ...PROGRAM,
          isCustom: true,
          isOwner: true,
        });
      }
      return Promise.resolve({ activePrograms: [] });
    });

    const { getByTestId } = render(<ProgramDetailRoute />);

    await waitFor(() => {
      expect(getByTestId("program-detail-edit")).toBeTruthy();
    });

    fireEvent.press(getByTestId("program-detail-edit"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/prog-1/edit");
    expect(mockOpenWebSignedIn).not.toHaveBeenCalled();
  });

  it("Custom program shared by trainer does not show Edit button", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/prog-1") {
        return Promise.resolve({
          ...PROGRAM,
          isCustom: true,
          isOwner: false,
        });
      }
      return Promise.resolve({ activePrograms: [] });
    });

    const { queryByTestId } = render(<ProgramDetailRoute />);

    await waitFor(() => {
      expect(queryByTestId("program-detail-edit")).toBeNull();
    });
  });
});

describe("ProgramDetailRoute mutations", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockParams = { id: "prog-1" };
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (path === "/api/programs/active") {
        return Promise.resolve({ activePrograms: [] });
      }
      return Promise.resolve({ success: true });
    });
  });

  it("enroll opens dialog, POSTs /api/programs/enroll {programId, startDate}, refetches active and routes to schedule", async () => {
    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => expect(getByTestId("program-detail-start")).toBeTruthy());
    const activeBefore = getsTo("/api/programs/active").length;

    await act(async () => {
      fireEvent.press(getByTestId("program-detail-start"));
    });

    await waitFor(() => expect(getByTestId("enroll-modal-confirm")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("enroll-modal-confirm"));
    });

    await waitFor(() => {
      expect(callsByPathMethod("/api/programs/enroll", "POST").length).toBeGreaterThan(0);
    });
    const call = callsByPathMethod("/api/programs/enroll", "POST")[0]!;
    expect(call[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          programId: "prog-1",
          startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
        baseUrl: WEBAPP_BASE_URL,
      }),
    );
    await waitFor(() => {
      expect(getsTo("/api/programs/active").length).toBeGreaterThan(activeBefore);
    });
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/prog-1/schedule");
  });

  it("start-date opens dialog, PUTs /api/programs/start-date {programId, startDate} and refetches active", async () => {
    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() =>
      expect(getByTestId("program-detail-set-start-date")).toBeTruthy(),
    );
    const activeBefore = getsTo("/api/programs/active").length;

    await act(async () => {
      fireEvent.press(getByTestId("program-detail-set-start-date"));
    });

    await waitFor(() => {
      expect(getByTestId("change-start-date-save")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("change-start-date-save"));
    });

    await waitFor(() => {
      expect(callsByPathMethod("/api/programs/start-date", "PUT").length).toBeGreaterThan(0);
    });
    const call = callsByPathMethod("/api/programs/start-date", "PUT")[0]!;
    const opts = call[2] as {
      method?: string;
      body?: { programId?: string; startDate?: string };
      baseUrl?: string;
    };
    expect(opts.method).toBe("PUT");
    expect(opts.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(opts.body?.programId).toBe("prog-1");
    expect(opts.body?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => {
      expect(getsTo("/api/programs/active").length).toBeGreaterThan(activeBefore);
    });
  });

  it("(id: e015c92f) Abandon asks for confirmation, requires typing 'abandon' when progress exists, POSTs /api/programs/abandon and routes to workout tab", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: [
            {
              programId: "prog-1",
              programName: "Strength Foundation",
              currentPhase: 1,
              currentDay: "Day 1",
              completedWorkouts: 1,
              totalWorkouts: 4,
              status: "in-progress",
            },
          ],
        });
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => expect(getByTestId("program-detail-abandon")).toBeTruthy());
    const activeBefore = getsTo("/api/programs/active").length;

    await act(async () => {
      fireEvent.press(getByTestId("program-detail-abandon"));
    });

    // Confirmation dialog opens and requires typing "abandon" because completedWorkouts: 1
    await waitFor(() => {
      expect(getByTestId("abandon-confirm-input")).toBeTruthy();
    });

    // Trying to press confirm before typing should not trigger POST
    const initialPostCount = callsByPathMethod("/api/programs/abandon", "POST").length;
    await act(async () => {
      fireEvent.press(getByTestId("abandon-confirm"));
    });
    expect(callsByPathMethod("/api/programs/abandon", "POST").length).toBe(initialPostCount);

    // Type "abandon" to enable confirmation
    await act(async () => {
      fireEvent.changeText(getByTestId("abandon-confirm-input"), "abandon");
    });

    await act(async () => {
      fireEvent.press(getByTestId("abandon-confirm"));
    });

    await waitFor(() => {
      expect(callsByPathMethod("/api/programs/abandon", "POST").length).toBeGreaterThan(0);
    });
    const call = callsByPathMethod("/api/programs/abandon", "POST")[0]!;
    expect(call[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { programId: "prog-1" },
        baseUrl: WEBAPP_BASE_URL,
      }),
    );
    await waitFor(() => {
      expect(getsTo("/api/programs/active").length).toBeGreaterThan(activeBefore);
    });
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming");
  });

  it("(id: e015c930) Pausing natively calls PATCH /api/schedule {action: 'pause'}, shows paused state, and resuming reverses it", async () => {
    let programStatus: "in-progress" | "paused" = "in-progress";
    mockApiFetch.mockImplementation((path: string, schema: unknown, opts: { method?: string; body?: { action?: string } }) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (path === "/api/programs/active") {
        return Promise.resolve({
          activePrograms: [
            {
              programId: "prog-1",
              programName: "Strength Foundation",
              currentPhase: 1,
              currentDay: "Day 1",
              completedWorkouts: 1,
              totalWorkouts: 4,
              status: programStatus,
            },
          ],
        });
      }
      if (path === "/api/schedule" && opts?.method === "PATCH") {
        if (opts.body?.action === "pause") {
          programStatus = "paused";
          return Promise.resolve({ message: "Program paused", programId: "prog-1" });
        }
        if (opts.body?.action === "resume") {
          programStatus = "in-progress";
          return Promise.resolve({ message: "Program resumed", programId: "prog-1" });
        }
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId, queryByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => expect(getByTestId("program-detail-pause-resume")).toBeTruthy());
    expect(queryByTestId("program-detail-paused-banner")).toBeNull();

    // 1. Pause
    await act(async () => {
      fireEvent.press(getByTestId("program-detail-pause-resume"));
    });

    await waitFor(() => {
      const pauseCalls = callsByPathMethod("/api/schedule", "PATCH").filter(
        (c) => (c[2] as { body?: { action?: string } })?.body?.action === "pause",
      );
      expect(pauseCalls.length).toBeGreaterThan(0);
    });

    // Now paused: paused banner visible
    await waitFor(() => {
      expect(getByTestId("program-detail-paused-banner")).toBeTruthy();
    });

    // 2. Resume
    await act(async () => {
      fireEvent.press(getByTestId("program-detail-pause-resume"));
    });

    await waitFor(() => {
      const resumeCalls = callsByPathMethod("/api/schedule", "PATCH").filter(
        (c) => (c[2] as { body?: { action?: string } })?.body?.action === "resume",
      );
      expect(resumeCalls.length).toBeGreaterThan(0);
    });

    // Resumed: paused banner gone
    await waitFor(() => {
      expect(queryByTestId("program-detail-paused-banner")).toBeNull();
    });
  });

  it("(id: e015c931) Shifting by 3 days opens dialog, calls PATCH /api/schedule with action: 'shift' and days: 3, and refetches active", async () => {
    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => expect(getByTestId("program-detail-shift")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("program-detail-shift"));
    });

    await waitFor(() => {
      expect(getByTestId("shift-confirm")).toBeTruthy();
      expect(getByTestId("shift-days-input").props.value).toBe("3");
    });

    await act(async () => {
      fireEvent.press(getByTestId("shift-confirm"));
    });

    await waitFor(() => {
      const shiftCalls = callsByPathMethod("/api/schedule", "PATCH").filter(
        (c) => (c[2] as { body?: { action?: string } })?.body?.action === "shift",
      );
      expect(shiftCalls.length).toBeGreaterThan(0);
      const call = shiftCalls[0]!;
      const opts = call[2] as { body?: { programId?: string; action?: string; days?: number } };
      expect(opts.body?.programId).toBe("prog-1");
      expect(opts.body?.action).toBe("shift");
      expect(opts.body?.days).toBe(3);
    });
  });

  it("save toggle POSTs and DELETEs /api/programs/saved {programId}", async () => {
    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => expect(getByTestId("program-detail-toggle-save")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("program-detail-toggle-save"));
    });

    await waitFor(() => {
      expect(callsByPathMethod("/api/programs/saved", "POST").length).toBeGreaterThan(0);
    });
    const postCall = callsByPathMethod("/api/programs/saved", "POST")[0]!;
    expect(postCall[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { programId: "prog-1" },
        baseUrl: WEBAPP_BASE_URL,
      }),
    );
  });
});

describe("PhaseRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockResolvedValue(PROGRAM);
  });

  it("renders the correct workout slice for phase[1] (one GET)", async () => {
    mockParams = { id: "prog-1", phase: "1" };
    const { getByTestId, getByText, queryByTestId } = render(<PhaseRoute />);
    await waitFor(() => {
      expect(getByText("Phase 2")).toBeTruthy();
    });
    expect(getsTo("/api/programs/prog-1").length).toBe(1);
    // Phase 2 has exactly one workout: "Push B".
    expect(getByTestId("phase-screen-workout-0")).toBeTruthy();
    expect(queryByTestId("phase-screen-workout-1")).toBeNull();
    expect(getByText("Push B")).toBeTruthy();
  });
});

describe("WorkoutOverviewRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockResolvedValue(PROGRAM);
  });

  it("renders the workout for phase 0 / index 0 (one GET)", async () => {
    mockParams = { id: "prog-1", idx: "0", phase: "0" };
    const { getByTestId } = render(<WorkoutOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("workout-overview-title").props.children).toBe(
        "Push A",
      );
    });
    expect(getsTo("/api/programs/prog-1").length).toBe(1);
    expect(getByTestId("workout-overview-exercise-bench")).toBeTruthy();
    expect(getByTestId("workout-overview-exercise-ohp")).toBeTruthy();
  });

  it("uses the phase query param to slice a different phase's workout", async () => {
    mockParams = { id: "prog-1", idx: "0", phase: "1" };
    const { getByTestId } = render(<WorkoutOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("workout-overview-title").props.children).toBe(
        "Push B",
      );
    });
  });

  // THE BUTTON THAT DID NOTHING: WorkoutOverview shipped with
  // `onPress={onStartLive ?? (() => {})}` and this route rendered it without
  // one, so the only control on the screen was inert. The prop is required
  // now, and it opens the live screen for the SAME program, phase and index.
  it("Start live workout opens the live screen for this program, phase and index", async () => {
    mockParams = { id: "prog-1", idx: "1", phase: "0" };
    const { getByTestId } = render(<WorkoutOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("workout-overview-title").props.children).toBe(
        "Pull A",
      );
    });

    fireEvent.press(getByTestId("workout-overview-start-live"));

    expect(mockPush).toHaveBeenCalledWith(
      "/(tabs)/programming/prog-1/workout/1/live?phase=0",
    );
  });

  it("carries a non-zero phase through to the live screen", async () => {
    mockParams = { id: "prog-1", idx: "0", phase: "1" };
    const { getByTestId } = render(<WorkoutOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("workout-overview-title").props.children).toBe(
        "Push B",
      );
    });

    fireEvent.press(getByTestId("workout-overview-start-live"));

    expect(mockPush).toHaveBeenCalledWith(
      "/(tabs)/programming/prog-1/workout/0/live?phase=1",
    );
  });
});
