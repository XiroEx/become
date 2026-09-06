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
//
// The third layer is ORDERING, and it is the easiest one to lose. Sharing an
// in-flight request is what makes "one request per screen" true, but a request
// only carries the answer as of the moment it was DISPATCHED. A caller that has
// since changed something — deleted a custom exercise, say — cannot be served
// from it, and its answer must not be allowed to stamp the cache fresh when it
// lands. `requestSeq` / `supersededSeq` below are that rule.

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
/** Monotonic id handed to every dispatched request. More than one request can
 *  be on the wire at a time (see `load`), so an id — not the promise — is what
 *  says which one currently owns the `inflight` slot. */
let requestSeq = 0
/** The id of the request `inflight` holds. */
let inflightSeq = 0
/** Requests with an id at or below this one were dispatched BEFORE something
 *  the client already knows about changed the answer: a forced refresh, an
 *  explicit `invalidateEntitlements()`, or an identity change. They are stale
 *  by construction, so they may neither be adopted by a new caller nor written
 *  to the cache when they land.
 *
 *  Without it, a `refresh()` fired after a delete piggybacks on the mount's
 *  still-in-flight request, resolves with the member's PRE-delete counts and
 *  stamps them `fetchedAt = Date.now()` — re-locking the create button for a
 *  further full TTL. Refreshing after a delete exists to prevent exactly that. */
let supersededSeq = 0
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

/**
 * One request, identified by `seq` and dispatched for `token`.
 *
 * Never rejects: every failure path leaves the last snapshot standing. A gate
 * is a product boundary, not a security one, and the server refuses either way.
 */
async function fetchSnapshot(
  seq: number,
  token: string | null,
): Promise<EntitlementsSnapshot | null> {
  try {
    // Signed out — nothing to read. The snapshot was already dropped in load().
    if (!token) return snapshot
    // tz so `resetsAt` is the member's local midnight / Monday, not UTC's.
    const tz = new Date().getTimezoneOffset()
    const res = await fetch(`/api/me/entitlements?tz=${tz}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return snapshot
    const data: unknown = await res.json()
    if (!isSnapshot(data)) return snapshot
    // Landed after the client learned this answer was out of date. Writing it
    // would be wrong twice over: the stale counts would replace the truth, AND
    // `fetchedAt` would certify them fresh for another whole TTL — the lock
    // outliving the delete that cleared it, which is the bug this guards.
    // Dropping it leaves the cache exactly as stale as it already was, so the
    // next reader refetches. That is what `refresh` and `invalidateEntitlements`
    // both promise, and it fails OPEN: a discard never locks anything.
    if (seq <= supersededSeq) return snapshot
    snapshot = data
    fetchedAt = Date.now()
    fetchedForToken = token
    writeCache(CACHE_KEY, data)
    emit()
    return snapshot
  } catch {
    // Offline / parse error — the last snapshot (or none) stands.
    return snapshot
  }
}

async function load(force: boolean): Promise<EntitlementsSnapshot | null> {
  if (typeof window === 'undefined') return null

  // Identity check FIRST: a different (or absent) token means the cached
  // snapshot belongs to someone else.
  const token = currentToken()
  if (snapshot && token !== fetchedForToken) resetEntitlementsCache()

  if (!force && snapshot && Date.now() - fetchedAt < TTL_MS) return snapshot

  // Adopting the request already on the wire is what makes "one request per
  // screen" true, and it holds for an ordinary read.
  //
  // It does NOT hold for a FORCED read. `refresh()` is called because the
  // member just created or deleted something; a request dispatched before that
  // write cannot possibly contain it, and adopting it would answer with the
  // pre-change counts and then certify them for a full TTL.
  //
  // Nor does it hold for a request already marked superseded — after an
  // `invalidateEntitlements()` the next reader is promised the truth, not the
  // answer that was already in the air when the row was deleted.
  if (!force && inflight && inflightSeq > supersededSeq) return inflight

  const seq = ++requestSeq
  // A forced read declares everything already on the wire out of date. Merely
  // declining to adopt them is not enough: one could still land first and stamp
  // its stale answer over the top.
  if (force) supersededSeq = seq - 1

  const request = fetchSnapshot(seq, token).finally(() => {
    // Only the current occupant may vacate the slot — an older request settling
    // late must not clear a newer one out of it.
    if (inflightSeq === seq) inflight = null
  })
  inflight = request
  inflightSeq = seq
  return request
}

export interface UseEntitlements {
  data: EntitlementsSnapshot | null
  loading: boolean
  /** Refetch now. Call after a 403, and after a successful create or DELETE so
   *  the counters the member is watching actually move. A delete frees an
   *  inventory slot immediately; without this the lock survives it for up to
   *  the TTL. Surfaces that do not hold the hook use `invalidateEntitlements`.
   *
   *  Always issues its own request rather than joining one already in flight —
   *  see `load`. */
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

/**
 * Mark the snapshot STALE without dropping it and without fetching.
 *
 * This is the delete-side counterpart to `refresh`. Deleting a row frees an
 * inventory slot server-side immediately, but the 60s TTL means the client
 * keeps answering `canCreate: false` from the snapshot it took while the member
 * was still at the cap — the lock outlives the thing that cleared it, and the
 * only way out (delete one) looks like it did nothing.
 *
 * It invalidates rather than refetches on purpose, so a page that renders no
 * gate at all (the meal pages) can call it from a delete handler without
 * suddenly issuing entitlement requests or mounting gate UI. The next real
 * reader — a mount, or an explicit `refresh` — picks up the truth.
 *
 * Components that already hold the hook AND stay mounted through the delete
 * should call `refresh` instead: they need the lock to clear on screen now, not
 * on the next mount.
 */
export function invalidateEntitlements(): void {
  fetchedAt = 0
  // Expiring the TTL is only half of it. A request already on the wire was
  // dispatched before the delete that prompted this call, so when it lands it
  // writes its pre-delete counts and sets `fetchedAt` again — restoring the
  // very 60s window this call just cleared, invisibly. Marking those requests
  // superseded is what makes the invalidation stick.
  supersededSeq = requestSeq
}

/** Drop the in-memory snapshot. Called on an identity change; exported for tests. */
export function resetEntitlementsCache(): void {
  snapshot = null
  fetchedAt = 0
  fetchedForToken = null
  // A request dispatched for the PREVIOUS identity is not merely stale, it is
  // somebody else's plan. It must never land in the cache.
  supersededSeq = requestSeq
  emit()
}

/**
 * Fetch (or revalidate) the shared snapshot directly.
 *
 * The hook and `invalidateEntitlements` are the app-facing surface; this is
 * exported so the ordering rules above — which are the entire reason this
 * module holds state — can be exercised without a React renderer.
 */
export function loadEntitlements(force = false): Promise<EntitlementsSnapshot | null> {
  return load(force)
}

export default useEntitlements
