// Run with: npm run test:file tests/unit/push/fcm.test.ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  FCM_MAX_RETRY_WAIT_MS,
  FCM_SCOPE,
  buildFcmMessage,
  classifyFcmError,
  fcmAccessToken,
  resetFcmAccessToken,
  sendFcm,
  type FcmDeps,
} from '../../../lib/push/fcm'
import type { FcmConfig } from '../../../lib/push/nativeConfig'
import { decodeJwt, rsaKeyPair } from './keys'

const { privatePem, publicKey } = rsaKeyPair()
const CONFIG: FcmConfig = {
  projectId: 'become-test',
  clientEmail: 'fcm-sender@become-test.iam.gserviceaccount.com',
  privateKey: privatePem,
  tokenUri: 'https://oauth2.googleapis.com/token',
}
const DEVICE = 'fcm-token:APA91b' + 'x'.repeat(140)
const MSG = { title: 'Workout time', body: 'Push day is ready', url: '/dashboard/workout', tag: 'workout-reminder' }

type Call = { url: string; headers: Record<string, string>; body: string }

function fakeDeps(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = []
  const sleeps: number[] = []
  let clock = Date.UTC(2026, 9, 13, 12, 0, 0)
  const queue = [...responses]
  const deps: FcmDeps = {
    now: () => clock,
    sleep: async (ms) => { sleeps.push(ms) },
    fetch: async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body })
      if (url === CONFIG.tokenUri) {
        return {
          status: 200,
          headers: { get: () => null },
          text: async () => JSON.stringify({ access_token: `at-${calls.length}`, expires_in: 3600 }),
        }
      }
      const next = queue.shift() ?? { status: 200, body: { name: 'projects/x/messages/1' } }
      return {
        status: next.status,
        headers: { get: (name: string) => next.headers?.[name.toLowerCase()] ?? null },
        text: async () => JSON.stringify(next.body ?? {}),
      }
    },
  }
  return { deps, calls, sleeps, advance: (ms: number) => { clock += ms } }
}

beforeEach(() => resetFcmAccessToken())

test('message: notification, data, channel, tag, sound and HIGH priority', () => {
  const m = buildFcmMessage(DEVICE, MSG) as { message: Record<string, any> }
  assert.equal(m.message.token, DEVICE)
  assert.deepEqual(m.message.notification, { title: 'Workout time', body: 'Push day is ready' })
  assert.deepEqual(m.message.data, { url: '/dashboard/workout', tag: 'workout-reminder' })
  assert.equal(m.message.android.priority, 'HIGH')
  assert.equal(m.message.android.notification.channel_id, 'workout-reminder')
  assert.equal(m.message.android.notification.tag, 'workout-reminder')
  assert.equal(m.message.android.notification.sound, 'default')
  assert.ok(!('notification_count' in m.message.android.notification))
})

test('message: the badge count rides as notification_count and as data', () => {
  const m = buildFcmMessage(DEVICE, { ...MSG, tag: 'daily-glance', badgeCount: 2 }) as { message: Record<string, any> }
  assert.equal(m.message.android.notification.notification_count, 2)
  assert.equal(m.message.data.badgeCount, '2')
  const zero = buildFcmMessage(DEVICE, { ...MSG, badgeCount: 0 }) as { message: Record<string, any> }
  assert.ok(!('notification_count' in zero.message.android.notification))
  assert.equal(zero.message.data.badgeCount, '0')
})

test('message: a tag with no channel of its own sends no channel_id', () => {
  const m = buildFcmMessage(DEVICE, { ...MSG, tag: 'streak-freeze-used' }) as { message: Record<string, any> }
  assert.ok(!('channel_id' in m.message.android.notification))
  // Every data value is a string, which FCM requires.
  for (const v of Object.values(m.message.data)) assert.equal(typeof v, 'string')
})

