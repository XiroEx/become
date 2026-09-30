import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import {
  CACHE_VERSION,
  DEFAULT_MAX_AGE_MS,
  readCache,
  writeCache,
  clearCache,
  clearAll,
  setCacheMemberId,
  getCacheMemberId,
  getCachedSync,
  cacheStorageKey,
} from "@/lib/cache/lastKnown";

describe("lastKnownCache", () => {
  let storage = createMemoryAsyncStorage();

  beforeEach(() => {
    storage = createMemoryAsyncStorage();
    setCacheMemberId(null);
  });

  afterEach(async () => {
    await clearAll(storage);
    setCacheMemberId(null);
  });

  it("writes and reads back cached data", async () => {
    await writeCache("/api/test", { count: 42 }, "user-1", storage);
    const result = await readCache<{ count: number }>(
      "/api/test",
      "user-1",
      DEFAULT_MAX_AGE_MS,
      storage,
    );
    expect(result).toEqual({ count: 42 });
  });

  it("synchronously reads from memory cache once written", async () => {
    await writeCache("/api/sync", { ok: true }, "user-1", storage);
    const sync = getCachedSync<{ ok: boolean }>("/api/sync", "user-1");
    expect(sync).toEqual({ ok: true });
  });

  it("enforces member scoping: user 2 cannot read user 1's cached data", async () => {
    await writeCache("/api/profile", { name: "User One" }, "user-1", storage);

    // User 2 cannot read it
    const user2Read = await readCache(
      "/api/profile",
      "user-2",
      DEFAULT_MAX_AGE_MS,
      storage,
    );
    expect(user2Read).toBeNull();

    // User 1 CAN read it
    const user1Read = await readCache(
      "/api/profile",
      "user-1",
      DEFAULT_MAX_AGE_MS,
      storage,
    );
    expect(user1Read).toEqual({ name: "User One" });
  });

  it("uses setCacheMemberId when memberId is not explicitly provided", async () => {
    setCacheMemberId("user-active");
    expect(getCacheMemberId()).toBe("user-active");

    await writeCache("/api/streak", { streakDays: 7 }, undefined, storage);
    const read = await readCache<{ streakDays: number }>(
      "/api/streak",
      undefined,
      DEFAULT_MAX_AGE_MS,
      storage,
    );
    expect(read).toEqual({ streakDays: 7 });

    // Switching active member to someone else
    setCacheMemberId("user-other");
    const otherRead = await readCache(
      "/api/streak",
      undefined,
      DEFAULT_MAX_AGE_MS,
      storage,
    );
    expect(otherRead).toBeNull();
  });

  it("drops data older than 24 hours (DEFAULT_MAX_AGE_MS)", async () => {
    const key = "/api/expired";
    const rawKey = cacheStorageKey(key, "user-1");

    // Write manually with a timestamp from 25 hours ago
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    await storage.setItem(
      rawKey,
      JSON.stringify({
        t: twentyFiveHoursAgo,
        data: { old: true },
        memberId: "user-1",
        version: CACHE_VERSION,
      }),
    );

    const result = await readCache(key, "user-1", DEFAULT_MAX_AGE_MS, storage);
    expect(result).toBeNull();
  });

  it("returns data within the 24 hour window", async () => {
    const key = "/api/fresh";
    const rawKey = cacheStorageKey(key, "user-1");

    // Write timestamp from 23 hours ago
    const twentyThreeHoursAgo = Date.now() - 23 * 60 * 60 * 1000;
    await storage.setItem(
      rawKey,
      JSON.stringify({
        t: twentyThreeHoursAgo,
        data: { fresh: true },
        memberId: "user-1",
        version: CACHE_VERSION,
      }),
    );

    const result = await readCache(key, "user-1", DEFAULT_MAX_AGE_MS, storage);
    expect(result).toEqual({ fresh: true });
  });

  it("fail-soft: handles corrupt JSON or invalid envelope gracefully", async () => {
    const rawKey = cacheStorageKey("/api/corrupt", "user-1");
    await storage.setItem(rawKey, "{not-json");
    expect(await readCache("/api/corrupt", "user-1", DEFAULT_MAX_AGE_MS, storage)).toBeNull();

    await storage.setItem(rawKey, JSON.stringify({ notAnEnvelope: true }));
    expect(await readCache("/api/corrupt", "user-1", DEFAULT_MAX_AGE_MS, storage)).toBeNull();
  });

  it("fail-soft: storage throwing an error never crashes the app", async () => {
    const brokenStorage = {
      getItem: jest.fn(async () => {
        throw new Error("Disk read error");
      }),
      setItem: jest.fn(async () => {
        throw new Error("Quota exceeded");
      }),
      removeItem: jest.fn(async () => {
        throw new Error("Disk error");
      }),
    };

    // Neither read nor write should throw
    await expect(writeCache("/api/test-broken", { a: 1 }, "user-1", brokenStorage)).resolves.toBeUndefined();
    await clearAll();
    await expect(readCache("/api/test-broken", "user-1", DEFAULT_MAX_AGE_MS, brokenStorage)).resolves.toBeNull();
    await expect(clearCache("/api/test-broken", "user-1", brokenStorage)).resolves.toBeUndefined();
  });

  it("clearCache removes a single entry", async () => {
    await writeCache("/api/item1", "one", "user-1", storage);
    await writeCache("/api/item2", "two", "user-1", storage);

    await clearCache("/api/item1", "user-1", storage);

    expect(await readCache("/api/item1", "user-1", DEFAULT_MAX_AGE_MS, storage)).toBeNull();
    expect(await readCache("/api/item2", "user-1", DEFAULT_MAX_AGE_MS, storage)).toBe("two");
  });

  it("clearAll removes all become.cache.* keys and preserves other keys", async () => {
    // Write other keys to storage
    await storage.setItem("become.session", "jwt-token");
    await storage.setItem("become.offline-writes.v1", "writes-queue");

    // Write cache entries across members
    await writeCache("/api/1", "one", "user-1", storage);
    await writeCache("/api/2", "two", "user-2", storage);

    await clearAll(storage);

    // All cache entries are gone
    expect(await readCache("/api/1", "user-1", DEFAULT_MAX_AGE_MS, storage)).toBeNull();
    expect(await readCache("/api/2", "user-2", DEFAULT_MAX_AGE_MS, storage)).toBeNull();

    // Session and offline queue keys are untouched
    expect(await storage.getItem("become.session")).toBe("jwt-token");
    expect(await storage.getItem("become.offline-writes.v1")).toBe("writes-queue");
  });
});
