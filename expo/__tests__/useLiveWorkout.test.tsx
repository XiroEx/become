import { renderHook, act, waitFor } from "@testing-library/react-native";
import { apiFetch } from "@become/api-client";
import { useLiveWorkout } from "@/lib/live/useLiveWorkout";
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";

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
const mockApiFetch = apiFetch as unknown as jest.Mock;

describe("useLiveWorkout", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("(id: e015c85e) A workout started on the web and resumed natively shows the same completed sets, swaps and elapsed time, and the other way round", async () => {
    const store = createMemoryKeyValueStore();

    // 1. Web started this workout and saved an in-progress log with:
    // - 240 active seconds
    // - swap on exercise 0: "Barbell Bench Press" swapped to "Incline DB Press"
    // - completed set 1 (185 lbs x 5 reps)
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const url = String(path);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Push Day",
            day: "Day 1",
            exercises: [
              {
                exerciseSlug: "bench",
                name: "Barbell Bench Press",
                sets: 2,
                reps: "5",
                trackingType: "reps_weight",
              },
            ],
          },
          phase: 1,
          day: "Day 1",
        });
      }
      if (url.startsWith("/api/workouts/last-performance")) {
        return Promise.resolve({ performances: {}, prs: {} });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({
          isResume: true,
          workout: {
            programId: "prog-1",
            day: "Day 1",
            phase: 1,
            activeSeconds: 240,
            date: "2026-10-01T12:00:00.000Z",
            exercises: [
              {
                name: "Incline DB Press",
                exerciseSlug: "incline-db-press",
                originalExerciseSlug: "bench",
                swappedFromName: "Barbell Bench Press",
                sets: [
                  { setNumber: 1, reps: 5, weight: 185, completed: true },
                  { setNumber: 2, reps: 0, weight: 0, completed: false },
                ],
              },
            ],
          },
          exerciseHistory: {},
          exercisePRs: {},
        });
      }
      if (url === "/api/workouts" && (init as { method?: string })?.method === "POST") {
        return Promise.resolve({
          message: "Workout saved successfully",
          completed: false,
        });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", "2026-10-01", { cacheStore: store }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify resumed state matches what web saved:
    expect(result.current.isResuming).toBe(true);
    // Elapsed time reflects the resumed log's baseline (240s)
    expect(result.current.activeSeconds).toBeGreaterThanOrEqual(240);

    // Swapped exercise is restored
    expect(result.current.workout?.exercises[0]?.name).toBe("Incline DB Press");
    expect(result.current.workout?.exercises[0]?.slug).toBe("incline-db-press");
    expect(result.current.swappedExercises[0]).toEqual({
      originalSlug: "bench",
      originalName: "Barbell Bench Press",
    });

    // Completed sets are restored with same reps/weight/completed
    const sets = result.current.restoredGrid?.["incline-db-press"];
    expect(sets).toBeDefined();
    expect(sets?.[0]).toEqual(
      expect.objectContaining({
        reps: 5,
        weight: 185,
        completed: true,
      }),
    );
    expect(sets?.[1]?.completed).toBe(false);

    // And the other way round: saving from native sends the web's full body contract
    await act(async () => {
      await result.current.save(false);
    });

    const postCall = mockApiFetch.mock.calls.find(
      (c) => String(c[0]) === "/api/workouts" && (c[2] as { method?: string })?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    const saveBody = postCall![2].body;
    expect(saveBody.programId).toBe("prog-1");
    expect(saveBody.day).toBe("Day 1");
    expect(saveBody.phase).toBe(1);
    expect(saveBody.activeSeconds).toBeGreaterThanOrEqual(240);
    expect(saveBody.scheduledDate).toBe("2026-10-01");
    expect(saveBody.exercises[0]).toEqual(
      expect.objectContaining({
        name: "Incline DB Press",
        exerciseSlug: "incline-db-press",
        originalExerciseSlug: "bench",
        swappedFromName: "Barbell Bench Press",
        prescription: expect.objectContaining({ sets: 2 }),
        sets: [
          expect.objectContaining({ setNumber: 1, reps: 5, weight: 185, completed: true }),
          expect.objectContaining({ setNumber: 2, completed: false }),
        ],
      }),
    );
  });

  it("(id: e015c85f) A member with a permanent swap sees the replacement exercise natively", async () => {
    // Server GET /api/programs/current-workout replaces activePrograms[].exerciseSwaps
    // before hydrating. Here "barbell-squat" is permanently swapped to "goblet-squat".
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Leg Day",
            day: "Day 2",
            exercises: [
              {
                exerciseSlug: "goblet-squat",
                name: "Goblet Squat",
                sets: 3,
                reps: "10",
                trackingType: "reps_weight",
              },
            ],
          },
          phase: 1,
          day: "Day 2",
        });
      }
      if (url.startsWith("/api/workouts/last-performance")) {
        return Promise.resolve({ performances: {}, prs: {} });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({
          isResume: false,
          workout: null,
          exerciseHistory: {},
        });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 2", null),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // The member sees the replacement exercise ("Goblet Squat"), not the original raw catalogue exercise
    expect(result.current.workout?.exercises[0]?.name).toBe("Goblet Squat");
    expect(result.current.workout?.exercises[0]?.slug).toBe("goblet-squat");
  });

  it("(id: e015c860) A workout finished natively appears on the web with the same sets and duration, and its schedule slot is marked completed", async () => {
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const url = String(path);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Upper Body",
            day: "Day 1",
            exercises: [
              {
                exerciseSlug: "bench",
                name: "Bench Press",
                sets: 2,
                reps: "5",
                trackingType: "reps_weight",
              },
            ],
          },
          phase: 1,
          day: "Day 1",
        });
      }
      if (url.startsWith("/api/workouts/last-performance")) {
        return Promise.resolve({ performances: {}, prs: {} });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({
          isResume: false,
          workout: null,
          exerciseHistory: {},
        });
      }
      if (url === "/api/workouts" && (init as { method?: string })?.method === "POST") {
        return Promise.resolve({
          message: "Workout completed successfully",
          completed: true,
          programCompleted: false,
          newPRsAchieved: [],
        });
      }
      return Promise.resolve({});
    });

    const slotDate = "2026-10-01";
    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", slotDate),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Enter set data
    act(() => {
      result.current.onGridChange({
        bench: [
          { reps: 5, weight: 225, completed: true },
          { reps: 5, weight: 225, completed: true },
        ],
      });
    });

    // Finish workout
    await act(async () => {
      await result.current.save(true);
    });

    const postCall = mockApiFetch.mock.calls.find(
      (c) => String(c[0]) === "/api/workouts" && (c[2] as { method?: string })?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    const saveBody = postCall![2].body;

    // Save body satisfies slot completion and duration contracts
    expect(saveBody.completed).toBe(true);
    expect(saveBody.scheduledDate).toBe("2026-10-01"); // Enables server exact slot match
    expect(saveBody.duration).toBeGreaterThanOrEqual(1); // Duration in minutes
    expect(saveBody.tz).toBe(new Date().getTimezoneOffset());
    expect(saveBody.exercises[0].sets).toEqual([
      { setNumber: 1, reps: 5, weight: 225, completed: true },
      { setNumber: 2, reps: 5, weight: 225, completed: true },
    ]);
  });

  it("(id: e015c861) Two quick taps on Finish produce one save", async () => {
    let saveCount = 0;
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const url = String(path);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Quick Tap Test",
            day: "Day 1",
            exercises: [{ exerciseSlug: "pushup", name: "Pushup", sets: 1 }],
          },
          phase: 1,
          day: "Day 1",
        });
      }
      if (url.startsWith("/api/workouts/last-performance")) {
        return Promise.resolve({ performances: {}, prs: {} });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({ isResume: false, workout: null });
      }
      if (url === "/api/workouts" && (init as { method?: string })?.method === "POST") {
        saveCount++;
        return new Promise((resolve) =>
          setTimeout(() => resolve({ message: "saved", completed: true }), 100),
        );
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Two quick taps on finish (concurrent invocation)
    let p1: Promise<any>;
    let p2: Promise<any>;
    act(() => {
      p1 = result.current.save(true);
      p2 = result.current.save(true);
    });

    await act(async () => {
      await Promise.all([p1, p2]);
    });

    // Re-entrant lock ensures exactly ONE POST was sent
    expect(saveCount).toBe(1);
  });

  it("sets start blank: last time's numbers are a reference and not written into inputs", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Reference Test",
            day: "Day 1",
            exercises: [{ exerciseSlug: "bench", name: "Bench Press", sets: 1 }],
          },
          phase: 1,
          day: "Day 1",
        });
      }
      if (url.startsWith("/api/workouts/last-performance")) {
        return Promise.resolve({
          performances: {
            bench: { weight: 200, reps: 5, date: "2026-09-20T00:00:00Z" },
          },
          prs: { "Bench Press": { weight: 225, reps: 3 } },
        });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({
          isResume: false,
          workout: null,
          exerciseHistory: {
            "Bench Press": { weight: 200, reps: 5, date: "2026-09-20T00:00:00Z" },
          },
        });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Prefill reference is populated for display
    const ex = result.current.workout?.exercises[0];
    expect(ex?.prefill?.[0]?.weight).toBe(200);
    expect(ex?.prefill?.[0]?.reps).toBe(5);

    // But initial grid sets start BLANK (not filled with 200 / 5)
    const set = result.current.grid["bench"]?.[0];
    expect(set?.weight == null || set?.weight === 0).toBe(true);
    expect(set?.reps == null || set?.reps === 0).toBe(true);
    expect(set?.completed).toBe(false);
  });

  it("(id: e5ced228) a loaded exercise with tip exposes it on exercises[0].tip", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Coaching Fields",
            day: "Day 1",
            exercises: [
              {
                exerciseSlug: "bench",
                name: "Bench Press",
                sets: 3,
                reps: "5",
                trackingType: "reps_weight",
                tip: "Keep shoulder blades pinched",
                tempo: "3-1-1",
                rpe: 8,
                duration: "30s",
                primaryMuscles: ["chest", "triceps"],
              },
            ],
          },
          phase: 1,
          day: "Day 1",
        });
      }
      if (url.startsWith("/api/workouts/last-performance")) {
        return Promise.resolve({ performances: {}, prs: {} });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({
          isResume: false,
          workout: null,
          exerciseHistory: {},
        });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const ex = result.current.workout?.exercises[0];
    expect(ex?.tip).toBe("Keep shoulder blades pinched");
    expect(ex?.tempo).toBe("3-1-1");
    expect(ex?.rpe).toBe(8);
    expect(ex?.durationLabel).toBe("30s");
    expect(ex?.primaryMuscles).toEqual(["chest", "triceps"]);
  });

  it("(id: e5ced229) a resumed workout keeps coaching fields through the saved-log merge", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Coaching Fields Resume",
            day: "Day 1",
            exercises: [
              {
                exerciseSlug: "bench",
                name: "Bench Press",
                sets: 2,
                reps: "5",
                trackingType: "reps_weight",
                tip: "Keep shoulder blades pinched",
                tempo: "3-1-1",
                rpe: 8,
                duration: "30s",
                primaryMuscles: ["chest", "triceps"],
              },
            ],
          },
          phase: 1,
          day: "Day 1",
        });
      }
      if (url.startsWith("/api/workouts/last-performance")) {
        return Promise.resolve({ performances: {}, prs: {} });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({
          isResume: true,
          workout: {
            programId: "prog-1",
            day: "Day 1",
            phase: 1,
            activeSeconds: 60,
            date: "2026-10-01T12:00:00.000Z",
            exercises: [
              {
                name: "Bench Press",
                exerciseSlug: "bench",
                sets: [
                  { setNumber: 1, reps: 5, weight: 185, completed: true },
                  { setNumber: 2, reps: 0, weight: 0, completed: false },
                ],
              },
            ],
          },
          exerciseHistory: {},
          exercisePRs: {},
        });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isResuming).toBe(true);
    const ex = result.current.workout?.exercises[0];
    expect(ex?.tip).toBe("Keep shoulder blades pinched");
    expect(ex?.tempo).toBe("3-1-1");
    expect(ex?.rpe).toBe(8);
    expect(ex?.durationLabel).toBe("30s");
    expect(ex?.primaryMuscles).toEqual(["chest", "triceps"]);
  });
});
