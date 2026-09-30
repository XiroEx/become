/**
 * ─── LAST-KNOWN CLIENT CACHE (NP-036) ─────────────────────────────────────────
 *
 * Web equivalent: webapp/lib/clientCache.ts
 *
 * Stale-while-revalidate cache for native screens. Seeds last-known data on
 * cold open / relaunch so the app paints instantly without spinners or blank
 * states, then revalidates in the background. In airplane mode or offline,
 * serves the last good data with an offline note.
 *
 * Rules:
 *   1. Versioned keys: bumped on breaking schema changes so stale shapes are dropped cleanly.
 *   2. Scoped to the member: keys and envelopes are scoped to the authenticated member ID,
 *      so a user never sees another member's cached data.
 *   3. 24-hour limit: entries older than 24 hours are treated as a cache miss.
 *   4. Fail-soft: storage quota, JSON parse, or disk errors are swallowed silently.
 *   5. Cleared on sign-out and account deletion (NP-047).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AsyncStorageLike } from "@/lib/query/persistor";

export const CACHE_VERSION = "v1";

/** Default max age — never surface data older than 24 hours. */
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface CacheEnvelope<T> {
  t: number;
  data: T;
  memberId?: string | null;
  version: string;
}

let activeMemberId: string | null = null;

export function setCacheMemberId(memberId: string | null): void {
  activeMemberId = memberId;
}

export function getCacheMemberId(): string | null {
  return activeMemberId;
}

/** In-memory cache for fast synchronous seeding and test environments. */
const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const writtenKeys = new Set<string>();

export function cacheStorageKey(key: string, memberId?: string | null): string {
  const scope = memberId ?? activeMemberId ?? "anon";
  return `become.cache.${CACHE_VERSION}.${scope}.${key}`;
}

export function getCachedSync<T>(
  key: string,
  memberId?: string | null,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): T | null {
  try {
    const k = cacheStorageKey(key, memberId);
    const envelope = memoryCache.get(k) as CacheEnvelope<T> | undefined;
    if (!envelope) return null;
    const expectedMember = memberId ?? activeMemberId;
    if (expectedMember && envelope.memberId && envelope.memberId !== expectedMember) {
      return null;
    }
    if (Date.now() - envelope.t > maxAgeMs) {
      memoryCache.delete(k);
      return null;
    }
    return envelope.data;
  } catch {
    return null;
  }
}

export async function readCache<T>(
  key: string,
  memberId?: string | null,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
  storage: AsyncStorageLike = AsyncStorage,
): Promise<T | null> {
  const k = cacheStorageKey(key, memberId);
  // Check memory first
  const mem = getCachedSync<T>(key, memberId, maxAgeMs);
  if (mem !== null) return mem;

  try {
    const raw = await storage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
    if (
      parsed == null ||
      typeof parsed !== "object" ||
      typeof parsed.t !== "number" ||
      !("data" in parsed)
    ) {
      return null;
    }
    const expectedMember = memberId ?? activeMemberId;
    if (expectedMember && parsed.memberId && parsed.memberId !== expectedMember) {
      return null;
    }
    if (Date.now() - parsed.t > maxAgeMs) {
      await storage.removeItem(k).catch(() => {});
      return null;
    }
    const envelope: CacheEnvelope<T> = {
      t: parsed.t,
      data: parsed.data as T,
      memberId: parsed.memberId ?? null,
      version: parsed.version ?? CACHE_VERSION,
    };
    memoryCache.set(k, envelope);
    writtenKeys.add(k);
    return envelope.data;
  } catch {
    return null;
  }
}

export async function writeCache<T>(
  key: string,
  data: T,
  memberId?: string | null,
  storage: AsyncStorageLike = AsyncStorage,
): Promise<void> {
  try {
    const k = cacheStorageKey(key, memberId);
    const scope = memberId ?? activeMemberId ?? null;
    const envelope: CacheEnvelope<T> = {
      t: Date.now(),
      data,
      memberId: scope,
      version: CACHE_VERSION,
    };
    memoryCache.set(k, envelope);
    writtenKeys.add(k);
    await storage.setItem(k, JSON.stringify(envelope));
  } catch {
    // fail-soft
  }
}

export async function clearCache(
  key: string,
  memberId?: string | null,
  storage: AsyncStorageLike = AsyncStorage,
): Promise<void> {
  try {
    const k = cacheStorageKey(key, memberId);
    memoryCache.delete(k);
    writtenKeys.delete(k);
    await storage.removeItem(k);
  } catch {
    // fail-soft
  }
}

export async function clearAll(
  storage: AsyncStorageLike = AsyncStorage,
): Promise<void> {
  try {
    memoryCache.clear();
    let keys: readonly string[] = [];
    if (typeof storage.getAllKeys === "function") {
      try {
        keys = await storage.getAllKeys();
      } catch {
        keys = Array.from(writtenKeys);
      }
    } else {
      keys = Array.from(writtenKeys);
    }
    const toRemove = keys.filter((k) => k.startsWith("become.cache."));
    writtenKeys.clear();
    if (toRemove.length > 0) {
      if (typeof storage.multiRemove === "function") {
        await storage.multiRemove(toRemove);
      } else {
        await Promise.all(toRemove.map((k) => storage.removeItem(k)));
      }
    }
  } catch {
    // fail-soft
  }
}

export const clearAllCache = clearAll;
