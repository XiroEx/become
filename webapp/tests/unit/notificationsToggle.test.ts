// Run with: npm run test:file tests/unit/notificationsToggle.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notificationsAreEnabled } from '../../lib/push/notificationsToggle'

test('undefined/null reads as enabled — matches notificationPrefs.<category> convention', () => {
  assert.equal(notificationsAreEnabled(undefined), true)
  assert.equal(notificationsAreEnabled(null), true)
})

test('true reads as enabled', () => {
  assert.equal(notificationsAreEnabled(true), true)
})

test('only an explicit false reads as disabled', () => {
  assert.equal(notificationsAreEnabled(false), false)
})
