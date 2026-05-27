/**
 * Per-collection convenience helpers built on top of `createOfflineQueue`.
 * P18 ships the four offline-first mutation entry points: workout, weight,
 * mood, meal log. Callers (screens / hooks) call these from event handlers
 * and the queue takes care of dedup + persistence + reconnect flush.
 */
import {
  createOfflineQueue,
  type FlushResult,
  type OfflineCollection,
  type OfflineQueue,
  type OfflineQueueItem,
  type OfflineQueueOptions,
} from "./offlineQueue";

export interface CollectionFlusher<T> {
  (item: OfflineQueueItem<T>): Promise<FlushResult<T>>;
}

export interface BuildOfflineMutationsInput {
  flushers: {
    workout: CollectionFlusher<unknown>;
    weight: CollectionFlusher<unknown>;
    mood: CollectionFlusher<unknown>;
    meal: CollectionFlusher<unknown>;
  };
  // Shared queue infra
  storage?: OfflineQueueOptions<unknown>["storage"];
  storageKey?: string;
  netInfo?: OfflineQueueOptions<unknown>["netInfo"];
  onConfirmed?: OfflineQueueOptions<unknown>["onConfirmed"];
}

export interface OfflineMutations {
  queue: OfflineQueue<unknown>;
  saveWorkout: (primaryKey: string, payload: unknown) => Promise<void>;
  logWeight: (date: string, payload: unknown) => Promise<void>;
  logMood: (date: string, payload: unknown) => Promise<void>;
  logMeal: (mealId: string, payload: unknown) => Promise<void>;
}

export function buildOfflineMutations(
  input: BuildOfflineMutationsInput,
): OfflineMutations {
  const flushByCollection = (
    item: OfflineQueueItem<unknown>,
  ): Promise<FlushResult<unknown>> => {
    return input.flushers[item.collection](item);
  };
  const queueOpts: OfflineQueueOptions<unknown> = {
    flusher: flushByCollection,
  };
  if (input.storage !== undefined) queueOpts.storage = input.storage;
  if (input.storageKey !== undefined) queueOpts.storageKey = input.storageKey;
  if (input.netInfo !== undefined) queueOpts.netInfo = input.netInfo;
  if (input.onConfirmed !== undefined) queueOpts.onConfirmed = input.onConfirmed;
  const queue = createOfflineQueue<unknown>(queueOpts);

  function makeEnqueuer(collection: OfflineCollection) {
    return async (primaryKey: string, payload: unknown): Promise<void> => {
      await queue.enqueue({
        collection,
        primaryKey,
        timestamp: new Date().toISOString(),
        payload,
      });
    };
  }

  return {
    queue,
    saveWorkout: makeEnqueuer("workout"),
    logWeight: makeEnqueuer("weight"),
    logMood: makeEnqueuer("mood"),
    logMeal: makeEnqueuer("meal"),
  };
}
