// Run with: npm run test:file tests/unit/push/webDeviceOS.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyWebUserAgent } from '../../../lib/push/webDeviceOS'
import { classifyUserAgent } from '../../../lib/deviceOS'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const DESKTOP_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const DESKTOP_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

test('an iPhone or iPod User-Agent classifies as ios', () => {
  assert.equal(classifyWebUserAgent(IPHONE_UA), 'ios')
  assert.equal(classifyWebUserAgent('Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0 like Mac OS X)'), 'ios')
})

test('an Android User-Agent classifies as android', () => {
  assert.equal(classifyWebUserAgent(ANDROID_UA), 'android')
})

test('desktop browsers, and anything unidentifiable, classify as other', () => {
  assert.equal(classifyWebUserAgent(DESKTOP_MAC_UA), 'other')
  assert.equal(classifyWebUserAgent(DESKTOP_WINDOWS_UA), 'other')
  assert.equal(classifyWebUserAgent(null), 'other')
  assert.equal(classifyWebUserAgent(undefined), 'other')
  assert.equal(classifyWebUserAgent(''), 'other')
})

test('an iPad classifies as other, not ios — iPadOS 13+ Safari sends a desktop User-Agent', () => {
  // The documented, deliberate trade-off (see lib/deviceOS.ts): we would
  // rather risk a duplicate reminder on a device we cannot confidently place
  // than silently mute one we are only guessing about.
  assert.equal(classifyWebUserAgent(DESKTOP_MAC_UA), 'other')
})

test('lib/push/webDeviceOS.ts and lib/deviceOS.ts agree — one algorithm, not two', () => {
  for (const ua of [IPHONE_UA, ANDROID_UA, DESKTOP_MAC_UA, DESKTOP_WINDOWS_UA, null, undefined]) {
    assert.equal(classifyWebUserAgent(ua), classifyUserAgent(ua))
  }
})
