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
//   5. the account-deletion copy still matches reality — that there is no
//      in-app delete button — for as long as that stays true.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import TermsPage from '../../../app/terms/page'
import PrivacyPage from '../../../app/privacy/page'
import SupportPage from '../../../app/support/page'
import { PlanPricing } from '../../../app/dashboard/plan/PlanPageClient'
import {
  COUNSEL_TODO,
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  LEGAL_LINKS,
  LEGAL_VERSION,
  RENEWAL_TERMS,
  counselTodos,
  renewalLine,
} from '../../../lib/legal'
import { TERMS } from '../../../lib/legal/terms'
import { PRIVACY } from '../../../lib/legal/privacy'
import { SUPPORT } from '../../../lib/legal/support'

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
  // The sign-in screen (where agreement happens), the plan page (where money
  // happens), the dashboard home and settings (in-app, for App Store review).
  for (const file of [
    'app/login/page.tsx',
    'app/dashboard/plan/PlanPageClient.tsx',
    'app/dashboard/DashboardClient.tsx',
    'app/dashboard/settings/page.tsx',
  ]) {
    const src = read(file)
    assert.match(src, /legal\/LegalLinks/, `${file}: does not import LegalLinks`)
    assert.match(src, /<LegalLinks/, `${file}: imports LegalLinks but never renders it`)
  }

  // And the sign-in screen names the two documents in the sentence itself,
  // because that is the screen on which agreement is given.
  const login = read('app/login/page.tsx')
  assert.match(login, /href="\/terms"/, 'login does not link the terms')
  assert.match(login, /href="\/privacy"/, 'login does not link the privacy policy')
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
  const all = [...counselTodos(TERMS), ...counselTodos(PRIVACY), ...counselTodos(SUPPORT)]
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
  // There is no member-facing deletion route: app/api/admin/users/[id] is
  // admin-only. While that is true, the policy must say so rather than describe
  // a button. When in-app deletion ships, this test fails and both the route
  // list and the copy get updated together — which is the point.
  const memberFacingDelete = fs.existsSync(
    path.join(ROOT, 'app/api/me/account/route.ts'),
  )
  const html = renderToStaticMarkup(<PrivacyPage />)

  if (memberFacingDelete) {
    assert.fail(
      'a member-facing account-deletion route now exists: update the Privacy Policy (section 13), the Support page and the settings copy to describe it, then update this test',
    )
  }

  assert.ok(
    has(html, 'Become does not yet have a'),
    'the policy must admit there is no in-app delete button while there is none',
  )
  assert.ok(has(html, LEGAL_CONTACT_EMAIL), 'no address to send a deletion request to')
})
