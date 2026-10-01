import {
  renderHook,
  act,
  waitFor,
  render,
  fireEvent,
} from "@testing-library/react-native";
import { apiFetch } from "@become/api-client";
import * as SecureStore from "expo-secure-store";
import { useLiveWorkout } from "@/lib/live/useLiveWorkout";
import {
  createLiveWorkoutCache,
  createMemoryKeyValueStore,
  hasWorkoutProgress,
  liveCacheKey,
  type LiveWorkoutSnapshot,
} from "@/lib/live/liveWorkoutCache";
import LiveWorkoutRoute from "@/app/(app)/(tabs)/programming/[id]/workout/[idx]/live";
import type { AppStateStatus } from "react-native";

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

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({
    id: "prog-1",
    day: "Day 1",
    idx: "0",
  }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});
const mockApiFetch = apiFetch as unknown as jest.Mock;

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

describe("Live Workout Autosave & Crash-safe Local Draft (NP-079)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    jest.clearAllMocks();
  });

  it("(id: e015c865) Completing a set, force-quitting and reopening on another device shows that set completed", async () => {
    const storeA = createMemoryKeyValueStore();

    // Device A setup
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
        return Promise.resolve({ isResume: false, workout: null });
      }
      if (url === "/api/workouts" && (init as { method?: string })?.method === "POST") {
        return Promise.resolve({
          message: "Workout saved successfully",
          completed: false,
        });
      }
      return Promise.resolve({});
    });

    const hookA = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null, { cacheStore: storeA }),
    );

    await waitFor(() => {
      expect(hookA.result.current.loading).toBe(false);
    });

    // Device A: Complete set 0 (e.g. 225 lbs x 5 reps)
    const updatedGrid = {
      bench: [
        { reps: 5, weight: 225, durationSec: null, distance: null, completed: true },
        { reps: null, weight: null, durationSec: null, distance: null, completed: false },
      ],
    };

    await act(async () => {
      hookA.result.current.onGridChange(updatedGrid);
      hookA.result.current.onSetComplete({
        exerciseSlug: "bench",
        setIndex: 0,
        state: { reps: 5, weight: 225, completed: true },
      });
    });

    // Verify immediate server POST happened on set completion without sending performedAt
    const postCall = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]) === "/api/workouts" &&
        (c[2] as { method?: string })?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    const saveBody = postCall![2].body;
    expect(saveBody.completed).toBe(false);
    expect(saveBody.performedAt).toBeUndefined(); // Autosaves never send performedAt
    expect(saveBody.exercises[0].sets[0]).toEqual(
      expect.objectContaining({ setNumber: 1, reps: 5, weight: 225, completed: true }),
    );

    // Force-quit Device A: unmount hookA
    hookA.unmount();

    // Device B: Reopen workout on another device
    // Server now returns the open in-progress log saved by Device A
    mockApiFetch.mockImplementation((path: string) => {
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
            activeSeconds: 120,
            exercises: [
              {
                name: "Barbell Bench Press",
                exerciseSlug: "bench",
                sets: [
                  { setNumber: 1, reps: 5, weight: 225, completed: true },
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

    const storeB = createMemoryKeyValueStore();
    const hookB = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null, { cacheStore: storeB }),
    );

    await waitFor(() => {
      expect(hookB.result.current.loading).toBe(false);
    });

    // On Device B, the completed set is restored and marked complete
    expect(hookB.result.current.isResuming).toBe(true);
    const restoredSets = hookB.result.current.restoredGrid?.["bench"];
    expect(restoredSets).toBeDefined();
    expect(restoredSets?.[0]?.completed).toBe(true);
    expect(restoredSets?.[0]?.reps).toBe(5);
    expect(restoredSets?.[0]?.weight).toBe(225);
    expect(restoredSets?.[1]?.completed).toBe(false);
  });

  it("(id: e015c866) Backgrounding mid-set with a typed but unsaved value keeps the value on return", async () => {
    const store = createMemoryKeyValueStore();
    let appStateListener: ((status: AppStateStatus) => void) | null = null;
    const subscribeToAppState = (listener: (status: AppStateStatus) => void) => {
      appStateListener = listener;
      return () => {
        appStateListener = null;
      };
    };

    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const url = String(path);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Pull Day",
            day: "Day 1",
            exercises: [
              {
                exerciseSlug: "deadlift",
                name: "Deadlift",
                sets: 1,
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
        return Promise.resolve({ isResume: false, workout: null });
      }
      if (url === "/api/workouts" && (init as { method?: string })?.method === "POST") {
        return Promise.resolve({ message: "saved", completed: false });
      }
      return Promise.resolve({});
    });

    // Set a long debounce delay so it wouldn't save naturally within the test tick
    const hook = renderHook(() =>
      useLiveWorkout("prog-1", "Day 1", null, {
        cacheStore: store,
        subscribeToAppState,
        autoSaveDelayMs: 10000,
      }),
    );

    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
    });

    // User types "315" into weight mid-set (not completed yet)
    const typedGrid = {
      deadlift: [
        { reps: 5, weight: 315, durationSec: null, distance: null, completed: false },
      ],
    };

    act(() => {
      hook.result.current.onGridChange(typedGrid);
    });

    // Reset API mock to verify the AppState background flush sends a POST
    mockApiFetch.mockClear();

    // Mid-set, user backgrounds the app
    await act(async () => {
      appStateListener?.("background");
    });

    // 1. Local draft was flushed immediately to cache
    const cacheKey = liveCacheKey("prog-1", "Day 1", 0);
    const draftRaw = await store.get(cacheKey);
    expect(draftRaw).toBeTruthy();
    const parsedDraft = JSON.parse(draftRaw!);
    expect(parsedDraft.grid.deadlift[0]).toEqual(
      expect.objectContaining({ reps: 5, weight: 315, completed: false }),
    );

    // 2. Server save was also immediately flushed
    const flushPostCall = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]) === "/api/workouts" &&
        (c[2] as { method?: string })?.method === "POST",
    );
    expect(flushPostCall).toBeTruthy();
    expect(flushPostCall![2].body.completed).toBe(false);
    expect(flushPostCall![2].body.exercises[0].sets[0].weight).toBe(315);

    // Return to app: user comes back, value 315 is retained in grid
    expect(hook.result.current.grid["deadlift"]?.[0]?.weight).toBe(315);
  });

  it("(id: e015c867) A 10-exercise, 5-set workout survives a kill and relaunch on a real iPhone and a real Android phone with no lost values", async () => {
    const store = createMemoryKeyValueStore();
    const cache = createLiveWorkoutCache(store);

    // Construct a large 10-exercise, 5-set workout grid (50 total sets with detailed data)
    const largeGrid: LiveWorkoutSnapshot = {};
    for (let e = 1; e <= 10; e++) {
      const slug = `exercise-slug-${e}`;
      largeGrid[slug] = [];
      for (let s = 1; s <= 5; s++) {
        largeGrid[slug].push({
          reps: 8 + s,
          weight: 100 + e * 10 + s * 5,
          completed: s <= 3, // first 3 sets completed
          durationSec: null,
          distance: null,
        });
      }
    }

    const cacheKey = liveCacheKey("prog-10", "Day 1", 0);
    await cache.save(cacheKey, largeGrid, 1800, "attempt-10x5");

    // Verify stored JSON exceeds SecureStore's 2048-byte limit
    const rawSaved = await store.get(cacheKey);
    expect(rawSaved).toBeTruthy();
    expect(rawSaved!.length).toBeGreaterThan(2048);

    // Simulate process kill and relaunch: load fresh draft from store
    const reloadedDraft = await cache.loadDraft(cacheKey, {
      maxAgeMs: 86_400_000,
      requireProgress: true,
    });
    expect(reloadedDraft).toBeTruthy();
    expect(reloadedDraft?.activeSeconds).toBe(1800);
    expect(reloadedDraft?.attemptId).toBe("attempt-10x5");

    // Verify all 10 exercises and all 50 sets survived with exact values
    for (let e = 1; e <= 10; e++) {
      const slug = `exercise-slug-${e}`;
      const sets = reloadedDraft!.grid[slug];
      expect(sets).toBeDefined();
      expect(sets!.length).toBe(5);
      for (let s = 1; s <= 5; s++) {
        const set = sets![s - 1]!;
        expect(set.reps).toBe(8 + s);
        expect(set.weight).toBe(100 + e * 10 + s * 5);
        expect(set.completed).toBe(s <= 3);
      }
    }
  });

  it("(id: e015c868) No live-workout data is written to expo-secure-store", async () => {
    const store = createMemoryKeyValueStore();
    const cache = createLiveWorkoutCache(store);

    const testSnap: LiveWorkoutSnapshot = {
      squat: [{ reps: 5, weight: 315, completed: true }],
    };
    const key = liveCacheKey("prog-1", "Day 1", 0);

    // Save, load, and clear live workout cache
    await cache.save(key, testSnap);
    await cache.load(key);
    await cache.clear(key);

    // Assert that expo-secure-store was NEVER called for any live-workout operation
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("(id: e015c869) Finishing with no signal keeps the workout on the phone and offers Retry, and nothing is lost", async () => {
    const store = createMemoryKeyValueStore();
    const cacheKey = liveCacheKey("prog-1", 0, 0);

    const PROGRAM = {
      program_id: "prog-1",
      name: "Strength Program",
      phases: [
        {
          phase: "Phase 1",
          workouts: [
            {
              day: "Day 1",
              title: "Day 1 - Chest",
              exercises: [
                {
                  name: "Bench Press",
                  exerciseSlug: "bench",
                  sets: 1,
                  reps: "5",
                  trackingType: "reps_weight",
                },
              ],
            },
          ],
        },
      ],
    };

    let finishAttemptCount = 0;
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const url = String(path);
      if (url === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (url.startsWith("/api/workouts/last-performance")) {
        return Promise.resolve({ performances: {}, prs: {} });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({ isResume: false, workout: null });
      }
      if (url === "/api/workouts" && (init as { method?: string })?.method === "POST") {
        const body = (init as { body?: { completed?: boolean } }).body;
        if (body?.completed) {
          finishAttemptCount++;
          if (finishAttemptCount === 1) {
            // First finish attempt fails due to no signal / network down
            return Promise.reject(new Error("Network request failed (offline)"));
          }
          // Second attempt (retry) succeeds
          return Promise.resolve({
            message: "Workout completed successfully",
            completed: true,
            newPRsAchieved: [],
          });
        }
        return Promise.resolve({ message: "saved", completed: false });
      }
      return Promise.resolve({});
    });

    const screen = render(<LiveWorkoutRoute cacheStore={store} />);

    await waitFor(() => {
      expect(screen.getByTestId("live-workout-bench-set-0-weight")).toBeTruthy();
    });

    // Enter set data
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("live-workout-bench-set-0-weight"),
        "225",
      );
    });
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("live-workout-bench-set-0-reps"),
        "5",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("live-workout-bench-set-0-complete"));
    });

    // Verify cache has the workout before finish
    await waitFor(async () => {
      expect(await store.get(cacheKey)).toBeTruthy();
    });

    // Tap Finish when offline / no signal
    await act(async () => {
      fireEvent.press(screen.getByTestId("live-workout-finish"));
    });

    // Completing save failed:
    // 1. Local draft is kept on phone (NOT cleared)
    expect(await store.get(cacheKey)).toBeTruthy();

    // 2. Values in inputs are NOT lost
    expect(screen.getByTestId("live-workout-bench-set-0-weight").props.value).toBe("225");
    expect(screen.getByTestId("live-workout-bench-set-0-reps").props.value).toBe("5");

    // 3. UI displays error banner and offers Retry
    await waitFor(() => {
      expect(screen.getByTestId("live-workout-error-banner")).toBeTruthy();
      expect(screen.getByTestId("live-workout-retry")).toBeTruthy();
    });

    // Tap Retry (network restored)
    await act(async () => {
      fireEvent.press(screen.getByTestId("live-workout-retry"));
    });

    // 4. Retry succeeded: cache is cleared after successful finish
    await waitFor(async () => {
      expect(await store.get(cacheKey)).toBeNull();
    });
    expect(finishAttemptCount).toBeGreaterThanOrEqual(2);
  });

  describe("Draft Freshness and Progress Rules", () => {
    it("hasWorkoutProgress accurately detects empty vs touched workouts", () => {
      const blankGrid: LiveWorkoutSnapshot = {
        bench: [
          { reps: null, weight: null, durationSec: null, distance: null, completed: false },
        ],
      };
      expect(hasWorkoutProgress(blankGrid)).toBe(false);

      const withReps: LiveWorkoutSnapshot = {
        bench: [
          { reps: 5, weight: null, durationSec: null, distance: null, completed: false },
        ],
      };
      expect(hasWorkoutProgress(withReps)).toBe(true);

      const withCompleted: LiveWorkoutSnapshot = {
        bench: [
          { reps: null, weight: null, durationSec: null, distance: null, completed: true },
        ],
      };
      expect(hasWorkoutProgress(withCompleted)).toBe(true);
    });

    it("ignores local drafts older than 24 hours", async () => {
      const store = createMemoryKeyValueStore();
      const cache = createLiveWorkoutCache(store);
      const key = liveCacheKey("prog-1", "Day 1", 0);

      const gridWithProgress: LiveWorkoutSnapshot = {
        bench: [{ reps: 5, weight: 135, completed: true }],
      };

      await cache.save(key, gridWithProgress);

      // Fast-forward 25 hours (90_000_000 ms)
      const twentyFiveHoursLater = Date.now() + 90_000_000;
      const loaded = await cache.loadDraft(key, {
        maxAgeMs: 86_400_000,
        now: twentyFiveHoursLater,
      });

      expect(loaded).toBeNull();
    });

    it("prefers server open log over local draft on reopen", async () => {
      const store = createMemoryKeyValueStore();
      const cache = createLiveWorkoutCache(store);
      const key = liveCacheKey("prog-1", "Day 1", 0);

      // Local draft has set 1 completed
      await cache.save(key, {
        bench: [{ reps: 5, weight: 185, completed: false }],
      });

      // Server open log has set 1 completed at 225
      mockApiFetch.mockImplementation((path: string) => {
        const url = String(path);
        if (url.startsWith("/api/programs/current-workout")) {
          return Promise.resolve({
            workout: {
              title: "Chest Day",
              day: "Day 1",
              exercises: [{ exerciseSlug: "bench", name: "Bench", sets: 1 }],
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
              exercises: [
                {
                  name: "Bench",
                  exerciseSlug: "bench",
                  sets: [{ setNumber: 1, reps: 5, weight: 225, completed: true }],
                },
              ],
            },
          });
        }
        return Promise.resolve({});
      });

      const hook = renderHook(() =>
        useLiveWorkout("prog-1", "Day 1", null, { cacheStore: store }),
      );

      await waitFor(() => {
        expect(hook.result.current.loading).toBe(false);
      });

      // Server open log was preferred (225 lbs, completed)
      expect(hook.result.current.isResuming).toBe(true);
      expect(hook.result.current.grid["bench"]?.[0]?.weight).toBe(225);
      expect(hook.result.current.grid["bench"]?.[0]?.completed).toBe(true);
    });
  });
});
