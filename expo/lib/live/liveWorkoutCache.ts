import * as SecureStore from "expo-secure-store";

/**
 * On-device persistence for an in-flight live workout. The grid of logged sets
 * is mirrored to SecureStore so a backgrounded app / network blip / accidental
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

/**
 * Pure state-machine transition: replace one set in the grid, returning a new
 * grid (no mutation). Generic over the set shape so it works for both the cache
 * snapshot and the presentational LiveSetState.
 */
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
  workoutIndex: number,
  phaseIndex = 0,
): string {
  return `become.live.${programId}.${phaseIndex}.${workoutIndex}`;
}

/**
 * Minimal key/value contract — DI-friendly so unit tests pass an in-memory
 * store and avoid the native expo-secure-store module.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Default store backed by expo-secure-store. */
export const secureKeyValueStore: KeyValueStore = {
  async get(key: string): Promise<string | null> {
    const v = await SecureStore.getItemAsync(key);
    return v ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
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

export interface LiveWorkoutCache {
  load(key: string): Promise<LiveWorkoutSnapshot | null>;
  save(key: string, snapshot: LiveWorkoutSnapshot): Promise<void>;
  clear(key: string): Promise<void>;
}

export function createLiveWorkoutCache(
  store: KeyValueStore = secureKeyValueStore,
): LiveWorkoutCache {
  return {
    async load(key: string): Promise<LiveWorkoutSnapshot | null> {
      const raw = await store.get(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as LiveWorkoutSnapshot;
        }
        return null;
      } catch {
        // Corrupt cache entry — treat as empty rather than crashing the screen.
        return null;
      }
    },
    async save(key: string, snapshot: LiveWorkoutSnapshot): Promise<void> {
      await store.set(key, JSON.stringify(snapshot));
    },
    async clear(key: string): Promise<void> {
      await store.remove(key);
    },
  };
}
