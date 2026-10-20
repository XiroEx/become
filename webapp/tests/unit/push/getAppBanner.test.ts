// Run with: npm run test:file tests/unit/push/getAppBanner.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldShowGetAppBanner } from '../../../lib/getAppBanner'
import { extractAppleAppId } from '../../../lib/appleAppId'

const base = {
  os: 'android' as const,
  openedByNativeApp: false,
  dismissed: false,
  storeUrl: 'https://play.google.com/store/apps/details?id=io.redbtn.become',
}

test('shows on Android mobile web, not dismissed, not inside the app, store url known', () => {
  assert.equal(shouldShowGetAppBanner(base), true)
})

test('never shows inside the native app — the one hard rule', () => {
  assert.equal(shouldShowGetAppBanner({ ...base, openedByNativeApp: true }), false)
})

test('never shows once dismissed', () => {
  assert.equal(shouldShowGetAppBanner({ ...base, dismissed: true }), false)
})

test('never shows on iOS or desktop — iOS gets the Safari smart banner instead', () => {
  assert.equal(shouldShowGetAppBanner({ ...base, os: 'ios' }), false)
  assert.equal(shouldShowGetAppBanner({ ...base, os: 'other' }), false)
})

test('never shows with no configured store url', () => {
  assert.equal(shouldShowGetAppBanner({ ...base, storeUrl: undefined }), false)
})

test('extractAppleAppId pulls the numeric id out of an apps.apple.com URL', () => {
  assert.equal(extractAppleAppId('https://apps.apple.com/us/app/become/id123456789'), '123456789')
  assert.equal(extractAppleAppId('https://apps.apple.com/app/id987654321?mt=8'), '987654321')
})

test('extractAppleAppId fails open — no id, no meta tag, never a broken link', () => {
  assert.equal(extractAppleAppId('https://apps.apple.com/app/become'), undefined)
  assert.equal(extractAppleAppId(undefined), undefined)
  assert.equal(extractAppleAppId(null), undefined)
  assert.equal(extractAppleAppId(''), undefined)
})
