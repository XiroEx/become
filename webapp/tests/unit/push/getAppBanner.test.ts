// Run with: npm run test:file tests/unit/push/getAppBanner.test.ts
//
// (NP-205) decideAppBanner: pure decision behind the mobile-web "Get the
// app" prompt. iOS gets Safari's own apple-itunes-app banner (lib/appleAppId.ts)
// so this only ever shows Android — but it must refuse that too inside the
// native app, once dismissed, and when there is nowhere to send a tap.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideAppBanner } from '../../../lib/getAppBanner'

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/124.0.0.0 Mobile Safari/537.36'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1'
const STORE_URL = 'https://play.google.com/store/apps/details?id=io.redbtn.become'

function base(overrides: Partial<Parameters<typeof decideAppBanner>[0]> = {}) {
  return {
    userAgent: ANDROID_UA,
    isNativeAppBrowser: false,
    dismissed: false,
    androidStoreUrl: STORE_URL,
    ...overrides,
  }
}

test('(id: e015cb30) shows on Android mobile web with a configured store URL', () => {
  const decision = decideAppBanner(base())
  assert.equal(decision.show, true)
  assert.equal(decision.platform, 'android')
  assert.equal(decision.storeUrl, STORE_URL)
})

test('(id: e015cb30) never shows inside the native app in-app browser', () => {
  const decision = decideAppBanner(base({ isNativeAppBrowser: true }))
  assert.equal(decision.show, false)
  assert.equal(decision.storeUrl, null)
})

test('(id: e015cb30) stays hidden once dismissed', () => {
  const decision = decideAppBanner(base({ dismissed: true }))
  assert.equal(decision.show, false)
})

test('(id: e015cb30) refuses iPhone UA — iOS gets the Safari banner, not this one', () => {
  const decision = decideAppBanner(base({ userAgent: IPHONE_UA }))
  assert.equal(decision.show, false)
})

test('(id: e015cb30) refuses desktop UA', () => {
  const decision = decideAppBanner(base({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0.0.0 Safari/537.36' }))
  assert.equal(decision.show, false)
})

test('(id: e015cb30) refuses when no Android store URL is configured — nowhere to send a tap', () => {
  const decision = decideAppBanner(base({ androidStoreUrl: null }))
  assert.equal(decision.show, false)
  assert.equal(decision.storeUrl, null)
})

test('(id: e015cb30) the native-app refusal wins even on Android with a dismissal already recorded', () => {
  const decision = decideAppBanner(base({ isNativeAppBrowser: true, dismissed: true }))
  assert.equal(decision.show, false)
})
