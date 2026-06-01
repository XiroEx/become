// Fail-soft Redis cache layer.
//
// This module exposes a tiny key/value JSON cache backed by ioredis. Its single
// most important property is that it NEVER throws, NEVER hangs, and NEVER breaks
// the calling request. If REDIS_URL is unset, or Redis is down / unreachable /
// slow / errors at any point (connect, get, set, del), every helper degrades to
// a no-op (returns null / void) so callers fall back to computing fresh data.
//
// How fail-soft is guaranteed:
//   1. Lazy singleton client (lazyConnect) — we never connect until the first
//      cache call, and a missing REDIS_URL means we never construct a client.
//   2. enableOfflineQueue: false + maxRetriesPerRequest: 1 — commands fail fast
//      instead of buffering forever when the server is unreachable.
//   3. A capped retryStrategy so an unreachable Redis doesn't reconnect-storm.
//   4. A single 'error' handler that logs at most once, so an unreachable Redis
//      doesn't spam logs or crash the process on unhandled 'error' events.
//   5. Every helper wraps its command in try/catch AND races it against a short
//      timeout (Promise.race), so even a hung TCP connection can't delay the
//      response by more than ~150ms.

import type { Redis as RedisClient } from 'ioredis'

// Minimal surface we actually use. Lets tests inject a fake without ioredis.
export interface CacheClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>
  del(key: string): Promise<unknown>
}

// Per-call hard timeout so a hung Redis never meaningfully delays a request.
const CALL_TIMEOUT_MS = 150

let singleton: CacheClient | null | undefined
let loggedError = false

/**
 * Lazily construct (once) the ioredis singleton. Returns null when REDIS_URL is
 * unset OR when client construction itself fails — both mean "no cache". The
 * result is memoized so we don't re-attempt construction on every call.
 */
function getClient(): CacheClient | null {
  if (singleton !== undefined) return singleton

  const url = process.env.REDIS_URL
  if (!url) {
    singleton = null
    return null
  }

  try {
    // Require lazily so environments without ioredis (or where REDIS_URL is
    // unset) never pay the import cost, and a broken module can't crash import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis') as typeof import('ioredis').default
    const client: RedisClient = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      // Give up quickly; cap the backoff so we never reconnect-storm a dead box.
      retryStrategy(times: number) {
        if (times > 3) return null // stop retrying
        return Math.min(times * 200, 1000)
      },
    })
    // Swallow async 'error' events (unreachable host emits these). Without a
    // handler, ioredis 'error' events would crash the process.
    client.on('error', (err: Error) => {
      if (!loggedError) {
        loggedError = true
        console.warn(
          `[redis] connection error (cache disabled, failing soft): ${err?.message ?? err}`,
        )
      }
    })
    singleton = client as unknown as CacheClient
    return singleton
  } catch (err) {
    if (!loggedError) {
      loggedError = true
      console.warn(
        `[redis] failed to construct client (cache disabled): ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
    singleton = null
    return null
  }
}

/** Race a promise against a timeout that resolves to a sentinel on expiry. */
function withTimeout<T>(p: Promise<T>, fallback: T, ms = CALL_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => {
      const t = setTimeout(() => resolve(fallback), ms)
      // Don't keep the event loop alive solely for this timer.
      if (typeof t === 'object' && t && 'unref' in t) {
        ;(t as { unref: () => void }).unref()
      }
    }),
  ])
}

/**
 * Read + JSON.parse a cached value. Returns null on miss, on any error, on
 * timeout, or when no cache is configured. `client` is injectable for tests.
 */
export async function cacheGetJson<T>(
  key: string,
  client: CacheClient | null = getClient(),
): Promise<T | null> {
  if (!client) return null
  try {
    const raw = await withTimeout(client.get(key), null)
    if (raw == null) return null
    return JSON.parse(raw) as T
  } catch {
    return null // fail soft: never throw
  }
}

/**
 * JSON.stringify + write a value with a TTL (seconds). Best-effort: swallows
 * all errors / timeouts and returns void. `client` is injectable for tests.
 */
export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
  client: CacheClient | null = getClient(),
): Promise<void> {
  if (!client) return
  try {
    const payload = JSON.stringify(value)
    await withTimeout(client.set(key, payload, 'EX', ttlSeconds), undefined)
  } catch {
    // fail soft: never throw
  }
}

/**
 * Delete a key (cache invalidation). Best-effort: swallows all errors /
 * timeouts. `client` is injectable for tests.
 */
export async function cacheDel(
  key: string,
  client: CacheClient | null = getClient(),
): Promise<void> {
  if (!client) return
  try {
    await withTimeout(client.del(key), undefined)
  } catch {
    // fail soft: never throw
  }
}

// ---------------------------------------------------------------------------
// Tiles cache helpers — single source of truth for the key shape + TTL.
// ---------------------------------------------------------------------------

/** Versioned per-user cache key. Bump the version to invalidate all entries. */
export function tilesCacheKey(userId: string): string {
  return `tiles:v1:${userId}`
}

/** Short TTL for the dashboard tiles payload. */
export const TILES_CACHE_TTL_SECONDS = 60

/** Explicit invalidation after a write that changes tile inputs. Fail-soft. */
export async function bustTilesCache(userId: string): Promise<void> {
  await cacheDel(tilesCacheKey(userId))
}

// Test-only: reset the memoized singleton so a test can re-exercise getClient.
export function __resetRedisSingletonForTests(): void {
  singleton = undefined
  loggedError = false
}
