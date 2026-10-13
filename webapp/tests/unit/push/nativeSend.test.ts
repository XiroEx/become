// Run with: npm run test:file tests/unit/push/nativeSend.test.ts
//
// The native fan-out with fake transports: what reaches APNs and FCM, what
// counts as delivered, which tokens get pruned, and what is never sent.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resetApnsProviderToken, type ApnsRequest, type ApnsResponse } from '../../../lib/push/apns'
import { resetFcmAccessToken, type FcmDeps } from '../../../lib/push/fcm'
import type { ApnsConfig, FcmConfig } from '../../../lib/push/nativeConfig'
import {
  __resetNativeSendWarningsForTests,
  sendToNativeDevices,
  type NativeSendDeps,
  type NativeSubscriptionRow,
} from '../../../lib/push/nativeSend'
import { ecKeyPair, rsaKeyPair } from './keys'

const APNS: ApnsConfig = {
  keyId: 'ABC123DEFG',
  teamId: 'Y7X4278T48',
  bundleId: 'io.redbtn.become',
  privateKey: ecKeyPair().privatePem,
  environment: 'production',
}
const FCM: FcmConfig = {
  projectId: 'become-test',
  clientEmail: 'fcm@become-test.iam.gserviceaccount.com',
  privateKey: rsaKeyPair().privatePem,
  tokenUri: 'https://oauth2.googleapis.com/token',
}

const IOS = (id: string, extra: Partial<NativeSubscriptionRow> = {}): NativeSubscriptionRow =>
  ({ id, platform: 'ios', endpoint: id.padEnd(64, '0').slice(0, 64), ...extra })
const ANDROID = (id: string): NativeSubscriptionRow =>
  ({ id, platform: 'android', endpoint: `fcm:${id}:${'x'.repeat(60)}` })

const MSG = { title: 'Daily glance', body: '2 left today', url: '/dashboard', tag: 'daily-glance', badgeCount: 2 }

function harness(opts: {
  apns?: (req: ApnsRequest, n: number) => ApnsResponse
  fcm?: (body: any) => { status: number; body?: unknown }
} = {}) {
  const apnsCalls: ApnsRequest[] = []
  const fcmBodies: any[] = []
  const warnings: string[] = []
  const errors: string[] = []
  const fcm: FcmDeps = {
    now: () => Date.UTC(2026, 9, 13, 12),
    sleep: async () => {},
    fetch: async (url, init) => {
      if (url === FCM.tokenUri) {
        return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ access_token: 'at', expires_in: 3600 }) }
      }
      const body = JSON.parse(init.body)
      fcmBodies.push(body)
      const res = opts.fcm?.(body) ?? { status: 200 }
      return { status: res.status, headers: { get: () => null }, text: async () => JSON.stringify(res.body ?? {}) }
    },
  }
  const deps: NativeSendDeps = {
    apns: {
      async send(req) {
        apnsCalls.push(req)
        return opts.apns?.(req, apnsCalls.length) ?? { status: 200 }
      },
    },
    fcm,
    warn: (m) => warnings.push(m),
    error: (m) => errors.push(m),
  }
  return { deps, apnsCalls, fcmBodies, warnings, errors }
}

beforeEach(() => {
  resetApnsProviderToken()
  resetFcmAccessToken()
  __resetNativeSendWarningsForTests()
})

test('every device gets one notification through its own transport, with the badge', async () => {
  const h = harness()
  const report = await sendToNativeDevices([IOS('a1'), ANDROID('b1')], MSG, { apns: APNS, fcm: FCM, nativeChat: false }, h.deps)
  assert.equal(h.apnsCalls.length, 1)
  assert.equal(h.fcmBodies.length, 1)
  assert.equal(JSON.parse(h.apnsCalls[0].body).aps.badge, 2)
  assert.equal(h.apnsCalls[0].environment, 'production')
  assert.equal(h.fcmBodies[0].message.android.notification.notification_count, 2)
  assert.equal(h.fcmBodies[0].message.android.notification.channel_id, 'daily-glance')
  assert.deepEqual(report.ios, { attempted: 1, delivered: 1, pruned: 0, failed: 0 })
  assert.deepEqual(report.android, { attempted: 1, delivered: 1, pruned: 0, failed: 0 })
  assert.deepEqual(report.staleIds, [])
})

