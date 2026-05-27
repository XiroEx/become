import {
  createOfflineQueue,
  type OfflineQueueItem,
  type NetInfoLike,
} from "@/lib/query/offlineQueue";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";

const item = <T>(
  collection: OfflineQueueItem<T>["collection"],
  primaryKey: string,
  payload: T,
): OfflineQueueItem<T> => ({
  collection,
  primaryKey,
  timestamp: "2026-05-27T08:00:00Z",
  payload,
});

const syncSetT = ((fn: () => void) => {
  fn();
  return 0 as unknown as ReturnType<typeof setTimeout>;
}) as unknown as typeof setTimeout;

describe("createOfflineQueue", () => {
  it("enqueue + items reflects content", async () => {
    const q = createOfflineQueue<unknown>({
      flusher: async () => ({ ok: true }),
    });
    await q.enqueue(item("workout", "w1", { reps: 5 }));
    expect(q.size()).toBe(1);
    expect(q.items()[0]!.primaryKey).toBe("w1");
  });

  it("dedup by (collection, primaryKey): newer replaces older", async () => {
    const q = createOfflineQueue<unknown>({
      flusher: async () => ({ ok: true }),
    });
    await q.enqueue(item("workout", "w1", { v: 1 }));
    await q.enqueue(item("workout", "w1", { v: 99 }));
    expect(q.size()).toBe(1);
    expect(q.items()[0]!.payload).toEqual({ v: 99 });
  });

  it("dedup keys are scoped per collection", async () => {
    const q = createOfflineQueue<unknown>({
      flusher: async () => ({ ok: true }),
    });
    await q.enqueue(item("workout", "key", { v: 1 }));
    await q.enqueue(item("weight", "key", { v: 2 }));
    expect(q.size()).toBe(2);
  });

  it("flush calls flusher per item + removes successful items", async () => {
    const flusher = jest.fn(async () => ({ ok: true }));
    const q = createOfflineQueue<unknown>({
      flusher,
      setTimeoutImpl: syncSetT,
    });
    await q.enqueue(item("weight", "2026-05-27", { weight: 180 }));
    await q.enqueue(item("mood", "2026-05-27", { mood: 4 }));
    const result = await q.flush();
    expect(flusher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ flushed: 2, remaining: 0 });
  });

  it("flush leaves ok=false items in queue", async () => {
    const flusher = jest.fn(async (it: OfflineQueueItem<unknown>) => ({
      ok: it.primaryKey !== "fail",
    }));
    const q = createOfflineQueue<unknown>({
      flusher,
      setTimeoutImpl: syncSetT,
      maxRetries: 1,
    });
    await q.enqueue(item("weight", "ok", { v: 1 }));
    await q.enqueue(item("weight", "fail", { v: 2 }));
    const result = await q.flush();
    expect(result.flushed).toBe(1);
    expect(result.remaining).toBe(1);
    expect(q.items()[0]!.primaryKey).toBe("fail");
  });

  it("flush retries 5xx failures via exponential backoff", async () => {
    let attempts = 0;
    const flusher = jest.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("server 503");
      return { ok: true };
    });
    const q = createOfflineQueue<unknown>({
      flusher,
      setTimeoutImpl: syncSetT,
      maxRetries: 5,
      initialBackoffMs: 100,
      maxBackoffMs: 1000,
    });
    await q.enqueue(item("workout", "w1", { v: 1 }));
    const result = await q.flush();
    expect(flusher).toHaveBeenCalledTimes(3);
    expect(result.flushed).toBe(1);
    expect(result.attempts).toBe(3);
  });

  it("server response overwrites client payload (last-write-wins)", async () => {
    const onConfirmed = jest.fn();
    const q = createOfflineQueue<unknown>({
      flusher: async () => ({
        ok: true,
        serverPayload: { kcal: 600, fromServer: true },
      }),
      setTimeoutImpl: syncSetT,
      onConfirmed,
    });
    await q.enqueue(item("meal", "meal-1", { kcal: 500, fromServer: false }));
    await q.flush();
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    const confirmed = onConfirmed.mock.calls[0]![0];
    expect(confirmed.payload).toEqual({ kcal: 600, fromServer: true });
  });

  it("enqueue persists the queue to storage", async () => {
    const storage = createMemoryAsyncStorage();
    const q = createOfflineQueue<unknown>({
      flusher: async () => ({ ok: true }),
      storage,
    });
    await q.enqueue(item("workout", "w1", { v: 1 }));
    const raw = await storage.getItem("become.offline-queue.v1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual([
      expect.objectContaining({ primaryKey: "w1" }),
    ]);
  });

  it("rehydrate restores queue from storage on cold start", async () => {
    const storage = createMemoryAsyncStorage();
    // Seed storage with a snapshot from a 'previous run'
    await storage.setItem(
      "become.offline-queue.v1",
      JSON.stringify([
        {
          collection: "weight",
          primaryKey: "2026-05-27",
          timestamp: "2026-05-27T08:00:00Z",
          payload: { weight: 180 },
        },
      ]),
    );
    const q = createOfflineQueue<unknown>({
      flusher: async () => ({ ok: true }),
      storage,
    });
    expect(q.size()).toBe(0);
    await q.rehydrate();
    expect(q.size()).toBe(1);
    expect(q.items()[0]!.primaryKey).toBe("2026-05-27");
  });

  it("start() subscribes to NetInfo + flushes when isConnected reports true", async () => {
    let onlineListener: ((online: boolean) => void) | null = null;
    const netInfo: NetInfoLike = {
      isConnected: async () => true,
      subscribe: (listener) => {
        onlineListener = listener;
        return () => {
          onlineListener = null;
        };
      },
    };
    const flusher = jest.fn(async () => ({ ok: true }));
    const q = createOfflineQueue<unknown>({
      flusher,
      netInfo,
      setTimeoutImpl: syncSetT,
    });
    await q.enqueue(item("mood", "2026-05-27", { mood: 5 }));
    await q.start();
    // Yield so the auto-kicked flush resolves.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(flusher).toHaveBeenCalled();
    expect(onlineListener).not.toBeNull();
  });

  it("NetInfo 'came online' event triggers a flush", async () => {
    let listener: ((online: boolean) => void) | null = null;
    const netInfo: NetInfoLike = {
      isConnected: async () => false,
      subscribe: (l) => {
        listener = l;
        return () => {};
      },
    };
    const flusher = jest.fn(async () => ({ ok: true }));
    const q = createOfflineQueue<unknown>({
      flusher,
      netInfo,
      setTimeoutImpl: syncSetT,
    });
    await q.enqueue(item("workout", "w1", { v: 1 }));
    await q.start();
    expect(flusher).not.toHaveBeenCalled();
    // Simulate connection restored
    listener!(true);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(flusher).toHaveBeenCalled();
  });

  it("stop() unsubscribes from NetInfo", async () => {
    const unsubscribe = jest.fn();
    const netInfo: NetInfoLike = {
      isConnected: async () => false,
      subscribe: () => unsubscribe,
    };
    const q = createOfflineQueue<unknown>({
      flusher: async () => ({ ok: true }),
      netInfo,
    });
    await q.start();
    q.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
