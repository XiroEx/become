// Run with: npm run test:file tests/unit/entitlements/refreshRace.test.ts
//
// A REFRESH THAT ADOPTS AN OLDER REQUEST RE-LOCKS THE MEMBER FOR 60 SECONDS.
//
// hooks/useEntitlements caches one snapshot per module with a 60s TTL and
// shares whatever request is already on the wire. That sharing is what makes
// "one request per screen" true, and it was unconditional — so:
//
//   a member sitting at 3/3 custom exercises opens the library on a slow
//   connection and taps Delete before the mount's entitlements fetch has come
//   back. The delete handler calls `refresh()`. `refresh()` finds a request
//   already in flight and returns it. That request was dispatched BEFORE the
//   delete, so it answers 3/3 — and then stamps `fetchedAt = Date.now()`,
//   certifying the pre-delete counts fresh for another full minute.
//
// The Create button stays locked, the only way out of an inventory cap looks
// like it did nothing, and every later read is served from the stale snapshot.
// `invalidateEntitlements()` lost the same race from the other side: it expires
// the TTL, and the request already in the air simply set it again on arrival.
//
// A request carries the answer as of the moment it was DISPATCHED. So a caller
// that has since changed something may not be served from it, and its answer
// may not be written to the cache when it lands. These tests drive the module's
// loader directly — the ordering is the whole behaviour, and a renderer would
// only make it harder to see.

import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import type { EntitlementsSnapshot } from '../../../lib/entitlementsClient'

// ─── Browser shims ───────────────────────────────────────────────────────────
// The hook reads `localStorage` and `fetch` lazily, per call, so installing
// these before the first call is enough (see clientCache.test.ts).

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(k: string): string | null {
    return this.store.has(k) ? (this.store.get(k) as string) : null
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v))
  }
  removeItem(k: string): void {
    this.store.delete(k)
  }
  clear(): void {
    this.store.clear()
  }
  get length(): number {
    return this.store.size
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null
  }
}

const storage = new MemoryStorage()
const g = globalThis as unknown as {
  window: { localStorage: MemoryStorage }
  localStorage: MemoryStorage
  fetch: unknown
}
g.window = { localStorage: storage }
g.localStorage = storage

/** One dispatched request, held open so the test decides when (and in what
 *  order) each one lands. */
interface Pending {
  url: string
  token: string | null
  settle: (body: EntitlementsSnapshot) => void
  fail: (err: Error) => void
}

const requests: Pending[] = []

g.fetch = (url: string, init?: { headers?: Record<string, string> }) =>
  new Promise((resolve, reject) => {
    const auth = init?.headers?.Authorization ?? null
    requests.push({
      url: String(url),
      token: auth ? auth.replace(/^Bearer /, '') : null,
      settle: (body) =>
        resolve({ ok: true, json: async () => body } as unknown as Response),
      fail: reject,
    })
  })

