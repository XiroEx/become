/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
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
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import LiveWorkoutRoute from "../app/(app)/(tabs)/programming/[id]/workout/[idx]/live";
import {
  DayChoiceModal,
  labelFor,
} from "@/components/workout/DayChoiceModal";
import { IncompleteWorkoutModal } from "@/components/workout/IncompleteWorkoutModal";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const PROGRAM = {
  program_id: "prog-1",
  name: "Strength",
  phases: [
    {
      phase: "Phase 1",
      weeks: "1-4",
      focus: "Hypertrophy",
      workouts: [
        {
          day: "Day 1",
          title: "Leg Day",
          exercises: [
            { exerciseSlug: "squat", name: "Squat", sets: 3, reps: "8" },
          ],
        },
        {
          day: "Day 2",
          title: "Upper Day",
          exercises: [
            { exerciseSlug: "bench", name: "Bench", sets: 3, reps: "8" },
          ],
        },
      ],
    },
  ],
};

describe("Incomplete and Midnight Workout Modals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "prog-1", idx: "0", day: "Day 1" };
  });

  describe("DayChoiceModal Component", () => {
    it("renders formatted labels and handles choice selection", () => {
      const onChoose = jest.fn();
      const onClose = jest.fn();

      const { getByTestId, getByText } = render(
        <DayChoiceModal
          visible={true}
          originalKey="2026-09-30"
          todayKey="2026-10-01"
          onChoose={onChoose}
          onClose={onClose}
        />,
      );

      expect(getByText("You went past midnight")).toBeTruthy();
      expect(getByTestId("day-choice-modal-title")).toBeTruthy();
      expect(
        getByText(`You started this on ${labelFor("2026-09-30")}. Pick which day it should count toward.`),
      ).toBeTruthy();

      fireEvent.press(getByTestId("day-choice-modal-option-original"));
      expect(onChoose).toHaveBeenCalledWith("2026-09-30");

      fireEvent.press(getByTestId("day-choice-modal-option-today"));
      expect(onChoose).toHaveBeenCalledWith("2026-10-01");
    });
  });

  describe("IncompleteWorkoutModal Component", () => {
    it("renders stale workout info and dispatches all 4 actions", () => {
      const onResolve = jest.fn();
      const onDismiss = jest.fn();

      const stale = {
        day: "Day 1",
        phase: 1,
        date: "2026-09-30T10:00:00.000Z",
        exercises: [],
        completedExerciseCount: 2,
        totalExerciseCount: 4,
      };

      const { getByTestId, getByText } = render(
        <IncompleteWorkoutModal
          visible={true}
          stale={stale}
          onResolve={onResolve}
          onDismiss={onDismiss}
        />,
      );

      expect(getByText("Day 1 · 2 of 4 exercises logged")).toBeTruthy();

      fireEvent.press(getByTestId("incomplete-workout-modal-continue"));
      expect(onResolve).toHaveBeenCalledWith("continue");

      fireEvent.press(getByTestId("incomplete-workout-modal-restart"));
      expect(onResolve).toHaveBeenCalledWith("restart");

      fireEvent.press(getByTestId("incomplete-workout-modal-count"));
      expect(onResolve).toHaveBeenCalledWith("count");

      fireEvent.press(getByTestId("incomplete-workout-modal-skip"));
      expect(onResolve).toHaveBeenCalledWith("skip");
    });
  });

  describe("Acceptance Criteria", () => {
    // (id: e015c88d) An open workout from yesterday natively offers continue, restart, count and skip, and each leaves the same server state as on the web
    it("(id: e015c88d) offers continue, restart, count and skip when an open workout from yesterday exists", async () => {
      const staleWorkout = {
        day: "Day 1",
        phase: 1,
        date: "2026-09-30T15:30:00.000Z",
        exercises: [],
        completedExerciseCount: 1,
        totalExerciseCount: 3,
      };

      mockApiFetch.mockImplementation((path: string, _schema, init) => {
        if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
        if (path.startsWith("/api/workouts?")) {
          return Promise.resolve({
            workout: null,
            isResume: false,
            staleIncomplete: staleWorkout,
          });
        }
        if (path === "/api/workouts/resolve-incomplete") {
          const body = (init as { body?: any }).body;
          if (body.action === "continue") {
            return Promise.resolve({ action: "continue", nextDay: null, nextPhase: null });
          }
          if (body.action === "restart") {
            return Promise.resolve({ action: "restart", nextDay: null, nextPhase: null });
          }
          if (body.action === "count") {
            return Promise.resolve({ action: "count", nextDay: "Day 2", nextPhase: 1 });
          }
          if (body.action === "skip") {
            return Promise.resolve({ action: "skip", nextDay: "Day 2", nextPhase: 1 });
          }
        }
        return Promise.resolve({});
      });

      const store = createMemoryKeyValueStore();
      const { getByTestId } = render(
        <LiveWorkoutRoute cacheStore={store} />,
      );

      // Verify modal appears
      await waitFor(() => {
        expect(getByTestId("incomplete-workout-modal-continue")).toBeTruthy();
        expect(getByTestId("incomplete-workout-modal-restart")).toBeTruthy();
        expect(getByTestId("incomplete-workout-modal-count")).toBeTruthy();
        expect(getByTestId("incomplete-workout-modal-skip")).toBeTruthy();
      });

      // Test "count" action sends POST /api/workouts/resolve-incomplete
      await act(async () => {
        fireEvent.press(getByTestId("incomplete-workout-modal-count"));
      });

      await waitFor(() => {
        const resolveCall = mockApiFetch.mock.calls.find(
          (c) => c[0] === "/api/workouts/resolve-incomplete",
        );
        expect(resolveCall).toBeTruthy();
        expect(resolveCall[2].method).toBe("POST");
        expect(resolveCall[2].baseUrl).toBe(WEBAPP_BASE_URL);
        expect(resolveCall[2].body).toEqual(
          expect.objectContaining({
            programId: "prog-1",
            day: "Day 1",
            phase: 1,
            action: "count",
          }),
        );
        // Navigates to next day's workout overview
        expect(mockReplace).toHaveBeenCalledWith(
          "/(tabs)/programming/prog-1/workout/1?phase=0&day=Day%202",
        );
      });
    });

    it("(id: e015c88d) resolves with continue and navigates/reloads stale workout", async () => {
      const staleWorkout = {
        day: "Day 1",
        phase: 1,
        date: "2026-09-30T15:30:00.000Z",
        exercises: [],
        completedExerciseCount: 1,
        totalExerciseCount: 3,
      };

      mockParams = { id: "prog-1", idx: "1", day: "Day 2" };

      mockApiFetch.mockImplementation((path: string) => {
        if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
        if (path.startsWith("/api/workouts?")) {
          return Promise.resolve({
            workout: null,
            isResume: false,
            staleIncomplete: staleWorkout,
          });
        }
        if (path === "/api/workouts/resolve-incomplete") {
          return Promise.resolve({ action: "continue", nextDay: null, nextPhase: null });
        }
        return Promise.resolve({});
      });

      const store = createMemoryKeyValueStore();
      const { getByTestId } = render(
        <LiveWorkoutRoute cacheStore={store} />,
      );

      await waitFor(() => {
        expect(getByTestId("incomplete-workout-modal-continue")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("incomplete-workout-modal-continue"));
      });

      await waitFor(() => {
        const resolveCall = mockApiFetch.mock.calls.find(
          (c) => c[0] === "/api/workouts/resolve-incomplete",
        );
        expect(resolveCall).toBeTruthy();
        expect(resolveCall[2].body.action).toBe("continue");
        // Navigates to stale day's workout (Day 1)
        expect(mockReplace).toHaveBeenCalledWith(
          "/(tabs)/programming/prog-1/workout/0/live?phase=0&day=Day%201",
        );
      });
    });

    it("(id: e015c88d) resolves with restart to clear stale log and reload fresh", async () => {
      let isStale = true;
      const staleWorkout = {
        day: "Day 1",
        phase: 1,
        date: "2026-09-30T15:30:00.000Z",
        exercises: [],
        completedExerciseCount: 1,
        totalExerciseCount: 3,
      };

      mockApiFetch.mockImplementation((path: string) => {
        if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
        if (path.startsWith("/api/workouts?")) {
          return Promise.resolve({
            workout: null,
            isResume: false,
            staleIncomplete: isStale ? staleWorkout : null,
          });
        }
        if (path === "/api/workouts/resolve-incomplete") {
          isStale = false;
          return Promise.resolve({ action: "restart", nextDay: null, nextPhase: null });
        }
        return Promise.resolve({});
      });

      const store = createMemoryKeyValueStore();
      const { getByTestId, queryByTestId } = render(
        <LiveWorkoutRoute cacheStore={store} />,
      );

      await waitFor(() => {
        expect(getByTestId("incomplete-workout-modal-restart")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("incomplete-workout-modal-restart"));
      });

      await waitFor(() => {
        const resolveCall = mockApiFetch.mock.calls.find(
          (c) => c[0] === "/api/workouts/resolve-incomplete",
        );
        expect(resolveCall).toBeTruthy();
        expect(resolveCall[2].body.action).toBe("restart");
        expect(queryByTestId("incomplete-workout-modal-restart")).toBeNull();
      });
    });

    it("(id: e015c88d) resolves with skip and advances to next workout overview", async () => {
      const staleWorkout = {
        day: "Day 1",
        phase: 1,
        date: "2026-09-30T15:30:00.000Z",
        exercises: [],
        completedExerciseCount: 1,
        totalExerciseCount: 3,
      };

      mockApiFetch.mockImplementation((path: string) => {
        if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
        if (path.startsWith("/api/workouts?")) {
          return Promise.resolve({
            workout: null,
            isResume: false,
            staleIncomplete: staleWorkout,
          });
        }
        if (path === "/api/workouts/resolve-incomplete") {
          return Promise.resolve({ action: "skip", nextDay: "Day 2", nextPhase: 1 });
        }
        return Promise.resolve({});
      });

      const store = createMemoryKeyValueStore();
      const { getByTestId } = render(
        <LiveWorkoutRoute cacheStore={store} />,
      );

      await waitFor(() => {
        expect(getByTestId("incomplete-workout-modal-skip")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("incomplete-workout-modal-skip"));
      });

      await waitFor(() => {
        const resolveCall = mockApiFetch.mock.calls.find(
          (c) => c[0] === "/api/workouts/resolve-incomplete",
        );
        expect(resolveCall).toBeTruthy();
        expect(resolveCall[2].body.action).toBe("skip");
        expect(mockReplace).toHaveBeenCalledWith(
          "/(tabs)/programming/prog-1/workout/1?phase=0&day=Day%202",
        );
      });
    });

    // (id: e015c88e) Finishing at 00:20 a workout started at 23:40 asks which day it counts toward, and the web shows it on the chosen day
    it("(id: e015c88e) finishing at 00:20 a workout started at 23:40 asks which day it counts toward, and sends performedAt on the chosen day", async () => {
      mockApiFetch.mockImplementation((path: string, _schema, init) => {
        if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
        if (path.startsWith("/api/workouts?")) {
          // Open workout started at 23:40 yesterday (rolling 24h window keeps it open)
          return Promise.resolve({
            workout: {
              programId: "prog-1",
              phase: 1,
              day: "Day 1",
              date: "2026-09-30T23:40:00.000Z",
              completed: false,
              // Every set of the day already logged: Complete Workout only
              // exists once the whole workout is done (NP-087), so a resume
              // that is one set in would not have the button to press.
              // Different numbers per set on purpose — identical numbers on
              // INCOMPLETE sets are the old prefill bug's fingerprint and the
              // restore blanks them.
              exercises: [
                {
                  name: "Squat",
                  sets: [
                    { setNumber: 1, reps: 8, weight: 200, completed: true },
                    { setNumber: 2, reps: 8, weight: 205, completed: true },
                    { setNumber: 3, reps: 8, weight: 210, completed: true },
                  ],
                },
              ],
            },
            isResume: true,
          });
        }
        if (path === "/api/workouts" && (init as { method?: string })?.method === "POST") {
          return Promise.resolve({
            message: "Workout saved successfully",
            completed: true,
          });
        }
        return Promise.resolve({});
      });

      const store = createMemoryKeyValueStore();
      // Finishing at 00:20 on Oct 1, while workout started at 23:40 on Sep 30
      const finishClock = () => new Date("2026-10-01T00:20:00.000Z");

      const { getByTestId, queryByTestId } = render(
        <LiveWorkoutRoute
          cacheStore={store}
          initialOriginKey="2026-09-30"
          getNow={finishClock}
        />,
      );

      await waitFor(() => {
        expect(getByTestId("live-workout-finish")).toBeTruthy();
      });

      // Press Finish workout
      await act(async () => {
        fireEvent.press(getByTestId("live-workout-finish"));
      });

      // DayChoiceModal must appear because midnight was crossed
      await waitFor(() => {
        expect(getByTestId("day-choice-modal-title")).toBeTruthy();
        expect(getByTestId("day-choice-modal-option-original")).toBeTruthy();
        expect(getByTestId("day-choice-modal-option-today")).toBeTruthy();
      });

      // No POST /api/workouts completed:true sent yet before choosing
      const postCallsBefore = mockApiFetch.mock.calls.filter(
        (c) => c[0] === "/api/workouts" && c[2]?.method === "POST" && c[2]?.body?.completed,
      );
      expect(postCallsBefore.length).toBe(0);

      // Choose "Today" (2026-10-01)
      await act(async () => {
        fireEvent.press(getByTestId("day-choice-modal-option-today"));
      });

      // DayChoiceModal dismissed
      expect(queryByTestId("day-choice-modal-title")).toBeNull();

      // Completing save sent with performedAt: "2026-10-01"
      await waitFor(() => {
        const completingPost = mockApiFetch.mock.calls.find(
          (c) => c[0] === "/api/workouts" && c[2]?.method === "POST" && c[2]?.body?.completed === true,
        );
        expect(completingPost).toBeTruthy();
        expect(completingPost[2].body.performedAt).toBe("2026-10-01");
        expect(completingPost[2].body.completed).toBe(true);
      });
    });

    // (id: e015c88f) If the completing save fails, the retry still sends the chosen day
    it("(id: e015c88f) if the completing save fails, the retry still sends the chosen day", async () => {
      let saveAttempt = 0;

      mockApiFetch.mockImplementation((path: string, _schema, init) => {
        if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
        if (path.startsWith("/api/workouts?")) {
          return Promise.resolve({
            workout: null,
            isResume: false,
          });
        }
        if (path === "/api/workouts" && (init as { method?: string })?.method === "POST") {
          // Only the COMPLETING save is the one under test. Ticking the three
          // sets so Complete Workout appears at all (NP-087) fires an autosave
          // each, and those must not consume the scripted failure.
          const completing = Boolean(
            (init as { body?: { completed?: boolean } } | undefined)?.body
              ?.completed,
          );
          if (!completing) {
            return Promise.resolve({ message: "autosaved", completed: false });
          }
          saveAttempt++;
          if (saveAttempt === 1) {
            // First completing save fails
            return Promise.reject(new Error("Network error"));
          }
          // Retry succeeds
          return Promise.resolve({
            message: "Workout saved successfully",
            completed: true,
          });
        }
        return Promise.resolve({});
      });

      const store = createMemoryKeyValueStore();
      const finishClock = () => new Date("2026-10-01T00:20:00.000Z");

      const { getByTestId, queryByTestId } = render(
        <LiveWorkoutRoute
          cacheStore={store}
          initialOriginKey="2026-09-30"
          getNow={finishClock}
        />,
      );

      // Complete Workout only exists at 100% (NP-087), so tick all three sets
      // of the day's one exercise by hand first.
      await waitFor(() => {
        expect(getByTestId("live-workout-squat-set-0-complete")).toBeTruthy();
      });
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          fireEvent.press(getByTestId(`live-workout-squat-set-${i}-complete`));
        });
      }

      await waitFor(() => {
        expect(getByTestId("live-workout-finish")).toBeTruthy();
      });

      // Press Complete Workout
      await act(async () => {
        fireEvent.press(getByTestId("live-workout-finish"));
      });

      // DayChoiceModal appears
      await waitFor(() => {
        expect(getByTestId("day-choice-modal-title")).toBeTruthy();
      });

      // Choose "When you started" (2026-09-30)
      await act(async () => {
        fireEvent.press(getByTestId("day-choice-modal-option-original"));
      });

      // The save was attempted and failed
      await waitFor(() => {
        expect(saveAttempt).toBe(1);
        expect(getByTestId("live-workout-error-banner")).toBeTruthy();
        expect(getByTestId("live-workout-retry")).toBeTruthy();
      });

      // Check first attempt sent performedAt: "2026-09-30"
      const firstSaveCall = mockApiFetch.mock.calls.find(
        (c) => c[0] === "/api/workouts" && c[2]?.method === "POST" && c[2]?.body?.completed === true,
      );
      expect(firstSaveCall).toBeTruthy();
      expect(firstSaveCall[2].body.performedAt).toBe("2026-09-30");

      // Clear mock calls to specifically inspect retry
      mockApiFetch.mockClear();

      // Press Retry
      await act(async () => {
        fireEvent.press(getByTestId("live-workout-retry"));
      });

      // DayChoiceModal is NOT shown again
      expect(queryByTestId("day-choice-modal-title")).toBeNull();

      // Retry save MUST still send performedAt: "2026-09-30"
      await waitFor(() => {
        const retrySaveCall = mockApiFetch.mock.calls.find(
          (c) => c[0] === "/api/workouts" && c[2]?.method === "POST" && c[2]?.body?.completed === true,
        );
        expect(retrySaveCall).toBeTruthy();
        expect(retrySaveCall[2].body.performedAt).toBe("2026-09-30");
        expect(retrySaveCall[2].body.completed).toBe(true);
      });

      // Retry succeeded, error banner cleared
      await waitFor(() => {
        expect(queryByTestId("live-workout-error-banner")).toBeNull();
      });
    });
  });
});
