// NP-294 — WORKOUT NOW SHEET: VISUAL PARITY PASS (native-parity, store-readiness).
//
// Full visual pass (native vs web, build d68b84e3) found four gaps on
// `expo/components/workout/WorkoutNowSheet.tsx` against
// `webapp/components/QuickSessionModal.tsx`:
//
//   1. No "Build a custom session" entry point, and the empty "My Sessions"
//      state was bare text with nowhere to go (the web's dashed-border
//      "No sessions yet / Build your first session →" card, plus a
//      "See all ›" link once there are sessions).
//   2. No header avatar / explicit close button.
//   3. No Share action on the preview.
//   4. Red (`primary`) stood in for the web's purple (`mindset`, the dumbbell
//      icons / AI toggle) and green (`success`, the selected chip / Start
//      button / Repeat / See all) accents.
//
// This file covers the BEHAVIOUR each new affordance adds (navigation, the
// close button, the Share action's presence) — colour classes are not
// resolved under jest (NativeWind classNames have no effect in this
// environment, per AGENTS.md), so they are not asserted here; they were
// checked by eye in both colour schemes against the web screenshots.

/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
    token: "test-jwt",
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
import { WorkoutNowSheet } from "@/components/workout/WorkoutNowSheet";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const NO_SESSIONS = { logs: [], favoriteSessionOrder: [] };

const RECENT_LOGS = {
  logs: [
    {
      kind: "quick",
      title: "Sunday Back & Shoulders",
      focus: "pull",
      date: "2026-10-05T12:00:00.000Z",
      duration: 30,
      exerciseCount: 2,
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
      ],
    },
  ],
  favoriteSessionOrder: [],
};

const PREVIEW = {
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
    ],
  },
  seed: 1,
};

beforeEach(() => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
});

describe("NP-294 Workout Now sheet — visual parity pass", () => {
  it("the empty My Sessions state is a tappable card (not bare text) that opens the Sessions hub and closes the sheet", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/logs")) return NO_SESSIONS;
      return {};
    });
    const onClose = jest.fn();
    const { getByTestId, getByText, queryByTestId } = render(
      <WorkoutNowSheet visible onClose={onClose} />,
    );

    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-recent-empty")).toBeTruthy();
    });
    expect(getByText("No sessions yet")).toBeTruthy();
    expect(getByText("Build your first session")).toBeTruthy();
    // "See all" only makes sense once there is something to see all of.
    expect(queryByTestId("workout-now-sheet-see-all")).toBeNull();

    fireEvent.press(getByTestId("workout-now-sheet-recent-empty"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/sessions");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"See all" appears once there are recent sessions and opens the Sessions hub', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/logs")) return RECENT_LOGS;
      return {};
    });
    const onClose = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <WorkoutNowSheet visible onClose={onClose} />,
    );

    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-see-all")).toBeTruthy();
    });
    // The dashed empty-state card is gone now that there is a real list.
    expect(queryByTestId("workout-now-sheet-recent-empty")).toBeNull();

    fireEvent.press(getByTestId("workout-now-sheet-see-all"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/sessions");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"Build a custom session" opens the native session builder, already in place, and closes the sheet', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/logs")) return NO_SESSIONS;
      return {};
    });
    const onClose = jest.fn();
    const { getByTestId } = render(<WorkoutNowSheet visible onClose={onClose} />);

    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-build-custom")).toBeTruthy();
    });
    fireEvent.press(getByTestId("workout-now-sheet-build-custom"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/quick/build");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the header carries an explicit close button beside the avatar + title, wired to the same close as the backdrop", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/logs")) return NO_SESSIONS;
      return {};
    });
    const onClose = jest.fn();
    const { getByTestId } = render(<WorkoutNowSheet visible onClose={onClose} />);

    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-title")).toBeTruthy();
    });
    expect(getByTestId("workout-now-sheet-title").props.children).toBe("Workout Now");

    fireEvent.press(getByTestId("workout-now-sheet-close-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the preview offers a Share action alongside Regenerate and Start", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/workouts/logs")) return NO_SESSIONS;
      if (path === "/api/generate/session") return PREVIEW;
      return {};
    });
    const { getByTestId } = render(<WorkoutNowSheet visible onClose={() => {}} />);

    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-focus-push")).toBeTruthy();
    });
    fireEvent.press(getByTestId("workout-now-sheet-focus-push"));
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-preview-title")).toBeTruthy();
    });

    expect(getByTestId("workout-now-sheet-regenerate")).toBeTruthy();
    expect(getByTestId("workout-now-sheet-share")).toBeTruthy();
    expect(getByTestId("workout-now-sheet-start")).toBeTruthy();
  });
});