test('oauth: an RS256 JWT-bearer grant with the messaging scope, cached until near expiry', async () => {
  const { deps, calls, advance } = fakeDeps([])
  const first = await fcmAccessToken(CONFIG, deps)
  assert.equal(calls.length, 1)
  const form = new URLSearchParams(calls[0].body)
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
  const jwt = decodeJwt(form.get('assertion')!)
  assert.deepEqual(jwt.header, { alg: 'RS256', typ: 'JWT' })
  assert.equal(jwt.claims.iss, CONFIG.clientEmail)
  assert.equal(jwt.claims.scope, FCM_SCOPE)
  assert.equal(jwt.claims.aud, CONFIG.tokenUri)
  assert.equal(jwt.claims.exp - jwt.claims.iat, 3600)
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(jwt.signingInput), publicKey, jwt.signature))

  advance(50 * 60 * 1000)
  assert.equal(await fcmAccessToken(CONFIG, deps), first)
  assert.equal(calls.length, 1)
  advance(6 * 60 * 1000) // inside the 5-minute skew of the 60-minute token
  assert.notEqual(await fcmAccessToken(CONFIG, deps), first)
  assert.equal(calls.length, 2)
})

test('send: posts to the v1 endpoint with the bearer token', async () => {
  const { deps, calls } = fakeDeps([{ status: 200 }])
  const outcome = await sendFcm(CONFIG, DEVICE, MSG, deps)
  assert.deepEqual(outcome, { kind: 'delivered' })
  const send = calls.find((c) => c.url.includes('messages:send'))!
  assert.equal(send.url, 'https://fcm.googleapis.com/v1/projects/become-test/messages:send')
  assert.match(send.headers.authorization, /^Bearer at-/)
  assert.equal(JSON.parse(send.body).message.token, DEVICE)
})

test('send: UNREGISTERED and 404 are dead tokens', async () => {
  const unregistered = fakeDeps([{ status: 404, body: { error: { status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } } }])
  assert.deepEqual(await sendFcm(CONFIG, DEVICE, MSG, unregistered.deps), { kind: 'unregistered', status: 404, code: 'UNREGISTERED' })
  assert.equal(classifyFcmError(404, '').kind, 'unregistered')
})

test('send: INVALID_ARGUMENT prunes only when it names the token', () => {
  const badToken = JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token', details: [{ errorCode: 'INVALID_ARGUMENT' }] } })
  const badPayload = JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid value at message.data', details: [{ errorCode: 'INVALID_ARGUMENT' }] } })
  assert.equal(classifyFcmError(400, badToken).kind, 'unregistered')
  assert.equal(classifyFcmError(400, badPayload).kind, 'failed')
  // SENDER_ID_MISMATCH / THIRD_PARTY_AUTH_ERROR are our config, not the device.
  assert.equal(classifyFcmError(403, JSON.stringify({ error: { details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } })).kind, 'failed')
})

test('send: 429 backs off once, honouring a bounded Retry-After', async () => {
  const { deps, sleeps } = fakeDeps([{ status: 429, headers: { 'retry-after': '2' } }, { status: 200 }])
  assert.deepEqual(await sendFcm(CONFIG, DEVICE, MSG, deps), { kind: 'delivered' })
  assert.deepEqual(sleeps, [2000])

  const long = fakeDeps([{ status: 503, headers: { 'retry-after': '120' } }, { status: 200 }])
  await sendFcm(CONFIG, DEVICE, MSG, long.deps)
  assert.deepEqual(long.sleeps, [FCM_MAX_RETRY_WAIT_MS])
})

test('send: a second 429 is a failure, not a loop', async () => {
  const { deps, sleeps } = fakeDeps([{ status: 429 }, { status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED', details: [{ errorCode: 'QUOTA_EXCEEDED' }] } } }])
  const outcome = await sendFcm(CONFIG, DEVICE, MSG, deps)
  assert.equal(outcome.kind, 'failed')
  assert.equal(sleeps.length, 1)
})

test('send: a 401 re-mints the access token once', async () => {
  const { deps, calls } = fakeDeps([{ status: 401 }, { status: 200 }])
  assert.deepEqual(await sendFcm(CONFIG, DEVICE, MSG, deps), { kind: 'delivered' })
  assert.equal(calls.filter((c) => c.url === CONFIG.tokenUri).length, 2)
})
