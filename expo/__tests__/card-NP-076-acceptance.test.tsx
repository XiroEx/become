/* eslint-disable import/first */
// NP-076 — WORKOUT NOW: PICK A FOCUS, GENERATE WITHOUT AI, PREVIEW AND START.
//
// Native port of `webapp/components/QuickSessionModal.tsx` WITHOUT the AI
// switch (NP-136 adds it): the `WorkoutNowSheet` at
// `expo/components/workout/WorkoutNowSheet.tsx` picks a focus, previews a
// deterministic `POST /api/generate/session` session with Regenerate, repeats
// a recent session without regenerating, and hands off to the NP-227
// overview. Opened from a calendar day it pre-fills that day.
//
// Fixed clock: Wednesday 2026-10-07 local noon. Past Tuesday is 2026-10-06,
// next Thursday is 2026-10-15.

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
import { WorkoutNowSheet } from "@/components/workout/WorkoutNowSheet";
import { readQuickSession } from "@/lib/quickSession/store";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const TODAY = "2026-10-07";
const PAST_TUESDAY = "2026-10-06";
const NEXT_THURSDAY = "2026-10-15";

const PREVIEW_SESSION = {
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
      reps: "8",
      rest: "90s",
    },
  ],
};

const REGENERATED_SESSION = {
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
};

const RECENT_LOG = {
  kind: "quick",
  title: "Sunday Back & Shoulders",
  focus: "push",
  date: new Date(2026, 9, 5, 12, 0, 0).toISOString(),
  duration: 30,
  completed: true,
  skipped: false,
  favorite: false,
  exerciseCount: 2,
  completedSets: 6,
  sessionId: "qs-old-session",
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
      reps: "8",
      rest: "90s",
    },
  ],
};

function generateCalls() {
  return mockApiFetch.mock.calls.filter((c) =>
    String(c[0]).startsWith("/api/generate/session"),
  );
}

function overviewPushes() {
  return mockPush.mock.calls
    .map((c) => String(c[0]))
    .filter((href) => href.includes("/(tabs)/programming/quick?"));
}

function sessionIdFrom(href: string): string {
  const m = /session=([^&]+)/.exec(href);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 7, 12, 0, 0));
  mockPush.mockReset();
  mockApiFetch.mockReset();
  await AsyncStorage.clear();
  // Default: no recent sessions; each generate POST answers the preview.
  mockApiFetch.mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/workouts/logs")) {
      return { logs: [], favoriteSessionOrder: [] };
    }
    if (String(path).startsWith("/api/generate/session")) {
      return { session: PREVIEW_SESSION, seed: 111 };
    }
    return {};
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("(id: e015c851) A member picks a focus and gets a preview; Regenerate gives a different session", () => {
  it("focus → preview → Regenerate → Start hands the session to the overview", async () => {
    const { getByTestId, getByText } = render(
      <WorkoutNowSheet visible onClose={() => {}} />,
    );

    fireEvent.press(getByTestId("workout-now-sheet-focus-push"));
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-preview-title")).toBeTruthy();
    });
    expect(getByText("Push Session")).toBeTruthy();
    expect(getByText("Bench Press")).toBeTruthy();
    expect(generateCalls()).toHaveLength(1);
    expect(generateCalls()[0]?.[2]).toEqual(
      expect.objectContaining({ method: "POST" }),
    );
    expect(generateCalls()[0]?.[2]?.body).toEqual(
      expect.objectContaining({ focus: "push" }),
    );

    // Regenerate is a fresh POST with no seed — the server mints a new one.
    mockApiFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith("/api/workouts/logs")) {
        return { logs: [], favoriteSessionOrder: [] };
      }
      if (String(path).startsWith("/api/generate/session")) {
        return { session: REGENERATED_SESSION, seed: 222 };
      }
      return {};
    });
    fireEvent.press(getByTestId("workout-now-sheet-regenerate"));
    await waitFor(() => {
      expect(getByText("Incline Press")).toBeTruthy();
    });
    expect(generateCalls()).toHaveLength(2);
    for (const call of generateCalls()) {
      expect(call[2]?.body).toEqual(expect.objectContaining({ focus: "push" }));
      expect(call[2]?.body).not.toEqual(
        expect.objectContaining({ seed: expect.anything() }),
      );
    }

    // Start stashes the preview and hands off to the NP-227 overview.
    fireEvent.press(getByTestId("workout-now-sheet-start"));
    await waitFor(() => {
      expect(overviewPushes()).toHaveLength(1);
    });
    const stashed = await readQuickSession(
      sessionIdFrom(overviewPushes()[0] ?? ""),
    );
    expect(stashed?.title).toBe("Push Session");
    expect(stashed?.exercises.map((e) => e.name)).toEqual([
      "Incline Press",
      "Lateral Raise",
    ]);
  });

  it("the glutes focus serves the coach-curated session without calling the generator", async () => {
    const { getByTestId, getByText } = render(
      <WorkoutNowSheet visible onClose={() => {}} />,
    );
    fireEvent.press(getByTestId("workout-now-sheet-focus-glutes"));
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-preview-title")).toBeTruthy();
    });
    expect(getByText("Glutes Session")).toBeTruthy();
    expect(getByText("Hip Thrust")).toBeTruthy();
    expect(generateCalls()).toHaveLength(0);
  });
});

