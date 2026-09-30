// Run with: npm run test:file tests/unit/billing/billingEventStore.test.ts
//
// Stripe retries any delivery that did not answer 2xx, and occasionally
// redelivers one that did. Without a claim, a retried
// `customer.subscription.deleted` re-runs after the member has resubscribed and
// the second apply undoes the first.
//
// The release-on-throw case is the subtle one. If a handler throws and the
// claim row is LEFT behind, the route's 500 makes Stripe retry — and every
// retry then short-circuits as a duplicate and does nothing. The event is lost
// silently, forever, with a log line that says only "500".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withEventClaim, type EventClaimStore } from '../../../lib/billing/eventStore'

/** In-memory store with the same atomic semantics as the unique index. */
class FakeClaimStore implements EventClaimStore {
  claims = new Map<string, { type: string; mode: string; status: string }>()
  released: string[] = []
  processed: string[] = []

  async claim(eventId: string, type: string, mode: 'test' | 'live') {
    if (this.claims.has(eventId)) return 'duplicate' as const
    this.claims.set(eventId, { type, mode, status: 'processing' })
    return 'claimed' as const
  }
  async markProcessed(eventId: string) {
    this.processed.push(eventId)
    const row = this.claims.get(eventId)
    if (row) row.status = 'processed'
  }
  async release(eventId: string) {
    this.released.push(eventId)
    this.claims.delete(eventId)
  }
}

test('the first claim wins and the second is a duplicate', async () => {
  const store = new FakeClaimStore()
  assert.equal(await store.claim('evt_1', 'customer.subscription.updated', 'test'), 'claimed')
  assert.equal(await store.claim('evt_1', 'customer.subscription.updated', 'test'), 'duplicate')
})

test('a duplicate never runs the body', async () => {
  const store = new FakeClaimStore()
  let runs = 0
  const body = async () => {
    runs += 1
    return 'applied'
  }

  const first = await withEventClaim(store, 'evt_2', 'invoice.payment_failed', 'test', body)
  assert.deepEqual(first, { duplicate: false, result: 'applied' })

  const second = await withEventClaim(store, 'evt_2', 'invoice.payment_failed', 'test', body)
  assert.deepEqual(second, { duplicate: true })
  assert.equal(runs, 1, 'the redelivery must not re-apply')
})

test('a successful run is marked processed', async () => {
  const store = new FakeClaimStore()
  await withEventClaim(store, 'evt_3', 'customer.subscription.created', 'live', async () => 'ok')
  assert.deepEqual(store.processed, ['evt_3'])
  assert.equal(store.claims.get('evt_3')?.status, 'processed')
  assert.deepEqual(store.released, [])
})

test('a throwing body releases the claim AND rethrows', async () => {
  const store = new FakeClaimStore()
  await assert.rejects(
    () =>
      withEventClaim(store, 'evt_4', 'customer.subscription.updated', 'test', async () => {
        throw new Error('mongo went away')
      }),
    /mongo went away/,
  )

  assert.deepEqual(store.released, ['evt_4'])
  assert.equal(store.claims.has('evt_4'), false, 'the retry must be able to re-claim')
  assert.deepEqual(store.processed, [])
})

test('a released claim can be taken again by the retry', async () => {
  const store = new FakeClaimStore()
  await assert.rejects(() =>
    withEventClaim(store, 'evt_5', 'invoice.payment_failed', 'test', async () => {
      throw new Error('transient')
    }),
  )

  const retry = await withEventClaim(store, 'evt_5', 'invoice.payment_failed', 'test', async () => 'ok')
  assert.deepEqual(retry, { duplicate: false, result: 'ok' })
})

test('a failing release does not mask the original error', async () => {
  const store: EventClaimStore = {
    claim: async () => 'claimed',
    markProcessed: async () => {},
    release: async () => {
      throw new Error('release also failed')
    },
  }

  await assert.rejects(
    () =>
      withEventClaim(store, 'evt_6', 'customer.subscription.deleted', 'test', async () => {
        throw new Error('the real problem')
      }),
    /the real problem/,
  )
})

test('the claim carries the mode, so test and live ids never collide in meaning', async () => {
  const store = new FakeClaimStore()
  await withEventClaim(store, 'evt_7', 'customer.subscription.updated', 'live', async () => 'ok')
  assert.equal(store.claims.get('evt_7')?.mode, 'live')
})
