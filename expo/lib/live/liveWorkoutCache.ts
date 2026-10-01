import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * On-device persistence for an in-flight live workout. The grid of logged sets
 * is mirrored to AsyncStorage so a backgrounded app / network blip / accidental
 * navigation away doesn't lose sets the user already entered — re-entering the
 * screen restores exactly where they left off.
 */

/** A single logged set (structurally identical to LiveSetRow's LiveSetState). */
export interface LiveSetSnapshot {
  reps: number | null;
  weight: number | null;
  completed: boolean;
  /** Optional, for duration/distance tracking types (inputs land later). */
  durationSec?: number | null;
  distance?: number | null;
}

/** exerciseSlug → ordered set snapshots. */
export type LiveWorkoutSnapshot = Record<string, LiveSetSnapshot[]>;

/** Local draft metadata stored alongside snapshot. */
export interface LiveWorkoutDraft {
  savedAt: number;
  grid: LiveWorkoutSnapshot;
  activeSeconds?: number;
  attemptId?: string;
}

/**
 * Checks if a live workout grid has any actual progress (typed values or completed sets).
 */
export function hasWorkoutProgress(grid: LiveWorkoutSnapshot): boolean {
  if (!grid || typeof grid !== "object") return false;
  return Object.values(grid).some(
    (sets) =>
      Array.isArray(sets) &&
      sets.some(
        (s) =>
          Boolean(s?.completed) ||
          s?.reps != null ||
          s?.weight != null ||
          s?.durationSec != null ||
          s?.distance != null,
      ),
  );
}

/**
 * Pure state-machine transition: replace one set in the grid, returning a new
 * grid (no mutation). Generic over the set shape so it works for both the cache
 * snapshot and the presentational LiveSetState.\n */
export function applySetUpdate<S>(
  grid: Record<string, S[]>,
  slug: string,
  setIndex: number,
  next: S,
): Record<string, S[]> {
  const cur = grid[slug] ? [...grid[slug]!] : [];
  cur[setIndex] = next;
  return { ...grid, [slug]: cur };
}

/** Stable cache key for a (program, phase, workout) tuple. */
export function liveCacheKey(
  programId: string,
  workoutIndex: number | string,
  phaseIndex: number | string = 0,
): string {
  const sanitize = (val: string | number) =>
    String(val).trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return `become.live.${sanitize(programId)}.${sanitize(phaseIndex)}.${sanitize(workoutIndex)}`;
}

/**
 * Minimal key/value contract — DI-friendly so unit tests pass an in-memory
 * store and avoid the native AsyncStorage module.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Default store backed by @react-native-async-storage/async-storage. */
export const asyncStorageKeyValueStore: KeyValueStore = {
  async get(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Non-blocking
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Non-blocking
    }
  },
};

/** In-memory store for tests / fallback. */
export function createMemoryKeyValueStore(
  initial?: Record<string, string>,
): KeyValueStore {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    async get(key: string): Promise<string | null> {
      return map.has(key) ? map.get(key)! : null;
    },
    async set(key: string, value: string): Promise<void> {
      map.set(key, value);
    },
    async remove(key: string): Promise<void> {
      map.delete(key);
    },
  };
}

export const LIVE_WORKOUT_TRACKER_KEY = "become.live._keys";

async function getTrackedLiveKeys(store: KeyValueStore): Promise<string[]> {
  try {
    const raw = await store.get(LIVE_WORKOUT_TRACKER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

async function addTrackedLiveKey(store: KeyValueStore, key: string): Promise<void> {
  try {
    const keys = await getTrackedLiveKeys(store);
    if (!keys.includes(key)) {
      keys.push(key);
      await store.set(LIVE_WORKOUT_TRACKER_KEY, JSON.stringify(keys));
    }
  } catch {
    // Non-blocking
  }
}

async function removeTrackedLiveKey(store: KeyValueStore, key: string): Promise<void> {
  try {
    const keys = await getTrackedLiveKeys(store);
    const next = keys.filter((k) => k !== key);
    if (next.length !== keys.length) {
      await store.set(LIVE_WORKOUT_TRACKER_KEY, JSON.stringify(next));
    }
  } catch {
    // Non-blocking
  }
}

/** Wipes all tracked live workout draft snapshots in the store. */
export async function clearAllLiveWorkoutDrafts(
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<void> {
  try {
    const keys = await getTrackedLiveKeys(store);
    await Promise.all(keys.map((k) => store.remove(k).catch(() => {})));
    await store.remove(LIVE_WORKOUT_TRACKER_KEY).catch(() => {});
  } catch {
    // Non-blocking
  }
}

export interface LoadDraftOptions {
  /** Maximum age of draft in milliseconds. Defaults to 24h (86_400_000 ms) when checking freshness. */
  maxAgeMs?: number;
  /** Whether to require at least one set with progress (reps/weight/completed/etc). */
  requireProgress?: boolean;
  /** Current timestamp (DI for testing). */
  now?: number;
}

export interface LiveWorkoutCache {
  load(key: string, options?: LoadDraftOptions): Promise<LiveWorkoutSnapshot | null>;
  loadDraft(key: string, options?: LoadDraftOptions): Promise<LiveWorkoutDraft | null>;
  save(
    key: string,
    snap: LiveWorkoutSnapshot,
    activeSeconds?: number,
    attemptId?: string,
  ): Promise<void>;
  clear(key: string): Promise<void>;
}

export function createLiveWorkoutCache(
  store: KeyValueStore = asyncStorageKeyValueStore,
): LiveWorkoutCache {
  return {
    async loadDraft(
      key: string,
      options?: LoadDraftOptions,
    ): Promise<LiveWorkoutDraft | null> {
      try {
        const raw = await store.get(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== "object" || parsed === null) return null;

        let draft: LiveWorkoutDraft;
        if ("grid" in parsed && typeof (parsed as { savedAt?: unknown }).savedAt === "number") {
          draft = parsed as LiveWorkoutDraft;
        } else {
          // Legacy format where raw snapshot was saved directly
          draft = {
            savedAt: Date.now(),
            grid: parsed as LiveWorkoutSnapshot,
          };
        }

        if (options?.maxAgeMs !== undefined) {
          const now = options.now ?? Date.now();
          const age = now - draft.savedAt;
          if (age > options.maxAgeMs) {
            return null;
          }
        }

        if (options?.requireProgress) {
          if (!hasWorkoutProgress(draft.grid)) {
            return null;
          }
        }

        return draft;
      } catch {
        return null;
      }
    },
    async load(
      key: string,
      options?: LoadDraftOptions,
    ): Promise<LiveWorkoutSnapshot | null> {
      const draft = await this.loadDraft(key, options);
      return draft?.grid ?? null;
    },
    async save(
      key: string,
      snap: LiveWorkoutSnapshot,
      activeSeconds?: number,
      attemptId?: string,
    ): Promise<void> {
      try {
        const draft: LiveWorkoutDraft = {
          savedAt: Date.now(),
          grid: snap,
          ...(activeSeconds !== undefined ? { activeSeconds } : {}),
          ...(attemptId ? { attemptId } : {}),
        };
        await store.set(key, JSON.stringify(draft));
        await addTrackedLiveKey(store, key);
      } catch {
        // Silent failure — cache is an optimization, don't crash the workout.
      }
    },
    async clear(key: string): Promise<void> {
      try {
        await store.remove(key);
        await removeTrackedLiveKey(store, key);
      } catch {
        // Silent failure
      }
    },
  };
}
