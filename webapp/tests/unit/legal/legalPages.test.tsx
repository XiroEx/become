// Run with: npm run test:file tests/unit/legal/legalPages.test.tsx
//
// /terms, /privacy and /support are the three URLs an outside party checks
// before Become is allowed to take money: App Store Connect wants a privacy URL
// and a support URL, Stripe wants terms and a cancellation policy, and CalOPPA
// wants a privacy policy linked from the home page. All three fail in the same
// quiet way — a 404, or a link that was never added — so this file asserts:
//
//   1. each page RENDERS, signed out, with no session and no client JS;
//   2. all three are LINKED from the landing footer, which is the surface a
//      reviewer and a crawler actually start from;
//   3. the automatic-renewal wording required by New York GBL 527-a is on the
//      plan page, next to the button that asks for consent, and is the SAME
//      wording the Terms commit to;
//   4. nothing claims a certification Become does not hold;
//   5. the account-deletion copy still matches reality — that there IS an
//      in-app delete button, and where it is.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import TermsPage from '../../../app/terms/page'
import PrivacyPage from '../../../app/privacy/page'
import SupportPage from '../../../app/support/page'
import HealthDataPage from '../../../app/health-data/page'
import DeleteAccountPage from '../../../app/delete-account/page'
import { PlanPricing } from '../../../app/dashboard/plan/PlanPageClient'
import {
  COUNSEL_TODO,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DELETION_REQUEST_PATH,
  LEGAL_LAST_UPDATED,
  LEGAL_LINKS,
  LEGAL_REFUND_WINDOW_DAYS,
  LEGAL_VERSION,
  RENEWAL_TERMS,
  counselTodos,
  renewalLine,
} from '../../../lib/legal'
import { ACCOUNT_DELETION_GRACE_DAYS } from '../../../lib/accountDeletion'
import { TERMS } from '../../../lib/legal/terms'
import { PRIVACY } from '../../../lib/legal/privacy'
import { SUPPORT } from '../../../lib/legal/support'
import { HEALTH_DATA } from '../../../lib/legal/healthData'
import { DELETE_ACCOUNT } from '../../../lib/legal/deleteAccount'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** React escapes text nodes, so an expectation has to be escaped to match. */
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

/** Substring, not RegExp: the copy is full of "$14.99" and "." and building a
 *  pattern out of prose silently turns a price into an anchor. */
const has = (html: string, text: string) => html.includes(esc(text))

const PAGES = [
  { name: 'terms', href: '/terms', Page: TermsPage, doc: TERMS },
  { name: 'privacy', href: '/privacy', Page: PrivacyPage, doc: PRIVACY },
  { name: 'health-data', href: '/health-data', Page: HealthDataPage, doc: HEALTH_DATA },
  { name: 'support', href: '/support', Page: SupportPage, doc: SUPPORT },
] as const

// ─── They render ─────────────────────────────────────────────────────────────

test('every legal page renders, with its title, date, version and contact', () => {
  for (const { name, Page, doc } of PAGES) {
    const html = renderToStaticMarkup(<Page />)

    // Not `has()` here: the tags are markup, so only the title itself escapes.
    assert.ok(html.includes(`>${esc(doc.title)}</h1>`), `${name}: no title`)
    assert.ok(has(html, LEGAL_LAST_UPDATED), `${name}: no last-updated date`)
    assert.ok(has(html, LEGAL_VERSION), `${name}: no version`)
    assert.ok(has(html, LEGAL_CONTACT_EMAIL), `${name}: no contact address`)
    assert.ok(has(html, '516 Cambridge Ave'), `${name}: no postal address`)

    // Every section reaches the page, with an anchor to link a clause by.
    for (const section of doc.sections) {
      assert.ok(html.includes(`id="${section.id}"`), `${name}: section ${section.id} missing`)
      assert.ok(has(html, section.heading), `${name}: heading ${section.heading} missing`)
    }
  }
})

