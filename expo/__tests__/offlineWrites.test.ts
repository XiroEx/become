/* eslint-disable import/first */
/**
 * THE QUEUE, MOUNTED (NP-190).
 *
 * The acceptance this file exists for: "Mood and weight logged in airplane
 * mode sync when the connection returns and land on the day they were logged,
 * even after midnight." So the clock is injected and moved ACROSS midnight
 * between the tap and the reconnect, and the assertion is on the `date` the
 * body carries — not on the date the machine running the test happens to be on.
 */
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { ApiError, apiFetch } from "@become/api-client";
import {
  createOfflineWrites,
  dayFieldsFor,
  isPermanentRefusal,
  OFFLINE_WRITES_STORAGE_KEY,
  type OfflineWrites,
} from "@/lib/offline/writes";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import type { ConnectivitySource } from "@/lib/offline/connectivity";
import { WEBAPP_BASE_URL } from "@/lib/config";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

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
  writes: OfflineWrites;
  net: ReturnType<typeof fakeConnectivity>;
  storage: AsyncStorageLike;
}

function makeWrites(
  opts: { online?: boolean; storage?: AsyncStorageLike } = {},
): Harness {
  const net = fakeConnectivity(opts.online ?? true);
  const storage = opts.storage ?? createMemoryAsyncStorage();
  const writes = createOfflineWrites({
    storage,
    connectivity: net,
    tokenStore,
    // Keep a failing flush from sleeping through the test.
    maxRetries: 1,
    initialBackoffMs: 1,
    maxBackoffMs: 1,
  });
  return { writes, net, storage };
}

function bodiesFor(path: string): Record<string, unknown>[] {
  return mockApiFetch.mock.calls
    .filter((c) => String(c[0]) === path)
    .map((c) => (c[2] as { body?: Record<string, unknown> }).body ?? {});
}

