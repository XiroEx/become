/* eslint-disable import/first */
// NP-291 — QUICK SESSION: START WORKOUT OPENS LIVE, SHOWS THE ELAPSED TIMER,
// SHARE SITS IN THE OVERVIEW'S TOP BAR; SWAP EXERCISE AND "TAP TO JUMP" WORK
// ON A QUICK SESSION'S LIVE VIEW.
//
// Full-pass gaps against the web (build d68b84e3), plus the Android follow-up
// (build 24f4e34d) in the card's comment thread:
//   1. `Start workout` opened Track on native, Live on web; no elapsed timer.
//   2. The overview's Share button stood alone under the title; the web
//      keeps it in the header row beside Back / Edit / Log or plan.
//   3. `quick/live.tsx` never passed `onRequestSwap` to `LiveWorkoutClient`,
//      so "Swap exercise" did nothing.
//   4. The manage sheet ("Exercises (N)", `WorkoutExerciseList`) says "Tap
//      to jump · hold to move", but a row tap only closed the sheet.
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import { stashQuickSessionWithId } from "@/lib/quickSession/store";
import QuickLiveRoute from "../app/(app)/(tabs)/programming/quick/live";
import QuickSessionOverviewRoute from "../app/(app)/(tabs)/programming/quick/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function jsonResponse(body: unknown, ok = true, status?: number) {
  const text = JSON.stringify(body);
  return {
    ok,
    status: status ?? (ok ? 200 : 404),
    headers: { get: () => null },
    json: async () => body,
    text: async () => text,
  };
}

function makeFetchImpl(handler: (url: string, method: string) => unknown) {
  const fetchImpl = (async (url: unknown, init?: RequestInit) =>
    handler(String(url), (init?.method ?? "GET").toUpperCase())) as unknown as typeof fetch;
  return fetchImpl;
}

const TWO_EXERCISES = [
  {
    exerciseSlug: "bench-press",
    name: "Bench Press",
    trackingType: "reps_weight",
    sets: 1,
    reps: "8-12",
    rest: "90s",
  },
  {
    exerciseSlug: "plank",
    name: "Plank",
    trackingType: "time",
    sets: 1,
    reps: "",
    duration: "45",
  },
];

function defaultFetchImpl() {
  return makeFetchImpl((url, method) => {
    if (url.includes("/api/exercises/hydrate")) return jsonResponse({ exercises: [{}, {}] });
    if (url.includes("/api/workouts") && method === "POST")
      return jsonResponse({ message: "ok", completed: false });
    return jsonResponse({}, false);
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 6, 12, 0, 0));
  mockPush.mockReset();
  mockParams = {};
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({});
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("(id: np291-live-default) Start workout opens Live with a running elapsed timer", () => {
  it("renders the Live step (not Track) and the elapsed time advances", async () => {
    {
      mockParams = { session: "qs-1" };
      const store = createMemoryKeyValueStore();
      await stashQuickSessionWithId(
        { title: "Quick Session", exercises: TWO_EXERCISES },
        "qs-1",
        {},
        store,
      );

      const { getByTestId, queryByTestId } = render(
        <QuickLiveRoute store={store} fetchImpl={defaultFetchImpl()} />,
      );

      await waitFor(() => {
        expect(
          getByTestId("live-workout-live-exercise-bench-press"),
        ).toBeTruthy();
      });
      // Track's exercise card (a different testID) never rendered — this is
      // the Live step, not the web's default Track.
      expect(queryByTestId("live-workout-exercise-bench-press")).toBeNull();

      // The elapsed line renders and ticks on the wall clock.
      expect(getByTestId("live-workout-elapsed")).toBeTruthy();
      const before = String(getByTestId("live-workout-elapsed").props.children);
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      const after = String(getByTestId("live-workout-elapsed").props.children);
      expect(after).not.toBe(before);
    }
  });
});

describe("(id: np291-swap) Swap exercise opens the picker and commits the pick", () => {
  it("renames the exercise in Live after choosing an alternative", async () => {
    mockParams = { session: "qs-swap" };
    const store = createMemoryKeyValueStore();
    await stashQuickSessionWithId(
      { title: "Quick Session", exercises: [TWO_EXERCISES[0]!] },
      "qs-swap",
      {},
      store,
    );

    mockApiFetch.mockImplementation((path: string) => {
      if (path.includes("/api/exercises/alternatives")) {
        return Promise.resolve({
          alternatives: [
            {
              slug: "db-press",
              name: "DB Bench Press",
              trackingType: "reps_weight",
              equipment: ["dumbbell"],
            },
          ],
        });
      }
      if (path.includes("/api/exercises/custom")) {
        return Promise.resolve({ exercises: [] });
      }
      return Promise.resolve({});
    });

    const { getByTestId, queryByTestId } = render(
      <QuickLiveRoute store={store} fetchImpl={defaultFetchImpl()} />,
    );

    await waitFor(() => {
      expect(
        getByTestId("live-workout-live-exercise-bench-press"),
      ).toBeTruthy();
    });

    // Swap exercise used to do nothing — `onRequestSwap` reached the button
    // but had no handler above it.
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-live-swap"));
    });
    await waitFor(() => {
      expect(getByTestId("quick-live-swap-option-db-press")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("quick-live-swap-option-db-press"));
    });

    // The modal closes and the Live step now carries the swapped-in exercise.
    await waitFor(() => {
      expect(queryByTestId("quick-live-swap-option-db-press")).toBeNull();
    });
    expect(getByTestId("live-workout-live-exercise-db-press")).toBeTruthy();
    expect(
      queryByTestId("live-workout-live-exercise-bench-press"),
    ).toBeNull();
  });
});