test('every notification type the cron sends reaches both phones', async () => {
  const cron = readFileSync(join(process.cwd(), 'app/api/cron/notify/route.ts'), 'utf8')
  const tags = Array.from(new Set(Array.from(cron.matchAll(/tag: '([a-z-]+)'/g), (m) => m[1])))
  assert.ok(tags.length >= 10, `expected the cron's ten types, found ${tags.join(',')}`)
  for (const tag of tags) {
    const h = harness()
    const report = await sendToNativeDevices([IOS('a1'), ANDROID('b1')], { ...MSG, tag, badgeCount: undefined }, { apns: APNS, fcm: FCM, nativeChat: false }, h.deps)
    assert.equal(report.ios.delivered + report.android.delivered, 2, tag)
    assert.equal(h.fcmBodies[0].message.android.notification.channel_id, tag, `${tag} has no Android channel`)
    // No badgeCount on the payload = the badge is left alone.
    assert.ok(!('badge' in JSON.parse(h.apnsCalls[0].body).aps), tag)
  }
})

test('APNs 410 Unregistered prunes the token', async () => {
  const h = harness({ apns: () => ({ status: 410, reason: 'Unregistered' }) })
  const report = await sendToNativeDevices([IOS('dead')], MSG, { apns: APNS, nativeChat: false }, h.deps)
  assert.deepEqual(report.staleIds, ['dead'])
  assert.deepEqual(report.ios, { attempted: 1, delivered: 0, pruned: 1, failed: 0 })
})

test('APNs BadDeviceToken tries the other host once, and remembers the one that worked', async () => {
  const h = harness({ apns: (req) => req.environment === 'production' ? { status: 400, reason: 'BadDeviceToken' } : { status: 200 } })
  const report = await sendToNativeDevices([IOS('devbuild')], MSG, { apns: APNS, nativeChat: false }, h.deps)
  assert.deepEqual(h.apnsCalls.map((c) => c.environment), ['production', 'sandbox'])
  assert.equal(report.ios.delivered, 1)
  assert.deepEqual(report.apnsEnvironmentUpdates, [{ id: 'devbuild', environment: 'sandbox' }])
  assert.deepEqual(report.staleIds, [])
})

test('a stored APNs environment is tried first and not rewritten', async () => {
  const h = harness()
  const report = await sendToNativeDevices([IOS('dev', { apnsEnvironment: 'sandbox' })], MSG, { apns: APNS, nativeChat: false }, h.deps)
  assert.deepEqual(h.apnsCalls.map((c) => c.environment), ['sandbox'])
  assert.deepEqual(report.apnsEnvironmentUpdates, [])
})

test('APNs BadDeviceToken on both hosts prunes', async () => {
  const h = harness({ apns: () => ({ status: 400, reason: 'BadDeviceToken' }) })
  const report = await sendToNativeDevices([IOS('junk')], MSG, { apns: APNS, nativeChat: false }, h.deps)
  assert.equal(h.apnsCalls.length, 2)
  assert.deepEqual(report.staleIds, ['junk'])
})

test('DeviceTokenNotForTopic is our config: logged, never pruned', async () => {
  const h = harness({ apns: () => ({ status: 400, reason: 'DeviceTokenNotForTopic' }) })
  const report = await sendToNativeDevices([IOS('a1')], MSG, { apns: APNS, nativeChat: false }, h.deps)
  assert.deepEqual(report.staleIds, [])
  assert.equal(report.ios.failed, 1)
  assert.match(h.errors[0], /DeviceTokenNotForTopic/)
  assert.ok(!h.errors[0].includes(IOS('a1').endpoint), 'a device token was logged')
})

