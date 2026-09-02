// Run with: npx tsx --test tests/unit/billing/billingCustomer.test.ts
//
// Two Stripe customers on one member is a genuine mess: the subscription lands
// on one, the portal opens the other, and the member cannot cancel the thing
// they are being charged for. A double-tapped upgrade button is all it takes,
// because read-then-create is racy — both requests read "no customer" and both
// create one.
//
// The fix is a GUARDED write that only matches a document whose mode-specific
// field is still empty, and a loser that reads back the winner's id. Its own
// freshly-created Stripe customer is orphaned and harmless.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureStripeCustomer } from '../../../lib/billing/customer'
import type { StripeLike } from '../../../lib/billing/stripeClient'
import type { StripeMode } from '../../../lib/billing/mode'

interface Created {
  email?: string
  name?: string
  metadata?: Record<string, string>
}

function fakeStripe(nextId = 'cus_new_1'): { stripe: StripeLike; created: Created[] } {
  const created: Created[] = []
  const stripe = {
    customers: {
      async create(params: Created) {
        created.push(params)
        return { id: nextId }
      },
    },
  } as unknown as StripeLike
  return { stripe, created }
}

/** Mirrors the mongoDeps store: one field per mode, guarded write. */
function fakeStore(initial: Partial<Record<StripeMode, string>> = {}) {
  const stored: Partial<Record<StripeMode, string>> = { ...initial }
  const writes: Array<{ mode: StripeMode; customerId: string }> = []
  return {
    stored,
    writes,
    readCustomerId: async (_userId: string, mode: StripeMode) => stored[mode],
    writeCustomerIdIfAbsent: async (_userId: string, mode: StripeMode, customerId: string) => {
      writes.push({ mode, customerId })
      if (stored[mode]) return { id: stored[mode]!, won: false }
      stored[mode] = customerId
      return { id: customerId, won: true }
    },
  }
}

test('an existing customer is reused — Stripe is never called', async () => {
  const { stripe, created } = fakeStripe()
  const store = fakeStore({ test: 'cus_already_there' })

  const id = await ensureStripeCustomer({
    userId: 'user_1',
    email: 'member@example.test',
    mode: 'test',
    appChannel: 'beta',
    stripe,
    ...store,
  })

  assert.equal(id, 'cus_already_there')
  assert.equal(created.length, 0, 'a second customers.create is the bug this prevents')
  assert.equal(store.writes.length, 0)
})

test('a first-time member gets a customer carrying userId and channel metadata', async () => {
  const { stripe, created } = fakeStripe('cus_fresh')
  const store = fakeStore()

  const id = await ensureStripeCustomer({
    userId: 'user_1',
    email: 'member@example.test',
    name: 'A Member',
    mode: 'test',
    appChannel: 'beta',
    stripe,
    ...store,
  })

  assert.equal(id, 'cus_fresh')
  assert.equal(created.length, 1)
  assert.equal(created[0].email, 'member@example.test')
  assert.equal(created[0].name, 'A Member')
  // userId is the join key every webhook falls back to; appChannel is what
  // makes a beta-created customer identifiable in the Stripe dashboard.
  assert.deepEqual(created[0].metadata, { userId: 'user_1', appChannel: 'beta' })
})

test('losing the guarded write returns the WINNER’s id, not the orphan', async () => {
  const { stripe } = fakeStripe('cus_loser')
  const store = fakeStore()
  // Simulate the concurrent winner landing between the read and the write.
  const racing = {
    readCustomerId: async () => undefined,
    writeCustomerIdIfAbsent: async () => ({ id: 'cus_winner', won: false }),
  }

  const id = await ensureStripeCustomer({
    userId: 'user_1',
    email: 'member@example.test',
    mode: 'test',
    appChannel: 'prod',
    stripe,
    ...store,
    ...racing,
  })

  assert.equal(id, 'cus_winner', 'the checkout must use the id the document actually holds')
})

test('test mode never touches the live field, and live never touches the test one', async () => {
  const testRun = fakeStore()
  await ensureStripeCustomer({
    userId: 'user_1',
    email: 'm@example.test',
    mode: 'test',
    appChannel: 'beta',
    stripe: fakeStripe('cus_test_side').stripe,
    ...testRun,
  })
  assert.equal(testRun.stored.test, 'cus_test_side')
  assert.equal(testRun.stored.live, undefined)

  const liveRun = fakeStore()
  await ensureStripeCustomer({
    userId: 'user_1',
    email: 'm@example.test',
    mode: 'live',
    appChannel: 'prod',
    stripe: fakeStripe('cus_live_side').stripe,
    ...liveRun,
  })
  assert.equal(liveRun.stored.live, 'cus_live_side')
  assert.equal(liveRun.stored.test, undefined)
})

test('a member can hold both a live and a test customer at once', async () => {
  // They are different Stripe accounts, so the two ids can never share a field.
  const store = fakeStore({ live: 'cus_real' })
  const id = await ensureStripeCustomer({
    userId: 'user_1',
    email: 'm@example.test',
    mode: 'test',
    appChannel: 'beta',
    stripe: fakeStripe('cus_sandbox').stripe,
    ...store,
  })

  assert.equal(id, 'cus_sandbox')
  assert.equal(store.stored.live, 'cus_real', 'the live id must be untouched')
})
