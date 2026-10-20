// Run with: npm run test:file tests/unit/push/sendPushMuted.test.ts
//
// (id: e015cb2f) isSendableWebSubscription: the rule that keeps a member who
// installed the native app from getting a reminder twice on the same phone.
// Pure, so this is exercised without a database, web-push, or a VAPID key —
// see lib/pushNotification.ts for where it is actually applied.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSendableWebSubscription } from '../../../lib/pushNotification'

test('(id: e015cb2f) an active web subscription (keys, not muted) is sendable', () => {
  assert.equal(isSendableWebSubscription({ keys: { p256dh: 'p', auth: 'a' } }), true)
})

test('(id: e015cb2f) a muted web subscription is skipped, even with valid keys', () => {
  assert.equal(
    isSendableWebSubscription({ keys: { p256dh: 'p', auth: 'a' }, mutedAt: new Date() }),
    false,
  )
})

test('(id: e015cb2f) a row with no keys is never sendable, muted or not', () => {
  assert.equal(isSendableWebSubscription({}), false)
  assert.equal(isSendableWebSubscription({ mutedAt: null }), false)
})

test('(id: e015cb2f) mutedAt: null/undefined reads as not muted (unmuted via reenable)', () => {
  assert.equal(isSendableWebSubscription({ keys: { p256dh: 'p', auth: 'a' }, mutedAt: null }), true)
  assert.equal(isSendableWebSubscription({ keys: { p256dh: 'p', auth: 'a' }, mutedAt: undefined }), true)
})