test('an expired provider token is reminted and the send retried once', async () => {
  const h = harness({ apns: (_req, n) => n === 1 ? { status: 403, reason: 'ExpiredProviderToken' } : { status: 200 } })
  const report = await sendToNativeDevices([IOS('a1')], MSG, { apns: APNS, nativeChat: false }, h.deps)
  assert.equal(report.ios.delivered, 1)
  assert.equal(h.apnsCalls.length, 2)
})

test('a thrown transport error is a visible failure, not a prune', async () => {
  const h = harness({ apns: () => { throw new Error('socket hang up') } })
  const report = await sendToNativeDevices([IOS('a1')], MSG, { apns: APNS, nativeChat: false }, h.deps)
  assert.equal(report.ios.failed, 1)
  assert.deepEqual(report.staleIds, [])
  assert.match(h.errors[0], /socket hang up/)
})

test('FCM UNREGISTERED prunes the token', async () => {
  const h = harness({ fcm: () => ({ status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } }) })
  const report = await sendToNativeDevices([ANDROID('gone')], MSG, { fcm: FCM, nativeChat: false }, h.deps)
  assert.deepEqual(report.staleIds, ['gone'])
  assert.deepEqual(report.android, { attempted: 1, delivered: 0, pruned: 1, failed: 0 })
})

test('stored Expo push tokens are pruned without a send', async () => {
  const h = harness()
  const report = await sendToNativeDevices(
    [{ id: 'old', platform: 'ios', endpoint: 'ExponentPushToken[abc]' }, { id: 'old2', platform: 'android', endpoint: 'ExpoPushToken[def]' }],
    MSG,
    { apns: APNS, fcm: FCM, nativeChat: false },
    h.deps,
  )
  assert.equal(h.apnsCalls.length + h.fcmBodies.length, 0)
  assert.deepEqual(report.staleIds.sort(), ['old', 'old2'])
})

test('an unconfigured transport skips its devices, warns once, and the other still sends', async () => {
  const h = harness()
  const r1 = await sendToNativeDevices([IOS('a1'), ANDROID('b1')], MSG, { fcm: FCM, nativeChat: false }, h.deps)
  await sendToNativeDevices([IOS('a2')], MSG, { fcm: FCM, nativeChat: false }, h.deps)
  assert.equal(h.apnsCalls.length, 0)
  assert.equal(r1.ios.attempted, 0)
  assert.equal(r1.android.delivered, 1)
  assert.equal(h.warnings.length, 1)
  assert.match(h.warnings[0], /push\.apns is not configured/)
})

test('nothing configured at all sends nothing and throws nothing', async () => {
  const h = harness()
  const report = await sendToNativeDevices([IOS('a1'), ANDROID('b1')], MSG, { nativeChat: false }, h.deps)
  assert.equal(report.ios.attempted + report.android.attempted, 0)
})

test('chat notifications never reach a phone while chat is hidden', async () => {
  const h = harness()
  const report = await sendToNativeDevices([IOS('a1'), ANDROID('b1')], { ...MSG, tag: 'chat-6512' }, { apns: APNS, fcm: FCM, nativeChat: false }, h.deps)
  assert.equal(h.apnsCalls.length + h.fcmBodies.length, 0)
  assert.equal(report.ios.attempted + report.android.attempted, 0)

  const on = harness()
  await sendToNativeDevices([IOS('a1')], { ...MSG, tag: 'chat-6512' }, { apns: APNS, nativeChat: true }, on.deps)
  assert.equal(on.apnsCalls.length, 1)
})

test('the web send path calls the native fan-out (source wiring)', () => {
  const src = readFileSync(join(process.cwd(), 'lib/pushNotification.ts'), 'utf8')
  assert.match(src, /sendToNativeDevices\(/)
  assert.doesNotMatch(src, /expo-server-sdk/)
  assert.match(src, /PushSubscription\.deleteMany\(\{ _id: \{ \$in: staleIds \} \}\)/)
  assert.match(src, /apnsEnvironment: u\.environment/)
})
