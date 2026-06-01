'use client'

// Stale-while-revalidate fetch hook backed by the localStorage clientCache.
//
// On mount it synchronously seeds state from cache (if present) so the first
// paint shows last-known values instantly — no skeleton flash on a reopen.
// Then it fetches fresh in the background, updating both state and the cache.
// Only a true cold first-ever load (no cache) shows `loading === true`.

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_MAX_AGE_MS, readCache, writeCache } from '@/lib/clientCache'

export interface UseCachedFetchOptions<T> {
  /** Stable cache key (namespaced internally). */
  cacheKey: string
  /** Fetcher — receives an AbortSignal so the request is cancelled on unmount. */
  fetcher: (signal: AbortSignal) => Promise<T>
  /** Ignore cache entries older than this (default ~24h). */
  maxAgeMs?: number
  /** When false, skip fetching entirely (e.g. no auth token yet). */
  enabled?: boolean
}

export interface UseCachedFetchResult<T> {
  /** Cached value (instant) then revalidated value, or null until first data. */
  data: T | null
  /** True only on a cold load with no cache; false once any data is present. */
  loading: boolean
  /** Last fetch error, if the revalidation failed. */
  error: unknown
}

/**
 * SWR-style read. The fetcher is captured per-key via a ref so callers can pass
 * an inline closure without retriggering the effect every render.
 */
export function useCachedFetch<T>({
  cacheKey,
  fetcher,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  enabled = true,
}: UseCachedFetchOptions<T>): UseCachedFetchResult<T> {
  // Seed synchronously from cache so the very first render is already populated.
  const [data, setData] = useState<T | null>(() => readCache<T>(cacheKey, maxAgeMs))
  // Cold load only — if we seeded from cache, we're already "loaded".
  const [loading, setLoading] = useState<boolean>(() => data === null && enabled)
  const [error, setError] = useState<unknown>(null)

  // Keep the latest fetcher without making it an effect dependency, so an
  // inline closure doesn't cause refetch loops.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let cancelled = false

    void (async () => {
      try {
        const fresh = await fetcherRef.current(controller.signal)
        if (cancelled) return
        setData(fresh)
        setError(null)
        writeCache(cacheKey, fresh)
      } catch (err) {
        // Swallow aborts (unmount); surface real errors but keep cached data.
        if (cancelled || controller.signal.aborted) return
        setError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
    // cacheKey/enabled/maxAgeMs identify the request; fetcher is via ref.
  }, [cacheKey, enabled, maxAgeMs])

  return { data, loading, error }
}

export default useCachedFetch
