import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { apiFetch, ApiError, SchemaValidationError } from "@become/api-client";
import { reportRequestError } from "@/lib/auth/unauthorized";
import { decodeJwtPayload } from "@/lib/auth/jwt";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import {
  getCachedSync,
  readCache,
  writeCache,
  getCacheMemberId,
} from "@/lib/cache/lastKnown";

export interface UseFetchOptions {
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  /**
   * `tz` override in MINUTES WEST OF UTC (`Date.getTimezoneOffset()` units —
   * New York in summer is 240), which is what the server reads. Leave unset:
   * the client computes it from the device clock per request.
   */
  tz?: number;
  /** IANA zone override; travels as `tzZone` in write bodies only. */
  tzZone?: string;
  fetchImpl?: typeof fetch;
  /** Skip the initial fetch — call `refetch()` to trigger manually. */
  skip?: boolean;
  /** Member ID to scope cache keys. Defaults to current active member or derived from JWT. */
  memberId?: string | null;
  /** Cache key override. Defaults to path. */
  cacheKey?: string | null;
  /** Max cache age in ms. Defaults to 24 hours (DEFAULT_MAX_AGE_MS). */
  maxAgeMs?: number;
  /** Custom storage backend for tests. Defaults to AsyncStorage. */
  storage?: AsyncStorageLike;
  /**
   * Whether to seed from and write to last-known cache (NP-036).
   * Enabled for wave-1 screens (Settings, Health, Dashboard) and future wave-2 screens.
   * Defaults to false to avoid unintended cache bleed across legacy screens/tests.
   */
  useCache?: boolean;
}

export interface UseFetchResult<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  refetch: () => Promise<void>;
  /** Whether current data came from last-known cache. */
  isCached: boolean;
}

function resolveMemberId(opts: UseFetchOptions): string | null {
  if (opts.memberId !== undefined) return opts.memberId;
  const current = getCacheMemberId();
  if (current) return current;
  if (opts.getToken) {
    try {
      const t = opts.getToken();
      if (typeof t === "string") {
        const payload = decodeJwtPayload(t);
        if (payload?.userId) return String(payload.userId);
        if (payload?.sub) return String(payload.sub);
        if (payload?.email) return String(payload.email);
        return t;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function useFetch<T>(
  path: string | null,
  schema: z.ZodType<T>,
  options: UseFetchOptions = {},
): UseFetchResult<T> {
  const effectiveKey = options.cacheKey ?? path;
  const cachingEnabled =
    (options.useCache === true || (options.useCache !== false && options.cacheKey != null)) &&
    !!effectiveKey;

  const [data, setData] = useState<T | null>(() => {
    if (!cachingEnabled || !effectiveKey) return null;
    const mId = resolveMemberId(options);
    return getCachedSync<T>(effectiveKey, mId, options.maxAgeMs);
  });
  const [isCached, setIsCached] = useState<boolean>(() => {
    if (!cachingEnabled || !effectiveKey) return false;
    const mId = resolveMemberId(options);
    return getCachedSync<T>(effectiveKey, mId, options.maxAgeMs) !== null;
  });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(!options.skip && !!path);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef<boolean>(true);
  const optsRef = useRef(options);
  const hasFreshDataRef = useRef<boolean>(false);

  // Keep optsRef in sync via effect (refs must not be written during render).
  useEffect(() => {
    optsRef.current = options;
  });

  // Reset `loading` the moment the fetch TARGET changes, not a render later.
  //
  // A tab-gated caller (My Stuff's recipes/foods tabs — null `path` while
  // inactive) flips `path` from null to a real url and `skip` from true to
  // false on the SAME render that switches tabs. `loading` used to stay
  // stale until the effect below ran `run()`, which calls `setLoading(true)`
  // — one render later. In between, `data` was still null and `loading` was
  // still false, so a tab's empty state ("No favorites yet") painted for a
  // frame ahead of the fetch even starting.
  //
  // Deriving it during render (React's own pattern for "adjust state when a
  // prop changes") closes that frame: a changed key resets `loading`
  // immediately, before paint, instead of through a second effect-driven
  // render.
  const fetchKey = `${String(path)}:${String(options.skip)}`;
  const [prevFetchKey, setPrevFetchKey] = useState(fetchKey);
  if (fetchKey !== prevFetchKey) {
    setPrevFetchKey(fetchKey);
    const willFetch = !options.skip && !!path;
    if (willFetch !== loading) setLoading(willFetch);
  }

  // Async cache seed on mount / path change
  useEffect(() => {
    hasFreshDataRef.current = false;
    if (!cachingEnabled || !effectiveKey) return;
    let alive = true;
    const mId = resolveMemberId(optsRef.current);
    void readCache<T>(
      effectiveKey,
      mId,
      optsRef.current.maxAgeMs,
      optsRef.current.storage,
    ).then((cached) => {
      if (!alive || !mountedRef.current) return;
      if (cached !== null && !hasFreshDataRef.current) {
        setData((prev) => (prev !== null ? prev : cached));
        setIsCached(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [effectiveKey, cachingEnabled]);

  const run = useCallback(async (): Promise<void> => {
    if (!path) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch(path, schema, {
        ...optsRef.current,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      hasFreshDataRef.current = true;
      setData(result);
      setIsCached(false);
      setError(null);
      if (cachingEnabled && effectiveKey) {
        let mId = resolveMemberId(optsRef.current);
        if (!mId && optsRef.current.getToken) {
          try {
            const t = await optsRef.current.getToken();
            if (t) {
              const p = decodeJwtPayload(t);
              mId = p?.userId ? String(p.userId) : (p?.sub ? String(p.sub) : t);
            }
          } catch {
            // ignore
          }
        }
        void writeCache(effectiveKey, result, mId, optsRef.current.storage);
      }
    } catch (err) {
      // Report BEFORE the mounted/abort guards: a 401 is the session ending
      // and it ends the session whether or not this screen is still watching.
      reportRequestError(err);
      if (!mountedRef.current || controller.signal.aborted) return;
      if (err instanceof ApiError || err instanceof SchemaValidationError) {
        setError(err);
      } else {
        setError(err);
      }
      // Note: data is NOT cleared on error! Cached data remains visible.
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [path, schema, effectiveKey, cachingEnabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!options.skip && path) {
      // Mount-time fetch is the whole point of this hook — the setState
      // cascade is intentional. The lint rule guards against unnecessary
      // setStates in effects but this is the canonical data-fetching shape.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void run();
    }
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [path, run, options.skip]);

  return { data, error, loading, refetch: run, isCached };
}
