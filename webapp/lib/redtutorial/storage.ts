/**
 * Persistence adapters. The adapter interface is intentionally tiny —
 * `{ get, set }` over a single JSON state blob — so apps can back it with
 * anything: localStorage (default), an authenticated API route (account-based,
 * synced across devices), user settings docs, etc.
 */

import type { TutorialProgressState, TutorialStorageAdapter } from './types';

export function emptyProgressState(enabled = true): TutorialProgressState {
  return { enabled, tutorials: {} };
}

function isValidState(v: unknown): v is TutorialProgressState {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as TutorialProgressState).enabled === 'boolean' &&
    typeof (v as TutorialProgressState).tutorials === 'object' &&
    (v as TutorialProgressState).tutorials !== null
  );
}

/** Parse unknown JSON into a progress state, or null if it isn't one. */
export function parseProgressState(raw: unknown): TutorialProgressState | null {
  return isValidState(raw) ? raw : null;
}

/* ------------------------------------------------------------------ */
/* localStorage (default)                                              */
/* ------------------------------------------------------------------ */

export function createLocalStorageAdapter(
  key = 'redtutorial:progress'
): TutorialStorageAdapter {
  return {
    get() {
      try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(key);
        return raw ? parseProgressState(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },
    set(state) {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        /* quota / private mode — non-fatal */
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* In-memory (tests, SSR fallbacks)                                    */
/* ------------------------------------------------------------------ */

export function createMemoryAdapter(
  initial?: TutorialProgressState | null
): TutorialStorageAdapter & { state: TutorialProgressState | null } {
  const box = {
    state: (initial ?? null) as TutorialProgressState | null,
    get() {
      return box.state;
    },
    set(state: TutorialProgressState) {
      box.state = state;
    },
  };
  return box;
}

/* ------------------------------------------------------------------ */
/* Fetch (account-based via an API route)                              */
/* ------------------------------------------------------------------ */

export interface FetchAdapterOptions {
  /** Endpoint that GETs and PUTs the progress state as JSON. */
  url: string;
  /** Extra headers (e.g. auth). */
  headers?: Record<string, string>;
  /** Custom fetch (defaults to global fetch). */
  fetchFn?: typeof fetch;
  /** Include credentials (cookies). Default 'same-origin'. */
  credentials?: RequestCredentials;
  /**
   * Optional local fallback used when the API is unreachable, so the tour
   * still works offline; the API remains the source of truth when it responds.
   */
  fallback?: TutorialStorageAdapter;
}

/**
 * Account-based adapter: GET `url` → progress state JSON (404/empty → null),
 * PUT `url` with the JSON state to save. Wire it to a per-user API route and
 * progress follows the account across devices.
 */
export function createFetchAdapter(opts: FetchAdapterOptions): TutorialStorageAdapter {
  const {
    url,
    headers = {},
    credentials = 'same-origin',
    fallback,
  } = opts;
  const f: typeof fetch | undefined =
    opts.fetchFn ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);

  return {
    async get() {
      if (!f) return fallback ? fallback.get() : null;
      try {
        const res = await f(url, { method: 'GET', headers, credentials });
        if (res.status === 404 || res.status === 204) return null;
        if (!res.ok) throw new Error(`redtutorial storage GET ${res.status}`);
        const body = (await res.json()) as unknown;
        return parseProgressState(body);
      } catch {
        return fallback ? fallback.get() : null;
      }
    },
    async set(state) {
      try {
        await fallback?.set(state);
      } catch {
        /* ignore */
      }
      if (!f) return;
      try {
        await f(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...headers },
          credentials,
          body: JSON.stringify(state),
        });
      } catch {
        /* offline — fallback (if any) already has it */
      }
    },
  };
}
