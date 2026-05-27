import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { apiFetch } from "@become/api-client";
import type { ApiCallInit, ApiFetchOptions } from "@become/api-client";

export interface UseMutationOptions<TInput, TOutput> {
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  tz?: string;
  fetchImpl?: typeof fetch;
  method?: ApiCallInit["method"];
  headers?: Record<string, string>;
  onSuccess?: (data: TOutput, input: TInput) => void;
  onError?: (error: unknown, input: TInput) => void;
  /**
   * Returns a value used as the optimistic data while the request is in
   * flight. Rolled back on failure.
   */
  optimisticData?: (input: TInput) => TOutput;
}

export interface UseMutationResult<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>;
  data: TOutput | null;
  error: unknown;
  loading: boolean;
  reset: () => void;
}

export function useMutation<TInput, TOutput>(
  path: string,
  schema: z.ZodType<TOutput>,
  options: UseMutationOptions<TInput, TOutput> = {},
): UseMutationResult<TInput, TOutput> {
  const [data, setData] = useState<TOutput | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const optsRef = useRef(options);

  useEffect(() => {
    optsRef.current = options;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  const mutate = useCallback(
    async (input: TInput): Promise<TOutput> => {
      const opts = optsRef.current;
      setLoading(true);
      setError(null);

      let optimistic: TOutput | undefined;
      if (opts.optimisticData) {
        optimistic = opts.optimisticData(input);
        setData(optimistic);
      }

      const init: ApiCallInit & ApiFetchOptions = {
        method: opts.method ?? "POST",
        body: input,
      };
      if (opts.headers !== undefined) init.headers = opts.headers;
      if (opts.baseUrl !== undefined) init.baseUrl = opts.baseUrl;
      if (opts.getToken !== undefined) init.getToken = opts.getToken;
      if (opts.tz !== undefined) init.tz = opts.tz;
      if (opts.fetchImpl !== undefined) init.fetchImpl = opts.fetchImpl;

      try {
        const result = await apiFetch<TOutput>(path, schema, init);
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
        opts.onSuccess?.(result, input);
        return result;
      } catch (err) {
        if (mountedRef.current) {
          if (optimistic !== undefined) setData(null);
          setError(err);
          setLoading(false);
        }
        opts.onError?.(err, input);
        throw err;
      }
    },
    [path, schema],
  );

  return { mutate, data, error, loading, reset };
}
