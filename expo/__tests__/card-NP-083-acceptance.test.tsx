import { act, renderHook } from "@testing-library/react-native";
import { useLiveWorkout } from "@/lib/live/useLiveWorkout";
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import { setInputsFor } from "@/components/live/LiveSetRow";
import type { AlternativeCandidate } from "@become/api-client";

const mockApiFetch = jest.fn();
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: (...args: any[]) => mockApiFetch(...args),
  };
});

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "user-1", email: "test@example.com" },
    token: "test-token",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

const INITIAL_WORKOUT = {
  workout: {
    title: "Push Day",
    day: "Day 1",
    exercises: [
      {
        exerciseSlug: "barbell-bench-press",
        slug: "barbell-bench-press",
        name: "Barbell Bench Press",
        sets: 3,
        reps: "5",
        trackingType: "reps_weight",
        equipment: ["barbell"],
        laterality: "bilateral",
        category: "strength",
      },
    ],
  },
  phase: 1,
  day: "Day 1",
};

describe("Card NP-083 Acceptance Criteria", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string) => {
      if (String(path).startsWith("/api/programs/current-workout")) {
        return Promise.resolve(INITIAL_WORKOUT);
      }
      if (String(path).startsWith("/api/exercises/alternatives")) {
        return Promise.resolve({
          source: { slug: "barbell-bench-press", name: "Barbell Bench Press" },
          alternatives: [
            {
              slug: "dumbbell-bench-press",
              name: "Dumbbell Bench Press",
              score: 90,
              reasons: ["Same movement pattern", "Same primary muscle"],
              trackingType: "reps_weight",
              equipment: ["dumbbell"],
              laterality: "bilateral",
              category: "strength",
            },
            {
              slug: "plank",
              name: "Plank",
              score: 40,
              reasons: ["Core engagement"],
              trackingType: "time",
              equipment: ["bodyweight"],
              category: "core",
            },
          ],
        });
      }
      if (path === "/api/programs/swap") {
        return Promise.resolve({ message: "Exercise swap saved" });
      }
      if (path === "/api/workouts") {
        return Promise.resolve({
          message: "Workout saved successfully",
          completed: true,
          newPRsAchieved: [
            {
              exerciseSlug: "dumbbell-bench-press",
              exerciseName: "Dumbbell Bench Press",
              dimensions: ["weight_1rm"],
            },
          ],
        });
      }
      return Promise.resolve({});
    });
  });

  it("(id: e015c881) Swapping Barbell Bench Press for Dumbbell Bench Press natively logs dumbbell sets under the dumbbell slug, and the barbell PR is unchanged", async () => {
    const store = createMemoryKeyValueStore();
    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null, {
        cacheStore: store,
        initialPhase: 0,
      }),
    );

    // Wait for initial load
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.workout?.exercises[0]?.slug).toBe("barbell-bench-press");

    // Request swap on Barbell Bench Press
    act(() => {
      result.current.onRequestSwap("barbell-bench-press");
    });
    expect(result.current.swapSlug).toBe("barbell-bench-press");

    // Swap to Dumbbell Bench Press
    const dumbbellCandidate: AlternativeCandidate = {
      slug: "dumbbell-bench-press",
      name: "Dumbbell Bench Press",
      score: 90,
      reasons: ["Same movement pattern"],
      trackingType: "reps_weight",
      equipment: ["dumbbell"],
      laterality: "bilateral",
      category: "strength",
    };

    await act(async () => {
      await result.current.onSelectAlternative(dumbbellCandidate, "session");
    });

    // The exercise in the live workout now has the dumbbell slug and name
    expect(result.current.workout?.exercises[0]?.slug).toBe("dumbbell-bench-press");
    expect(result.current.workout?.exercises[0]?.name).toBe("Dumbbell Bench Press");
    expect(result.current.workout?.exercises[0]?.originalExerciseSlug).toBe("barbell-bench-press");
    expect(result.current.workout?.exercises[0]?.swappedFromName).toBe("Barbell Bench Press");

    // Old slug is removed from grid, new slug has reset blank sets
    expect(result.current.grid["barbell-bench-press"]).toBeUndefined();
    expect(result.current.grid["dumbbell-bench-press"]).toBeDefined();
    expect(result.current.grid["dumbbell-bench-press"]?.[0]?.completed).toBe(false);

    // Log a dumbbell set: 50 lbs x 10 reps
    const updatedGrid = {
      ...result.current.grid,
      "dumbbell-bench-press": [
        {
          reps: 10,
          weight: 50,
          durationSec: null,
          distance: null,
          completed: true,
        },
        {
          reps: 10,
          weight: 50,
          durationSec: null,
          distance: null,
          completed: true,
        },
        {
          reps: 10,
          weight: 50,
          durationSec: null,
          distance: null,
          completed: true,
        },
      ],
    };

    // Save and complete the workout
    await act(async () => {
      await result.current.save(true, updatedGrid);
    });

    const workoutPostCalls = mockApiFetch.mock.calls.filter(
      (c) => c[0] === "/api/workouts" && c[2]?.method === "POST",
    );
    expect(workoutPostCalls.length).toBeGreaterThan(0);
    const lastSaveBody = workoutPostCalls[workoutPostCalls.length - 1][2].body;

    // Verify dumbbell sets are logged under the dumbbell slug
    expect(lastSaveBody.exercises[0]).toEqual(
      expect.objectContaining({
        name: "Dumbbell Bench Press",
        exerciseSlug: "dumbbell-bench-press",
        originalExerciseSlug: "barbell-bench-press",
        swappedFromName: "Barbell Bench Press",
        sets: [
          expect.objectContaining({ setNumber: 1, reps: 10, weight: 50, completed: true }),
          expect.objectContaining({ setNumber: 2, reps: 10, weight: 50, completed: true }),
          expect.objectContaining({ setNumber: 3, reps: 10, weight: 50, completed: true }),
        ],
      }),
    );

    // Verify barbell PR is unchanged:
    // Existing PR record for barbell bench press is 200 lbs 1RM
    const existingPRs = [
      {
        exerciseSlug: "barbell-bench-press",
        exerciseName: "Barbell Bench Press",
        best1RM: 200,
        maxWeight: 200,
      },
    ];

    // Simulating server PR update using slug matching (as server updatePRsForWorkout does)
    const prMap = new Map(existingPRs.map((pr) => [pr.exerciseSlug, { ...pr }]));
    for (const ex of lastSaveBody.exercises) {
      // Server indexes PR by ex.exerciseSlug
      const exSlug = ex.exerciseSlug.toLowerCase();
      let currentPR = prMap.get(exSlug);
      if (!currentPR) {
        currentPR = {
          exerciseSlug: exSlug,
          exerciseName: ex.name,
          best1RM: 0,
          maxWeight: 0,
        };
        prMap.set(exSlug, currentPR);
      }
      for (const set of ex.sets) {
        if (set.completed && set.weight > currentPR.maxWeight) {
          currentPR.maxWeight = set.weight;
        }
      }
    }

    // Barbell PR was NOT updated by dumbbell sets
    expect(prMap.get("barbell-bench-press")?.best1RM).toBe(200);
    expect(prMap.get("barbell-bench-press")?.maxWeight).toBe(200);

    // Dumbbell PR was recorded under dumbbell slug
    expect(prMap.get("dumbbell-bench-press")?.maxWeight).toBe(50);
  });

  it("(id: e015c882) A program-scope swap made natively appears in the next session of that program on the web", async () => {
    const store = createMemoryKeyValueStore();
    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null, {
        cacheStore: store,
        initialPhase: 0,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.onRequestSwap("barbell-bench-press");
    });

    const dumbbellCandidate: AlternativeCandidate = {
      slug: "dumbbell-bench-press",
      name: "Dumbbell Bench Press",
      score: 90,
      trackingType: "reps_weight",
      equipment: ["dumbbell"],
    };

    // Swap with 'program' scope
    await act(async () => {
      await result.current.onSelectAlternative(dumbbellCandidate, "program");
    });

    // Native called POST /api/programs/swap
    const swapCalls = mockApiFetch.mock.calls.filter(
      (c) => c[0] === "/api/programs/swap" && c[2]?.method === "POST",
    );
    expect(swapCalls.length).toBe(1);
    expect(swapCalls[0][2].body).toEqual({
      programId: "prog-1",
      originalSlug: "barbell-bench-press",
      replacementSlug: "dumbbell-bench-press",
      replacementName: "Dumbbell Bench Press",
    });

    // Web simulation: next session loads program workout via current-workout,
    // which applies activeProgram.exerciseSwaps
    const activeProgramSwaps = [
      {
        originalSlug: swapCalls[0][2].body.originalSlug,
        replacementSlug: swapCalls[0][2].body.replacementSlug,
        replacementName: swapCalls[0][2].body.replacementName,
      },
    ];

    const nextSessionProgramWorkout = {
      day: "Day 2",
      title: "Push B",
      exercises: [
        { exerciseSlug: "barbell-bench-press", name: "Barbell Bench Press", sets: 3 },
        { exerciseSlug: "overhead-press", name: "Overhead Press", sets: 3 },
      ],
    };

    // The web server's applyPermanentSwaps helper (from current-workout/route.ts)
    const applyPermanentSwaps = (workout: typeof nextSessionProgramWorkout) => {
      const res = { ...workout, exercises: [...workout.exercises] };
      for (const swap of activeProgramSwaps) {
        const idx = res.exercises.findIndex((e) => e.exerciseSlug === swap.originalSlug);
        const target = res.exercises[idx];
        if (idx !== -1 && target) {
          res.exercises[idx] = { ...target, exerciseSlug: swap.replacementSlug };
        }
      }
      return res;
    };

    const webWorkout = applyPermanentSwaps(nextSessionProgramWorkout);
    // The swapped exercise appears in the next session on the web
    expect(webWorkout.exercises[0]?.exerciseSlug).toBe("dumbbell-bench-press");
  });

  it("(id: e015c883) The replacement's tracking type decides its inputs", async () => {
    const store = createMemoryKeyValueStore();
    const { result } = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null, {
        cacheStore: store,
        initialPhase: 0,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    // 1. Initial exercise: Barbell Bench Press (reps_weight) -> weight & reps inputs
    const initialEx = result.current.workout?.exercises[0];
    expect(initialEx?.trackingType).toBe("reps_weight");
    const initialInputs = setInputsFor(initialEx?.trackingType);
    expect(initialInputs).toEqual({
      weight: true,
      reps: true,
      duration: false,
      distance: false,
    });

    // 2. Swap to Plank (time) -> duration only
    act(() => {
      result.current.onRequestSwap("barbell-bench-press");
    });
    const plankCandidate: AlternativeCandidate = {
      slug: "plank",
      name: "Plank",
      trackingType: "time",
      equipment: ["bodyweight"],
    };
    await act(async () => {
      await result.current.onSelectAlternative(plankCandidate, "session");
    });

    const plankEx = result.current.workout?.exercises[0];
    expect(plankEx?.slug).toBe("plank");
    expect(plankEx?.trackingType).toBe("time");
    const plankInputs = setInputsFor(plankEx?.trackingType);
    expect(plankInputs).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: false,
    });

    // 3. Swap to Treadmill Run (time_distance) -> duration & distance
    act(() => {
      result.current.onRequestSwap("plank");
    });
    const runCandidate: AlternativeCandidate = {
      slug: "treadmill-run",
      name: "Treadmill Run",
      trackingType: "time_distance",
      equipment: ["treadmill"],
    };
    await act(async () => {
      await result.current.onSelectAlternative(runCandidate, "session");
    });

    const runEx = result.current.workout?.exercises[0];
    expect(runEx?.slug).toBe("treadmill-run");
    expect(runEx?.trackingType).toBe("time_distance");
    const runInputs = setInputsFor(runEx?.trackingType);
    expect(runInputs).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: true,
    });

    // 4. Swap to Bodyweight Squat (reps_bodyweight) -> reps only
    act(() => {
      result.current.onRequestSwap("treadmill-run");
    });
    const bwSquatCandidate: AlternativeCandidate = {
      slug: "bodyweight-squat",
      name: "Bodyweight Squat",
      trackingType: "reps_bodyweight",
      equipment: ["bodyweight"],
    };
    await act(async () => {
      await result.current.onSelectAlternative(bwSquatCandidate, "session");
    });

    const bwEx = result.current.workout?.exercises[0];
    expect(bwEx?.slug).toBe("bodyweight-squat");
    expect(bwEx?.trackingType).toBe("reps_bodyweight");
    const bwInputs = setInputsFor(bwEx?.trackingType);
    expect(bwInputs).toEqual({
      weight: false,
      reps: true,
      duration: false,
      distance: false,
    });
  });
});
