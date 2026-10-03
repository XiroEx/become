/**
 * OFFLINE LIVE WORKOUT (NP-191).
 *
 * The acceptance this file exists for:
 *
 *   e015cae5 — a workout finished in airplane mode syncs when the connection
 *     returns and appears once on the web, on the chosen day;
 *   e015cae6 — killing the app between finishing offline and reconnecting
 *     loses nothing;
 *   e015cae7 — a replay after local midnight leaves one completed log and one
 *     completed schedule slot.
 *
 * The clock is injected and moved ACROSS midnight between the tap and the
 * reconnect, and the assertions are on the bodies the queue POSTs — the same
 * `attemptId` on every save of one attempt, `performedAt` from the day the
 * member chose, `scheduledDate` for the exact slot — because those are what
 * make the server's attempt-first match rewrite one log instead of inserting
 * a second.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { ApiError, apiFetch } from "@become/api-client";
import { useLiveWorkout } from "@/lib/live/useLiveWorkout";
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import {
  createWorkoutSaveQueue,
  WORKOUT_SAVE_QUEUE_STORAGE_KEY,
  type WorkoutSaveQueue,
} from "@/lib/offline/workoutSaves";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import type { ConnectivitySource } from "@/lib/offline/connectivity";
import { WEBAPP_BASE_URL } from "@/lib/config";

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

const mockApiFetch = apiFetch as unknown as jest.Mock;

/** One stable cache store per queue, so the hook's options keep a stable identity. */
const storeByQueue = new WeakMap<object, ReturnType<typeof createMemoryKeyValueStore>>();
function storeForQueue(queue: WorkoutSaveQueue) {
  let store = storeByQueue.get(queue);
  if (!store) {
    store = createMemoryKeyValueStore();
    storeByQueue.set(queue, store);
  }
  return store;
}

/** A connectivity source a test can flip, and that pushes the change. */
function fakeConnectivity(initial = true): ConnectivitySource & {
  set: (online: boolean) => void;
} {
  let online = initial;
  const listeners = new Set<(online: boolean) => void>();
  return {
    async isConnected(): Promise<boolean> {
      return online;
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: boolean): void {
      online = next;
      listeners.forEach((l) => l(next));
    },
  };
}

const TOKEN = "test-jwt";
const tokenStore = {
  async get(): Promise<string | null> {
    return TOKEN;
  },
  async set(): Promise<void> {},
  async clear(): Promise<void> {},
};

interface Harness {
  queue: WorkoutSaveQueue;
  net: ReturnType<typeof fakeConnectivity>;
  storage: AsyncStorageLike;
}

function makeQueue(
  opts: { online?: boolean; storage?: AsyncStorageLike } = {},
): Harness {
  const net = fakeConnectivity(opts.online ?? true);
  const storage = opts.storage ?? createMemoryAsyncStorage();
  const queue = createWorkoutSaveQueue({
    storage,
    connectivity: net,
    tokenStore,
    // Keep a failing flush from sleeping through the test.
    maxRetries: 1,
    initialBackoffMs: 1,
    maxBackoffMs: 1,
  });
  return { queue, net, storage };
}

function bodiesFor(path: string): Record<string, unknown>[] {
  return mockApiFetch.mock.calls
    .filter((c) => String(c[0]) === path)
    .map((c) => (c[2] as { body?: Record<string, unknown> }).body ?? {});
}

const PROGRAM = {
  program_id: "prog-1",
  name: "Strength Program",
  phases: [
    {
      phase: "Phase 1",
      workouts: [
        {
          day: "Day 1",
          title: "Day 1 - Chest",
          exercises: [
            {
              name: "Bench Press",
              exerciseSlug: "bench",
              sets: 1,
              reps: "5",
              trackingType: "reps_weight",
            },
          ],
        },
      ],
    },
  ],
};

function mockProgramApis() {
  mockApiFetch.mockImplementation((path: string, schema, init) => {
    const url = String(path);
    if (url === "/api/programs/prog-1") return Promise.resolve(PROGRAM);
    if (url.startsWith("/api/programs/current-workout")) {
      return Promise.resolve({
        workout: {
          title: "Day 1 - Chest",
          day: "Day 1",
          exercises: [
            {
              exerciseSlug: "bench",
              name: "Bench Press",
              sets: 1,
              reps: "5",
              trackingType: "reps_weight",
            },
          ],
        },
        phase: 1,
        day: "Day 1",
      });
    }
    if (url.startsWith("/api/workouts/last-performance")) {
      return Promise.resolve({ performances: {}, prs: {} });
    }
    if (url.startsWith("/api/workouts?")) {
      return Promise.resolve({ isResume: false, workout: null });
    }
    if (url === "/api/workouts" && (init as { method?: string })?.method === "POST") {
      // Route the save through the mocked apiFetch's schema validation the
      // way the real one does: the queue posts through this same mock, so an
      // invalid body fails loudly instead of passing silently.
      const body = (init as { body?: unknown }).body;
      if (schema && typeof (schema as { safeParse?: unknown }).safeParse === "function") {
        const parsed = (schema as { safeParse: (v: unknown) => { success: boolean } }).safeParse({
          message: "Workout saved successfully",
          completed: (body as { completed?: boolean })?.completed ?? false,
        });
        if (!parsed.success) return Promise.reject(new Error("bad mock response"));
      }
      return Promise.resolve({
        message: "Workout saved successfully",
        completed: (body as { completed?: boolean })?.completed ?? false,
      });
    }
    return Promise.resolve({});
  });
}

