// Run with: npm run test:file tests/unit/push/nativeConfig.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalisePem,
  resolveApnsConfig,
  resolveFcmConfig,
  resolveNativeChat,
} from '../../../lib/push/nativeConfig'

const PEM_ESCAPED = '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n'

test('apns: unset or incomplete means not configured, never a throw', () => {
  assert.equal(resolveApnsConfig(undefined), undefined)
  assert.equal(resolveApnsConfig({ keyId: 'K', teamId: 'T' }), undefined)
  assert.equal(resolveApnsConfig({ keyId: 'K', privateKey: 'P' }), undefined)
  assert.equal(resolveApnsConfig({ keyId: ' ', teamId: 'T', privateKey: 'P' }), undefined)
})

test('apns: defaults the bundle id and environment, and normalises an escaped PEM', () => {
  const cfg = resolveApnsConfig({ keyId: 'KEY123', teamId: 'TEAM', privateKey: PEM_ESCAPED })
  assert.ok(cfg)
  assert.equal(cfg.bundleId, 'io.redbtn.become')
  assert.equal(cfg.environment, 'production')
  assert.ok(cfg.privateKey.includes('\n'))
  assert.ok(!cfg.privateKey.includes('\\n'))
})

test('apns: sandbox (or development) is honoured, anything else is production', () => {
  const base = { keyId: 'K', teamId: 'T', privateKey: 'P' }
  assert.equal(resolveApnsConfig({ ...base, environment: 'sandbox' })!.environment, 'sandbox')
  assert.equal(resolveApnsConfig({ ...base, environment: 'development' })!.environment, 'sandbox')
  assert.equal(resolveApnsConfig({ ...base, environment: 'nonsense' })!.environment, 'production')
})

test('apns: local env is the fallback', () => {
  const cfg = resolveApnsConfig(undefined, { APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: 'P', APNS_BUNDLE_ID: 'x.y' })
  assert.equal(cfg?.bundleId, 'x.y')
})

test('fcm: the service account is accepted as an object or a JSON string', () => {
  const sa = { project_id: 'become-1', client_email: 'fcm@become-1.iam.gserviceaccount.com', private_key: PEM_ESCAPED }
  const fromObject = resolveFcmConfig({ serviceAccount: sa })
  const fromString = resolveFcmConfig({ serviceAccount: JSON.stringify(sa) })
  assert.deepEqual(fromObject, fromString)
  assert.equal(fromObject!.projectId, 'become-1')
  assert.equal(fromObject!.tokenUri, 'https://oauth2.googleapis.com/token')
  assert.ok(!fromObject!.privateKey.includes('\\n'))
})

test('fcm: missing fields or bad JSON leave FCM off without throwing', () => {
  assert.equal(resolveFcmConfig(undefined), undefined)
  assert.equal(resolveFcmConfig({ serviceAccount: { project_id: 'p' } }), undefined)
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.equal(resolveFcmConfig({ serviceAccount: '{not json' }), undefined)
  } finally {
    console.warn = warn
  }
})

test('nativeChat is off unless explicitly on', () => {
  assert.equal(resolveNativeChat(undefined), false)
  assert.equal(resolveNativeChat('nope'), false)
  assert.equal(resolveNativeChat(true), true)
  assert.equal(resolveNativeChat(undefined, 'true'), true)
})

test('normalisePem leaves a real PEM alone', () => {
  const real = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n'
  assert.equal(normalisePem(real), real)
})
