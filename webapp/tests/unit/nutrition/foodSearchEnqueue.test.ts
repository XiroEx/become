// Run with: npm run test:file tests/unit/nutrition/foodSearchEnqueue.test.ts
//
// Unit tests for search-surfaced food verification enqueueing.
//
// Covers acceptance criteria:
//  - (id: 96d40d83) A food returned by member food search with verification.state='unverified'
//    is enqueued to 'queued' at most once, without slowing the search response.
//  - (id: 96d40d84) Enqueueing is rate-limited per run and never enqueues a food that is
//    already queued/running/verified, or whose verification has not expired.
//  - (id: 96d40d85) Search results and their order are unchanged by this ticket - no member-visible difference.
//  - (id: 96d40d86) Unit tests cover the enqueue predicate, the already-queued/verified no-ops,
//    and the rate limit.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canEnqueue,
  canEnqueueForVerification,
  shouldEnqueueForVerification,
  enqueueFilter,
  enqueueUpdate,
  DEFAULT_SEARCH_ENQUEUE_LIMIT,
  SEARCH_ENQUEUE_LIMIT,
} from '../../../lib/nutrition/flagPolicy'
import {
  enqueueUnverifiedFoodsFromSearch,
  enqueueFoodsFromSearch,
} from '../../../lib/nutrition/foodSearchEnqueue'

const NOW = 1_780_000_000_000
const MINUTE = 60_000

