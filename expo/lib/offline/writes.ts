/**
 * ─── THE OFFLINE WRITE QUEUE, MOUNTED ────────────────────────────────────────
 *
 * `lib/query/offlineQueue.ts` (de-dup, backoff, reconnect, a persisted
 * snapshot) was written and tested months ago and had no consumer. This file is
 * the consumer: every weight and every mood the member logs goes through it,
 * online or not.
 *
 * THE RULE THAT MAKES IT SAFE: A QUEUED WRITE KEEPS ITS OWN DAY.
 *
 * The server dates a write by ITS clock unless the body says otherwise, so a
 * mood logged at 11:50pm and delivered at 12:05am would land on tomorrow — the
 * member would see an empty yesterday and a mood they did not feel today.
 * NP-189 taught `/api/mood` and `/api/weight` to read `date` (the local day,
 * `YYYY-MM-DD`) and `loggedAt` (the instant) off the body, so the payload is
 * built AT THE MOMENT THE MEMBER TAPS and is never rebuilt at delivery:
 *
 *   date     — the local calendar day it was logged on; the entry's day, for
 *              good, however long it waits in the queue
 *   loggedAt — when they logged it, so a replay that arrives after a NEWER
 *              value for the same day loses to it server-side
 *              (`webapp/lib/dayWindow.ts#isStaleReplay`) instead of
 *              overwriting it
 *   tz       — minutes WEST of UTC as of the tap, so the server resolves that
 *              day in the zone the member was in, not the one they woke up in
 *
 * The queue's de-dup key is the local day, which is also the server's unit —
 * both routes keep one entry per local day — so replaying can add a day, never
 * a duplicate of one.
 *
 * WHAT IS AND IS NOT AN ERROR. An unreachable server is not one any more: the
 * write is kept and the member is told by the banner, not by a red message.
 * A REFUSAL is (a 400 for a malformed day, a 403, a 404): retrying cannot
 * change it, so the item is dropped and the caller is told. 5xx and network
 * failures stay queued.
 */
import { z } from "zod";
import {
  ApiError,
  apiFetch,
  LogWeightResponseSchema,
  LogMoodResponseSchema,
  type ApiCallInit,
  type ApiFetchOptions,
  type LogWeightResponse,
  type LogMoodResponse,
} from "@become/api-client";
import {
  createOfflineQueue,
  type OfflineCollection,
  type OfflineQueue,
  type OfflineQueueItem,
} from "@/lib/query/offlineQueue";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { sessionStore, type TokenStore } from "@/lib/auth/secureStoreToken";
import {
  localDateKey,
  tzBodyFields,
  tzOffsetMinutes,
} from "@/lib/nutrition/localDay";
import { reportRequestError } from "@/lib/auth/unauthorized";
import {
  netInfoConnectivity,
  type ConnectivitySource,
} from "@/lib/offline/connectivity";
import { deviceStorage } from "@/lib/offline/storage";

export type MoodValue = 1 | 2 | 3 | 4 | 5;

/** The fields every queued day-entry carries, fixed at the moment of the tap. */
export interface QueuedDayFields {
  /** The LOCAL day the member logged on (`YYYY-MM-DD`). Never recomputed. */
  date: string;
  /** When they logged it, ISO-8601. The server's last-write-wins tiebreak. */
  loggedAt: string;
  /** Minutes WEST of UTC at the tap. Omitted when the clock is unusable. */
  tz?: number;
}

export type QueuedWeightWrite = QueuedDayFields & { weight: number };
export type QueuedMoodWrite = QueuedDayFields & { mood: MoodValue };
export type QueuedWrite = QueuedWeightWrite | QueuedMoodWrite;

/** What happened to a write the member just made. */
export type OfflineWriteStatus =
  /** It reached the server. */
  | "sent"
  /** It is on disk and will be replayed — offline, or the server was down. */
  | "queued";

export interface LogWeightOptions {
  now?: Date;
  onResponse?: (response: LogWeightResponse) => void;
}

export interface LogMoodOptions {
  now?: Date;
  onResponse?: (response: LogMoodResponse) => void;
}

export interface OfflineWrites {
  logWeight: (
    weightLbs: number,
    opts?: LogWeightOptions,
  ) => Promise<OfflineWriteStatus>;
  logMood: (mood: MoodValue, opts?: LogMoodOptions) => Promise<OfflineWriteStatus>;
  getLastWeightResponse: () => LogWeightResponse | null;
  getLastMoodResponse: () => LogMoodResponse | null;
  /** Re-hydrate the snapshot, subscribe to reconnect, flush if already online. */
  start: () => Promise<void>;
  stop: () => void;
  /** Sign-out: forget every pending write, in memory and on disk. */
  clear: () => Promise<void>;
  /** How many writes are waiting. */
  pending: () => number;
  /** Replay now (a reconnect does this on its own). */
  flush: () => Promise<void>;
  queue: OfflineQueue<QueuedWrite>;
}

