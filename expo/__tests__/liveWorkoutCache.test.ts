import {
  applySetUpdate,
  liveCacheKey,
  createLiveWorkoutCache,
  createMemoryKeyValueStore,
  type LiveSetSnapshot,
  type LiveWorkoutSnapshot,
} from "@/lib/live/liveWorkoutCache";

describe("applySetUpdate (state machine)", () => {
  const base: LiveWorkoutSnapshot = {
    bench: [
      { reps: null, weight: null, completed: false },
      { reps: null, weight: null, completed: false },
    ],
  };

  it("replaces a single set immutably", () => {
    const patch: LiveSetSnapshot = { reps: 5, weight: 135, completed: false };
    const next = applySetUpdate<LiveSetSnapshot>(base, "bench", 0, patch);
    expect(next.bench![0]).toEqual({ reps: 5, weight: 135, completed: false });
    // Untouched set + original object preserved.
    expect(next.bench![1]).toEqual({
      reps: null,
      weight: null,
      completed: false,
    });
    expect(base.bench![0]).toEqual({
      reps: null,
      weight: null,
      completed: false,
    });
    expect(next).not.toBe(base);
  });

  it("transitions a set to completed", () => {
    const patch: LiveSetSnapshot = { reps: 8, weight: 100, completed: true };
    const next = applySetUpdate<LiveSetSnapshot>(base, "bench", 1, patch);
    expect(next.bench![1]!.completed).toBe(true);
  });

  it("creates the slug bucket when absent", () => {
    const patch: LiveSetSnapshot = { reps: 10, weight: 60, completed: false };
    const next = applySetUpdate<LiveSetSnapshot>(base, "ohp", 0, patch);
    expect(next.ohp![0]).toEqual({ reps: 10, weight: 60, completed: false });
  });
});

describe("liveCacheKey", () => {
  it("encodes program / phase / workout", () => {
    expect(liveCacheKey("prog-1", 2, 1)).toBe("become.live.prog-1.1.2");
    expect(liveCacheKey("prog-1", 0)).toBe("become.live.prog-1.0.0");
  });
});

describe("createLiveWorkoutCache", () => {
  const snap: LiveWorkoutSnapshot = {
    bench: [{ reps: 5, weight: 135, completed: true }],
  };

  it("round-trips a snapshot through the store", async () => {
    const store = createMemoryKeyValueStore();
    const cache = createLiveWorkoutCache(store);
    const key = liveCacheKey("p", 0);
    await cache.save(key, snap);
    expect(await cache.load(key)).toEqual(snap);
  });

  it("returns null for a missing key", async () => {
    const cache = createLiveWorkoutCache(createMemoryKeyValueStore());
    expect(await cache.load("nope")).toBeNull();
  });

  it("returns null (does not throw) on a corrupt entry", async () => {
    const store = createMemoryKeyValueStore({ k: "{not json" });
    const cache = createLiveWorkoutCache(store);
    expect(await cache.load("k")).toBeNull();
  });

  it("clear removes the entry", async () => {
    const store = createMemoryKeyValueStore();
    const cache = createLiveWorkoutCache(store);
    const key = liveCacheKey("p", 0);
    await cache.save(key, snap);
    await cache.clear(key);
    expect(await cache.load(key)).toBeNull();
  });
});
