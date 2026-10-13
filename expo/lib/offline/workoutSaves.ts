/**
 * ─── THE OFFLINE LIVE-WORKOUT SAVE QUEUE (NP-191) ────────────────────────────
 *
 * The live workout's own saves — every autosave AND the completing save — go
 * through this queue, online or not. It is the workout half of the offline
 * story: NP-190's queue (`lib/offline/writes.ts`) carries weight and mood
 * only, and NP-079's draft (`lib/live/liveWorkoutCache.ts`) keeps the grid on
 * the phone but never sends it. Without this file, a workout logged with no
 * signal is saved nowhere the server can see, and each ticket left it to the
 * other.
 *
 * THE RULES THAT TRAVEL WITH EVERY ITEM:
 *
 *   one log per attempt — every save of one attempt carries the same
 *     `attemptId` (NP-139, minted once per attempt and restored from the
 *     draft after a kill), so a replay after a crash or after local midnight
 *     rewrites the attempt's own log instead of inserting a second one;
 *   the completing save's day is the one the member chose — the payload is
 *     built AT THE MOMENT THE MEMBER TAPS (including `performedAt` from the
 *     day choice, NP-085) and is never rebuilt at delivery, so a replay that
 *     arrives after midnight still lands on the chosen day;
 *   a replay never repeats completion side effects — the server matches by
 *     `attemptId` before any window rule and runs the completion effects
 *     exactly once per attempt, so the client only has to send the same body
 *     again. The client-side effects (mind-session invalidation, draft
 *     clearing, health mirror, PR/streak banners) therefore run ONLY on the
 *     save that actually reached the server, never on an enqueue.
 *
 * QUEUE SHAPE. One item per attempt (`collection: "workout"`,
 * `primaryKey: attemptId`): an autosave replaces the pending autosave, and a
 * completing save replaces whatever is pending — replaying can rewrite a log,
 * never duplicate one. Autosaves and the completing save replay IN ORDER
 * (enqueue order), so the completing save is always delivered last.
 *
 * WHAT IS AND IS NOT AN ERROR. An unreachable server is not one: the save is
 * kept and the member is told by the "saved on this phone, will sync" state,
 * not by a red message. A REFUSAL is (a 400 for a malformed body, a 403, a
 * 404): retrying cannot change it, so the item is dropped and the caller is
 * told. 5xx and network failures stay queued. A 401 is reported to the one
 * place that turns it into a sign-out (`lib/auth/unauthorized.ts`).
 */
import {
  ApiError,
  apiFetch,
  WorkoutSaveResponseSchema,
  type ApiCallInit,
  type ApiFetchOptions,
  type WorkoutProgramSaveRequest,
  type WorkoutSaveResponse,
} from "@become/api-client";
import {
  createOfflineQueue,
  type OfflineQueue,
  type OfflineQueueItem,
} from "@/lib/query/offlineQueue";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { sessionStore, type TokenStore } from "@/lib/auth/secureStoreToken";
import { reportRequestError } from "@/lib/auth/unauthorized";
import {
  netInfoConnectivity,
  type ConnectivitySource,
} from "@/lib/offline/connectivity";
import { deviceStorage } from "@/lib/offline/storage";

/** The payload is the POST /api/workouts body, fixed at the moment of the tap. */
export type QueuedWorkoutSave = WorkoutProgramSaveRequest;

/**
 * Its own key, at v1. The weight/mood queue (`become.offline-writes.v1`) and
 * the four-collection façade's default (`become.offline-queue.v1`) are left
 * alone — three queues must not share a snapshot.
 */
export const WORKOUT_SAVE_QUEUE_STORAGE_KEY = "become.workout-saves.v1";

/** What happened to a save the member just made. */
export type WorkoutSaveStatus =
  /** It reached the server. */
  | "sent"
  /** It is on disk and will be replayed — offline, or the server was down. */
  | "queued";

export interface SaveWorkoutInput {
  /** The POST /api/workouts body, built at the moment of the tap. */
  payload: QueuedWorkoutSave;
  /** This attempt's id — the queue's dedup key (one log per attempt). */
  attemptId: string;
}

