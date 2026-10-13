// Run with: npm run test:file tests/unit/auth/passkeyNative.test.ts
//
// NP-161 — "Passkeys natively: webcredentials, a native passkey module and
// the Android origin". What is pinned here is everything that can be
// checked WITHOUT a database connection — `getRedAuth()` itself is not
// called (see tests/unit/_guard.ts: "No test reaches getRedAuth() ... today"
// — it opens a real Mongo connection and nothing here mocks mongoose):
//
//   1. the AASA lists `webcredentials` for this app's bundle id, alongside
//      the existing `applinks` entry (NP-044 untouched);
//   2. assetlinks.json adds `delegate_permission/common.get_login_creds`
//      for this app's package, alongside the existing `handle_all_urls`
//      statement;
//   3. `ios.associatedDomains` claims `webcredentials:become.redbtn.io`;
//   4. `passkeyOriginFromRequest` (lib/passkeyOrigin.ts) — the pure selector
//      that picks between the web-origin and Android-origin
//      `@redbtn/redauth` instances — reads ONLY the platform header,
//      defaults to 'web', and the header name native and web actually
//      share.
//   5. no placeholder survives: the AASA names Team ID Y7X4278T48, both
//      assetlinks statements carry the fingerprints the server accepts, and
//      the app also claims `webcredentials:redbtn.io` (the rpID);
//   6. `passkeyExpectedOrigins`: web = web origin + `https://<rpID>` (what
//      the iOS app reports), android = one apk-key-hash origin per cert.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  BECOME_ANDROID_CERT_SHA256,
  PASSKEY_ORIGIN_HEADER,
  androidApkKeyHashOrigin,
  passkeyExpectedOrigins,
  passkeyOriginFromRequest,
} from '../../../lib/passkeyOrigin'

// Apple Team ID for REDBTN LLC, which owns io.redbtn.become.
const APPLE_APP_ID = 'Y7X4278T48.io.redbtn.become'
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

const ROOT = path.join(__dirname, '../../..')
const REPO = path.join(ROOT, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const readRepo = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8')

function fakeRequest(headerValue: string | null): { headers: { get(name: string): string | null } } {
  return { headers: { get: (name: string) => (name === PASSKEY_ORIGIN_HEADER ? headerValue : null) } }
}

// ─── 1. The AASA ──────────────────────────────────────────────────────────────

test('the AASA lists webcredentials for the app, alongside the existing applinks entry', () => {
  const aasa = JSON.parse(read('public/.well-known/apple-app-site-association')) as {
    applinks?: { details?: Array<{ appIDs?: string[] }> }
    webcredentials?: { apps?: string[] }
  }

  // NP-044's /verify universal link must still be there — this card adds to
  // the AASA, it does not replace what is already in it.
  assert.ok(aasa.applinks?.details?.some((d) => (d.appIDs ?? []).length > 0), 'applinks is gone')

  assert.ok(aasa.webcredentials, 'no webcredentials key — iOS cannot offer this app\'s passkeys')
  const appId = aasa.webcredentials!.apps?.[0]
  assert.ok(appId, 'webcredentials.apps is empty')
  // Same bundle id the applinks entry already names (minus the team id
  // prefix, which both share) — one app, one identity.
  const bundleId = appId!.split('.').slice(1).join('.')
  assert.equal(bundleId, 'io.redbtn.become')
})

// ─── 2. assetlinks.json ───────────────────────────────────────────────────────

test('assetlinks.json adds get_login_creds for this app, alongside handle_all_urls', () => {
  const statements = JSON.parse(read('public/.well-known/assetlinks.json')) as Array<{
    relation: string[]
    target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] }
  }>

  const urls = statements.find((s) => s.relation.includes('delegate_permission/common.handle_all_urls'))
  assert.ok(urls, 'the original handle_all_urls statement is gone')

  const creds = statements.find((s) => s.relation.includes('delegate_permission/common.get_login_creds'))
  assert.ok(creds, 'no get_login_creds statement — Android Credential Manager cannot offer this app\'s passkeys')
  assert.equal(creds!.target.namespace, 'android_app')
  assert.equal(creds!.target.package_name, 'io.redbtn.become')
  assert.ok(creds!.target.sha256_cert_fingerprints.length > 0)
})

// ─── 3. ios.associatedDomains ─────────────────────────────────────────────────

test("ios.associatedDomains claims webcredentials:become.redbtn.io, alongside applinks", () => {
  const appJson = JSON.parse(readRepo('expo/app.json')) as {
    expo: { ios?: { associatedDomains?: string[] } }
  }
  const domains = appJson.expo.ios?.associatedDomains ?? []
  assert.ok(domains.includes('applinks:become.redbtn.io'), 'applinks entry is gone')
  assert.ok(
    domains.includes('webcredentials:become.redbtn.io'),
    'iOS does not claim webcredentials:become.redbtn.io, so a passkey made on the web will not be offered in the app',
  )
})

// ─── 4. passkeyOriginFromRequest ──────────────────────────────────────────────

test('passkeyOriginFromRequest defaults to web — the web and the iOS app need no header', () => {
  assert.equal(passkeyOriginFromRequest(fakeRequest(null)), 'web')
  assert.equal(passkeyOriginFromRequest(fakeRequest('ios')), 'web')
  assert.equal(passkeyOriginFromRequest(fakeRequest('something-else')), 'web')
})