test('each page carries the other two in its footer', () => {
  for (const { name, href, Page } of PAGES) {
    const html = renderToStaticMarkup(<Page />)
    for (const link of LEGAL_LINKS) {
      if (link.href === href) continue
      assert.ok(html.includes(`href="${link.href}"`), `${name}: does not link ${link.href}`)
    }
  }
})

// ─── They are linked from the landing footer ─────────────────────────────────

test('the landing footer links all three routes', () => {
  // Scanned over the FOOTER only. A link somewhere else on a 1000-line landing
  // page is not what CalOPPA or an App Store reviewer looks for, and a match
  // anywhere in the file would pass even after the footer row was emptied.
  const src = read('components/landing/BecomeLanding.tsx')
  const footer = /<footer className={styles\.footer}>[\s\S]*?<\/footer>/.exec(src)
  assert.ok(footer, 'the landing page has no footer any more')

  for (const link of LEGAL_LINKS) {
    assert.ok(footer[0].includes(`href="${link.href}"`), `footer does not link ${link.href}`)
    assert.ok(footer[0].includes(`>${link.label}<`), `footer has no "${link.label}" label`)
  }
})

test('the surfaces that must carry the links actually import them', () => {
  // The auth screen (where agreement happens), the plan page (where money
  // happens), the dashboard home and settings (in-app, for App Store review).
  for (const file of [
    'components/AuthScreen.tsx',
    'app/dashboard/plan/PlanPageClient.tsx',
    'app/dashboard/DashboardClient.tsx',
    'app/dashboard/settings/page.tsx',
  ]) {
    const src = read(file)
    assert.match(src, /legal\/LegalLinks/, `${file}: does not import LegalLinks`)
    assert.match(src, /<LegalLinks/, `${file}: imports LegalLinks but never renders it`)
  }

  // Sign-in and sign-up are two routes rendering one screen, so BOTH have to
  // reach it — a second auth page that drew its own form would carry none of
  // this.
  for (const file of ['app/login/page.tsx', 'app/register/page.tsx']) {
    assert.match(read(file), /<AuthScreen /, `${file}: does not render AuthScreen`)
  }

  // And that screen names the two documents in the sentence itself, because it
  // is the screen on which agreement is given.
  const auth = read('components/AuthScreen.tsx')
  assert.match(auth, /href="\/terms"/, 'the auth screen does not link the terms')
  assert.match(auth, /href="\/privacy"/, 'the auth screen does not link the privacy policy')
})

// ─── Automatic renewal (NY GBL 527-a) ────────────────────────────────────────

test('the renewal terms sit next to the button that asks for consent', () => {
  const html = renderToStaticMarkup(
    <PlanPricing
      checkout="ready"
      available={{ monthly: true, annual: true }}
      portalState="idle"
      onStart={() => {}}
      onOpenPortal={() => {}}
    />,
  )
  // Per plan, not one shared line: the two periods renew on different terms.
  assert.ok(has(html, renewalLine('monthly')), 'no monthly renewal disclosure')
  assert.ok(has(html, renewalLine('annual')), 'no annual renewal disclosure')
  assert.match(html, /href="\/terms#plans"/, 'the disclosure does not link the full terms')

  // Both disclosures name the price, the interval, that it renews until
  // cancelled, and how to cancel — the four things 527-a asks for.
  for (const plan of ['monthly', 'annual'] as const) {
    const line = renewalLine(plan)
    assert.match(line, /Renews automatically/, `${plan}: does not say it renews automatically`)
    assert.match(line, /until you cancel/, `${plan}: does not say "until you cancel"`)
    assert.match(line, /Manage billing/, `${plan}: does not say how to cancel`)
    assert.match(line, /\$\d/, `${plan}: names no price`)
  }
})

test('the Terms commit to the same renewal sentences, word for word', () => {
  const html = renderToStaticMarkup(<TermsPage />)
  for (const sentence of RENEWAL_TERMS) {
    assert.ok(has(html, sentence), 'a renewal sentence is missing from the Terms')
  }
  // And the plan page anchor the disclosure links to actually exists.
  assert.ok(
    TERMS.sections.some((s) => s.id === 'plans'),
    'the Terms have no #plans section for the plan page to link to',
  )
})

