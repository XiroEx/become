// Run with: npm run test:file tests/unit/pushEnsureSubscription.test.ts
//
// The pure decision logic behind lib/push/ensureSubscription.ts. The bug it
// exists to fix: every path that could create a push subscription was gated on
// `Notification.permission === 'default'`, so once a user granted permission
// the app could never make another one. When theirs expired, rotated, or was
// pruned on 404/410, they went silent forever while Settings said "Active".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldResync, keysMatch, RESYNC_INTERVAL_MS } from '../../lib/push/ensureSubscription'

const NOW = 1_760_000_000_000

test('a device that has never synced always syncs', () => {
  assert.equal(shouldResync(null, NOW), true)
  assert.equal(shouldResync('', NOW), true)
})

test('an unparseable or nonsensical timestamp syncs rather than being trusted', () => {
  // Treating garbage as "recent" is exactly how a device stays invisible.
  assert.equal(shouldResync('not-a-number', NOW), true)
  assert.equal(shouldResync('0', NOW), true)
  assert.equal(shouldResync('-5', NOW), true)
})

test('a recent sync is skipped, an old one is repeated', () => {
  assert.equal(shouldResync(String(NOW - 60_000), NOW), false)
  assert.equal(shouldResync(String(NOW - RESYNC_INTERVAL_MS + 1000), NOW), false)
  assert.equal(shouldResync(String(NOW - RESYNC_INTERVAL_MS), NOW), true)
  assert.equal(shouldResync(String(NOW - 5 * RESYNC_INTERVAL_MS), NOW), true)
})

test('a timestamp in the future re-syncs instead of wedging forever', () => {
  // A device whose clock jumped forward once would otherwise never sync again.
  assert.equal(shouldResync(String(NOW + 10 * RESYNC_INTERVAL_MS), NOW), true)
})

test('keysMatch compares the raw VAPID bytes', () => {
  const key = Uint8Array.from([1, 2, 3, 4, 5])
  assert.equal(keysMatch(Uint8Array.from([1, 2, 3, 4, 5]).buffer, key), true)
  assert.equal(keysMatch(Uint8Array.from([1, 2, 3, 4, 9]).buffer, key), false)
  // Different length — a truncated or padded key is not our key.
  assert.equal(keysMatch(Uint8Array.from([1, 2, 3, 4]).buffer, key), false)
  assert.equal(keysMatch(Uint8Array.from([1, 2, 3, 4, 5, 6]).buffer, key), false)
})

test('a subscription with no applicationServerKey is treated as a mismatch', () => {
  // Sending to one signed by a key we no longer hold fails 403 — silently, and
  // indistinguishably from "no notifications". Replace it rather than keep it.
  const key = Uint8Array.from([1, 2, 3])
  assert.equal(keysMatch(null, key), false)
  assert.equal(keysMatch(undefined, key), false)
})