test("passkeyOriginFromRequest reads 'android' only from the exact header the native client sends", () => {
  assert.equal(passkeyOriginFromRequest(fakeRequest('android')), 'android')
  assert.equal(PASSKEY_ORIGIN_HEADER, 'x-become-platform')
})

// ─── 5. No placeholders, and the real identities ─────────────────────────────

test('the AASA names the real Team ID in applinks and webcredentials, no placeholder', () => {
  const raw = read('public/.well-known/apple-app-site-association')
  assert.ok(!/PLACEHOLDER/i.test(raw), 'a placeholder is still in the AASA')
  const aasa = JSON.parse(raw) as {
    applinks: { details: Array<{ appIDs: string[] }> }
    webcredentials: { apps: string[] }
  }
  assert.deepEqual(aasa.webcredentials.apps, [APPLE_APP_ID])
  assert.ok(aasa.applinks.details.every((d) => d.appIDs.includes(APPLE_APP_ID)))
})

test('the AASA claims every path Android claims with an autoVerify intent filter', () => {
  const aasa = JSON.parse(read('public/.well-known/apple-app-site-association')) as {
    applinks: { details: Array<{ components: Array<{ '/': string }> }> }
  }
  const iosPaths = new Set(aasa.applinks.details.flatMap((d) => d.components.map((c) => c['/'])))
  const appJson = JSON.parse(readRepo('expo/app.json')) as {
    expo: { android: { intentFilters: Array<{ autoVerify?: boolean; data?: Array<{ host?: string; pathPrefix?: string }> }> } }
  }
  const androidPaths = appJson.expo.android.intentFilters
    .filter((f) => f.autoVerify)
    .flatMap((f) => f.data ?? [])
    .filter((d) => d.host === 'become.redbtn.io' && d.pathPrefix)
    .map((d) => d.pathPrefix!)
  assert.ok(androidPaths.length > 0)
  for (const path of androidPaths) assert.ok(iosPaths.has(path), `iOS does not claim ${path}`)
})

test('both assetlinks statements carry real fingerprints, and exactly the ones the server accepts', () => {
  const raw = read('public/.well-known/assetlinks.json')
  assert.ok(!/REPLACE_WITH/i.test(raw), 'a placeholder is still in assetlinks.json')
  const statements = JSON.parse(raw) as Array<{
    relation: string[]
    target: { package_name: string; sha256_cert_fingerprints: string[] }
  }>
  assert.equal(statements.length, 2)
  for (const s of statements) {
    assert.equal(s.target.package_name, 'io.redbtn.become')
    for (const fp of s.target.sha256_cert_fingerprints) assert.match(fp, FINGERPRINT)
    // The server's Android origins are derived from the same list, so a cert
    // added in one place and not the other fails here.
    assert.deepEqual([...s.target.sha256_cert_fingerprints].sort(), [...BECOME_ANDROID_CERT_SHA256].sort())
  }
})

test('ios.associatedDomains also claims webcredentials:redbtn.io, the rpID the server issues passkeys for', () => {
  const appJson = JSON.parse(readRepo('expo/app.json')) as {
    expo: { ios?: { associatedDomains?: string[] } }
  }
  const domains = appJson.expo.ios?.associatedDomains ?? []
  assert.ok(domains.includes('webcredentials:redbtn.io'))
})

// ─── 6. The expected origins ─────────────────────────────────────────────────

const ENV = { baseUrl: 'https://become.redbtn.io', rpID: 'redbtn.io' }

test('androidApkKeyHashOrigin is base64url, no padding, of the raw SHA-256', () => {
  assert.equal(
    androidApkKeyHashOrigin(
      'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
    ),
    'android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w',
  )
  assert.throws(() => androidApkKeyHashOrigin('REPLACE_WITH_PLAY_APP_SIGNING_SHA256'))
})

test('the web instance accepts the web origin and https://<rpID>, which the iOS app reports', () => {
  assert.deepEqual(passkeyExpectedOrigins('web', ENV), ['https://become.redbtn.io', 'https://redbtn.io'])
  assert.deepEqual(passkeyExpectedOrigins('web', { ...ENV, webOriginEnv: 'https://become-beta.redbtn.io' }), [
    'https://become-beta.redbtn.io',
    'https://redbtn.io',
  ])
})

test('the Android instance defaults to every cert in BECOME_ANDROID_CERT_SHA256, and never a web origin', () => {
  const origins = passkeyExpectedOrigins('android', ENV)
  assert.deepEqual(origins, BECOME_ANDROID_CERT_SHA256.map(androidApkKeyHashOrigin))
  assert.ok(origins.every((o) => o.startsWith('android:apk-key-hash:')))
})

test('PASSKEY_ANDROID_ORIGIN, when set, replaces the defaults and may list several', () => {
  assert.deepEqual(
    passkeyExpectedOrigins('android', { ...ENV, androidOriginEnv: ' android:apk-key-hash:aaa , android:apk-key-hash:bbb,' }),
    ['android:apk-key-hash:aaa', 'android:apk-key-hash:bbb'],
  )
  // Empty or blank behaves as unset.
  assert.deepEqual(
    passkeyExpectedOrigins('android', { ...ENV, androidOriginEnv: ' ' }),
    BECOME_ANDROID_CERT_SHA256.map(androidApkKeyHashOrigin),
  )
})
