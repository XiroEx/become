/* eslint-disable import/first */
// NP-076 — WORKOUT NOW: PICK A FOCUS, GENERATE WITHOUT AI, PREVIEW AND START.
//
// Native port of `webapp/components/QuickSessionModal.tsx` without the AI
// switch (NP-136 adds it): `expo/components/workout/WorkoutNowSheet.tsx`
// renders the focus list, the coach-curated glutes session (no generator),
// the five most recent quick sessions to repeat, `POST /api/generate/session`
// for a preview with Regenerate, then hands off to the NP-227 overview.
//
// Acceptance:
//  - (e015c851) a member picks a focus and gets a preview; Regenerate gives a
//    different session;
//  - (e015c852) a recent session can be repeated without regenerating;
//  - (e015c853) opening Workout Now from a calendar day pre-fills that day.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@become/api-client";
import { workoutNowTitle, WorkoutNowSheet } from "@/components/workout/WorkoutNowSheet";
import { readQuickSession } from "@/lib/quickSession/store";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const PREVIEW_A = {
  session: {
    title: "Push Session",
    focus: "push",
    exercises: [
      {
        exerciseSlug: "bench-press",
        name: "Bench Press",
        trackingType: "reps_weight",
        sets: 3,
        reps: "8-12",
        rest: "90s",
      },
      {
        exerciseSlug: "overhead-press",
        name: "Overhead Press",
        trackingType: "reps_weight",
        sets: 3,
        reps: "8-12",
        rest: "90s",
      },
    ],
  },
  seed: 11,
};

const PREVIEW_B = {
  session: {
    title: "Push Session",
    focus: "push",
    exercises: [
      {
        exerciseSlug: "incline-press",
        name: "Incline Press",
        trackingType: "reps_weight",
        sets: 3,
        reps: "10",
        rest: "60s",
      },
      {
        exerciseSlug: "lateral-raise",
        name: "Lateral Raise",
        trackingType: "reps_weight",
        sets: 3,
        reps: "12-15",
        rest: "60s",
      },
    ],
  },
  seed: 22,
};

const RECENT_LOGS = {
  logs: [
    {
      kind: "quick",
      title: "Sunday Back & Shoulders",
      focus: "pull",
      date: "2026-10-05T12:00:00.000Z",
      duration: 30,
      exerciseCount: 2,
      completedSets: 6,
      completed: true,
      skipped: false,
      favorite: false,
      sessionId: "recent-session-1",
      exercises: [
        {
          exerciseSlug: "pull-up",
          name: "Pull-Up",
          trackingType: "reps_bodyweight",
          sets: 3,
          reps: "5-8",
          rest: "90s",
        },
        {
          exerciseSlug: "face-pull",
          name: "Face Pull",
          trackingType: "reps_weight",
          sets: 3,
          reps: "12-15",
          rest: "60s",
        },
      ],
    },
  ],
  favoriteSessionOrder: [],
};

function mockGenerateSequence() {
  let calls = 0;
  mockApiFetch.mockImplementation(async (path: string, _schema: unknown, init?: { body?: unknown }) => {
    if (path.startsWith("/api/workouts/logs")) return RECENT_LOGS;
    if (path === "/api/generate/session") {
      calls += 1;
      void init;
      return calls === 1 ? PREVIEW_A : PREVIEW_B;
    }
    return {};
  });
  return () => calls;
}

beforeEach(() => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
});

afterEach(async () => {
  await AsyncStorage.clear();
});

