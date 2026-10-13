// Run with: npm run test:file tests/unit/push/subscribeBody.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSubscribeBody } from '../../../lib/push/subscribeBody'

const APNS = 'AB'.repeat(32)
const FCM = 'dGVzdA:APA91bH' + 'abc_DEF-123.'.repeat(12)

test('web: endpoint and both keys, platform defaults to web', () => {
  const ok = parseSubscribeBody({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } })
  assert.ok(ok.ok && ok.platform === 'web' && ok.keys?.auth === 'a')
  const noKeys = parseSubscribeBody({ endpoint: 'https://x', platform: 'web' })
  assert.deepEqual(noKeys, { ok: false, error: 'keys.p256dh and keys.auth required for web subscriptions' })
})

test('a missing endpoint or an unknown platform is refused', () => {
  assert.deepEqual(parseSubscribeBody({ platform: 'ios' }), { ok: false, error: 'endpoint is required' })
  assert.deepEqual(parseSubscribeBody(null), { ok: false, error: 'endpoint is required' })
  assert.equal(parseSubscribeBody({ endpoint: APNS, platform: 'windows' }).ok, false)
})

test('ios: a raw APNs hex token, stored lowercased, with an optional environment', () => {
  const parsed = parseSubscribeBody({ endpoint: APNS, platform: 'ios', reenable: true, apnsEnvironment: 'sandbox' })
  assert.ok(parsed.ok)
  assert.equal(parsed.endpoint, APNS.toLowerCase())
  assert.equal(parsed.reenable, true)
  assert.equal(parsed.apnsEnvironment, 'sandbox')
  assert.equal(parsed.keys, undefined)
  assert.equal(parseSubscribeBody({ endpoint: APNS, platform: 'ios', apnsEnvironment: 'dev' }).ok, false)
})

test('ios: anything that is not a hex token of plausible length is refused', () => {
  for (const bad of ['abc', 'zz'.repeat(32), 'ab'.repeat(31), 'ab '.repeat(32)]) {
    assert.deepEqual(parseSubscribeBody({ endpoint: bad, platform: 'ios' }), { ok: false, error: 'invalid_device_token' }, bad)
  }
})

test('android: a raw FCM registration token', () => {
  const parsed = parseSubscribeBody({ endpoint: FCM, platform: 'android' })
  assert.ok(parsed.ok && parsed.endpoint === FCM && parsed.platform === 'android')
  assert.deepEqual(parseSubscribeBody({ endpoint: 'has spaces in it and is long enough', platform: 'android' }), { ok: false, error: 'invalid_device_token' })
  assert.deepEqual(parseSubscribeBody({ endpoint: 'short', platform: 'android' }), { ok: false, error: 'invalid_device_token' })
})

test('Expo push tokens are refused on both native platforms', () => {
  for (const platform of ['ios', 'android']) {
    for (const endpoint of ['ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', 'ExpoPushToken[yyyyyyyyyyyyyyyy]']) {
      assert.deepEqual(parseSubscribeBody({ endpoint, platform }), { ok: false, error: 'expo_push_token_not_supported' })
    }
  }
})

test('reenable is only ever an explicit true', () => {
  const parsed = parseSubscribeBody({ endpoint: APNS, platform: 'ios', reenable: 'true' })
  assert.ok(parsed.ok && parsed.reenable === false)
})

test('the subscribe route validates through parseSubscribeBody before touching the database', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/notifications/subscribe/route.ts'), 'utf8')
  const parseAt = src.indexOf('parseSubscribeBody(')
  const dbAt = src.indexOf('await dbConnect()')
  assert.ok(parseAt > 0 && dbAt > parseAt)
  assert.match(src, /status: 400/)
})
