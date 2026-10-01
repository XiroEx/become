// Run with: npm run test:file tests/unit/legal/consentDrift.test.ts
//
// Lockstep drift test for the consent gate strings (NP-017 / NP-045).
//
// Shared pure legal constants live in `@become/core` (`shared/core/src/legal/`),
// imported by `expo/` through Metro (`file:` dependency) and by `webapp/`
// through published package (re-exported by `webapp/lib/legal/index.ts`).
//
// This test asserts that the legal consent strings in `shared/core/src/legal`
// are strictly in lockstep with `webapp/lib/legal`, and that the sentences
// rendered by the web's ConsentSheet and native's ConsentSheet are identical.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Web components & re-exported published legal module
import { ConsentSheet as WebConsentSheet } from '@/components/ConsentSheet'
import * as webLegal from '@/lib/legal'

// Shared core source (what native bundles and redsync publishes)
import * as sharedLegal from '../../../../shared/core/src/legal/index'

const ROOT = path.resolve(__dirname, '../../..')
const EXPO_ROOT = path.resolve(ROOT, '../expo')

// ─── 1. Constants parity between webapp and shared/core ─────────────────────

test('(id: e015c79c) legal consent constants in @become/core and webapp/lib/legal match', () => {
  assert.equal(webLegal.CONSENT_STATEMENT, sharedLegal.CONSENT_STATEMENT)
  assert.equal(webLegal.AI_CONSENT_STATEMENT, sharedLegal.AI_CONSENT_STATEMENT)
  assert.deepEqual(webLegal.AI_CONSENT_SENDS, sharedLegal.AI_CONSENT_SENDS)
  assert.equal(webLegal.AI_CONSENT_DECLINE_NOTE, sharedLegal.AI_CONSENT_DECLINE_NOTE)
  assert.equal(webLegal.HEALTH_DISCLAIMER_SHORT, sharedLegal.HEALTH_DISCLAIMER_SHORT)
  assert.equal(webLegal.LEGAL_MINIMUM_AGE, sharedLegal.LEGAL_MINIMUM_AGE)
  assert.equal(webLegal.AI_PROVIDER, sharedLegal.AI_PROVIDER)
  assert.equal(webLegal.AI_PROVIDER_ROUTE, sharedLegal.AI_PROVIDER_ROUTE)
  assert.equal(webLegal.AI_CONSENT_REASON, sharedLegal.AI_CONSENT_REASON)
  assert.equal(webLegal.AI_CONSENT_REFUSAL_MESSAGE, sharedLegal.AI_CONSENT_REFUSAL_MESSAGE)
})

// ─── 2. Web ConsentSheet sentences match shared/core helpers ─────────────────

test('(id: e015c79c) web ConsentSheet titles and standfirsts match shared/core helpers', () => {
  assert.equal(sharedLegal.consentTitle(true), 'Before you continue')
  assert.equal(sharedLegal.consentTitle(false), 'One thing about AI')

  assert.equal(
    sharedLegal.consentStandfirst(true),
    'We need one thing on record: that you are old enough to use Become and that you agree to how it works.',
  )
  assert.equal(
    sharedLegal.consentStandfirst(false),
    `Become uses AI for some of its work, and that means sending what you submit to ${webLegal.AI_PROVIDER}. We will not do that until you say we can.`,
  )

  assert.equal(
    sharedLegal.AI_CONSENT_SENDS_INTRO,
    `What gets sent to ${webLegal.AI_PROVIDER}, through ${webLegal.AI_PROVIDER_ROUTE}:`,
  )

  assert.equal(
    sharedLegal.CONSENT_ERROR_SAVE,
    'That did not save. Check your connection and try again.',
  )

  assert.equal(sharedLegal.consentButtonLabel({ busy: true }), 'Saving…')
  assert.equal(sharedLegal.consentButtonLabel({ showTerms: true }), 'Agree and continue')
  assert.equal(sharedLegal.consentButtonLabel({ showTerms: false, aiChecked: true }), 'Allow and continue')
  assert.equal(sharedLegal.consentButtonLabel({ showTerms: false, aiChecked: false }), 'Save and continue')
})

// ─── 3. Sentences rendered on Web match those in Native ConsentSheet ─────────

test('(id: e015c79c) every sentence rendered by web ConsentSheet is also present in native ConsentSheet', () => {
  const webHtml = renderToStaticMarkup(
    React.createElement(WebConsentSheet, {
      checked: false,
      onCheckedChange: () => {},
      onAgree: () => {},
      busy: false,
      error: null,
      showTerms: true,
      showAi: true,
      aiChecked: false,
    }),
  )

  const nativeSheetSrc = fs.readFileSync(
    path.join(EXPO_ROOT, 'components/auth/ConsentSheet.tsx'),
    'utf8',
  )

  // Native imports from @become/core (NP-017)
  assert.match(
    nativeSheetSrc,
    /from ["']@become\/core["']/,
    'native ConsentSheet must import shared legal constants from @become/core',
  )

  // Both show the same titles
  assert.ok(webHtml.includes('Before you continue'), 'web is missing title')
  assert.match(nativeSheetSrc, /consentTitle/, 'native must use shared consentTitle')

  // Both show the standfirst
  assert.ok(
    webHtml.includes('We need one thing on record: that you are old enough to use Become and that you agree to how it works.'),
    'web is missing terms standfirst',
  )
  assert.match(nativeSheetSrc, /consentStandfirst/, 'native must use shared consentStandfirst')

  // Both show the age statement and document links
  assert.ok(
    webHtml.includes(`I am at least ${webLegal.LEGAL_MINIMUM_AGE} years old, and I agree to the`),
    'web is missing age agreement',
  )
  assert.match(nativeSheetSrc, /LEGAL_MINIMUM_AGE/, 'native must state LEGAL_MINIMUM_AGE')
  assert.match(nativeSheetSrc, /Terms of Service/, 'native must link Terms of Service')
  assert.match(nativeSheetSrc, /Privacy Policy/, 'native must link Privacy Policy')

  // Both show the AI disclosure
  assert.ok(webHtml.includes('Optional'), 'web is missing Optional badge')
  assert.match(nativeSheetSrc, /Optional/, 'native is missing Optional badge')
  assert.match(nativeSheetSrc, /AI_CONSENT_STATEMENT/, 'native must use AI_CONSENT_STATEMENT')
  assert.match(nativeSheetSrc, /AI_CONSENT_SENDS_INTRO/, 'native must use AI_CONSENT_SENDS_INTRO')
  assert.match(nativeSheetSrc, /AI_CONSENT_SENDS/, 'native must render AI_CONSENT_SENDS items')
  assert.match(nativeSheetSrc, /AI_CONSENT_DECLINE_NOTE/, 'native must use AI_CONSENT_DECLINE_NOTE')
  assert.match(nativeSheetSrc, /Privacy Policy, section 7/, 'native must link section 7')

  // Both show health disclaimer
  assert.match(nativeSheetSrc, /HEALTH_DISCLAIMER_SHORT/, 'native must show HEALTH_DISCLAIMER_SHORT')

  // Both show the action button labels
  assert.match(nativeSheetSrc, /consentButtonLabel/, 'native must use shared consentButtonLabel')
})
