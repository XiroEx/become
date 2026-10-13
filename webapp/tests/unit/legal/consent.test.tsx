// Run with: npm run test:file tests/unit/legal/consent.test.tsx
//
// "Nothing records that anyone agreed to anything" was item #1 on the go-live
// card of 2026-09-10. This file pins the record: that every path which creates
// a member either writes the agreement in the same save or leaves the member
// to a gate that asks, that the gate and the sign-up form show the SAME
// sentence, that the Terms say the same age the tick attests to, and that the
// checkout hands Stripe its own copy.
//
// Source-text assertions where the property is wiring (the repo idiom — see
// tests/unit/billing/billingRoutes.test.ts), renderToStaticMarkup where it is
// words on a screen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConsentSheet } from '../../../components/ConsentSheet'
import TermsPage from '../../../app/terms/page'
import {
  CONSENT_STATEMENT,
  HEALTH_DISCLAIMER_SHORT,
  LEGAL_MINIMUM_AGE,
  LEGAL_VERSION,
} from '../../../lib/legal'
import { TERMS } from '../../../lib/legal/terms'
import { consentIsCurrent, newConsent } from '../../../lib/consent'
import { isTermsUrlMissingError } from '../../../lib/billing/consentCollection'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

// ─── The decision ────────────────────────────────────────────────────────────

test('consent is current only for the exact LEGAL_VERSION', () => {
  assert.equal(consentIsCurrent(undefined), false)
  assert.equal(consentIsCurrent(null), false)
  assert.equal(consentIsCurrent({ termsVersion: 'v0.9.0' }), false)
  assert.equal(consentIsCurrent({ termsVersion: LEGAL_VERSION }), true)
})

test('a fresh agreement records the version, the age floor and its source', () => {
  const now = new Date('2026-09-13T12:00:00Z')
  const c = newConsent('gate', now)
  assert.equal(c.termsVersion, LEGAL_VERSION)
  assert.equal(c.minimumAge, LEGAL_MINIMUM_AGE)
  assert.equal(c.acceptedAt, now)
  assert.equal(c.source, 'gate')
  assert.equal(consentIsCurrent(c), true)
})

// ─── Every creation path ─────────────────────────────────────────────────────

test('the sign-up form carries the tick, and send-link refuses a register without it', () => {
  const form = read('components/AuthForm.tsx')
  assert.match(form, /type="checkbox"[\s\S]*?required/, 'the sign-up box is not required')
  assert.match(form, /consent/, 'the form never sends the tick')
  assert.match(form, /href="\/terms"/, 'the tick does not link the terms')
  assert.match(form, /href="\/privacy"/, 'the tick does not link the privacy policy')

  const sendLink = read('app/api/auth/send-link/route.ts')
  assert.match(sendLink, /consent !== true/, 'send-link accepts a register request with no agreement')
  assert.match(sendLink, /LEGAL_VERSION/, 'send-link does not stamp the version on the link')
})

