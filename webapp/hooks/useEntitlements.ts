'use client'

// The one client-side reader of GET /api/me/entitlements.
//
// Before this, three surfaces each ran their own bespoke fetch of the endpoint
// (the nutrition page, My Programs, the program creator) and each derived its
// own answer from `allowed`. That is exactly how a client ends up disagreeing
// with the server about whether someone may create something. One hook, one
// shared snapshot, one field to read (`canCreate`).
//
// Caching, deliberately in two layers:
//   • a module-level snapshot + 60s TTL, so a screen that mounts three gated
//     components issues ONE request and a client-side navigation issues none;
//   • lib/clientCache (localStorage), so a reopen paints the plan state it last
//     saw instead of flashing a lock, then revalidates.
//
// The localStorage seed is applied in an EFFECT, never in a useState
// initializer: seeding from storage during the first render makes the client's
// markup differ from the server's and trips hydration.

import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '@/lib/clientCache'
import type {
  EntitlementsSnapshot,
  Feature,
  FeatureEntitlement,
} from '@/lib/entitlementsClient'

const CACHE_KEY = 'entitlements'
/** How long a fetched snapshot is reused before revalidating. */
const TTL_MS = 60_000
/** How stale a localStorage seed may be before it is ignored on first paint. */
const SEED_MAX_AGE_MS = 12 * 60 * 60 * 1000

let snapshot: EntitlementsSnapshot | null = null
let fetchedAt = 0
/** Whose snapshot this is. Logout is a client-side push, not a reload, so the
 *  module cache outlives the session that filled it — without this the next
 *  person to sign in on the device sees the previous member's plan. */
let fetchedForToken: string | null = null
let inflight: Promise<EntitlementsSnapshot | null> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function isSnapshot(v: unknown): v is EntitlementsSnapshot {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as EntitlementsSnapshot).enforced === 'boolean' &&
    typeof (v as EntitlementsSnapshot).features === 'object'
  )
}

/**
 * Last-known plan state from localStorage. Never fatal, never throws.
 *
 * Safe across accounts because logout calls clearAllCache(), which drops every
 * `become.cache.*` key — the module snapshot is the half that needs the token
 * check in load().
 */
function seedFromCache(): EntitlementsSnapshot | null {
  if (snapshot) return snapshot
  const cached = readCache<EntitlementsSnapshot>(CACHE_KEY, SEED_MAX_AGE_MS)
  if (isSnapshot(cached)) {
    snapshot = cached
    fetchedForToken = currentToken()
  }
  return snapshot
}

function currentToken(): string | null {
  try {
    return localStorage.getItem('token')
  } catch {
    return null
  }
}

async function load(force: boolean): Promise<EntitlementsSnapshot | null> {
  if (typeof window === 'undefined') return null

  // Identity check FIRST: a different (or absent) token means the cached
  // snapshot belongs to someone else.
  const token = currentToken()
  if (snapshot && token !== fetchedForToken) resetEntitlementsCache()

  if (!force && snapshot && Date.now() - fetchedAt < TTL_MS) return snapshot
  if (inflight) return inflight

  inflight = (async () => {
    try {
      // Signed out — nothing to read. The snapshot was already dropped above.
      if (!token) return snapshot
      // tz so `resetsAt` is the member's local midnight / Monday, not UTC's.
      const tz = new Date().getTimezoneOffset()
      const res = await fetch(`/api/me/entitlements?tz=${tz}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return snapshot
      const data: unknown = await res.json()
      if (!isSnapshot(data)) return snapshot
      snapshot = data
      fetchedAt = Date.now()
      fetchedForToken = token
      writeCache(CACHE_KEY, data)
      emit()
      return snapshot
    } catch {
      // Offline / parse error — the last snapshot (or none) stands. A gate is a
      // product boundary, not a security one; the server refuses either way.
      return snapshot
    } finally {
      inflight = null
    }
  })()

  return inflight
}

export interface UseEntitlements {
  data: EntitlementsSnapshot | null
  loading: boolean
  /** Refetch now. Call after a 403, and after a successful create so the
   *  counters the member is watching actually move. */
  refresh: () => Promise<void>
  feature: (f: Feature) => FeatureEntitlement | null
}

export function useEntitlements(): UseEntitlements {
  // Starts from the MODULE cache only (null on the server and on a cold first
  // client render), so server and client agree on the first paint.
  const [data, setData] = useState<EntitlementsSnapshot | null>(snapshot)
  const [loading, setLoading] = useState<boolean>(snapshot === null)

  useEffect(() => {
    let cancelled = false
    const onChange = () => {
      if (!cancelled) setData(snapshot)
    }
    listeners.add(onChange)

    // Reading localStorage IS the "subscribe to an external system" case this
    // rule exists for; it cannot happen during render without breaking
    // hydration, and it must happen before the fetch resolves or the seed is
    // pointless.
    const seeded = seedFromCache()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seeded && !cancelled) setData(seeded)

    load(false).finally(() => {
      if (cancelled) return
      setData(snapshot)
      setLoading(false)
    })

    return () => {
      cancelled = true
      listeners.delete(onChange)
    }
  }, [])

  const refresh = useCallback(async () => {
    await load(true)
    setData(snapshot)
  }, [])

  const feature = useCallback(
    (f: Feature): FeatureEntitlement | null => data?.features?.[f] ?? null,
    [data],
  )

  return { data, loading, refresh, feature }
}

/** Drop the in-memory snapshot. Called on an identity change; exported for tests. */
export function resetEntitlementsCache(): void {
  snapshot = null
  fetchedAt = 0
  fetchedForToken = null
  emit()
}

export default useEntitlements