describe("(id: e015c852) A recent session can be repeated without regenerating", () => {
  it("Repeat replays the same title and exercises, never the generator", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith("/api/workouts/logs")) {
        return { logs: [RECENT_LOG], favoriteSessionOrder: [] };
      }
      if (String(path).startsWith("/api/generate/session")) {
        return { session: PREVIEW_SESSION, seed: 111 };
      }
      return {};
    });
    const { getByTestId } = render(
      <WorkoutNowSheet visible onClose={() => {}} />,
    );
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-recent-0")).toBeTruthy();
    });

    fireEvent.press(getByTestId("workout-now-sheet-recent-0"));
    await waitFor(() => {
      expect(overviewPushes()).toHaveLength(1);
    });
    // The repeat never touched the generator.
    expect(generateCalls()).toHaveLength(0);
    const stashed = await readQuickSession(
      sessionIdFrom(overviewPushes()[0] ?? ""),
    );
    expect(stashed?.title).toBe("Sunday Back & Shoulders");
    expect(stashed?.exercises.map((e) => e.name)).toEqual([
      "Bench Press",
      "Overhead Press",
    ]);
    // A repeat keeps its source apart, so completing it cannot overwrite history.
    expect(stashed?.sourceSessionId).toBe("qs-old-session");
  });
});

describe("(id: e015c853) Opening Workout Now from a calendar day pre-fills that day", () => {
  it("a past day titles Log a Workout and pre-fills the overview date", async () => {
    const { getByTestId, getByText } = render(
      <WorkoutNowSheet visible onClose={() => {}} date={PAST_TUESDAY} />,
    );
    expect(getByText("Log a Workout")).toBeTruthy();
    expect(getByTestId("workout-now-sheet-prefilled-date").props.children).toEqual(
      expect.arrayContaining([expect.stringContaining(PAST_TUESDAY)]),
    );

    fireEvent.press(getByTestId("workout-now-sheet-focus-push"));
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-preview-title")).toBeTruthy();
    });
    fireEvent.press(getByTestId("workout-now-sheet-start"));
    await waitFor(() => {
      expect(overviewPushes()).toHaveLength(1);
    });
    expect(overviewPushes()[0]).toContain(`date=${PAST_TUESDAY}`);
  });

  it("a future day titles Schedule a Workout and pre-fills the overview date", async () => {
    const { getByText } = render(
      <WorkoutNowSheet visible onClose={() => {}} date={NEXT_THURSDAY} />,
    );
    expect(getByText("Schedule a Workout")).toBeTruthy();
  });

  it("today keeps the Workout Now title", async () => {
    const { getByText } = render(
      <WorkoutNowSheet visible onClose={() => {}} date={TODAY} />,
    );
    expect(getByText("Workout Now")).toBeTruthy();
  });
});
