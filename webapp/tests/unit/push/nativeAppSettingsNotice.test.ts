// Run with: npm run test:file tests/unit/push/nativeAppSettingsNotice.test.ts
//
// (NP-205) The Notifications-settings "reminders now come from the app"
// notice: the pure show/text decision, GET /api/notifications/preferences
// wiring it depends on, and that Settings actually renders it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  NATIVE_APP_SETTINGS_NOTICE,
  shouldShowNativeAppSettingsNotice,
} from '../../../lib/push/nativeAppSettingsNotice'

const ROOT = path.join(__dirname, '../../..')
function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('(id: e015cb31) shows only when the server says a native device is active', () => {
  assert.equal(shouldShowNativeAppSettingsNotice(true), true)
  assert.equal(shouldShowNativeAppSettingsNotice(false), false)
  assert.equal(shouldShowNativeAppSettingsNotice(undefined), false)
})

test('(id: e015cb31) the notice names the app, not the browser, as the source of reminders', () => {
  assert.match(NATIVE_APP_SETTINGS_NOTICE, /app/i)
  assert.match(NATIVE_APP_SETTINGS_NOTICE, /twice/i)
})

test('(id: e015cb31) GET /api/notifications/preferences reports nativeAppActive from a real device count', () => {
  const src = readSource('app/api/notifications/preferences/route.ts')
  assert.match(src, /nativeAppActive/)
  assert.match(src, /PushSubscription\.countDocuments/)
  assert.match(src, /platform:\s*\{\s*\$in:\s*\['ios',\s*'android'\]\s*\}/)
})

test('(id: e015cb31) Settings renders the notice, driven by that same flag', () => {
  const src = readSource('app/dashboard/settings/page.tsx')
  assert.match(src, /shouldShowNativeAppSettingsNotice/)
  assert.match(src, /NATIVE_APP_SETTINGS_NOTICE/)
  assert.match(src, /nativeAppActive/)
})