// Required AFTER the shims so nothing can read a missing global at import time.
// `require` rather than a top-level `await import`: the test runner transforms
// these files to CJS, where top-level await is not available.
const {
  loadEntitlements,
  invalidateEntitlements,
  resetEntitlementsCache,
// eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('../../../hooks/useEntitlements') as typeof import('../../../hooks/useEntitlements')

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LOCKED = plan(false, 0)
const FREED = plan(true, 1)

function plan(canCreate: boolean, remaining: number): EntitlementsSnapshot {
  return {
    role: 'member',
    tier: 'free',
    enforced: true,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: false,
    features: {
      'custom-exercises': {
        allowed: true,
        canCreate,
        requiresTier: 'plus',
        limit: 3,
        used: 3 - remaining,
        remaining,
        resetsAt: null,
        window: 'lifetime',
      },
    },
  }
}

const canCreate = (s: EntitlementsSnapshot | null): boolean | null =>
  s?.features['custom-exercises']?.canCreate ?? null

function setToken(token: string | null): void {
  if (token === null) storage.removeItem('token')
  else storage.setItem('token', token)
}

beforeEach(() => {
  requests.length = 0
  storage.clear()
  setToken('member-1')
  // Also marks anything a previous test left in flight as superseded, so no
  // dangling request can leak into the next one.
  resetEntitlementsCache()
})

// ─── The bug ─────────────────────────────────────────────────────────────────

test('a forced refresh does not adopt the request that was already in flight', async () => {
  const mount = loadEntitlements(false)
  assert.equal(requests.length, 1, 'the mount issues one request')

  // The member deletes a custom exercise while that request is still open.
  const afterDelete = loadEntitlements(true)
  assert.equal(
    requests.length,
    2,
    'a forced read must dispatch its own request — the one already on the wire '
      + 'was sent before the delete and cannot contain it',
  )

  // The pre-delete answer lands first, exactly as it would in the browser.
  requests[0].settle(LOCKED)
  requests[1].settle(FREED)
  await Promise.all([mount, afterDelete])

  assert.equal(canCreate(await afterDelete), true, 'refresh must see the freed slot')

  // …and the stale answer must not have been certified fresh: a read inside the
  // TTL is served from the cache, so whatever is cached is what the member sees
  // for the next 60 seconds.
  const cached = await loadEntitlements(false)
  assert.equal(requests.length, 2, 'still within the TTL, so no new request')
  assert.equal(canCreate(cached), true, 'the cache must hold the post-delete answer')
})

test('a superseded response never overwrites the fresher one, whatever the order', async () => {
  const mount = loadEntitlements(false)
  const afterDelete = loadEntitlements(true)

  // The forced request wins the race; the stale one dawdles and lands after.
  requests[1].settle(FREED)
  await afterDelete
  requests[0].settle(LOCKED)
  await mount

  const cached = await loadEntitlements(false)
  assert.equal(canCreate(cached), true, 'the late pre-delete answer must be dropped')
  assert.equal(requests.length, 2, 'and dropping it must not have expired the TTL either')
})

test('invalidateEntitlements survives a response that was already in the air', async () => {
  const mount = loadEntitlements(false)
  assert.equal(requests.length, 1)

  // A meal page renders no gate, so its delete handler invalidates rather than
  // refetching. The next real reader is promised the truth.
  invalidateEntitlements()
  requests[0].settle(LOCKED)
  await mount

  const next = loadEntitlements(false)
  assert.equal(
    requests.length,
    2,
    'the in-flight answer must not have re-stamped fetchedAt and restored the TTL',
  )
  requests[1].settle(FREED)
  assert.equal(canCreate(await next), true)
})

test("a request for the previous identity never lands in the next member's cache", async () => {
  const first = loadEntitlements(false)
  requests[0].settle(FREED)
  await first

  // Signed-in member refreshes, then logs out and someone else signs in on the
  // same device before that request comes back.
  const stale = loadEntitlements(true)
  setToken('member-2')
  const second = loadEntitlements(false)
  assert.equal(requests.length, 3)
  assert.equal(requests[2].token, 'member-2')

  requests[2].settle(LOCKED) // member-2's real plan
  await second
  requests[1].settle(FREED) // member-1's plan, arriving late
  await stale

  const cached = await loadEntitlements(false)
  assert.equal(canCreate(cached), false, "member-2 must not inherit member-1's plan")
})

// ─── The properties the hook exists for, which the fix must not cost ─────────

test('ordinary reads still share one request per screen', async () => {
  const a = loadEntitlements(false)
  const b = loadEntitlements(false)
  const c = loadEntitlements(false)
  assert.equal(requests.length, 1, 'three gated components, one request')

  requests[0].settle(LOCKED)
  await Promise.all([a, b, c])

  await loadEntitlements(false)
  assert.equal(requests.length, 1, 'and a client-side navigation inside the TTL issues none')
})

test('a failed refresh leaves the last snapshot standing rather than locking', async () => {
  const first = loadEntitlements(false)
  requests[0].settle(FREED)
  await first

  const offline = loadEntitlements(true)
  requests[1].fail(new Error('network'))
  assert.equal(canCreate(await offline), true, 'a network blip must never add a lock')
})

test('a signed-out read fetches nothing and frees the slot for the next one', async () => {
  setToken(null)
  const out = loadEntitlements(false)
  assert.equal(requests.length, 0, 'nothing to read when there is no session')
  assert.equal(await out, null)

  // The in-flight slot has to be released even though that read never touched
  // the network — otherwise it holds a settled promise forever and every later
  // read is answered from it.
  setToken('member-1')
  const back = loadEntitlements(false)
  assert.equal(requests.length, 1, 'the next signed-in read must actually fetch')
  requests[0].settle(FREED)
  assert.equal(canCreate(await back), true)
})
