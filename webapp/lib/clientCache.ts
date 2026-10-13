// Tiny, dependency-free localStorage cache for stale-while-revalidate reads.
//
// The dashboard fires many independent fetches on cold open; until they resolve
// the tiles render zeros/dashes which reads as "broken". This helper lets the
// client seed last-known values synchronously on first paint, then revalidate
// in the background — so a reopen paints instantly.
//
// Design notes:
//  - SSR-safe: every access guards `typeof window` so this is import-safe in
//    server components / unit tests with no `window`.
//  - Fail-soft: quota, parse, and serialization errors are swallowed (privacy
//    mode, full storage, corrupt entry) — the cache is never load-bearing.
//  - Versioned keys: a schema change bumps CACHE_VERSION so stale-shaped
//    entries are ignored cleanly instead of mis-typing the UI.

/**
 * Bump this when the shape of any cached payload changes incompatibly. Old
 * entries (written under a prior version prefix) become unreadable and are
 * simply treated as a cache miss.
 */
// v2: the streaks payload gained the super-streak freeze. A v1 entry has no
// `freeze` at all, and a page that read it crashed on the missing field —
// bumping the version is what this mechanism is for, and it drops every stale
// entry app-wide instead of one page's worth.
export const CACHE_VERSION = 'v2'

/** Namespace prefix so our keys never collide with other localStorage usage. */
const KEY_PREFIX = `become.cache.${CACHE_VERSION}.`

/** Default max age — never surface data older than ~24h. */
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Wire format written to localStorage. `t` is the write timestamp (ms). */
interface CacheEnvelope<T> {
  t: number
  data: T
}

function storageKey(key: string): string {
  return `${KEY_PREFIX}${key}`
}

function getStorage(): Storage | null {
  // Guard both SSR (no window) and locked-down browsers where accessing
  // localStorage throws (Safari private mode historically did).
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * Read a cached value. Returns `null` on miss, corrupt JSON, version mismatch
 * (different prefix → different key, so it never matches), or when the entry is
 * older than `maxAgeMs`. Never throws.
 */
export function readCache<T>(
  key: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): T | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>>
    // Shape check — a corrupt/legacy entry that parses but isn't an envelope.
    if (
      parsed == null ||
      typeof parsed !== 'object' ||
      typeof parsed.t !== 'number' ||
      !('data' in parsed)
    ) {
      return null
    }
    if (Date.now() - parsed.t > maxAgeMs) return null
    return parsed.data as T
  } catch {
    // Corrupt JSON / access error — treat as a miss.
    return null
  }
}

/**
 * Write a value with the current timestamp. No-ops (never throws) on SSR,
 * quota-exceeded, or non-serializable input.
 */
export function writeCache<T>(key: string, data: T): void {
  const storage = getStorage()
  if (!storage) return
  try {
    const envelope: CacheEnvelope<T> = { t: Date.now(), data }
    storage.setItem(storageKey(key), JSON.stringify(envelope))
  } catch {
    // Quota / privacy mode / circular value — just skip caching.
  }
}

/** Remove a single cached entry. Never throws. */
export function clearCache(key: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(storageKey(key))
  } catch {
    // ignore
  }
}

/**
 * Remove ALL of our cached entries (every `become.cache.*` key, across
 * versions). Call on logout so a different user on the same device never sees
 * the previous user's cached data. Never throws.
 */
export function clearAllCache(): void {
  const storage = getStorage()
  if (!storage) return
  try {
    const toRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && k.startsWith('become.cache.')) toRemove.push(k)
    }
    for (const k of toRemove) storage.removeItem(k)
  } catch {
    // ignore
  }
}
