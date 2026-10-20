// Run with: npm run test:file tests/unit/push/nativeAppSettingsNotice.test.ts
//
// NP-205: "say in the web app's Notifications settings that reminders now
// come from the app." Behavioural coverage of nativeAppActive itself lives in
// tests/unit/notificationsSubscribe.test.ts; this pins that Settings actually
// renders something when it is true.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8')

test('Settings shows a notice when the member has a native push token, inside the Notifications section', () => {
  const src = read('app/dashboard/settings/page.tsx')
  assert.match(src, /setNativeAppActive\(data\.nativeAppActive === true\)/, 'never reads the field off the response')

  const noticeAt = src.indexOf('data-testid="native-app-reminders-notice"')
  assert.ok(noticeAt > -1, 'no notice rendered at all')
  assert.match(src.slice(noticeAt, noticeAt + 300), /reminders now come from the/i)

  const notificationsHeadingAt = src.indexOf('Notifications</h2>')
  assert.ok(notificationsHeadingAt > -1 && notificationsHeadingAt < noticeAt, 'the notice must sit inside the Notifications section')
})
