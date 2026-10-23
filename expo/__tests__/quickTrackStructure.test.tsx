/* eslint-disable import/first */
// Quick sessions get Track's structure controls (board card 6adae982):
// `quick/live.tsx` passes `onExerciseChange` to `LiveWorkoutClient` — the
// program route already did, so quick sessions rendered none of the Track
// card's Move up / Move down / Remove, Ungroup or superset toggle. A reorder
// from the Track card persists through the quick session's own save path
// (stash + progress + debounced server save), the same hook the route
// already used for add/swap.
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as fs from "fs";
import * as path from "path";

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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

import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import { stashQuickSessionWithId } from "@/lib/quickSession/store";
import QuickLiveRoute from "../app/(app)/(tabs)/programming/quick/live";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");

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

interface RecordedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

function makeFetchImpl(handler: (call: RecordedCall) => unknown) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    let body: Record<string, unknown> | null = null;
    try {
      body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;
    } catch {
      body = null;
    }
    const call: RecordedCall = {
      url: String(url),
      method: (init?.method ?? "GET").toUpperCase(),
      body,
    };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function workoutPosts(calls: RecordedCall[]) {
  return calls.filter(
    (c) => c.url.includes("/api/workouts") && c.method === "POST" && c.body,
  );
}

function exerciseSlugs(call: RecordedCall): string[] | null {
  const exercises = (call.body as { exercises?: unknown })?.exercises;
  if (!Array.isArray(exercises)) return null;
  return exercises.map((e) => String((e as { exerciseSlug?: unknown })?.exerciseSlug ?? ""));
}

const STASH_EXERCISES = [
  {
    exerciseSlug: "bench-press",
    name: "Bench Press",
    trackingType: "reps_weight",
    sets: 1,
    reps: "8-12",
    rest: "90s",
  },
  {
    exerciseSlug: "seated-row",
    name: "Seated Row",
    trackingType: "reps_weight",
    sets: 1,
    reps: "8-12",
    rest: "90s",
  },
];

describe("quick sessions get Track's structure controls", () => {
  it("quick/live.tsx passes onExerciseChange to LiveWorkoutClient", () => {
    const src = fs.readFileSync(
      path.join(EXPO_DIR, "app/(app)/(tabs)/programming/quick/live.tsx"),
      "utf8",
    );
    expect(src).toContain("onExerciseChange={applyExerciseChange}");
  });

  it("Move down reorders the quick session on screen and persists the new order", async () => {
    mockParams = { session: "qs-reorder" };
    const store = createMemoryKeyValueStore();
    await stashQuickSessionWithId(
      { title: "Quick Session", exercises: STASH_EXERCISES },
      "qs-reorder",
      {},
      store,
    );

    const { calls, fetchImpl } = makeFetchImpl((call) => {
      if (call.url.includes("/api/exercises/hydrate"))
        return jsonResponse({ exercises: [{}, {}] });
      if (call.url.includes("/api/workouts"))
        return jsonResponse({ message: "ok", completed: false });
      return jsonResponse({}, false);
    });

    const { getByTestId } = render(
      <QuickLiveRoute store={store} fetchImpl={fetchImpl} autoSaveDelayMs={0} />,
    );

    await waitFor(() => {
      expect(
        getByTestId("live-workout-live-exercise-bench-press"),
      ).toBeTruthy();
    });

    // The structure controls live on the Track card, not the Live step.
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-view-track"));
    });
    expect(
      getByTestId("live-workout-exercise-bench-press-move-down"),
    ).toBeTruthy();
    expect(
      getByTestId("live-workout-exercise-bench-press-badge").props.children
        .props.children,
    ).toBe(1);

    // Reorder: bench moves below the row.
    await act(async () => {
      fireEvent.press(
        getByTestId("live-workout-exercise-bench-press-move-down"),
      );
    });
    await waitFor(() => {
      expect(
        getByTestId("live-workout-exercise-bench-press-badge").props.children
          .props.children,
      ).toBe(2);
    });
    expect(
      getByTestId("live-workout-exercise-seated-row-badge").props.children.props
        .children,
    ).toBe(1);

    // …and the debounced server save carries the new order.
    await waitFor(() => {
      const posts = workoutPosts(calls).filter(
        (c) => (exerciseSlugs(c) ?? []).length === 2,
      );
      expect(posts.length).toBeGreaterThan(0);
      const last = posts[posts.length - 1]!;
      expect(exerciseSlugs(last)).toEqual(["seated-row", "bench-press"]);
    });
  });
});
