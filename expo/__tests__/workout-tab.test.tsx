/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "prog-1", idx: "1", phase: "0" }),
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
const mockApiFetch = apiFetch as unknown as jest.Mock;

import { ResumeWorkoutPill } from "@/components/workout/ResumeWorkoutPill";
import { UpcomingWeekStrip } from "@/components/workout/UpcomingWeekStrip";
import { ContinueTrainingSection } from "@/components/workout/ContinueTrainingSection";
import ProgrammingIndexRoute from "@/app/(app)/(tabs)/programming/index";
import LiveWorkoutRoute from "@/app/(app)/(tabs)/programming/[id]/workout/[idx]/live";
import {
  createLiveWorkoutCache,
  createMemoryKeyValueStore,
  liveCacheKey,
} from "@/lib/live/liveWorkoutCache";
import type { ScheduleApiResponse, WorkoutHistoryResponse } from "@become/api-client";
/* eslint-enable import/first */

describe("Workout tab: acceptance criteria tests", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
  });

  // Acceptance Criterion 1
  describe("(id: e015c833) A member with an open workout sees a Resume pill that reopens it on the set they were on, and can discard it after confirming", () => {
    it("shows Resume pill for an in-progress workout and reopens on the set they were on via cache", async () => {
      // 1. Prepare memory store with an in-flight set snapshot
      const cacheStore = createMemoryKeyValueStore();
      const cache = createLiveWorkoutCache(cacheStore);
      const snapshotKey = liveCacheKey("prog-1", 1, 0); // prog-1, workoutIndex 1 (Day 2), phaseIndex 0 (Phase 1)
      await cache.save(snapshotKey, {
        "squat": [
          { reps: 10, weight: 100, completed: true },
          { reps: 8, weight: 105, completed: false },
        ],
      });

      // 2. Mock GET /api/workouts/in-progress and /api/programs/prog-1 response
      mockApiFetch.mockImplementation(async (path: string) => {
        if (path.startsWith("/api/workouts/in-progress")) {
          return {
            workout: {
              kind: "program",
              programId: "prog-1",
              day: "Day 2",
              phase: 1, // 1-based Phase 1
              sessionId: null,
              title: "Lower Body",
              exerciseCount: 3,
              startedAt: "2026-09-30T14:00:00.000Z",
            },
            planned: null,
          };
        }
        if (path.startsWith("/api/programs/prog-1")) {
          return {
            id: "prog-1",
            name: "Strength 5x5",
            phases: [
              {
                name: "Phase 1",
                workouts: [
                  { day: "Day 1", exercises: [] },
                  {
                    day: "Day 2",
                    exercises: [
                      {
                        exerciseSlug: "squat",
                        name: "Barbell Back Squat",
                        trackingType: "reps_weight",
                        targetSets: 3,
                      },
                    ],
                  },
                ],
              },
            ],
          };
        }
        return {};
      });

      // 3. Render ResumeWorkoutPill
      const { getByTestId, getByText } = render(
        <ResumeWorkoutPill cacheStore={cacheStore} />,
      );

      // Verify pill appears and displays active status and day label
      await waitFor(() => {
        expect(getByTestId("resume-workout-pill")).toBeTruthy();
      });
      expect(getByText(/Active · Day 2/i)).toBeTruthy();
      expect(getByText("Get back into the workout")).toBeTruthy();

      // 4. Tap the pill -> navigates to LiveWorkoutRoute with phase 0 and day Day 2
      fireEvent.press(getByTestId("resume-workout-pill"));
      expect(mockPush).toHaveBeenCalledWith(
        "/(tabs)/programming/prog-1/workout/1/live?phase=0&day=Day%202",
      );

      // 5. Mount LiveWorkoutRoute with the same cacheStore to verify it restores the set they were on
      const liveRender = render(<LiveWorkoutRoute cacheStore={cacheStore} />);
      await waitFor(() => {
        // Barbell Back Squat input with reps: 10, weight: 100 should be restored
        expect(liveRender.getByDisplayValue("10")).toBeTruthy();
        expect(liveRender.getByDisplayValue("100")).toBeTruthy();
      });
    });

    it("discards in-progress workout after confirming, deleting on server and clearing cache", async () => {
      // 1. Prepare memory store with an in-flight set snapshot
      const cacheStore = createMemoryKeyValueStore();
      const cache = createLiveWorkoutCache(cacheStore);
      const snapshotKey = liveCacheKey("prog-1", 1, 0);
      await cache.save(snapshotKey, {
        "squat": [{ reps: 10, weight: 100, completed: true }],
      });

      // 2. Mock GET & DELETE
      mockApiFetch.mockImplementation(async (path: string, _schema: unknown, opts?: { method?: string }) => {
        if (opts?.method === "DELETE") {
          return { ok: true };
        }
        if (path.startsWith("/api/workouts/in-progress")) {
          return {
            workout: {
              kind: "program",
              programId: "prog-1",
              day: "Day 2",
              phase: 1,
              sessionId: null,
              title: "Lower Body",
              exerciseCount: 3,
              startedAt: "2026-09-30T14:00:00.000Z",
            },
            planned: null,
          };
        }
        return {};
      });

      // 3. Render ResumeWorkoutPill
      const { getByTestId, queryByTestId, getByText } = render(
        <ResumeWorkoutPill cacheStore={cacheStore} />,
      );

      await waitFor(() => {
        expect(getByTestId("resume-workout-pill")).toBeTruthy();
      });

      // 4. Test Discard flow: discard trigger opens confirmation modal
      fireEvent.press(getByTestId("resume-discard-trigger"));
      await waitFor(() => {
        expect(getByText("Delete this workout?")).toBeTruthy();
      });

      // Cancel dismissal first
      fireEvent.press(getByTestId("resume-confirm-modal-cancel"));
      // Pill is still there
      expect(getByTestId("resume-workout-pill")).toBeTruthy();

      // Trigger again and confirm deletion
      fireEvent.press(getByTestId("resume-discard-trigger"));
      await waitFor(() => {
        expect(getByTestId("resume-confirm-modal-confirm")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId("resume-confirm-modal-confirm"));
      });

      // Assert DELETE API was called
      const deleteCalls = mockApiFetch.mock.calls.filter(
        (c) => c[2]?.method === "DELETE",
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
      expect(String(deleteCalls[0]![0])).toContain("/api/workouts?programId=prog-1&day=Day%202");

      // Assert the draft was cleared from cache
      const cachedAfterDelete = await cacheStore.get(snapshotKey);
      expect(cachedAfterDelete).toBeNull();

      // Assert pill disappears
      await waitFor(() => {
        expect(queryByTestId("resume-workout-pill")).toBeNull();
      });
    });
  });

  // Acceptance Criterion 2
  describe("(id: e015c834) The week strip shows the same statuses as the web's for the same member and week", () => {
    it("renders week strip with identical statuses to web (completed, missed, scheduled, skipped, quick, rest)", async () => {
      const baseDate = new Date("2026-09-30T12:00:00.000Z"); // Wednesday Sep 30 2026

      const scheduleData: ScheduleApiResponse = {
        schedules: [
          {
            programId: "prog-1",
            programName: "Strength 5x5",
            scheduledWorkouts: [
              // Monday: completed
              {
                date: "2026-09-28T00:00:00.000Z",
                dayLabel: "Day 1",
                workoutTitle: "Upper A",
                status: "completed",
                phase: 1,
              },
              // Tuesday: missed
              {
                date: "2026-09-29T00:00:00.000Z",
                dayLabel: "Day 2",
                workoutTitle: "Lower A",
                status: "missed",
                phase: 1,
              },
              // Wednesday: program says scheduled, but quick log is completed -> should show COMPLETED
              {
                date: "2026-09-30T00:00:00.000Z",
                dayLabel: "Day 3",
                workoutTitle: "Upper B",
                status: "scheduled",
                phase: 1,
              },
              // Thursday: skipped
              {
                date: "2026-10-01T00:00:00.000Z",
                dayLabel: "Day 4",
                workoutTitle: "Lower B",
                status: "skipped",
                phase: 1,
              },
            ],
          },
        ],
      };

      const logsData: WorkoutHistoryResponse = {
        logs: [
          // Completed quick session on Wednesday Sep 30
          {
            kind: "quick",
            title: "Lunch HIIT",
            date: "2026-09-30T13:00:00.000Z",
            completed: true,
            skipped: false,
            favorite: false,
            exerciseCount: 4,
            completedSets: 12,
          },
          // Pending (incomplete) quick session on Friday Oct 2
          {
            kind: "quick",
            title: "Evening Stretch",
            date: "2026-10-02T18:00:00.000Z",
            completed: false,
            skipped: false,
            favorite: false,
            exerciseCount: 2,
            completedSets: 0,
          },
        ],
        favoriteSessionOrder: [],
      };

      const { getByTestId, getByText } = render(
        <UpcomingWeekStrip
          baseDate={baseDate}
          initialSchedule={scheduleData}
          initialLogs={logsData}
        />,
      );

      // Verify label
      expect(getByText("This Week")).toBeTruthy();

      // Sunday 2026-09-27 -> rest
      expect(getByTestId("week-strip-status-rest-2026-09-27")).toBeTruthy();

      // Monday 2026-09-28 -> completed
      expect(getByTestId("week-strip-status-completed-2026-09-28")).toBeTruthy();

      // Tuesday 2026-09-29 -> missed
      expect(getByTestId("week-strip-status-missed-2026-09-29")).toBeTruthy();

      // Wednesday 2026-09-30 -> completed (completed quick session overrides scheduled slot!)
      expect(getByTestId("week-strip-status-completed-2026-09-30")).toBeTruthy();

      // Thursday 2026-10-01 -> skipped
      expect(getByTestId("week-strip-status-skipped-2026-10-01")).toBeTruthy();

      // Friday 2026-10-02 -> quick (pending quick session with no program slot)
      expect(getByTestId("week-strip-status-quick-2026-10-02")).toBeTruthy();

      // Saturday 2026-10-03 -> rest
      expect(getByTestId("week-strip-status-rest-2026-10-03")).toBeTruthy();

      // Pressing a day opens calendar for that date
      fireEvent.press(getByTestId("week-strip-day-2026-09-28"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/calendar?date=2026-09-28");

      // Pressing calendar link opens calendar
      fireEvent.press(getByTestId("week-strip-open-calendar"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/calendar");

      // Week navigation buttons
      fireEvent.press(getByTestId("week-strip-next"));
      expect(getByText("Next Week")).toBeTruthy();

      fireEvent.press(getByTestId("week-strip-today"));
      expect(getByText("This Week")).toBeTruthy();
    });
  });

  // Acceptance Criterion 3
  describe("(id: e015c835) Continue Training shows each active program with the web's progress % and paused state", () => {
    it("renders active programs with progress %, paused state badge, and tap opens Track for next day", async () => {
      const activePrograms = [
        {
          programId: "p1",
          programName: "Hypertrophy Program",
          status: "in-progress" as const,
          progress: 67,
          completedWorkouts: 8,
          totalWorkouts: 12,
          currentPhase: 2,
          currentDay: "Day 3",
        },
        {
          programId: "p2",
          programName: "Strength 5x5",
          status: "paused" as const,
          progress: 25,
          completedWorkouts: 3,
          totalWorkouts: 12,
          currentPhase: 1,
          currentDay: "Day 4",
        },
      ];

      const { getByTestId, getByText } = render(
        <ContinueTrainingSection initialPrograms={activePrograms} />,
      );

      // Program 1: Hypertrophy (in-progress, 67%)
      expect(getByText("Hypertrophy Program")).toBeTruthy();
      expect(getByTestId("continue-program-progress-p1")).toBeTruthy();
      expect(getByText("67%")).toBeTruthy();
      expect(getByText("8/12 sessions")).toBeTruthy();
      expect(getByText("Phase 2 • Day 3")).toBeTruthy();

      // Tap opens the TRACK VIEW for the next day (NP-087) — every set on one
      // screen with Live on the toggle. Day 3 -> workoutIndex 2, Phase 2 ->
      // phaseIndex 1.
      fireEvent.press(getByTestId("continue-program-card-p1"));
      expect(mockPush).toHaveBeenCalledWith(
        "/(tabs)/programming/p1/workout/2/live?phase=1&day=Day%203",
      );

      // Program 2: Strength 5x5 (paused, 25%)
      expect(getByText("Strength 5x5")).toBeTruthy();
      expect(getByTestId("continue-program-progress-p2")).toBeTruthy();
      expect(getByText("25%")).toBeTruthy();
      expect(getByTestId("continue-program-paused-p2")).toBeTruthy();
      expect(getByText("Paused")).toBeTruthy();

      // Tap paused program opens program detail
      fireEvent.press(getByTestId("continue-program-card-p2"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/p2");

      // Workout Now button is present
      expect(getByTestId("workout-now-button")).toBeTruthy();
    });
  });

  // Tab Root Integration & Header Links
  describe("Workout Tab Root (ProgrammingIndexRoute)", () => {
    it("renders header links to History, Browse, Workout Now, Calendar, Search, and Saved", async () => {
      mockApiFetch.mockImplementation(async (path: string) => {
        if (path.startsWith("/api/workouts/in-progress")) {
          return { workout: null, planned: null };
        }
        if (path.startsWith("/api/programs/active")) {
          return { activePrograms: [] };
        }
        if (path.startsWith("/api/schedule")) {
          return { schedules: [] };
        }
        if (path.startsWith("/api/workouts/logs")) {
          return { logs: [], favoriteSessionOrder: [] };
        }
        return {};
      });

      const { getByTestId, getByText } = render(<ProgrammingIndexRoute />);

      expect(getByText("Workout")).toBeTruthy();

      // Browse link -> pushes /(tabs)/programming/browse
      fireEvent.press(getByTestId("workout-open-browse"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/browse");

      // Calendar link -> pushes /(tabs)/calendar
      fireEvent.press(getByTestId("programming-open-calendar"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/calendar");

      // Search link -> pushes /(tabs)/programming/search
      fireEvent.press(getByTestId("programming-open-search"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/search");

      // Saved link -> pushes /(tabs)/programming/saved
      fireEvent.press(getByTestId("programming-open-saved"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/saved");

      // History link
      fireEvent.press(getByTestId("workout-open-history"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming");

      // Workout Now button opens the sheet in place (NP-076)
      fireEvent.press(getByTestId("workout-open-workout-now"));
      expect(getByTestId("workout-now-sheet-focus-push")).toBeTruthy();
    });
  });
});
