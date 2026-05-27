/**
 * On-device save queue for live-workout writes (set-complete, set-update,
 * etc). Buffers items that fail to send (offline / 5xx) and re-flushes when
 * the consumer signals reconnect.
 *
 * Dedup semantics: `key` collapses prior queued items with the same key, so
 * the latest payload for a (workout, exercise, set) tuple replaces any
 * pending earlier write — no double-saves on a brief blip then reconnect.
 */
export interface QueuedItem<T> {
  /** Stable key for dedup. e.g. `set:<workoutId>:<exSlug>:<setIdx>`. */
  key: string;
  payload: T;
}

export interface SaveQueueOptions<T> {
  /** Returns true on success, false to keep queued for retry. May throw. */
  flusher: (item: QueuedItem<T>) => Promise<boolean>;
  initial?: QueuedItem<T>[];
}

export interface SaveQueue<T> {
  enqueue: (item: QueuedItem<T>) => void;
  flush: () => Promise<{ flushed: number; remaining: number }>;
  size: () => number;
  items: () => QueuedItem<T>[];
  clear: () => void;
}

export function createSaveQueue<T>(opts: SaveQueueOptions<T>): SaveQueue<T> {
  let queue: QueuedItem<T>[] = [...(opts.initial ?? [])];

  return {
    enqueue(item) {
      queue = queue.filter((q) => q.key !== item.key);
      queue.push(item);
    },
    async flush() {
      const failed: QueuedItem<T>[] = [];
      let flushed = 0;
      // Snapshot the current queue so concurrent enqueue() calls don't
      // double-fire during a flush pass.
      const snapshot = [...queue];
      queue = [];
      for (const item of snapshot) {
        try {
          const ok = await opts.flusher(item);
          if (ok) flushed += 1;
          else failed.push(item);
        } catch {
          failed.push(item);
        }
      }
      // Anything enqueued during the flush pass is preserved, with failed
      // items re-added (dedup is by key so re-adds collapse with newer
      // pending writes).
      const seenKeys = new Set(queue.map((q) => q.key));
      for (const item of failed) {
        if (!seenKeys.has(item.key)) queue.push(item);
      }
      return { flushed, remaining: queue.length };
    },
    size: () => queue.length,
    items: () => [...queue],
    clear: () => {
      queue = [];
    },
  };
}
