// Run with: npm run test:file tests/unit/legal/privacyCoreParity.test.tsx
//
// lib/legal/privacy.ts is a LOCAL COPY of shared/core/src/legal/privacy.ts
// until @become/core is republished (the webapp pins the published 0.1.0, and
// publishing is a manual step). This file is what keeps it a copy and not a
// fork: the two documents must be identical, block for block.
//
// It also pins the corrections from the 2026-10-13 App Store privacy audit, so
// a later edit cannot quietly put the old statements back.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import PrivacyPage from '../../../app/privacy/page'
import { PRIVACY } from '../../../lib/legal/privacy'
import { PRIVACY as CORE_PRIVACY } from '../../../../shared/core/src/legal/privacy'
import { HEALTH_DATA } from '../../../lib/legal/healthData'
import { HEALTH_DATA as CORE_HEALTH_DATA } from '../../../../shared/core/src/legal/healthData'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const has = (html: string, text: string) => html.includes(esc(text))
const section = (id: string) => JSON.stringify(PRIVACY.sections.find((s) => s.id === id)?.blocks ?? [])

test('the webapp copy of the Privacy Policy is shared/core’s, exactly', () => {
  assert.deepEqual(PRIVACY, CORE_PRIVACY)
})

test('the webapp copy of the Health Data policy is shared/core’s, exactly', () => {
  assert.deepEqual(HEALTH_DATA, CORE_HEALTH_DATA)
})

test('the page shows the privacy policy’s own last-updated date', () => {
  assert.ok(PRIVACY.lastUpdated, 'PRIVACY has no lastUpdated')
  const html = renderToStaticMarkup(<PrivacyPage />)
  assert.ok(html.includes(`dateTime="${PRIVACY.lastUpdated!.iso}"`), 'the <time> is not the privacy date')
  assert.ok(has(html, PRIVACY.lastUpdated!.label))
})

test('the push token is a raw APNs / FCM token, and both services are processors', () => {
  assert.doesNotMatch(JSON.stringify(PRIVACY), /Expo push token/)
  assert.match(section('collect'), /Apple Push Notification service \(APNs\)/)
  assert.match(section('collect'), /Firebase Cloud Messaging \(FCM\)/)
  assert.match(section('sharing'), /Apple Push Notification service \(Apple\) and Firebase Cloud Messaging \(Google\)/)
  const hd = JSON.stringify(HEALTH_DATA.sections.find((s) => s.id === 'sharing'))
  assert.match(hd, /Apple Push Notification service \(Apple Inc\.\) and Firebase Cloud Messaging/)
})

test('Sign in with Apple and passkeys are named as sources and sign-in methods', () => {
  assert.match(section('sources'), /Sign in with Apple/)
  assert.match(section('sources'), /passkey/)
  assert.match(section('collect'), /Sign in with Apple or a passkey/)
  assert.match(section('sharing'), /To Apple or Google, if you choose to sign in/)
})

test('the database is named as it is: MongoDB Atlas, in the United States', () => {
  // Verified 2026-10-13 against the production runtime config: Become's data
  // lives on a MongoDB Atlas cluster (US East), not on the fleet Mongo.
  assert.match(section('sharing'), /MongoDB Atlas/)
  assert.match(section('sharing'), /hosted in the United States/)
})

test('the App Store seller, tracking and private recipes are stated', () => {
  assert.match(section('who'), /seller name REDBTN LLC/)
  assert.match(section('who'), /Become LLC is still the company responsible/)
  assert.match(section('never'), /track you across other companies’ apps or websites/)
  assert.match(section('collect'), /Recipes you create are private to you by default/)
  assert.match(section('collect'), /app version and build, your operating system and version, your device model/)
})
