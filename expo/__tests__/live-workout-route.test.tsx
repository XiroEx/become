/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

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

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import LiveWorkoutRoute from "../app/(tabs)/programming/[id]/workout/[idx]/live";
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
            { exerciseSlug: "bench", name: "Bench", sets: 2, reps: "5" },
          ],
        },
      ],
    },
  ],
};

function getsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]) === path);
}

describe("LiveWorkoutRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(PROGRAM);
    mockParams = { id: "prog-1", idx: "0", phase: "0" };
  });

  it("GETs the program and renders the workout's exercises", async () => {
    const store = createMemoryKeyValueStore();
    const { getByTestId } = render(<LiveWorkoutRoute cacheStore={store} />);

    await waitFor(() => {
      expect(getsTo("/api/programs/prog-1").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(getByTestId("live-workout-title").props.children).toBe("Push A");
      expect(getByTestId("live-workout-exercise-bench")).toBeTruthy();
    });
    // Two set rows from sets: 2.
    expect(getByTestId("live-workout-bench-set-0")).toBeTruthy();
    expect(getByTestId("live-workout-bench-set-1")).toBeTruthy();
  });

  it("persists an in-flight set to the cache and restores it on re-entry", async () => {
    const store = createMemoryKeyValueStore();

    // First visit: log a weight into set 0.
    const first = render(<LiveWorkoutRoute cacheStore={store} />);
    await waitFor(() => {
      expect(first.getByTestId("live-workout-bench-set-0-weight")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.changeText(
        first.getByTestId("live-workout-bench-set-0-weight"),
        "135",
      );
    });

    // The set is written to the SecureStore-backed cache.
    await waitFor(async () => {
      const raw = await store.get("become.live.prog-1.0.0");
      expect(raw).toBeTruthy();
      expect(String(raw)).toContain("135");
    });

    first.unmount();

    // Re-enter with the same store: the in-flight set is restored.
    const second = render(<LiveWorkoutRoute cacheStore={store} />);
    await waitFor(() => {
      expect(
        second.getByTestId("live-workout-bench-set-0-weight").props.value,
      ).toBe("135");
    });
  });

  it("shows an invalid state for a bad workout index", () => {
    mockParams = { id: "prog-1", idx: "-1" };
    const { getByText } = render(<LiveWorkoutRoute />);
    expect(getByText("Invalid workout")).toBeTruthy();
  });

  it("POSTs the full workout-save contract on finish and surfaces PRs", async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (
        path === "/api/workouts" &&
        (init as { method?: string } | undefined)?.method === "POST"
      ) {
        return Promise.resolve({
          message: "Workout saved successfully",
          completed: true,
          newPRsAchieved: [
            { exerciseSlug: "bench", exerciseName: "Bench", dimensions: ["weight"] },
          ],
        });
      }
      return Promise.resolve({});
    });

    const store = createMemoryKeyValueStore();
    const { getByTestId } = render(<LiveWorkoutRoute cacheStore={store} />);
    await waitFor(() => {
      expect(getByTestId("live-workout-bench-set-0-weight")).toBeTruthy();
    });

    // Log a set (each edit re-renders before the next, as with real input).
    await act(async () => {
      fireEvent.changeText(
        getByTestId("live-workout-bench-set-0-weight"),
        "225",
      );
    });
    await act(async () => {
      fireEvent.changeText(getByTestId("live-workout-bench-set-0-reps"), "5");
    });
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-finish"));
    });

    await waitFor(() => {
      const posts = mockApiFetch.mock.calls.filter(
        (c) =>
          String(c[0]) === "/api/workouts" &&
          (c[2] as { method?: string }).method === "POST",
      );
      expect(posts.length).toBeGreaterThan(0);
    });

    const post = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]) === "/api/workouts" &&
        (c[2] as { method?: string }).method === "POST",
    )!;
    const opts = post[2] as {
      method?: string;
      baseUrl?: string;
      body?: {
        programId?: string;
        phase?: number;
        day?: string;
        completed?: boolean;
        exercises?: Array<{
          name?: string;
          exerciseSlug?: string;
          sets?: Array<{ setNumber?: number; weight?: number; completed?: boolean }>;
        }>;
      };
    };
    expect(opts.method).toBe("POST");
    expect(opts.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(opts.body?.programId).toBe("prog-1");
    expect(opts.body?.phase).toBe(1); // resolvedPhase 0 → 1-based
    expect(opts.body?.day).toBe("Day 1");
    expect(opts.body?.completed).toBe(true);
    const ex = opts.body?.exercises?.[0];
    expect(ex?.name).toBe("Bench");
    expect(ex?.exerciseSlug).toBe("bench");
    expect(ex?.sets).toHaveLength(2);
    expect(ex?.sets?.[0]).toEqual(
      expect.objectContaining({
        setNumber: 1,
        weight: 225,
        reps: 5,
        completed: false,
      }),
    );

    // PR detection result surfaced in the banner.
    await waitFor(() => {
      expect(getByTestId("live-pr-banner")).toBeTruthy();
      expect(getByTestId("live-pr-bench")).toBeTruthy();
    });
  });

  it("clears the local cache after a successful finish, but keeps it if the save fails", async () => {
    const cacheKey = "become.live.prog-1.0.0";

    // --- Success path: cache is cleared on a successful POST. ---
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (
        path === "/api/workouts" &&
        (init as { method?: string } | undefined)?.method === "POST"
      ) {
        return Promise.resolve({ message: "saved", completed: true });
      }
      return Promise.resolve({});
    });
    const store = createMemoryKeyValueStore();
    const ok = render(<LiveWorkoutRoute cacheStore={store} />);
    await waitFor(() => {
      expect(ok.getByTestId("live-workout-bench-set-0-weight")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.changeText(
        ok.getByTestId("live-workout-bench-set-0-weight"),
        "200",
      );
    });
    // Cache populated by the in-flight edit.
    await waitFor(async () => {
      expect(await store.get(cacheKey)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(ok.getByTestId("live-workout-finish"));
    });
    // After a successful save the in-flight snapshot is cleared so it can't
    // resurface on the next visit.
    await waitFor(async () => {
      expect(await store.get(cacheKey)).toBeNull();
    });
    ok.unmount();

    // --- Failure path: cache is retained so the user can retry. ---
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (
        path === "/api/workouts" &&
        (init as { method?: string } | undefined)?.method === "POST"
      ) {
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve({});
    });
    const store2 = createMemoryKeyValueStore();
    const fail = render(<LiveWorkoutRoute cacheStore={store2} />);
    await waitFor(() => {
      expect(fail.getByTestId("live-workout-bench-set-0-weight")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.changeText(
        fail.getByTestId("live-workout-bench-set-0-weight"),
        "200",
      );
    });
    await waitFor(async () => {
      expect(await store2.get(cacheKey)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(fail.getByTestId("live-workout-finish"));
    });
    // Save failed → snapshot must remain so logged sets aren't lost.
    await waitFor(() => {
      expect(
        fail.getByTestId("live-workout-finish").props.accessibilityState
          ?.disabled ?? false,
      ).toBe(false);
    });
    expect(await store2.get(cacheKey)).toBeTruthy();
  });

  it("fetches alternatives when an exercise swap is requested", async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (path.startsWith("/api/exercises/alternatives")) {
        return Promise.resolve({
          source: { slug: "bench", name: "Bench" },
          alternatives: [
            { slug: "db-press", name: "DB Bench Press", reasons: ["Same pattern"] },
          ],
          total: 1,
        });
      }
      return Promise.resolve({});
    });

    const store = createMemoryKeyValueStore();
    const { getByTestId } = render(<LiveWorkoutRoute cacheStore={store} />);
    await waitFor(() => {
      expect(getByTestId("live-workout-bench-swap")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("live-workout-bench-swap"));
    });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/exercises/alternatives"),
      );
      expect(calls.length).toBeGreaterThan(0);
    });
    const altCall = mockApiFetch.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/exercises/alternatives"),
    )!;
    expect(String(altCall[0])).toBe("/api/exercises/alternatives?slug=bench");
    expect(altCall[2]).toEqual(
      expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }),
    );

    // The returned alternative appears in the swap modal.
    await waitFor(() => {
      expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
    });
  });

  it("selecting an alternative replaces the exercise in the live grid", async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
      if (path.startsWith("/api/exercises/alternatives")) {
        return Promise.resolve({
          source: { slug: "bench", name: "Bench" },
          alternatives: [
            { slug: "db-press", name: "DB Bench Press", reasons: ["Same pattern"] },
          ],
          total: 1,
        });
      }
      return Promise.resolve({});
    });

    const store = createMemoryKeyValueStore();
    const { getByTestId, getByText, queryByText } = render(
      <LiveWorkoutRoute cacheStore={store} />,
    );
    await waitFor(() => {
      expect(getByText("Bench")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("live-workout-bench-swap"));
    });
    await waitFor(() => {
      expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
    });

    // Choose the alternative → the exercise card is renamed in place.
    await act(async () => {
      fireEvent.press(getByTestId("swap-modal-option-db-press"));
    });
    await waitFor(() => {
      expect(getByText("DB Bench Press")).toBeTruthy();
    });
    expect(queryByText("Bench")).toBeNull();
  });
});