export interface WorkoutSaveQueueDeps {
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

export interface WorkoutSaveQueue {
  saveWorkout: (input: SaveWorkoutInput) => Promise<WorkoutSaveStatus>;
  getLastResponse: () => WorkoutSaveResponse | null;
  /** Re-hydrate the snapshot, subscribe to reconnect, flush if already online. */
  start: () => Promise<void>;
  stop: () => void;
  /** Sign-out: forget every pending save, in memory and on disk. */
  clear: () => Promise<void>;
  /** How many saves are waiting. */
  pending: () => number;
  /** Replay now (a reconnect does this on its own). */
  flush: () => Promise<void>;
  queue: OfflineQueue<QueuedWorkoutSave>;
}

/**
 * Will retrying ever help? A refusal (4xx) is the server's final answer, so
 * the item is dropped and the caller told. 408/425/429 are the three 4xx that
 * mean "not now" rather than "no", and 5xx/network failures are always kept.
 */
export function isPermanentWorkoutRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const status = error.status;
  if (status === 408 || status === 425 || status === 429) return false;
  return status >= 400 && status < 500;
}

function keyOf(item: OfflineQueueItem<QueuedWorkoutSave>): string {
  return `${item.collection}:${item.primaryKey}`;
}

export function createWorkoutSaveQueue(
  deps: WorkoutSaveQueueDeps = {},
): WorkoutSaveQueue {
  const connectivity = deps.connectivity ?? netInfoConnectivity;
  const tokenStore = deps.tokenStore ?? sessionStore;
  const baseUrl = deps.baseUrl ?? WEBAPP_BASE_URL;

  /** Refusals seen during the CURRENT flush, by item key, for the caller. */
  const refusals = new Map<string, unknown>();
  /** Item keys the current flush actually tried. */
  const attempted = new Set<string>();

  let lastResponse: WorkoutSaveResponse | null = null;

  const flusher = async (
    item: OfflineQueueItem<QueuedWorkoutSave>,
  ): Promise<{ ok: boolean }> => {
    if (item.collection !== "workout") {
      // Not ours. Keep it rather than post a mood to /api/workouts — the
      // queue that owns it will find it.
      return { ok: false };
    }
    attempted.add(keyOf(item));
    // The JWT comes from the store, not from a screen: a replay fires on
    // reconnect, which may be minutes after the screen that queued the save
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

      const res = await apiFetch("/api/workouts", WorkoutSaveResponseSchema, init);
      lastResponse = res;
      return { ok: true };
    } catch (error) {
      // One place decides what a 401 means; this only reports it.
      reportRequestError(error);
      if (isPermanentWorkoutRefusal(error)) {
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
  const queue = createOfflineQueue<QueuedWorkoutSave>({
    flusher,
    storage: deps.storage ?? deviceStorage,
    storageKey: deps.storageKey ?? WORKOUT_SAVE_QUEUE_STORAGE_KEY,
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

  async function submit(input: SaveWorkoutInput): Promise<WorkoutSaveStatus> {
    const key = `workout:${input.attemptId}`;
    refusals.delete(key);
    // De-dup is (workout, attemptId) — the server's own unit, one log per
    // attempt — so a later save of the same attempt replaces the pending one
    // rather than queueing a write that would only overwrite it. The
    // completing save therefore always supersedes a pending autosave, and a
    // replay can rewrite a log but never duplicate one.
    await queue.enqueue({
      collection: "workout",
      primaryKey: input.attemptId,
      timestamp: new Date().toISOString(),
      payload: input.payload,
    });

    // Don't make the member wait on a request that cannot leave the device.
    const online = await connectivity.isConnected().catch(() => true);
    if (!online) return "queued";

    await flushOnce();
    // A flush already running when we enqueued works from a snapshot taken
    // before this save existed, so it never tried it. One more pass — which
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
    async saveWorkout(input): Promise<WorkoutSaveStatus> {
      return submit(input);
    },
    getLastResponse: () => lastResponse,
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
      lastResponse = null;
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
// A queue per screen would be a queue per copy of the pending saves, and the
// one that replays on reconnect is whichever screen happens to be mounted. So
// there is one, created on first use, exactly as the session is.

let singleton: WorkoutSaveQueue | null = null;

export function getWorkoutSaveQueue(): WorkoutSaveQueue {
  if (!singleton) singleton = createWorkoutSaveQueue();
  return singleton;
}

/** Drops the singleton. Tests only — nothing in the app resets the queue. */
export function resetWorkoutSaveQueueForTest(): void {
  singleton?.stop();
  singleton = null;
}
