/**
 * NP-188 acceptance, at the route (the real production entry point):
 * `expo/app/(app)/(tabs)/programming/[id]/workout/[idx]/live.tsx` is the one
 * place that loads the real `expo-widgets` factory (see
 * `useWorkoutLiveActivity.ts`'s doc comment for why `LiveWorkoutClient`
 * itself never does) and hands it to `LiveWorkoutClient`. These tests drive
 * that wiring end to end with a recording fake factory injected through the
 * route's own `workoutLiveActivityFactory` DI prop.
 */
/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
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
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import LiveWorkoutRoute from "../app/(app)/(tabs)/programming/[id]/workout/[idx]/live";
import type {
  WorkoutLiveActivityFactory,
  WorkoutLiveActivityInstance,
  WorkoutLiveActivityProps,
} from "@/lib/live/liveActivity/workoutLiveActivity";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const PROGRAM = {
  program_id: "prog-1",
  name: "Strength",
  phases: [
    {
      phase: "Phase 1",
      weeks: "1-4",
      focus: "f",
      workouts: [
        {
          day: "Day 1",
          title: "Push A",
          exercises: [
            { exerciseSlug: "bench", name: "Bench", sets: 1, reps: "5" },
          ],
        },
      ],
    },
  ],
};

interface Recording {
  factory: WorkoutLiveActivityFactory;
  started: WorkoutLiveActivityProps[];
  ended: (WorkoutLiveActivityProps | undefined)[];
}

function recordingFactory(): Recording {
  const rec: Partial<Recording> = { started: [], ended: [] };
  const instance: WorkoutLiveActivityInstance = {
    update: async () => undefined,
    end: async (props) => {
      rec.ended!.push(props);
    },
  };
  rec.factory = {
    start: (props) => {
      rec.started!.push(props);
      return instance;
    },
  };
  return rec as Recording;
}

beforeEach(() => {
  mockParams = { id: "prog-1", idx: "0", phase: "0" };
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
    return Promise.resolve({});
  });
});

describe("NP-188 acceptance, at the route", () => {
  it("e015cad4: starts the Lock Screen activity once the workout is open, showing the exercise", async () => {
    const rec = recordingFactory();
    const store = createMemoryKeyValueStore();
    const { getByTestId } = render(
      <LiveWorkoutRoute cacheStore={store} workoutLiveActivityFactory={rec.factory} />,
    );
    await waitFor(() => {
      expect(getByTestId("live-workout-bench-set-0-weight")).toBeTruthy();
    });
    await waitFor(() => {
      expect(rec.started).toHaveLength(1);
    });
    expect(rec.started[0]?.exerciseName).toBe("Bench");
    expect(rec.started[0]?.phase).toBe("exercise");
  });

  it("e015cad5: finishing the workout ends the activity", async () => {
    mockApiFetch.mockImplementation((path: string, _schema: unknown, init?: { method?: string }) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (path === "/api/workouts" && init?.method === "POST") {
        return Promise.resolve({ message: "saved", completed: true, newPRsAchieved: [] });
      }
      return Promise.resolve({});
    });
    const rec = recordingFactory();
    const store = createMemoryKeyValueStore();
    const { getByTestId } = render(
      <LiveWorkoutRoute cacheStore={store} workoutLiveActivityFactory={rec.factory} />,
    );
    await waitFor(() => {
      expect(getByTestId("live-workout-bench-set-0-weight")).toBeTruthy();
    });
    await waitFor(() => expect(rec.started).toHaveLength(1));

    await act(async () => {
      fireEvent.changeText(getByTestId("live-workout-bench-set-0-weight"), "100");
    });
    await act(async () => {
      fireEvent.changeText(getByTestId("live-workout-bench-set-0-reps"), "5");
    });
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-finish"));
    });

    // Finishing swaps `LiveWorkoutClient` for the summary (never both) —
    // that unmount is what ends the activity.
    await waitFor(() => {
      expect(getByTestId("workout-summary-closing")).toBeTruthy();
    });
    await waitFor(() => {
      expect(rec.ended).toEqual([undefined]);
    });
  });

  it("e015cad5: discarding — leaving the screen — ends the activity", async () => {
    const rec = recordingFactory();
    const store = createMemoryKeyValueStore();
    const { getByTestId, unmount } = render(
      <LiveWorkoutRoute cacheStore={store} workoutLiveActivityFactory={rec.factory} />,
    );
    await waitFor(() => {
      expect(getByTestId("live-workout-bench-set-0-weight")).toBeTruthy();
    });
    await waitFor(() => expect(rec.started).toHaveLength(1));
    expect(rec.ended).toEqual([]);

    act(() => unmount());
    expect(rec.ended).toEqual([undefined]);
  });
});