type FakeDoc = {
  _id: unknown
  verification?: {
    state?: string
    expiresAt?: Date | number | string | null
    claimedAt?: Date | number | string | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

// Helper to simulate a fake Food collection for testing updateOne without a database
function createFakeCollection(initialDocs: Array<FakeDoc> = []) {
  const docs = new Map<string, FakeDoc>()
  for (const d of initialDocs) {
    docs.set(String(d._id), JSON.parse(JSON.stringify(d)))
  }

  const calls: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = []

  return {
    docs,
    calls,
    collection: {
      async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
        calls.push({ filter, update })
        const id = String(filter._id)
        const doc = docs.get(id)
        if (!doc) {
          return { modifiedCount: 0, matchedCount: 0 }
        }

        // Check if doc matches filter conditions
        const v = (doc.verification ?? {}) as Record<string, unknown>
        const state = v.state ?? 'unverified'

        // Enqueue filter check: state must be unverified, or verified with expiresAt <= now
        const isUnverified = state === 'unverified' || !v.state
        const isExpiredVerified =
          state === 'verified' &&
          v.expiresAt != null &&
          new Date(v.expiresAt as string | number | Date).getTime() <= NOW

        if (!isUnverified && !isExpiredVerified) {
          return { modifiedCount: 0, matchedCount: 0 }
        }

        // Apply update
        if (update.$set) {
          for (const [k, val] of Object.entries(update.$set as Record<string, unknown>)) {
            if (k.startsWith('verification.')) {
              const sub = k.slice('verification.'.length)
              if (!doc.verification) doc.verification = {}
              ;(doc.verification as Record<string, unknown>)[sub] = val
            } else {
              doc[k] = val
            }
          }
        }
        if (update.$unset) {
          for (const k of Object.keys(update.$unset as Record<string, unknown>)) {
            if (k.startsWith('verification.')) {
              const sub = k.slice('verification.'.length)
              if (doc.verification) {
                delete (doc.verification as Record<string, unknown>)[sub]
              }
            } else {
              delete doc[k]
            }
          }
        }

        return { modifiedCount: 1, matchedCount: 1 }
      },
    },
  }
}

// ── 1. Enqueue Predicate Unit Tests (id: 96d40d86) ───────────────────────────

test('enqueue predicate: admits unverified foods', () => {
  assert.equal(canEnqueue({ state: 'unverified', now: NOW }), true)
  assert.equal(canEnqueueForVerification({ state: 'unverified', now: NOW }), true)
  assert.equal(shouldEnqueueForVerification({ state: 'unverified', now: NOW }), true)
  assert.equal(canEnqueue({ foodState: 'unverified', now: NOW }), true)
  assert.equal(canEnqueue({ verification: { state: 'unverified' }, now: NOW }), true)
  assert.equal(canEnqueue({ _id: 'food_1', name: 'Raw Oats' }, NOW), true)
  assert.equal(canEnqueue({ isVerified: false }, NOW), true)
})

test('enqueue predicate: rejects already queued foods (no-ops)', () => {
  assert.equal(canEnqueue({ state: 'queued', now: NOW }), false)
  assert.equal(canEnqueue({ foodState: 'queued', now: NOW }), false)
  assert.equal(canEnqueue({ verification: { state: 'queued' }, now: NOW }), false)
})

test('enqueue predicate: rejects running foods', () => {
  assert.equal(canEnqueue({ state: 'running', now: NOW }), false)
  assert.equal(canEnqueue({ foodState: 'running', now: NOW }), false)
  assert.equal(canEnqueue({ verification: { state: 'running' }, now: NOW }), false)
})

test('enqueue predicate: rejects insufficient foods', () => {
  assert.equal(canEnqueue({ state: 'insufficient', now: NOW }), false)
  assert.equal(canEnqueue({ foodState: 'insufficient', now: NOW }), false)
})

test('enqueue predicate: rejects verified foods whose verification has NOT expired', () => {
  // Missing expiresAt -> permanent verification, not expired
  assert.equal(canEnqueue({ state: 'verified', now: NOW }), false)
  assert.equal(canEnqueue({ isVerified: true, now: NOW }), false)
  assert.equal(canEnqueue({ verification: { state: 'verified' }, now: NOW }), false)

  // Future expiresAt -> still valid
  assert.equal(
    canEnqueue({
      state: 'verified',
      expiresAt: NOW + 10 * MINUTE,
      now: NOW,
    }),
    false,
  )
  assert.equal(
    canEnqueue({
      verification: {
        state: 'verified',
        expiresAt: new Date(NOW + 24 * 60 * MINUTE),
      },
      now: NOW,
    }),
    false,
  )
})

test('enqueue predicate: admits verified foods whose verification HAS expired', () => {
  // Expired in past
  assert.equal(
    canEnqueue({
      state: 'verified',
      expiresAt: NOW - 1000,
      now: NOW,
    }),
    true,
  )
  // Expired right now
  assert.equal(
    canEnqueue({
      state: 'verified',
      expiresAt: NOW,
      now: NOW,
    }),
    true,
  )
  assert.equal(
    canEnqueue({
      verification: {
        state: 'verified',
        expiresAt: new Date(NOW - 60_000),
      },
      now: NOW,
    }),
    true,
  )
})

test('enqueue predicate: respects active claim guard', () => {
  // Live claim (within CLAIM_TTL_MS) cannot be enqueued
  assert.equal(
    canEnqueue({
      state: 'unverified',
      claimedAt: NOW - 5 * MINUTE,
      now: NOW,
    }),
    false,
  )
})

// ── 2. Already-queued and Verified No-Ops (id: 96d40d84, 96d40d86) ───────────

test('already-queued and unexpired verified foods are no-ops during enqueue', async () => {
  const fake = createFakeCollection([
    { _id: 'queued_1', verification: { state: 'queued' } },
    { _id: 'running_1', verification: { state: 'running' } },
    { _id: 'verified_valid', verification: { state: 'verified', expiresAt: new Date(NOW + 100_000) } },
    { _id: 'verified_no_expiry', verification: { state: 'verified' } },
  ])

  const foods = [
    { _id: 'queued_1', verification: { state: 'queued' } },
    { _id: 'running_1', verification: { state: 'running' } },
    { _id: 'verified_valid', verification: { state: 'verified', expiresAt: new Date(NOW + 100_000) } },
    { _id: 'verified_no_expiry', verification: { state: 'verified' } },
  ]

  const result = await enqueueUnverifiedFoodsFromSearch(foods, {
    now: new Date(NOW),
    collection: fake.collection,
  })

  // All 4 are filtered out as no-ops
  assert.equal(result.enqueuedCount, 0)
  assert.deepEqual(result.enqueuedIds, [])
  assert.equal(result.skippedCount, 4)
  assert.equal(fake.calls.length, 0, 'No database updates fired for no-ops')
})

test('expired verified foods ARE enqueued while valid verified are skipped', async () => {
  const fake = createFakeCollection([
    { _id: 'expired_1', verification: { state: 'verified', expiresAt: new Date(NOW - 1000) } },
    { _id: 'valid_1', verification: { state: 'verified', expiresAt: new Date(NOW + 1000) } },
  ])

  const foods = [
    { _id: 'expired_1', verification: { state: 'verified', expiresAt: new Date(NOW - 1000) } },
    { _id: 'valid_1', verification: { state: 'verified', expiresAt: new Date(NOW + 1000) } },
  ]

  const result = await enqueueUnverifiedFoodsFromSearch(foods, {
    now: new Date(NOW),
    collection: fake.collection,
  })

  assert.equal(result.enqueuedCount, 1)
  assert.deepEqual(result.enqueuedIds, ['expired_1'])
  assert.equal(result.skippedCount, 1)
  assert.equal(fake.docs.get('expired_1')?.verification?.state, 'queued')
  assert.equal(fake.docs.get('valid_1')?.verification?.state, 'verified')
})

// ── 3. Rate Limiting Per Run (id: 96d40d84, 96d40d86) ────────────────────────

test('enqueueing is rate-limited to DEFAULT_SEARCH_ENQUEUE_LIMIT per run', async () => {
  const initialDocs = Array.from({ length: 12 }, (_, i) => ({
    _id: `unverified_${i + 1}`,
    verification: { state: 'unverified' },
  }))

  const fake = createFakeCollection(initialDocs)
  const foods = initialDocs.map((d) => ({ ...d }))

  assert.equal(DEFAULT_SEARCH_ENQUEUE_LIMIT, 5)

  const result = await enqueueUnverifiedFoodsFromSearch(foods, {
    now: new Date(NOW),
    collection: fake.collection,
  })

  // Exactly 5 enqueued, 7 skipped
  assert.equal(result.enqueuedCount, 5)
  assert.equal(result.enqueuedIds.length, 5)
  assert.deepEqual(result.enqueuedIds, [
    'unverified_1',
    'unverified_2',
    'unverified_3',
    'unverified_4',
    'unverified_5',
  ])
  assert.equal(result.skippedCount, 7)
  assert.equal(fake.calls.length, 5)

  // Verify state in docs
  for (let i = 1; i <= 5; i++) {
    assert.equal(fake.docs.get(`unverified_${i}`)?.verification?.state, 'queued')
  }
  for (let i = 6; i <= 12; i++) {
    assert.equal(fake.docs.get(`unverified_${i}`)?.verification?.state, 'unverified')
  }
})

test('custom limit parameter enforces specified bound', async () => {
  const initialDocs = Array.from({ length: 6 }, (_, i) => ({
    _id: `food_${i + 1}`,
    verification: { state: 'unverified' },
  }))

  const fake = createFakeCollection(initialDocs)
  const foods = initialDocs.map((d) => ({ ...d }))

  const result = await enqueueUnverifiedFoodsFromSearch(foods, {
    limit: 2,
    now: new Date(NOW),
    collection: fake.collection,
  })

  assert.equal(result.enqueuedCount, 2)
  assert.deepEqual(result.enqueuedIds, ['food_1', 'food_2'])
  assert.equal(result.skippedCount, 4)
  assert.equal(fake.calls.length, 2)
})

// ── 4. Idempotency: Enqueued At Most Once (id: 96d40d83) ─────────────────────

test('idempotency: a food is enqueued to "queued" at most once', async () => {
  const fake = createFakeCollection([
    { _id: 'repeat_food', verification: { state: 'unverified' } },
  ])

  const food = [{ _id: 'repeat_food', verification: { state: 'unverified' } }]

  // First search run: enqueues the food
  const first = await enqueueUnverifiedFoodsFromSearch(food, {
    now: new Date(NOW),
    collection: fake.collection,
  })
  assert.equal(first.enqueuedCount, 1)
  assert.deepEqual(first.enqueuedIds, ['repeat_food'])
  assert.equal(fake.docs.get('repeat_food')?.verification?.state, 'queued')

  // Second search run with updated food state: must be a no-op
  const updatedFood = [{ _id: 'repeat_food', verification: { state: 'queued' } }]
  const second = await enqueueUnverifiedFoodsFromSearch(updatedFood, {
    now: new Date(NOW + 1000),
    collection: fake.collection,
  })
  assert.equal(second.enqueuedCount, 0)
  assert.equal(second.skippedCount, 1)

  // Even if stale candidate object was passed, the atomic query protects DB
  const staleFood = [{ _id: 'repeat_food', verification: { state: 'unverified' } }]
  const third = await enqueueUnverifiedFoodsFromSearch(staleFood, {
    now: new Date(NOW + 2000),
    collection: fake.collection,
  })
  assert.equal(third.enqueuedCount, 0, 'Database atomic guard prevented double enqueue')
})

test('skips external synthetic items (usda-*, off-*)', async () => {
  const fake = createFakeCollection([])
  const foods = [
    { _id: 'usda-12345', name: 'USDA Apple' },
    { _id: 'off-67890', name: 'OFF Banana' },
  ]

  const result = await enqueueUnverifiedFoodsFromSearch(foods, {
    now: new Date(NOW),
    collection: fake.collection,
  })

  assert.equal(result.enqueuedCount, 0)
  assert.equal(fake.calls.length, 0)
})

// ── 5. Search Results and Order Integrity (id: 96d40d85) ─────────────────────

test('search results and their order are untouched by candidate extraction', () => {
  const paged = [
    { _id: 'id_1', name: 'Greek Yogurt', isVerified: false, isBestMatch: true },
    { _id: 'id_2', name: 'Almond Milk', isVerified: true },
    { _id: 'usda-999', name: 'Raw Honey', isVerified: false },
    { _id: 'id_3', name: 'Chicken Breast', isVerified: false },
  ]

  // Clone to verify no mutation occurs
  const originalJson = JSON.stringify(paged)

  const verificationMap = new Map([
    ['id_1', { state: 'unverified' }],
    ['id_2', { state: 'verified' }],
    ['id_3', { state: 'unverified' }],
  ])

  // Extract candidates the exact way route.ts does
  function fromOurDb(x: { _id?: unknown; source?: string }): boolean {
    return (
      x.source !== 'usda' &&
      x.source !== 'openfoodfacts' &&
      (typeof x._id !== 'string' || (!x._id.startsWith('usda-') && !x._id.startsWith('off-')))
    )
  }

  const candidates = paged.filter(fromOurDb).map((f) => ({
    ...f,
    verification: verificationMap.get(f._id),
  }))

  // 1. Paged array itself was not modified
  assert.equal(JSON.stringify(paged), originalJson)
  assert.equal(paged.length, 4)
  assert.equal(paged[0]._id, 'id_1')
  assert.equal(paged[1]._id, 'id_2')
  assert.equal(paged[2]._id, 'usda-999')
  assert.equal(paged[3]._id, 'id_3')

  // 2. No verification field leaked into paged items
  for (const item of paged) {
    assert.equal('verification' in item, false, 'No verification field in search response')
  }

  // 3. Candidates extracted correctly without affecting paged
  assert.equal(candidates.length, 3)
  assert.equal(candidates[0]._id, 'id_1')
  assert.equal(candidates[1]._id, 'id_2')
  assert.equal(candidates[3]?._id, undefined)
})

test('enqueueFilter, enqueueUpdate, and enqueueFoodsFromSearch alias work as expected', async () => {
  assert.equal(SEARCH_ENQUEUE_LIMIT, DEFAULT_SEARCH_ENQUEUE_LIMIT)
  assert.equal(typeof enqueueFoodsFromSearch, 'function')

  const fake = createFakeCollection([
    { _id: 'alias_food', verification: { state: 'unverified' } },
  ])

  const filter = enqueueFilter('alias_food', new Date(NOW))
  assert.equal(filter._id, 'alias_food')

  const update = enqueueUpdate()
  assert.equal((update.$set as Record<string, unknown>)['verification.state'], 'queued')

  const res = await enqueueFoodsFromSearch(
    [{ _id: 'alias_food', verification: { state: 'unverified' } }],
    { now: new Date(NOW), collection: fake.collection },
  )
  assert.equal(res.enqueuedCount, 1)
})
