// Run with: npm run test:file tests/unit/push/webDeviceOS.test.ts
//
// (NP-205) classifyDeviceOS / webDeviceOSFromUserAgent: the one three-way
// answer the "Get the app" banner and the push-mute decision both depend on,
// and must never disagree about.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyDeviceOS } from '../../../lib/deviceOS'
import { webDeviceOSFromUserAgent } from '../../../lib/push/webDeviceOS'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPAD_UA =
  // iPadOS 13+ Safari requests the desktop site by default: no "iPad", no "Mobile".
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
const DESKTOP_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

test('(NP-205) classifyDeviceOS: iPhone and iPod are ios', () => {
  assert.equal(classifyDeviceOS(IPHONE_UA), 'ios')
  assert.equal(classifyDeviceOS('...iPod touch...'), 'ios')
})

test('(NP-205) classifyDeviceOS: Android is android', () => {
  assert.equal(classifyDeviceOS(ANDROID_UA), 'android')
})

test('(NP-205) classifyDeviceOS: an iPad is "other", never guessed as ios', () => {
  // The trade-off this pins: iPadOS 13+ Safari's UA is indistinguishable
  // from a Mac's, so guessing wrong here would risk muting a reminder on a
  // device no phone can replace. See lib/deviceOS.ts's doc comment.
  assert.equal(classifyDeviceOS(IPAD_UA), 'other')
})

test('(NP-205) classifyDeviceOS: desktop Mac/Chrome and empty/missing input are "other"', () => {
  assert.equal(classifyDeviceOS(DESKTOP_MAC_UA), 'other')
  assert.equal(classifyDeviceOS(''), 'other')
  assert.equal(classifyDeviceOS(null), 'other')
  assert.equal(classifyDeviceOS(undefined), 'other')
})

test('(NP-205) classifyDeviceOS is case-insensitive', () => {
  assert.equal(classifyDeviceOS(IPHONE_UA.toUpperCase()), 'ios')
  assert.equal(classifyDeviceOS(ANDROID_UA.toUpperCase()), 'android')
})

test('(NP-205) webDeviceOSFromUserAgent mirrors classifyDeviceOS exactly', () => {
  for (const ua of [IPHONE_UA, IPAD_UA, ANDROID_UA, DESKTOP_MAC_UA, '', null, undefined]) {
    assert.equal(webDeviceOSFromUserAgent(ua), classifyDeviceOS(ua))
  }
})
