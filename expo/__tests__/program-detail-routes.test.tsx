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
import ProgramDetailRoute from "../app/(tabs)/programming/[id]/index";
import PhaseRoute from "../app/(tabs)/programming/[id]/phase/[phase]";
import WorkoutOverviewRoute from "../app/(tabs)/programming/[id]/workout/[idx]/index";
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
    expect(vm.phases[0]!.workouts[0]).toEqual({
      workoutIndex: 0,
      title: "Push A",
      exerciseCount: 2,
    });
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

  it("enroll POSTs /api/programs/enroll {programId} and refetches active", async () => {
    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => expect(getByTestId("program-detail-start")).toBeTruthy());
    const activeBefore = getsTo("/api/programs/active").length;

    await act(async () => {
      fireEvent.press(getByTestId("program-detail-start"));
    });

    await waitFor(() => {
      expect(callsByPathMethod("/api/programs/enroll", "POST").length).toBeGreaterThan(0);
    });
    const call = callsByPathMethod("/api/programs/enroll", "POST")[0]!;
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
  });

  it("start-date PUTs /api/programs/start-date {programId, startDate} and refetches active", async () => {
    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() =>
      expect(getByTestId("program-detail-set-start-date")).toBeTruthy(),
    );
    const activeBefore = getsTo("/api/programs/active").length;

    await act(async () => {
      fireEvent.press(getByTestId("program-detail-set-start-date"));
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

  it("abandon POSTs /api/programs/abandon {programId} and refetches active", async () => {
    const { getByTestId } = render(<ProgramDetailRoute />);
    await waitFor(() => expect(getByTestId("program-detail-abandon")).toBeTruthy());
    const activeBefore = getsTo("/api/programs/active").length;

    await act(async () => {
      fireEvent.press(getByTestId("program-detail-abandon"));
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

  it("navigates to live workout when pressing start-live", async () => {
    mockParams = { id: "prog-1", idx: "0", phase: "0" };
    const { getByTestId } = render(<WorkoutOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("workout-overview-title").props.children).toBe(
        "Push A",
      );
    });

    fireEvent.press(getByTestId("workout-overview-start-live"));
    expect(mockPush).toHaveBeenCalledWith(
      "/(tabs)/programming/prog-1/workout/0/live?phase=0",
    );
  });
});