test('verify-link writes the agreement in the same save that creates the member', () => {
  const src = read('app/api/auth/verify-link/route.ts')
  assert.match(src, /consentTermsVersion/, 'verify-link ignores the version the link carried')
  assert.match(src, /source: 'signup'/, 'the record does not say it came from sign-up')
  // MagicLink actually carries the field, so it is not silently dropped by
  // strict mode on the way through.
  assert.match(read('models/MagicLink.ts'), /consentTermsVersion:\s*\{\s*type:\s*String/, 'MagicLink has no consentTermsVersion path')
})

test('the User model holds the record, and the gate is mounted where every member passes', () => {
  const model = read('models/User.ts')
  assert.match(model, /consent:\s*\{\s*type:\s*UserConsentSchema/, 'User has no consent path')
  assert.match(model, /source:.*enum:\s*\['signup',\s*'gate',\s*'checkout'\]/, 'consent.source is not an enum')

  // Members created by Google, a passkey, or a login-mode link never ticked a
  // box. The dashboard layout covers every protected route; onboarding covers
  // the brand-new member before a health field is typed.
  for (const file of ['app/dashboard/layout.tsx', 'app/onboarding/page.tsx']) {
    const src = read(file)
    assert.match(src, /import ConsentGate from/, `${file}: does not import ConsentGate`)
    assert.match(src, /<ConsentGate \/>/, `${file}: imports ConsentGate but never mounts it`)
  }
})

test('the gate only records a literal accepted: true', () => {
  const src = read('app/api/me/consent/route.ts')
  assert.match(src, /accepted !== true/, 'POST /api/me/consent would record anything')
  assert.match(src, /recordConsent\(auth\.userId,\s*'gate'\)/)
  // And the read is pure: no write on GET.
  const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
  assert.doesNotMatch(get, /recordConsent|updateOne|\$set/, 'GET /api/me/consent writes')
})

// ─── One sentence, everywhere ────────────────────────────────────────────────

test('the gate shows the consent statement, both documents and the health disclaimer', () => {
  const html = renderToStaticMarkup(
    <ConsentSheet checked={false} onCheckedChange={() => {}} onAgree={() => {}} busy={false} error={null} />,
  )
  assert.ok(html.includes(esc(CONSENT_STATEMENT)), 'the gate does not carry CONSENT_STATEMENT')
  assert.ok(html.includes(`I am at least ${LEGAL_MINIMUM_AGE} years old`), 'the gate does not state the age')
  assert.match(html, /href="\/terms"/, 'the gate does not link the terms')
  assert.match(html, /href="\/privacy"/, 'the gate does not link the privacy policy')
  assert.ok(html.includes(esc(HEALTH_DISCLAIMER_SHORT)), 'the gate does not carry the health disclaimer')
  // Unticked = cannot agree.
  assert.match(html, /data-testid="consent-gate-agree"[^>]*disabled/, 'the agree button is enabled before the tick')
})

test('the statement names the same age the Terms set', () => {
  assert.match(CONSENT_STATEMENT, new RegExp(`at least ${LEGAL_MINIMUM_AGE} years old`))
  const eligibility = TERMS.sections.find((s) => s.id === 'eligibility')
  assert.ok(eligibility, 'the Terms have no eligibility section')
  const text = eligibility.blocks.map((b) => ('text' in b ? b.text : '')).join(' ')
  assert.match(text, new RegExp(`at least ${LEGAL_MINIMUM_AGE} years old`), 'the Terms state a different minimum age')
  assert.doesNotMatch(text, /at least 18 years old/, 'the Terms still say 18')
  // And the page renders it, so the sentence a member ticks is on the page they are pointed to.
  const html = renderToStaticMarkup(<TermsPage />)
  assert.ok(html.includes(`at least ${LEGAL_MINIMUM_AGE} years old`))
})

test('the age floor is enforced where an age is actually stated', () => {
  assert.match(read('app/api/profile/route.ts'), /age < LEGAL_MINIMUM_AGE/, 'PATCH /api/profile stores any age')
  assert.match(read('app/onboarding/page.tsx'), /min=\{LEGAL_MINIMUM_AGE\}/, 'the onboarding age input has no floor')
})

// ─── The health disclaimer exists outside /terms ─────────────────────────────

test('the in-app health disclaimer is shown at onboarding and in settings', () => {
  for (const file of ['app/onboarding/page.tsx', 'app/dashboard/settings/page.tsx']) {
    const src = read(file)
    assert.match(src, /HEALTH_DISCLAIMER_SHORT/, `${file}: no health disclaimer`)
  }
  // The short version claims no more than section 1 of the Terms does.
  assert.match(HEALTH_DISCLAIMER_SHORT, /not medical care or medical advice/)
  assert.match(HEALTH_DISCLAIMER_SHORT, /physician/)
})

// ─── Stripe's copy ───────────────────────────────────────────────────────────

test('checkout asks Stripe for consent too, and can survive the dashboard step being missed', () => {
  const src = read('app/api/billing/checkout/route.ts')
  assert.match(src, /consent_collection:\s*CHECKOUT_CONSENT_COLLECTION/, 'no consent_collection on the session')
  assert.match(src, /termsVersion/, 'the session metadata does not name the terms version')
  assert.match(src, /isTermsUrlMissingError\(err\)/, 'no fallback for the missing-URL refusal')
  // The retry MUST use a different idempotency key: Stripe replays the error
  // for the original one.
  assert.match(src, /idempotencyKey:\s*`\$\{idempotencyKey\}:noconsent`/, 'the retry reuses the idempotency key')
})

test('only the terms-URL refusal triggers the fallback', () => {
  assert.equal(isTermsUrlMissingError(null), false)
  assert.equal(isTermsUrlMissingError(new Error('boom')), false)
  assert.equal(
    isTermsUrlMissingError({ type: 'StripeCardError', param: 'consent_collection[terms_of_service]' }),
    false,
    'a card error is never a configuration problem',
  )
  assert.equal(
    isTermsUrlMissingError({ type: 'StripeInvalidRequestError', param: 'consent_collection[terms_of_service]', message: 'x' }),
    true,
  )
  assert.equal(
    isTermsUrlMissingError({
      type: 'StripeInvalidRequestError',
      message: 'You must set a Terms of Service URL in your Stripe Dashboard to use consent_collection.',
    }),
    true,
  )
  assert.equal(
    isTermsUrlMissingError({ type: 'StripeInvalidRequestError', param: 'line_items[0][price]', message: 'No such price' }),
    false,
    'an unrelated invalid-request error must not be retried without consent',
  )
})
