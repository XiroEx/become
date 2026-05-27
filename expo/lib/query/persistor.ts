/**
 * Snapshot persistence — wraps AsyncStorageLike so the queue can survive cold
 * starts. Built generic so the same wrapper persists TanStack Query's cache
 * (via @tanstack/query-async-storage-persister at runtime) and the offline
 * mutation queue (this phase).
 */
export interface AsyncStorageLike {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export interface Persistor<T> {
  save: (value: T) => Promise<void>;
  load: () => Promise<T | null>;
  clear: () => Promise<void>;
}

export function createPersistor<T>(
  storage: AsyncStorageLike,
  key: string,
): Persistor<T> {
  return {
    async save(value): Promise<void> {
      await storage.setItem(key, JSON.stringify(value));
    },
    async load(): Promise<T | null> {
      const raw = await storage.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async clear(): Promise<void> {
      await storage.removeItem(key);
    },
  };
}

/** In-memory AsyncStorage for tests + SSR fallback. */
export function createMemoryAsyncStorage(): AsyncStorageLike {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}
