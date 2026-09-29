import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { apiFetch, ApiError, SchemaValidationError } from "@become/api-client";
import { reportRequestError } from "@/lib/auth/unauthorized";

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
}

export interface UseFetchResult<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useFetch<T>(
  path: string | null,
  schema: z.ZodType<T>,
  options: UseFetchOptions = {},
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(!options.skip && !!path);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef<boolean>(true);
  const optsRef = useRef(options);

  // Keep optsRef in sync via effect (refs must not be written during render).
  useEffect(() => {
    optsRef.current = options;
  });

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
      setData(result);
      setError(null);
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
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [path, schema]);

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

  return { data, error, loading, refetch: run };
}