describe("(id: np291-jump) The manage sheet's 'Tap to jump' actually jumps", () => {
  it("closes the sheet and lands on the tapped exercise's Live step", async () => {
    mockParams = { session: "qs-jump" };
    const store = createMemoryKeyValueStore();
    await stashQuickSessionWithId(
      { title: "Quick Session", exercises: TWO_EXERCISES },
      "qs-jump",
      {},
      store,
    );

    const { getByTestId, queryByTestId } = render(
      <QuickLiveRoute store={store} fetchImpl={defaultFetchImpl()} />,
    );

    await waitFor(() => {
      expect(
        getByTestId("live-workout-live-exercise-bench-press"),
      ).toBeTruthy();
    });
    // Standing on exercise 1 (Bench Press); Plank is not on screen yet.
    expect(queryByTestId("live-workout-live-exercise-plank")).toBeNull();

    // NP-288 collapsed Live's two exercise buttons (`Exercises` and
    // `Exercises (12)`, which opened two different panels) into the web's
    // ONE entry: the rail beside the clip, which opens the route's manage
    // panel when there is one.
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-live-exercises"));
    });
    await waitFor(() => {
      expect(getByTestId("quick-live-manage-row-1")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("quick-live-manage-row-1"));
    });

    // The sheet closed AND the Live step actually moved to Plank — a plain
    // close would have left Bench Press on screen.
    await waitFor(() => {
      expect(queryByTestId("quick-live-manage-row-1")).toBeNull();
    });
    expect(getByTestId("live-workout-live-exercise-plank")).toBeTruthy();
    expect(queryByTestId("live-workout-live-exercise-bench-press")).toBeNull();
  });
});

describe("(id: np291-share) The overview's Share button sits in the header row", () => {
  it("is a sibling of Edit / Log or plan, not standing alone under the title", async () => {
    mockParams = { session: "qs-share" };
    // No `store` override: the overview route always reads AsyncStorage.
    await stashQuickSessionWithId(
      { title: "Quick Session", exercises: [TWO_EXERCISES[0]!] },
      "qs-share",
      {},
    );
    const { getByTestId } = render(<QuickSessionOverviewRoute />);

    await waitFor(() => {
      expect(getByTestId("quick-session-overview-title")).toBeTruthy();
    });

    // Share renders INSIDE the header's button row (the one holding Edit
    // and Log or plan) — the web's Back / Edit / Log or plan / Share
    // arrangement — not standing alone under the title.
    const actions = getByTestId("quick-session-overview-header-actions");
    expect(within(actions).getByTestId("quick-session-overview-share")).toBeTruthy();
    expect(
      within(actions).getByTestId("quick-session-overview-edit-toggle"),
    ).toBeTruthy();
    expect(
      within(actions).getByTestId("quick-session-overview-log-toggle"),
    ).toBeTruthy();
  });
});