// ─── The refund window ───────────────────────────────────────────────────────

test('the first-payment refund window is stated in the Terms and on the support page', () => {
  // George's decision of 2026-09-18: a full refund on request within
  // LEGAL_REFUND_WINDOW_DAYS of the FIRST charge, once, never on renewals.
  const terms = renderToStaticMarkup(<TermsPage />)
  const support = renderToStaticMarkup(<SupportPage />)
  assert.ok(
    has(terms, `Your first payment is refundable in full for ${LEGAL_REFUND_WINDOW_DAYS} days.`),
    'the Terms do not state the refund window',
  )
  assert.ok(has(terms, 'it does not apply to renewals'), 'the Terms do not exclude renewals')
  assert.ok(
    has(support, `refundable in full for ${LEGAL_REFUND_WINDOW_DAYS} days`),
    'the support page does not mention the refund window',
  )
  assert.equal(LEGAL_REFUND_WINDOW_DAYS, 14)
})

// ─── Nothing invented ────────────────────────────────────────────────────────

test('no certification, compliance or security claim Become cannot back', () => {
  // Mentioning a certification in order to DISCLAIM it is the opposite of
  // claiming one, so these patterns match the claim, not the word.
  const FORBIDDEN: [RegExp, string][] = [
    [/HIPAA[- ](compliant|certified)|HIPAA compliance/i, 'Become is not a HIPAA covered entity'],
    [/(SOC ?2|ISO ?27001)[- ]?(certified|compliant)/i, 'no audit or certification exists'],
    [/(certified|compliant) (under|with) (SOC|ISO|HIPAA)/i, 'no audit or certification exists'],
    [/bank[- ]level|military[- ]grade|AES[- ]?256|end[- ]to[- ]end encrypt/i, 'no encryption standard is claimed'],
    [/GDPR[- ]compliant|CCPA[- ]compliant/i, 'compliance is not self-certified'],
    [/\bguaranteed\b|money[- ]back/i, 'nothing is guaranteed'],
    [/lorem ipsum/i, 'placeholder copy'],
  ]
  for (const { name, Page } of PAGES) {
    const html = renderToStaticMarkup(<Page />)
    for (const [re, why] of FORBIDDEN) {
      assert.doesNotMatch(html, re, `${name}: ${why}`)
    }
  }

  // And the disclaimer is stated outright, not merely implied by silence.
  const privacy = renderToStaticMarkup(<PrivacyPage />)
  assert.ok(
    has(privacy, 'We do not hold SOC 2, ISO 27001, HIPAA or any other security certification'),
    'the privacy policy must say plainly that Become holds no certification',
  )
  assert.ok(
    has(privacy, 'Become is not a HIPAA covered entity'),
    'the privacy policy must say plainly that HIPAA does not apply',
  )
})

test('every open question is marked for counsel, and marked the same way', () => {
  const all = [...counselTodos(TERMS), ...counselTodos(PRIVACY), ...counselTodos(HEALTH_DATA), ...counselTodos(SUPPORT)]
  assert.ok(all.length > 0, 'a draft with no open questions has probably invented some answers')

  // The marker renders on the page, so an unresolved item cannot ship unseen.
  const termsHtml = renderToStaticMarkup(<TermsPage />)
  assert.ok(has(termsHtml, COUNSEL_TODO), 'the counsel marker is not rendered')

  // No arbitration clause has been drafted, so none may be implied.
  assert.ok(
    has(termsHtml, 'There is no arbitration agreement and no class-action waiver'),
    'the Terms must state plainly that no arbitration clause exists',
  )
})

// ─── The deletion copy matches reality ───────────────────────────────────────