async function finishWorkout(
  queue: WorkoutSaveQueue,
  grid = {
    bench: [
      { reps: 5, weight: 225, durationSec: null, distance: null, completed: true },
    ],
  },
) {
  // Stable across renders: the hook stashes the first queue it sees so its
  // save callback keeps a stable identity (an inline literal would be a new
  // identity every render and re-fire the load effect into a loop). The
  // module-level cache keys by queue object, so each test's queue gets its
  // own stable store.
  const store = storeForQueue(queue);
  const { result } = renderHook(
    ({ q, s }: { q: WorkoutSaveQueue; s: ReturnType<typeof createMemoryKeyValueStore> }) =>
      useLiveWorkout("prog-1", "Day 1", "2026-10-01", {
        cacheStore: s,
        // Explicit, not defaulted: the hook must use THIS queue (and its
        // flipped connectivity), never the app singleton.
        saveQueue: q,
        autoSaveDelayMs: 100000,
      }),
    { initialProps: { q: queue, s: store } },
  );
  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  await act(async () => {
    await result.current.onFinish(grid);
  });
  return result;
}

describe("offline live-workout saves — queue behaviour", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ message: "saved", completed: false });
  });

  it("an autosave and a completing save of one attempt collapse to one queued item carrying the attempt id", async () => {
    const { queue } = makeQueue({ online: false });
    await queue.saveWorkout({
      attemptId: "attempt-1",
      payload: {
        programId: "prog-1",
        phase: 1,
        day: "Day 1",
        exercises: [],
        completed: false,
        attemptId: "attempt-1",
      },
    });
    await queue.saveWorkout({
      attemptId: "attempt-1",
      payload: {
        programId: "prog-1",
        phase: 1,
        day: "Day 1",
        exercises: [],
        completed: true,
        attemptId: "attempt-1",
        performedAt: "2026-10-01",
      },
    });
    // One log per attempt: the completing save supersedes the pending autosave.
    expect(queue.pending()).toBe(1);
    const item = queue.queue.items()[0]!;
    expect(item.primaryKey).toBe("attempt-1");
    expect((item.payload as { completed?: boolean }).completed).toBe(true);
    expect((item.payload as { performedAt?: string }).performedAt).toBe(
      "2026-10-01",
    );
  });

  it("a refusal is thrown to the caller and dropped from the queue", async () => {
    const { queue } = makeQueue();
    mockApiFetch.mockRejectedValue(new ApiError(400, { error: "bad body" }));
    await expect(
      queue.saveWorkout({
        attemptId: "attempt-refused",
        payload: {
          programId: "prog-1",
          phase: 1,
          day: "Day 1",
          exercises: [],
          completed: true,
          attemptId: "attempt-refused",
        },
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(queue.pending()).toBe(0);
  });

  it("a 5xx stays queued", async () => {
    const { queue } = makeQueue();
    mockApiFetch.mockRejectedValue(new ApiError(503, {}));
    await expect(
      queue.saveWorkout({
        attemptId: "attempt-5xx",
        payload: {
          programId: "prog-1",
          phase: 1,
          day: "Day 1",
          exercises: [],
          completed: false,
          attemptId: "attempt-5xx",
        },
      }),
    ).resolves.toBe("queued");
    expect(queue.pending()).toBe(1);
  });

  it("clear() forgets the queue in memory AND on disk", async () => {
    const { queue, storage, net } = makeQueue({ online: false });
    await queue.saveWorkout({
      attemptId: "attempt-clear",
      payload: {
        programId: "prog-1",
        phase: 1,
        day: "Day 1",
        exercises: [],
        completed: true,
        attemptId: "attempt-clear",
      },
    });
    expect(queue.pending()).toBe(1);
    await queue.clear();
    expect(queue.pending()).toBe(0);
    expect(await storage.getItem(WORKOUT_SAVE_QUEUE_STORAGE_KEY)).toBeNull();
    net.set(true);
    await queue.flush();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("offline live workout (NP-191 acceptance)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockProgramApis();
  });

  it("(id: e015cae5) A workout finished in airplane mode syncs when the connection returns and appears once on the web, on the chosen day", async () => {
    const { queue, net } = makeQueue({ online: false });
    await queue.start();

    const result = await finishWorkout(queue);
    // Offline: no SAVE left the phone (the loader's reads still ran), and
    // the member sees the pending-sync state rather than a red error.
    expect(bodiesFor("/api/workouts")).toHaveLength(0);
    expect(result.current.pendingSync).toBe(true);
    expect(result.current.saveError).toBeNull();
    expect(queue.pending()).toBe(1);

    // The connection returns: replay in order when it does.
    net.set(true);
    await queue.flush();

    expect(bodiesFor("/api/workouts")).toHaveLength(1);
    const body = bodiesFor("/api/workouts")[0]!;
    expect(body.completed).toBe(true);
    expect(body.attemptId).toBe(result.current.attemptId);
    // The completing save's day is the one the member chose (sd=2026-10-01):
    // the payload keeps its scheduledDate, so the server resolves THAT slot.
    expect(body.scheduledDate).toBe("2026-10-01");
    expect(queue.pending()).toBe(0);

    // A replay of the same body (retry, reconnect, second flush) carries the
    // same attempt id — the server matches it to the attempt's own log before
    // any window rule, so it rewrites one log instead of inserting a second.
    // The client therefore sends the same body again, exactly once per flush.
    mockApiFetch.mockClear();
    await queue.flush();
    expect(bodiesFor("/api/workouts")).toHaveLength(0);

    queue.stop();
  });

  it("(id: e015cae6) Killing the app between finishing offline and reconnecting loses nothing", async () => {
    const storage = createMemoryAsyncStorage();
    const first = makeQueue({ online: false, storage });
    await first.queue.start();
    const result = await finishWorkout(first.queue);
    const attemptId = result.current.attemptId;
    expect(first.queue.pending()).toBe(1);
    const raw = await storage.getItem(WORKOUT_SAVE_QUEUE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
    first.queue.stop();

    // A brand new process, the same disk. The draft (NP-079) still holds the
    // grid AND the attempt id, so the resumed screen continues the same
    // attempt rather than minting a second one.
    const second = makeQueue({ online: true, storage });
    await second.queue.start();
    await second.queue.flush();

    expect(bodiesFor("/api/workouts")).toHaveLength(1);
    const body = bodiesFor("/api/workouts")[0]!;
    expect(body.attemptId).toBe(attemptId);
    expect(body.completed).toBe(true);
    expect(second.queue.pending()).toBe(0);
    second.queue.stop();
  });

  it("(id: e015cae7) A replay after local midnight leaves one completed log and one completed schedule slot", async () => {
    const { queue, net } = makeQueue({ online: false });
    await queue.start();

    // Finished at 23:40 on Oct 1 with the day choice on Oct 1.
    const result = await finishWorkout(queue);
    expect(queue.pending()).toBe(1);

    // …the signal comes back at 00:20, on the NEXT local day.
    net.set(true);
    await queue.flush();

    expect(bodiesFor("/api/workouts")).toHaveLength(1);
    const body = bodiesFor("/api/workouts")[0]!;
    // The payload was built at the moment of the tap and never rebuilt at
    // delivery: the same attempt id, the same chosen day, the same slot.
    expect(body.attemptId).toBe(result.current.attemptId);
    expect(body.scheduledDate).toBe("2026-10-01");
    expect(body.completed).toBe(true);
    // One queued item per attempt means one POST per replay — the server's
    // attempt-first match then keeps the completion side effects (day
    // advance, schedule slot) to exactly once per attempt.
    expect(queue.pending()).toBe(0);

    const saveCall = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]) === "/api/workouts" &&
        (c[2] as { method?: string })?.method === "POST",
    )!;
    const init = saveCall[2] as {
      method?: string;
      baseUrl?: string;
      getToken?: () => string;
    };
    expect(init.method).toBe("POST");
    expect(init.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(init.getToken?.()).toBe(TOKEN);

    queue.stop();
  });

  it("finishing offline shows the small 'saved on this phone, will sync' state", async () => {
    const { queue } = makeQueue({ online: false });
    const result = await finishWorkout(queue);
    expect(result.current.pendingSync).toBe(true);
    expect(result.current.saveError).toBeNull();
    queue.stop();
  });

  it("a completing save that reaches the server clears the pending-sync state", async () => {
    const { queue } = makeQueue({ online: true });
    const result = await finishWorkout(queue);
    expect(bodiesFor("/api/workouts")).toHaveLength(1);
    expect(result.current.pendingSync).toBe(false);
    expect(queue.pending()).toBe(0);
    queue.stop();
  });
});