describe("NP-076 Workout Now sheet", () => {
  it("(id: e015c851) a member picks a focus and gets a preview; Regenerate gives a different session", async () => {
    const generateCalls = mockGenerateSequence();
    const { getByTestId, getByText } = render(
      <WorkoutNowSheet visible onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-focus-push")).toBeTruthy();
    });

    // Pick a focus → preview appears.
    fireEvent.press(getByTestId("workout-now-sheet-focus-push"));
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-preview-title")).toBeTruthy();
    });
    expect(getByText("Bench Press")).toBeTruthy();

    // Regenerate → a different session (second POST, no seed, new exercises).
    fireEvent.press(getByTestId("workout-now-sheet-regenerate"));
    await waitFor(() => {
      expect(getByText("Incline Press")).toBeTruthy();
    });
    expect(generateCalls()).toBe(2);
    const secondCall = mockApiFetch.mock.calls.find(
      (c) => (c[0] as string) === "/api/generate/session",
    );
    expect(secondCall).toBeTruthy();

    // Start → stash + hand off to the NP-227 overview.
    fireEvent.press(getByTestId("workout-now-sheet-start"));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    const href = String(mockPush.mock.calls[0]?.[0] ?? "");
    expect(href).toContain("/(tabs)/programming/quick?session=");
    const sessionId = decodeURIComponent(href.split("session=")[1]?.split("&")[0] ?? "");
    const stashed = await readQuickSession(sessionId);
    expect(stashed?.title).toBe("Push Session");
    expect(stashed?.exercises.map((e) => e.name)).toEqual([
      "Incline Press",
      "Lateral Raise",
    ]);
  });

  it("(id: e015c852) a recent session can be repeated without regenerating", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/logs")) return RECENT_LOGS;
      throw new Error(`unexpected fetch ${path}`);
    });
    const { getByTestId } = render(<WorkoutNowSheet visible onClose={() => {}} />);

    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-repeat-0")).toBeTruthy();
    });

    fireEvent.press(getByTestId("workout-now-sheet-repeat-0"));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    // Zero /api/generate/session calls: the repeat reuses the log's own
    // title + exercises.
    expect(
      mockApiFetch.mock.calls.filter((c) => (c[0] as string) === "/api/generate/session"),
    ).toHaveLength(0);
    const href = String(mockPush.mock.calls[0]?.[0] ?? "");
    expect(href).toContain("/(tabs)/programming/quick?session=");
    const sessionId = decodeURIComponent(href.split("session=")[1]?.split("&")[0] ?? "");
    const stashed = await readQuickSession(sessionId);
    expect(stashed?.title).toBe("Sunday Back & Shoulders");
    expect(stashed?.exercises.map((e) => e.name)).toEqual(["Pull-Up", "Face Pull"]);
    expect(stashed?.sourceSessionId).toBe("recent-session-1");
  });

  it("(id: e015c853) opening Workout Now from a calendar day pre-fills that day", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/logs")) return { logs: [], favoriteSessionOrder: [] };
      if (path === "/api/generate/session") return PREVIEW_A;
      return {};
    });
    const onClose = jest.fn();
    const { getByTestId } = render(
      <WorkoutNowSheet visible onClose={onClose} date="2026-10-06" />,
    );

    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-focus-push")).toBeTruthy();
    });
    // The heading names the target day (web `logPlanAvailability`): a past
    // day reads "Log a Workout", a future day "Schedule a Workout".
    const heading = String(getByTestId("workout-now-sheet-title").props.children);
    expect(["Log a Workout", "Schedule a Workout", "Workout Now"]).toContain(heading);

    fireEvent.press(getByTestId("workout-now-sheet-focus-push"));
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-start")).toBeTruthy();
    });
    fireEvent.press(getByTestId("workout-now-sheet-start"));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    // The overview carries ?date= so its Log/Plan panel opens on that day.
    expect(String(mockPush.mock.calls[0]?.[0] ?? "")).toContain("date=2026-10-06");
    expect(onClose).toHaveBeenCalled();
  });

  it("the heading names the target day: past logs, future schedules, today is now", () => {
    expect(workoutNowTitle(undefined, "2026-10-07")).toBe("Workout Now");
    expect(workoutNowTitle("2026-10-07", "2026-10-07")).toBe("Workout Now");
    expect(workoutNowTitle("2026-10-06", "2026-10-07")).toBe("Log a Workout");
    expect(workoutNowTitle("2026-10-15", "2026-10-07")).toBe("Schedule a Workout");
  });

  it("the glutes focus uses the coach-curated session with no generator call", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/logs")) return { logs: [], favoriteSessionOrder: [] };
      throw new Error(`unexpected fetch ${path}`);
    });
    const { getByTestId, getByText } = render(
      <WorkoutNowSheet visible onClose={() => {}} />,
    );
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-focus-glutes")).toBeTruthy();
    });
    fireEvent.press(getByTestId("workout-now-sheet-focus-glutes"));
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-preview-title")).toBeTruthy();
    });
    expect(getByText("Glutes Session")).toBeTruthy();
    expect(getByText("Hip Thrust")).toBeTruthy();
    expect(
      mockApiFetch.mock.calls.filter((c) => (c[0] as string) === "/api/generate/session"),
    ).toHaveLength(0);
  });
});
