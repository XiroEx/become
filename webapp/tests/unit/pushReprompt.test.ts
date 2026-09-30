// Run with: npm run test:file tests/unit/pushReprompt.test.ts
//
// The pure decision logic behind the "notifications are blocked" reminder in
// components/NotificationOptIn.tsx. Browsers give JS no way to re-open the
// native permission dialog once a user denies it, so the card's behavior is
// entirely this cadence: first nudge 7 days after the initial denial, then
// once a month for as long as permission stays denied.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DENIAL_REPROMPT_DELAY_MS,
  DENIAL_REPROMPT_INTERVAL_MS,
  parseStoredTimestamp,
  resolveDeniedAt,
  shouldShowDeniedReprompt,
} from '../../lib/push/reprompt'

const NOW = 1_760_000_000_000
const DAY = 24 * 60 * 60 * 1000

test('parseStoredTimestamp rejects absent, garbage, and non-positive values', () => {
  assert.equal(parseStoredTimestamp(null), null)
  assert.equal(parseStoredTimestamp(''), null)
  assert.equal(parseStoredTimestamp('not-a-number'), null)
  assert.equal(parseStoredTimestamp('0'), null)
  assert.equal(parseStoredTimestamp('-5'), null)
  assert.equal(parseStoredTimestamp('12345'), 12345)
})

test('resolveDeniedAt: first observed denial wins and does not get overwritten', () => {
  assert.equal(resolveDeniedAt(null, NOW), NOW)
  assert.equal(resolveDeniedAt(String(NOW - 10 * DAY), NOW), NOW - 10 * DAY)
  // A corrupt stored value is treated as absent, not trusted.
  assert.equal(resolveDeniedAt('garbage', NOW), NOW)
})

test('no reminder before 7 days have passed since the initial denial', () => {
  assert.equal(shouldShowDeniedReprompt(NOW, null, NOW), false)
  assert.equal(shouldShowDeniedReprompt(NOW - (DENIAL_REPROMPT_DELAY_MS - 1000), null, NOW), false)
})

test('first reminder fires once 7 days have passed and none has shown yet', () => {
  assert.equal(shouldShowDeniedReprompt(NOW - DENIAL_REPROMPT_DELAY_MS, null, NOW), true)
  assert.equal(shouldShowDeniedReprompt(NOW - 30 * DAY, null, NOW), true)
})

test('after showing once, the next reminder waits a full month', () => {
  const deniedAt = NOW - 40 * DAY
  const shownAt = NOW - 10 * DAY
  assert.equal(shouldShowDeniedReprompt(deniedAt, shownAt, NOW), false)
  assert.equal(shouldShowDeniedReprompt(deniedAt, NOW - DENIAL_REPROMPT_INTERVAL_MS, NOW), true)
  assert.equal(shouldShowDeniedReprompt(deniedAt, NOW - 45 * DAY, NOW), true)
})

test('a lastShownAt in the future re-shows instead of wedging off forever', () => {
  assert.equal(shouldShowDeniedReprompt(NOW - 40 * DAY, NOW + 5 * DAY, NOW), true)
})

test('an invalid deniedAt never shows the reminder', () => {
  assert.equal(shouldShowDeniedReprompt(0, null, NOW), false)
  assert.equal(shouldShowDeniedReprompt(-1, null, NOW), false)
  assert.equal(shouldShowDeniedReprompt(NaN, null, NOW), false)
})