describe("offline writes — day fields", () => {
  it("stamps the LOCAL day, the instant and the tz offset of the tap", () => {
    const now = new Date();
    const fields = dayFieldsFor(now);
    const expectedDay = `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(fields.date).toBe(expectedDay);
    expect(fields.loggedAt).toBe(now.toISOString());
    expect(fields.tz).toBe(now.getTimezoneOffset());
  });
});

describe("isPermanentRefusal", () => {
  it("4xx is final, except the three that mean 'not now'", () => {
    expect(isPermanentRefusal(new ApiError(400, { error: "bad day" }))).toBe(true);
    expect(isPermanentRefusal(new ApiError(403, {}))).toBe(true);
    expect(isPermanentRefusal(new ApiError(404, {}))).toBe(true);
    expect(isPermanentRefusal(new ApiError(408, {}))).toBe(false);
    expect(isPermanentRefusal(new ApiError(429, {}))).toBe(false);
  });

  it("a 5xx or a network failure is never final", () => {
    expect(isPermanentRefusal(new ApiError(500, {}))).toBe(false);
    expect(isPermanentRefusal(new TypeError("Network request failed"))).toBe(
      false,
    );
  });
});

describe("offline writes — online", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ success: true });
  });

  it("POSTs a mood straight away, with its day, and keeps nothing", async () => {
    const { writes } = makeWrites();
    const now = new Date("2026-03-14T18:00:00.000Z");
    await expect(writes.logMood(4, { now })).resolves.toBe("sent");

    expect(bodiesFor("/api/mood")).toHaveLength(1);
    const body = bodiesFor("/api/mood")[0]!;
    expect(body.mood).toBe(4);
    expect(body.date).toBe(dayFieldsFor(now).date);
    expect(body.loggedAt).toBe(now.toISOString());
    expect(writes.pending()).toBe(0);

    const init = mockApiFetch.mock.calls[0]![2] as {
      method?: string;
      baseUrl?: string;
      getToken?: () => string;
    };
    expect(init.method).toBe("POST");
    expect(init.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(init.getToken?.()).toBe(TOKEN);
  });

  it("POSTs a weight the same way", async () => {
    const { writes } = makeWrites();
    const now = new Date("2026-03-14T18:00:00.000Z");
    await expect(writes.logWeight(183.5, { now })).resolves.toBe("sent");
    const body = bodiesFor("/api/weight")[0]!;
    expect(body.weight).toBe(183.5);
    expect(body.date).toBe(dayFieldsFor(now).date);
  });

  it("a refusal is thrown to the caller and dropped from the queue", async () => {
    const { writes } = makeWrites();
    mockApiFetch.mockRejectedValue(new ApiError(400, { error: "Invalid date" }));
    await expect(writes.logMood(2)).rejects.toBeInstanceOf(ApiError);
    // Nothing to retry: a 400 answers the same way forever.
    expect(writes.pending()).toBe(0);
  });

  it("a 5xx is not an error to the member — it stays queued", async () => {
    const { writes } = makeWrites();
    mockApiFetch.mockRejectedValue(new ApiError(503, {}));
    await expect(writes.logMood(2)).resolves.toBe("queued");
    expect(writes.pending()).toBe(1);
  });
});

describe("offline writes — airplane mode", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ success: true });
  });

  it("does not even try while offline, and persists what it kept", async () => {
    const { writes, storage } = makeWrites({ online: false });
    await expect(writes.logMood(5)).resolves.toBe("queued");
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(writes.pending()).toBe(1);

    const raw = await storage.getItem(OFFLINE_WRITES_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  it("A QUEUED WRITE KEEPS ITS DAY ACROSS MIDNIGHT", async () => {
    const { writes, net } = makeWrites({ online: false });
    // 11:50pm local, the day before.
    const lateLastNight = new Date(2026, 2, 14, 23, 50, 0);
    await writes.logMood(3, { now: lateLastNight });
    await writes.logWeight(181, { now: lateLastNight });
    expect(mockApiFetch).not.toHaveBeenCalled();

    // …the signal comes back at 12:05am, on the NEXT local day.
    net.set(true);
    await writes.flush();

    const moodBody = bodiesFor("/api/mood")[0]!;
    const weightBody = bodiesFor("/api/weight")[0]!;
    expect(moodBody.date).toBe("2026-03-14");
    expect(weightBody.date).toBe("2026-03-14");
    // …and the instant they were logged travels too, so a value written on
    // another device SINCE wins server-side instead of being overwritten.
    expect(moodBody.loggedAt).toBe(lateLastNight.toISOString());
    expect(moodBody.tz).toBe(lateLastNight.getTimezoneOffset());
    expect(writes.pending()).toBe(0);
  });

  it("replays in the order the member logged them", async () => {
    const { writes, net } = makeWrites({ online: false });
    await writes.logMood(3);
    await writes.logWeight(181);
    net.set(true);
    await writes.flush();
    expect(mockApiFetch.mock.calls.map((c) => String(c[0]))).toEqual([
      "/api/mood",
      "/api/weight",
    ]);
  });

  it("two moods on one day replay as ONE write, the newer one", async () => {
    const { writes, net } = makeWrites({ online: false });
    const day = new Date(2026, 2, 14, 9, 0, 0);
    const later = new Date(2026, 2, 14, 21, 0, 0);
    await writes.logMood(2, { now: day });
    await writes.logMood(5, { now: later });
    expect(writes.pending()).toBe(1);

    net.set(true);
    await writes.flush();
    expect(bodiesFor("/api/mood")).toHaveLength(1);
    expect(bodiesFor("/api/mood")[0]!.mood).toBe(5);
    expect(bodiesFor("/api/mood")[0]!.loggedAt).toBe(later.toISOString());
  });

  it("two different days are two writes, each on its own day", async () => {
    const { writes, net } = makeWrites({ online: false });
    await writes.logWeight(181, { now: new Date(2026, 2, 13, 8, 0, 0) });
    await writes.logWeight(180, { now: new Date(2026, 2, 14, 8, 0, 0) });
    net.set(true);
    await writes.flush();
    expect(bodiesFor("/api/weight").map((b) => b.date)).toEqual([
      "2026-03-13",
      "2026-03-14",
    ]);
  });

  it("a reconnect replays on its own, with no screen involved", async () => {
    const { writes, net } = makeWrites({ online: false });
    await writes.start();
    await writes.logMood(4);
    expect(mockApiFetch).not.toHaveBeenCalled();

    net.set(true);
    // The queue schedules its reconnect flush on a timer; let it run.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(bodiesFor("/api/mood")).toHaveLength(1);
    expect(writes.pending()).toBe(0);
  });

  it("a cold start re-hydrates what the last launch could not send", async () => {
    const storage = createMemoryAsyncStorage();
    const first = makeWrites({ online: false, storage });
    await first.writes.logWeight(179, { now: new Date(2026, 2, 14, 7, 30, 0) });
    first.writes.stop();

    // A brand new process, the same disk.
    const second = makeWrites({ online: true, storage });
    await second.writes.start();
    await second.writes.flush();
    expect(bodiesFor("/api/weight")).toHaveLength(1);
    expect(bodiesFor("/api/weight")[0]!.date).toBe("2026-03-14");
  });
});

describe("offline writes — sign-out", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ success: true });
  });

  it("clear() forgets the queue in memory AND on disk", async () => {
    const { writes, storage, net } = makeWrites({ online: false });
    await writes.logMood(4);
    await writes.logWeight(180);
    expect(writes.pending()).toBe(2);

    await writes.clear();

    expect(writes.pending()).toBe(0);
    expect(await storage.getItem(OFFLINE_WRITES_STORAGE_KEY)).toBeNull();

    // And nothing is delivered when the connection returns.
    net.set(true);
    await writes.flush();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("a cleared queue stays cleared across a cold start", async () => {
    const storage = createMemoryAsyncStorage();
    const first = makeWrites({ online: false, storage });
    await first.writes.logMood(1);
    await first.writes.clear();

    const second = makeWrites({ online: true, storage });
    await second.writes.start();
    expect(second.writes.pending()).toBe(0);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
