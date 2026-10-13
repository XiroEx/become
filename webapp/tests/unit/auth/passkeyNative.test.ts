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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { PASSKEY_ORIGIN_HEADER, passkeyOriginFromRequest } from '../../../lib/passkeyOrigin'

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
