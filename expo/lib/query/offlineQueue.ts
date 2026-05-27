import {
  createPersistor,
  type AsyncStorageLike,
  type Persistor,
} from "./persistor";

export type OfflineCollection = "workout" | "weight" | "mood" | "meal";

export interface OfflineQueueItem<T> {
  collection: OfflineCollection;
  /** Stable key for dedup within a collection (e.g. workoutId-setIdx, date). */
  primaryKey: string;
  /** When the client queued the write — informational, not part of the key. */
  timestamp: string;
  payload: T;
}

export interface NetInfoLike {
  isConnected: () => Promise<boolean>;
  subscribe: (listener: (online: boolean) => void) => () => void;
}

export interface FlushResult<T> {
  /** True ⇒ remove from queue; false ⇒ leave in queue for retry. */
  ok: boolean;
  /** Server's canonical record — overrides the client payload (last-write-wins). */
  serverPayload?: T;
}

export interface OfflineQueueOptions<T> {
  /** POSTs the item to the backend. Should resolve with FlushResult or throw. */
  flusher: (item: OfflineQueueItem<T>) => Promise<FlushResult<T>>;
  storage?: AsyncStorageLike;
  storageKey?: string;
  netInfo?: NetInfoLike;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  maxRetries?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  /** Optional listener: fired after server response (with serverPayload merged in). */
  onConfirmed?: (item: OfflineQueueItem<T>) => void;
}

export interface OfflineQueue<T> {
  enqueue: (item: OfflineQueueItem<T>) => Promise<void>;
  flush: () => Promise<{ flushed: number; remaining: number; attempts: number }>;
  start: () => Promise<void>;
  stop: () => void;
  size: () => number;
  items: () => OfflineQueueItem<T>[];
  /** Re-hydrate from storage. Called automatically by start(). */
  rehydrate: () => Promise<void>;
}

const DEFAULT_KEY = "become.offline-queue.v1";

function itemKey<T>(item: OfflineQueueItem<T>): string {
  return `${item.collection}:${item.primaryKey}`;
}

export function createOfflineQueue<T>(
  opts: OfflineQueueOptions<T>,
): OfflineQueue<T> {
  let queue: OfflineQueueItem<T>[] = [];
  const persistor: Persistor<OfflineQueueItem<T>[]> | null = opts.storage
    ? createPersistor<OfflineQueueItem<T>[]>(
        opts.storage,
        opts.storageKey ?? DEFAULT_KEY,
      )
    : null;
  const setT = opts.setTimeoutImpl ?? setTimeout;
  const clearT = opts.clearTimeoutImpl ?? clearTimeout;
  const initial = opts.initialBackoffMs ?? 1000;
  const max = opts.maxBackoffMs ?? 30000;
  const maxRetries = opts.maxRetries ?? 3;
  let unsubscribe: (() => void) | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  async function persist(): Promise<void> {
    if (persistor) await persistor.save(queue);
  }

  async function enqueue(item: OfflineQueueItem<T>): Promise<void> {
    const key = itemKey(item);
    queue = queue.filter((q) => itemKey(q) !== key);
    queue.push(item);
    await persist();
  }

  async function flush(): Promise<{
    flushed: number;
    remaining: number;
    attempts: number;
  }> {
    let flushed = 0;
    let attempts = 0;
    let backoff = initial;
    for (let pass = 0; pass < maxRetries; pass++) {
      if (queue.length === 0) break;
      attempts += 1;
      const snapshot = [...queue];
      const failed: OfflineQueueItem<T>[] = [];
      for (const item of snapshot) {
        try {
          const result = await opts.flusher(item);
          if (result.ok) {
            flushed += 1;
            const confirmed: OfflineQueueItem<T> = result.serverPayload !== undefined
              ? { ...item, payload: result.serverPayload }
              : item;
            opts.onConfirmed?.(confirmed);
          } else {
            failed.push(item);
          }
        } catch {
          failed.push(item);
        }
      }
      // Drop snapshot items from queue (they've been processed); only items
      // enqueued DURING the flush pass remain. Then re-add failures unless
      // a newer write with the same key arrived mid-flush (dedup wins).
      const snapshotKeys = new Set(snapshot.map(itemKey));
      queue = queue.filter((q) => !snapshotKeys.has(itemKey(q)));
      const midFlushKeys = new Set(queue.map(itemKey));
      for (const f of failed) {
        if (!midFlushKeys.has(itemKey(f))) queue.push(f);
      }
      if (failed.length === 0) break;
      // Wait before next pass.
      await new Promise<void>((resolve) => setT(resolve, backoff));
      backoff = Math.min(backoff * 2, max);
    }
    await persist();
    return { flushed, remaining: queue.length, attempts };
  }

  async function rehydrate(): Promise<void> {
    if (!persistor) return;
    const stored = await persistor.load();
    if (stored) queue = stored;
  }

  async function start(): Promise<void> {
    await rehydrate();
    if (opts.netInfo) {
      unsubscribe = opts.netInfo.subscribe((online) => {
        if (online) {
          if (pendingTimer) clearT(pendingTimer);
          pendingTimer = setT(() => {
            void flush();
          }, 0);
        }
      });
      // Kick off an initial flush if we're already online.
      if (await opts.netInfo.isConnected()) {
        void flush();
      }
    }
  }

  function stop(): void {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (pendingTimer) {
      clearT(pendingTimer);
      pendingTimer = null;
    }
  }

  return {
    enqueue,
    flush,
    start,
    stop,
    rehydrate,
    size: () => queue.length,
    items: () => [...queue],
  };
}
