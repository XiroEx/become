/**
 * TanStack Query client config — built as a plain options object so this file
 * doesn't import @tanstack/react-query at typecheck time. The runtime wiring
 * (in expo/app/_layout.tsx) passes this config into `new QueryClient(config)`
 * once the real lib is bundled.
 *
 * Offline-first defaults:
 *   - retry: exponential backoff up to maxRetries
 *   - retryDelay: starts at initialBackoffMs, doubles per attempt
 *   - staleTime: long (so cached data survives reconnect transients)
 *   - networkMode: 'offlineFirst' — fetches succeed from cache even when offline
 */

export interface OfflineQueryClientConfig {
  defaultOptions: {
    queries: {
      retry: number;
      retryDelay: (attempt: number) => number;
      staleTime: number;
      networkMode: "offlineFirst";
      refetchOnReconnect: boolean;
    };
    mutations: {
      retry: number;
      retryDelay: (attempt: number) => number;
      networkMode: "offlineFirst";
    };
  };
}

export interface CreateClientConfigInput {
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** How long cached query results are considered fresh, in ms. */
  staleTimeMs?: number;
}

export function createOfflineQueryClientConfig(
  input: CreateClientConfigInput = {},
): OfflineQueryClientConfig {
  const maxRetries = input.maxRetries ?? 3;
  const initial = input.initialBackoffMs ?? 1000;
  const max = input.maxBackoffMs ?? 30000;
  const staleTime = input.staleTimeMs ?? 5 * 60 * 1000;
  const backoff = (attempt: number): number =>
    Math.min(initial * Math.pow(2, attempt), max);
  return {
    defaultOptions: {
      queries: {
        retry: maxRetries,
        retryDelay: backoff,
        staleTime,
        networkMode: "offlineFirst",
        refetchOnReconnect: true,
      },
      mutations: {
        retry: maxRetries,
        retryDelay: backoff,
        networkMode: "offlineFirst",
      },
    },
  };
}
