// Run with: npm run test:file tests/unit/push/apns.test.ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  APNS_JWT_TTL_MS,
  apnsProviderToken,
  buildApnsRequest,
  resetApnsProviderToken,
} from '../../../lib/push/apns'
import type { ApnsConfig } from '../../../lib/push/nativeConfig'
import { decodeJwt, ecKeyPair } from './keys'

const { privatePem, publicKey } = ecKeyPair()
const CONFIG: ApnsConfig = {
  keyId: 'ABC123DEFG',
  teamId: 'TEAMID1234',
  bundleId: 'io.redbtn.become',
  privateKey: privatePem,
  environment: 'production',
}
const TOKEN = 'ab'.repeat(32)

beforeEach(() => resetApnsProviderToken())

test('the provider token is an ES256 JWT Apple can verify', () => {
  const now = Date.UTC(2026, 9, 13, 12, 0, 0)
  const jwt = decodeJwt(apnsProviderToken(CONFIG, now))
  assert.deepEqual(jwt.header, { alg: 'ES256', kid: 'ABC123DEFG' })
  assert.deepEqual(jwt.claims, { iss: 'TEAMID1234', iat: Math.floor(now / 1000) })
  // Raw r||s (64 bytes), which is what JOSE requires and Apple checks.
  assert.equal(jwt.signature.length, 64)
  const ok = crypto.verify('sha256', Buffer.from(jwt.signingInput), { key: publicKey, dsaEncoding: 'ieee-p1363' }, jwt.signature)
  assert.ok(ok)
})

test('the provider token is reused for ~50 minutes, then reminted', () => {
  const t0 = Date.UTC(2026, 9, 13, 12, 0, 0)
  const first = apnsProviderToken(CONFIG, t0)
  assert.equal(apnsProviderToken(CONFIG, t0 + 49 * 60 * 1000), first)
  assert.notEqual(apnsProviderToken(CONFIG, t0 + APNS_JWT_TTL_MS + 1000), first)
  assert.ok(APNS_JWT_TTL_MS < 60 * 60 * 1000 && APNS_JWT_TTL_MS > 20 * 60 * 1000)
})

test('a reset forces a fresh token', () => {
  const t0 = Date.UTC(2026, 9, 13, 12, 0, 0)
  const first = apnsProviderToken(CONFIG, t0)
  resetApnsProviderToken()
  assert.notEqual(apnsProviderToken(CONFIG, t0 + 1000), first)
})

test('request: alert, sound, topic, push type, priority, collapse id and the tap url', () => {
  const req = buildApnsRequest(CONFIG, TOKEN, {
    title: 'Streak at risk',
    body: 'Log something today',
    url: '/dashboard',
    tag: 'streak-at-risk',
  }, 'production')
  assert.equal(req.environment, 'production')
  assert.equal(req.deviceToken, TOKEN)
  assert.match(req.headers.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/)
  assert.equal(req.headers['apns-topic'], 'io.redbtn.become')
  assert.equal(req.headers['apns-push-type'], 'alert')
  assert.equal(req.headers['apns-priority'], '10')
  assert.equal(req.headers['apns-collapse-id'], 'streak-at-risk')
  const body = JSON.parse(req.body)
  assert.deepEqual(body.aps.alert, { title: 'Streak at risk', body: 'Log something today' })
  assert.equal(body.aps.sound, 'default')
  assert.equal(body.aps['thread-id'], 'streak-at-risk')
  assert.equal(body.url, '/dashboard')
  assert.equal(body.tag, 'streak-at-risk')
})

test('badge: set when counted, 0 clears, absent leaves it alone', () => {
  const msg = { title: 't', body: 'b', url: '/' }
  const withCount = JSON.parse(buildApnsRequest(CONFIG, TOKEN, { ...msg, badgeCount: 2 }, 'production').body)
  const zero = JSON.parse(buildApnsRequest(CONFIG, TOKEN, { ...msg, badgeCount: 0 }, 'production').body)
  const absent = JSON.parse(buildApnsRequest(CONFIG, TOKEN, msg, 'production').body)
  assert.equal(withCount.aps.badge, 2)
  assert.equal(zero.aps.badge, 0)
  assert.ok(!('badge' in absent.aps))
})

test('no tag means no collapse id and no thread', () => {
  const req = buildApnsRequest(CONFIG, TOKEN, { title: 't', body: 'b', url: '/' }, 'sandbox')
  assert.ok(!('apns-collapse-id' in req.headers))
  assert.ok(!('thread-id' in JSON.parse(req.body).aps))
})

test('a collapse id longer than 64 bytes is shortened, deterministically', () => {
  const tag = 'chat-' + 'x'.repeat(100)
  const a = buildApnsRequest(CONFIG, TOKEN, { title: 't', body: 'b', url: '/', tag }, 'production')
  const b = buildApnsRequest(CONFIG, TOKEN, { title: 't', body: 'b', url: '/', tag }, 'production')
  assert.ok(Buffer.byteLength(a.headers['apns-collapse-id']) <= 64)
  assert.equal(a.headers['apns-collapse-id'], b.headers['apns-collapse-id'])
})