export interface OfflineWritesDeps {
  storage?: AsyncStorageLike;
  storageKey?: string;
  connectivity?: ConnectivitySource;
  tokenStore?: TokenStore;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Retry passes inside ONE flush. A reconnect starts a fresh flush anyway. */
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

/**
 * Its own key, at v1. The queue's default (`become.offline-queue.v1`) is left
 * for the four-collection façade in `lib/query/offlineMutations.ts`, which
 * NP-191 mounts for live-workout saves — two queues must not share a snapshot.
 */
export const OFFLINE_WRITES_STORAGE_KEY = "become.offline-writes.v1";

const WRITE_PATHS: Record<"weight" | "mood", string> = {
  weight: "/api/weight",
  mood: "/api/mood",
};

/**
 * The server answers these with `{ success, date, applied, … }`; nothing here
 * depends on the shape, and a schema that did would turn a perfectly good write
 * into a retry the day a field is added.
 */
const AckSchema = z.unknown();

/**
 * Will retrying ever help? A refusal (4xx) is the server's final answer, so
 * the item is dropped and the caller told. 408/425/429 are the three 4xx that
 * mean "not now" rather than "no", and 5xx/network failures are always kept.
 */
export function isPermanentRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const status = error.status;
  if (status === 408 || status === 425 || status === 429) return false;
  return status >= 400 && status < 500;
}

/** The day fields for a write made NOW, on this device, in this zone. */
export function dayFieldsFor(now: Date = new Date()): QueuedDayFields {
  return {
    date: localDateKey(now),
    loggedAt: now.toISOString(),
    ...tzBodyFields(tzOffsetMinutes(now)),
  };
}

function keyOf(item: { collection: OfflineCollection; primaryKey: string }): string {
  return `${item.collection}:${item.primaryKey}`;
}