test('the privacy policy describes account deletion as it actually works', () => {
  // The member-facing route. This assertion used to run the other way round —
  // it FAILED if the route appeared, so that the copy and the code could never
  // ship apart. It still does that job, in the direction that is now true: if
  // the route is ever removed, the policy stops being able to promise a button.
  assert.ok(
    fs.existsSync(path.join(ROOT, 'app/api/me/account/route.ts')),
    'the Privacy Policy describes an in-app delete button; the route behind it is gone',
  )
  assert.ok(
    fs.existsSync(path.join(ROOT, 'app/api/me/account/restore/route.ts')),
    'the policy promises an undo link; the route behind it is gone',
  )

  const html = renderToStaticMarkup(<PrivacyPage />)

  // It names the path a member (and a reviewer) has to walk.
  assert.ok(has(html, 'Danger zone'), 'the policy does not say where the button is')
  assert.ok(has(html, 'Delete account'), 'the policy does not name the control')
  // And the two facts an authority would check: what stops immediately, and
  // how long the data survives.
  assert.ok(
    has(html, `scheduled for permanent erasure in ${ACCOUNT_DELETION_GRACE_DAYS} days`),
    'the policy does not state the undo window',
  )
  assert.ok(
    has(html, 'every push notification registration on your account is deleted'),
    'the policy does not say that notifications stop at request time',
  )
  // The old claim must be gone, not merely contradicted somewhere else.
  assert.equal(
    has(html, 'Become does not yet have a'),
    false,
    'the policy still says there is no in-app delete button',
  )
  assert.ok(has(html, LEGAL_CONTACT_EMAIL), 'no address for somebody locked out of the app')
})

// ─── Store readiness: the two URLs the stores ask for ────────────────────────

test('the public deletion-request page renders signed out, for Play Data safety', () => {
  // Google Play's Data safety form asks for "a web link where users can request
  // deletion of their account and data", and a reviewer opens it cold: no
  // session, no app installed, and — because this renders to static markup
  // here — no client JavaScript.
  const html = renderToStaticMarkup(<DeleteAccountPage />)

  assert.ok(html.includes(`>${esc(DELETE_ACCOUNT.title)}</h1>`), 'no title')
  assert.ok(has(html, 'Danger zone'), 'it does not say where the in-app button is')
  assert.ok(has(html, 'Delete account'), 'it does not name the in-app control')
  assert.ok(has(html, LEGAL_CONTACT_EMAIL), 'no address for somebody locked out')
  assert.ok(has(html, 'Privacy Policy'), 'it does not link the privacy policy')

  // Every section reaches the page with an anchor, like the other legal pages.
  for (const section of DELETE_ACCOUNT.sections) {
    assert.ok(html.includes(`id="${section.id}"`), `section ${section.id} missing`)
  }

  // And it claims nothing Become cannot back, held to the same list as the rest.
  for (const re of [/HIPAA[- ](compliant|certified)/i, /\bguaranteed\b|money[- ]back/i, /lorem ipsum/i]) {
    assert.doesNotMatch(html, re)
  }
})

test('the landing footer carries the public deletion URL', () => {
  // Being in the footer is what makes it reachable from the home page without
  // signing in, which is the form the Play reviewer fills the URL into.
  const src = read('components/landing/BecomeLanding.tsx')
  const footer = /<footer className={styles\.footer}>[\s\S]*?<\/footer>/.exec(src)
  assert.ok(footer, 'the landing page has no footer any more')
  assert.ok(
    footer[0].includes(`href="${LEGAL_DELETION_REQUEST_PATH}"`),
    'the footer does not link the public deletion page',
  )
})

test('the support page sends members to the in-app control, not only to an inbox', () => {
  const html = renderToStaticMarkup(<SupportPage />)
  assert.ok(has(html, 'Danger zone'), 'support does not name the in-app path')
  assert.ok(
    has(html, LEGAL_DELETION_REQUEST_PATH) || html.includes(`href="${LEGAL_DELETION_REQUEST_PATH}"`),
    'support does not link the public deletion page',
  )
  assert.equal(
    has(html, 'There is no delete button in the app yet'),
    false,
    'support still claims there is no in-app delete button',
  )
})
