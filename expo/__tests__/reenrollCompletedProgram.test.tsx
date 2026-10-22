/* eslint-disable import/first */
// RE-ENROLLING IN A COMPLETED PROGRAM: setup, not last season's calendar —
// and a failed enrolment says so instead of swallowing the error.
//
// What this pins:
// 1. `schedule.tsx` showed VIEW mode ("View Full Calendar" / "Edit Training
//    Days") whenever ANY schedule doc existed for the program — including the
//    stale August doc after a re-enrolment. The screen now shows SETUP
//    (prefilled from the old settings) whenever the active entry has
//    `hasSchedule !== true`, and VIEW only when it is `true`.
// 2. `[id]/index.tsx` `onConfirmEnroll` caught every enrol failure with a
//    "Surface nothing for now" comment. The modal now keeps open and renders
//    the refusal instead.
//
// Both render the REAL routes over the REAL `app/` directory
// (`test-support/appRoutes.tsx`) with `apiFetch` mocked by path — the same
// arrangement as `training-entry-points.test.tsx`.

jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {
      mem.set(key, value);
    },
    async deleteItemAsync(key: string): Promise<void> {
      mem.delete(key);
    },
    __reset(): void {
      mem.clear();
    },
  };
});

const mockApiFetch = jest.fn();
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: mockApiFetch };
});

import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { router } from "expo-router";
import { act } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
// NOTE: no `import { ApiError }` here on purpose. A static reference to the
// mocked module's exports in THIS file breaks router bootstrap under
// renderRouter (the list stub never mounts — every test in the file times
// out), while omitting it passes deterministically. The refusal below is
// built from a lazy requireActual instead, which is the identical class.
import { appRouteMap, savedJwt } from "../test-support/appRoutes";
/* eslint-enable import/first */

const fake = SecureStore as unknown as { __reset: () => void };

const PROGRAM_ID = "p1";

const DETAIL = {
  program_id: PROGRAM_ID,
  name: "Test Split",
  description: "A fixture program.",
  duration_weeks: 4,
  training_days_per_week: 4,
  goal: "Build strength",
  target_user: "Intermediate",
  phases: [
    {
      phase: "Phase 1",
      weeks: "1-4",
      focus: "Accumulation",
      workouts: [{ day: "Day 1", title: "Lower A", exercises: [] }],
    },
  ],
};

/** Last season's schedule doc — stale slots the re-enrolment must not show. */
const STALE_SCHEDULE = {
  schedules: [
    {
      programId: PROGRAM_ID,
      programName: "Test Split",
      settings: {
        trainingDays: [1, 3],
        startDate: "2026-08-03T00:00:00.000Z",
      },
      scheduledWorkouts: [
        {
          date: "2026-08-03T00:00:00.000Z",
          programId: PROGRAM_ID,
          phase: 1,
          dayLabel: "Day 1",
          workoutTitle: "Lower A",
          status: "completed",
        },
      ],
    },
  ],
};

function activeEntry(hasSchedule: boolean) {
  return {
    activePrograms: [
      {
        programId: PROGRAM_ID,
        programName: "Test Split",
        startDate: "2026-10-20T00:00:00.000Z",
        currentPhase: 1,
        currentDay: "Day 1",
        completedWorkouts: 0,
        totalWorkouts: 20,
        progress: 0,
        status: "in-progress",
        hasSchedule,
      },
    ],
  };
}

async function renderScheduleRoute(hasSchedule: boolean) {
  fake.__reset();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/programs/active") return activeEntry(hasSchedule);
    if (path.startsWith("/api/schedule")) return STALE_SCHEDULE;
    if (path.startsWith("/api/programs/")) return DETAIL;
    return { user: { _id: "u1", email: "jon@example.com" } };
  });
  await SecureStore.setItemAsync("become.session", savedJwt());
  // Start on the tab root and PUSH to the detail: a dynamic segment as the
  // initial URL renders an empty stack under renderRouter (the same reason
  // navigation-shell starts at the list and pushes), so deep-linking here
  // would assert against a screen that never mounted.
  renderRouter(
    appRouteMap({ real: ["(app)/(tabs)/programming/[id]/schedule"] }) as never,
    { initialUrl: "/(tabs)/programming" },
  );
  await screen.findByTestId("screen:(app)/(tabs)/programming/index");
  act(() => {
    router.push("/(tabs)/programming/p1/schedule" as never);
  });
}

describe("schedule.tsx mode selection", () => {
  it(
    "stale schedule doc + hasSchedule false → SETUP wizard, prefilled from the old settings",
    async () => {
      await renderScheduleRoute(false);
      // The wizard, not the view of last season's slots.
      expect(await screen.findByTestId("schedule-setup-wizard")).toBeTruthy();
      expect(screen.queryByTestId("schedule-setup-view-mode")).toBeNull();
    },
    15000,
  );

  it(
    "stale schedule doc + hasSchedule true → VIEW mode",
    async () => {
      await renderScheduleRoute(true);
      expect(
        await screen.findByTestId("schedule-setup-view-mode"),
      ).toBeTruthy();
      expect(screen.queryByTestId("schedule-setup-wizard")).toBeNull();
    },
    15000,
  );
});

describe("enroll failure renders an error", () => {
  it(
    "a refused enrolment keeps the modal open and shows the server's wording",
    async () => {
      fake.__reset();
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation(async (path: string) => {
        if (path === "/api/programs/active") return { activePrograms: [] };
        if (path.startsWith("/api/schedule")) return { schedules: [] };
        if (path === "/api/programs/enroll") {
          // Lazy so the test file keeps no static binding on the mocked
          // module (see the note on the imports): the identical class the
          // route's classifyApiError reads in production.
          const { ApiError: EnrollApiError } = jest.requireActual(
            "@become/api-client",
          ) as {
            ApiError: new (status: number, body: unknown) => Error;
          };
          throw new EnrollApiError(500, { error: "Enrollment failed" });
        }
        if (path.startsWith("/api/programs/")) return DETAIL;
        return {
          user: {
            _id: "u1",
            email: "jon@example.com",
            onboardingCompleted: true,
          },
        };
      });
      await SecureStore.setItemAsync("become.session", savedJwt());
      renderRouter(
        appRouteMap({ real: ["(app)/(tabs)/programming/[id]/index"] }) as never,
        { initialUrl: "/(tabs)/programming" },
      );
      await screen.findByTestId("screen:(app)/(tabs)/programming/index");
      act(() => {
        router.push("/(tabs)/programming/p1" as never);
      });

      // Not enrolled → the Start button opens the enrol modal.
      fireEvent.press(await screen.findByTestId("program-detail-start"));
      fireEvent.press(await screen.findByTestId("enroll-modal-confirm"));

      // The refusal is rendered — the server's words, verbatim — and the
      // modal stays open instead of landing on an empty calendar.
      const error = await screen.findByTestId("enroll-modal-error");
      expect(error).toBeTruthy();
      expect(screen.getByText("Enrollment failed")).toBeTruthy();
      expect(screen.getByTestId("enroll-modal")).toBeTruthy();
    },
    15000,
  );
});