export function createOfflineWrites(deps: OfflineWritesDeps = {}): OfflineWrites {
  const connectivity = deps.connectivity ?? netInfoConnectivity;
  const tokenStore = deps.tokenStore ?? sessionStore;
  const baseUrl = deps.baseUrl ?? WEBAPP_BASE_URL;

  /** Refusals seen during the CURRENT flush, by item key, for the caller. */
  const refusals = new Map<string, unknown>();
  /** Item keys the current flush actually tried. */
  const attempted = new Set<string>();

  let lastWeightResponse: LogWeightResponse | null = null;
  let lastMoodResponse: LogMoodResponse | null = null;

  const flusher = async (
    item: OfflineQueueItem<QueuedWrite>,
  ): Promise<{ ok: boolean }> => {
    const path = WRITE_PATHS[item.collection as "weight" | "mood"];
    if (!path) {
      // Not ours. Keep it rather than post a workout to /api/mood — the queue
      // that owns it (NP-191) will find it.
      return { ok: false };
    }
    attempted.add(keyOf(item));
    // The JWT comes from the store, not from a screen: a replay fires on
    // reconnect, which may be minutes after the screen that queued the write
    // was unmounted — and it is never persisted beside the payload.
    const token = await tokenStore.get().catch(() => null);
    if (!token) return { ok: false };
    try {
      const init: ApiCallInit & ApiFetchOptions = {
        method: "POST",
        body: item.payload,
        baseUrl,
        getToken: () => token,
      };
      if (deps.fetchImpl !== undefined) init.fetchImpl = deps.fetchImpl;

      const schema =
        item.collection === "weight"
          ? LogWeightResponseSchema
          : item.collection === "mood"
            ? LogMoodResponseSchema
            : AckSchema;

      let res: unknown;
      try {
        res = await apiFetch(path, schema, init);
      } catch (parseError) {
        if (parseError instanceof ApiError) throw parseError;
        res = await apiFetch(path, AckSchema, init);
      }

      if (item.collection === "weight" && res && typeof res === "object") {
        lastWeightResponse = res as LogWeightResponse;
      } else if (item.collection === "mood" && res && typeof res === "object") {
        lastMoodResponse = res as LogMoodResponse;
      }

      return { ok: true };
    } catch (error) {
      // One place decides what a 401 means; this only reports it.
      reportRequestError(error);
      if (isPermanentRefusal(error)) {
        refusals.set(keyOf(item), error);
        return { ok: true };
      }
      return { ok: false };
    }
  };

  // NO `netInfo` HERE, DELIBERATELY. The queue can subscribe to reconnect
  // itself, but its flush would then run beside the one a member's tap starts,
  // and the same item would be posted twice. The subscription lives in
  // `start()` below instead, so every replay — reconnect, launch or tap — goes
  // through the one guarded path.
  const queue = createOfflineQueue<QueuedWrite>({
    flusher,
    storage: deps.storage ?? deviceStorage,
    storageKey: deps.storageKey ?? OFFLINE_WRITES_STORAGE_KEY,
    maxRetries: deps.maxRetries ?? 2,
    initialBackoffMs: deps.initialBackoffMs ?? 500,
    maxBackoffMs: deps.maxBackoffMs ?? 30_000,
  });

  /** One flush at a time; a second caller joins the one already running. */
  let inFlight: Promise<unknown> | null = null;
  function flushOnce(): Promise<unknown> {
    if (!inFlight) {
      // Both maps describe THIS pass, so they start empty and cannot grow
      // without bound across a long-lived process.
      refusals.clear();
      attempted.clear();
      inFlight = queue.flush().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  let unsubscribe: (() => void) | null = null;

  async function submit(
    collection: "weight" | "mood",
    payload: QueuedWrite,
  ): Promise<OfflineWriteStatus> {
    const key = `${collection}:${payload.date}`;
    refusals.delete(key);
    // De-dup is (collection, local day) — the server's own unit, one entry per
    // day — so a second weigh-in today replaces the pending first rather than
    // queueing a write that would only overwrite it.
    await queue.enqueue({
      collection,
      primaryKey: payload.date,
      timestamp: payload.loggedAt,
      payload,
    });

    // Don't make the member wait on a request that cannot leave the device.
    const online = await connectivity.isConnected().catch(() => true);
    if (!online) return "queued";

    await flushOnce();
    // A flush already running when we enqueued works from a snapshot taken
    // before this write existed, so it never tried it. One more pass — which
    // is now ours — rather than telling a member on wifi it was only saved
    // locally.
    if (!attempted.has(key) && queue.items().some((i) => keyOf(i) === key)) {
      await flushOnce();
    }

    const refusal = refusals.get(key);
    if (refusal !== undefined) {
      refusals.delete(key);
      throw refusal;
    }
    const stillQueued = queue.items().some((item) => keyOf(item) === key);
    return stillQueued ? "queued" : "sent";
  }

  return {
    queue,
    async logWeight(weightLbs, opts): Promise<OfflineWriteStatus> {
      const fields = dayFieldsFor(opts?.now);
      const status = await submit("weight", { ...fields, weight: weightLbs });
      if (status === "sent" && lastWeightResponse && opts?.onResponse) {
        opts.onResponse(lastWeightResponse);
      }
      return status;
    },
    async logMood(mood, opts): Promise<OfflineWriteStatus> {
      const fields = dayFieldsFor(opts?.now);
      const status = await submit("mood", { ...fields, mood });
      if (status === "sent" && lastMoodResponse && opts?.onResponse) {
        opts.onResponse(lastMoodResponse);
      }
      return status;
    },
    getLastWeightResponse: () => lastWeightResponse,
    getLastMoodResponse: () => lastMoodResponse,
    /**
     * Read back what the last launch could not send, then watch for the
     * connection coming back. Called once, from the root
     * (`components/offline/ConnectivityBanner.tsx`).
     */
    start: async (): Promise<void> => {
      await queue.rehydrate();
      if (!unsubscribe) {
        unsubscribe = connectivity.subscribe((online) => {
          if (online) void flushOnce();
        });
      }
      const online = await connectivity.isConnected().catch(() => false);
      if (online && queue.size() > 0) await flushOnce();
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = null;
      queue.stop();
    },
    clear: async (): Promise<void> => {
      refusals.clear();
      lastWeightResponse = null;
      lastMoodResponse = null;
      await queue.clear();
    },
    pending: () => queue.size(),
    flush: async (): Promise<void> => {
      await flushOnce();
    },
  };
}

// ─── The app's one queue ─────────────────────────────────────────────────────
//
// A queue per screen would be a queue per copy of the pending writes, and the
// one that replays on reconnect is whichever screen happens to be mounted. So
// there is one, created on first use, exactly as the session is.

let singleton: OfflineWrites | null = null;

export function getOfflineWrites(): OfflineWrites {
  if (!singleton) singleton = createOfflineWrites();
  return singleton;
}

/** Drops the singleton. Tests only — nothing in the app resets the queue. */
export function resetOfflineWritesForTest(): void {
  singleton?.stop();
  singleton = null;
}
