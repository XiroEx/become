// Run with: npm run test:file tests/unit/billing/manageBilling.test.tsx
//
// "Manage billing" — the one control a paying member needs and, until this
// shipped, the one control the app did not have.
//
// The Terms (sections 9 and 10), the support page and the renewal disclosure
// under the buy button ALL tell a member to open the Plan page and choose
// "Manage billing" to update a card, read an invoice or cancel. The only caller
// of POST /api/billing/portal was the upgrade sheet's "Update payment method",
// which appears solely after checkout refuses someone whose card has already
// failed. An active subscriber saw "You're on Plus" and a date, and would have
// had to email to cancel — the exact thing New York GBL 527-a ("as easy to
// cancel as it was to subscribe") is written to stop.
//
// Four properties, and each of them is one careless edit away at all times:
//
//   1. A member Stripe is billing SEES the button, in every state a
//      subscription can be in that the portal can still act on.
//   2. A member Stripe has never heard of does NOT — grandfathered members and
//      admins hold Plus with no customer, and a portal button for them answers
//      409 no_customer, which reads as a broken app.
//   3. The WORDING is the documents' wording, letter for letter. An instruction
//      in the Terms that names a control that does not exist under that name is
//      the same bug in a different font.
//   4. The button goes somewhere real: a route that exists, posts, and hands
//      back a Stripe url.
//
// Rendered with renderToStaticMarkup (the house pattern — the repo has no DOM
// test environment), which is why CurrentPlan and ManageBillingButton are pure
// and take the portal state as a prop.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import TermsPage from '../../../app/terms/page'
import SupportPage from '../../../app/support/page'
import { CurrentPlan } from '../../../app/dashboard/plan/PlanPageClient'
import ManageBillingButton from '../../../components/billing/ManageBillingButton'
import { BILLING_PORTAL_PATH } from '../../../lib/billingPortal'
import {
  MANAGE_BILLING_LABEL,
  MANAGE_BILLING_PORTAL_NOTE,
  RENEWAL_TERMS,
  renewalLine,
} from '../../../lib/legal'
import {
  hasManageableBilling,
  type EntitlementsSnapshot,
  type SubscriptionSnapshot,
} from '../../../lib/entitlementsClient'

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

const has = (html: string, text: string) => html.includes(esc(text))

/** Source with comments removed. The comments in these files QUOTE the label
 *  while explaining why it must not be typed out, and a scan that cannot tell
 *  prose from code would fail on the explanation. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const DAY = 24 * 60 * 60 * 1000
const future = new Date(Date.now() + 20 * DAY).toISOString()
const past = new Date(Date.now() - 20 * DAY).toISOString()

const sub = (over: Partial<SubscriptionSnapshot>): SubscriptionSnapshot => ({
  status: 'active',
  currentPeriodEnd: future,
  cancelAtPeriodEnd: false,
  ...over,
})

const snapshot = (over: Partial<EntitlementsSnapshot>): EntitlementsSnapshot => ({
  role: 'user',
  tier: 'plus',
  enforced: true,
  grandfathered: false,
  subscription: null,
  checkoutAvailable: true,
  features: {},
  ...over,
})

const planCard = (data: EntitlementsSnapshot) =>
  renderToStaticMarkup(
    <CurrentPlan snapshot={data} portalState="idle" onOpenPortal={() => {}} />,
  )

// ─── Who has billing to manage ───────────────────────────────────────────────

test('every subscription the portal can act on counts as manageable', () => {
  // The four the card names, plus the three that are the same argument: Stripe
  // is holding a subscription and only the portal can do anything about it.
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']) {
    assert.equal(
      hasManageableBilling(sub({ status })),
      true,
      `${status}: a member Stripe is billing must be able to reach the portal`,
    )
  }
  // past_due is deliberately in that list even though it derives to the FREE
  // tier: their card is the problem, and the portal is where it gets fixed.
  assert.equal(hasManageableBilling(sub({ status: 'past_due' })), true)

  // Cancelled but still running — access continues to the period end, and so
  // does the ability to read an invoice or undo the cancellation.
  assert.equal(hasManageableBilling(sub({ status: 'canceled', currentPeriodEnd: future })), true)
  assert.equal(
    hasManageableBilling(sub({ status: 'active', cancelAtPeriodEnd: true })),
    true,
    'the ordinary shape of "cancelled": active until the period end',
  )
})

test('nobody without a subscription is offered a portal', () => {
  // GRANDFATHERED and ADMIN: Plus with no Stripe customer anywhere. This is the
  // whole of acceptance criterion 2 — the snapshot carries `subscription: null`
  // for both, and that is the only thing consulted.
  assert.equal(hasManageableBilling(null), false, 'grandfathered / admin / free')
  assert.equal(hasManageableBilling(undefined), false, 'no snapshot yet')

  // 'none' is the row EVERY member gets the moment they open checkout —
  // writeCustomerIdIfAbsent stamps a customer id and the schema defaults the
  // status. A customer is not a subscription.
  assert.equal(hasManageableBilling(sub({ status: 'none' })), false)
  // A checkout that was never completed. Nothing was charged, nothing renews.
  assert.equal(hasManageableBilling(sub({ status: 'incomplete_expired' })), false)
  // Cancelled and finished: the period they paid for is over.
  assert.equal(hasManageableBilling(sub({ status: 'canceled', currentPeriodEnd: past })), false)
  assert.equal(hasManageableBilling(sub({ status: 'canceled', currentPeriodEnd: null })), false)
  // A status nobody has read the semantics of fails closed, like normalizeStatus.
  assert.equal(hasManageableBilling(sub({ status: 'something_new' })), false)
})

// ─── The Plan page ───────────────────────────────────────────────────────────

test('a subscriber is never shown their plan without a way out of it', () => {
  // THE REGRESSION TEST for the bug itself: CurrentPlan is the only thing an
  // active subscriber sees on the plan page (the pricing block is hidden for
  // anyone who already holds Plus), so if the portal is not in this markup it
  // is nowhere on that screen.
  for (const status of ['active', 'trialing', 'past_due']) {
    const html = planCard(snapshot({ subscription: sub({ status }) }))
    assert.ok(has(html, MANAGE_BILLING_LABEL), `${status}: no way into the billing portal`)
    assert.match(html, /<button/, `${status}: the label must be on something pressable`)
  }

  const cancelled = planCard(
    snapshot({ subscription: sub({ status: 'canceled', currentPeriodEnd: future }) }),
  )
  assert.ok(has(cancelled, MANAGE_BILLING_LABEL), 'cancelled-but-still-running: no portal')

  // ...and it says what pressing it does, in the support page's own words.
  const active = planCard(snapshot({ subscription: sub({}) }))
  assert.ok(has(active, MANAGE_BILLING_PORTAL_NOTE), 'the button explains nothing')
})

test('grandfathered members and admins are shown no billing controls', () => {
  // Neither has a Stripe customer, so the portal would answer 409 no_customer.
  const grandfathered = planCard(snapshot({ grandfathered: true, subscription: null }))
  assert.ok(has(grandfathered, 'Thanks for being here early'), 'wrong card rendered')
  assert.ok(!has(grandfathered, MANAGE_BILLING_LABEL), 'grandfathered member offered a portal')

  const admin = planCard(snapshot({ role: 'admin', subscription: null }))
  assert.ok(!has(admin, MANAGE_BILLING_LABEL), 'admin offered a portal')

  const free = planCard(snapshot({ tier: 'free', subscription: null }))
  assert.ok(!has(free, MANAGE_BILLING_LABEL), 'free member offered a portal')

  // And a member who merely OPENED checkout once is not a subscriber either.
  const opened = planCard(snapshot({ tier: 'free', subscription: sub({ status: 'none' }) }))
  assert.ok(!has(opened, MANAGE_BILLING_LABEL), 'a bare customer id is not a subscription')
})

test('the plan page owns the request the button fires', () => {
  // The button is pure on purpose; this is the wiring it cannot assert itself.
  const src = read('app/dashboard/plan/PlanPageClient.tsx')
  assert.match(src, /<CurrentPlan[\s\S]{0,120}onOpenPortal=\{openPortal\}/, 'CurrentPlan is not wired to the portal')
  assert.match(src, /openBillingPortal\(portalPath\)/, 'the page must open the portal through the shared helper')
  assert.match(src, /setPortalState\('failed'\)/, 'a portal that does not open must say so')
})

// ─── Settings ────────────────────────────────────────────────────────────────

test('Settings carries the same button, and hides it the same way', () => {
  const settings = read('app/dashboard/settings/page.tsx')
  assert.match(settings, /import BillingSection from '@\/components\/billing\/BillingSection'/)
  assert.match(settings, /<BillingSection \/>/, 'imported but never mounted')

  const section = read('components/billing/BillingSection.tsx')
  assert.match(
    section,
    /hasManageableBilling\(data\?\.subscription\)/,
    'Settings must use the one visibility rule, not a second copy of it',
  )
  assert.match(section, /return null/, 'it must render nothing for a member with no subscription')
  assert.match(section, /openBillingPortal\(\)/, 'and open the portal through the shared helper')
  // No second definition of the label anywhere in the app.
  for (const file of [
    'components/billing/BillingSection.tsx',
    'components/billing/ManageBillingButton.tsx',
    'app/dashboard/plan/PlanPageClient.tsx',
  ]) {
    assert.doesNotMatch(
      stripComments(read(file)),
      /['"`]Manage billing['"`]/,
      `${file} types the label out instead of importing MANAGE_BILLING_LABEL`,
    )
  }
})

// ─── The wording is the documents' wording ───────────────────────────────────

test('the app, the Terms and the support page name one control', () => {
  // Word for word, from one constant — not three strings that happen to agree
  // today. Rename it and every one of these moves together; retype it anywhere
  // and this fails.
  const button = renderToStaticMarkup(
    <ManageBillingButton state="idle" onOpenPortal={() => {}} showNote />,
  )
  const terms = renderToStaticMarkup(<TermsPage />)
  const support = renderToStaticMarkup(<SupportPage />)

  assert.ok(has(button, MANAGE_BILLING_LABEL), 'the button does not carry the label')
  assert.ok(has(terms, MANAGE_BILLING_LABEL), 'the Terms no longer name it')
  assert.ok(has(support, MANAGE_BILLING_LABEL), 'the support page no longer names it')
  assert.ok(
    has(terms, `To cancel, open the Plan page in the app, choose ${MANAGE_BILLING_LABEL},`),
    'the Terms cancellation clause does not name the control',
  )
  assert.ok(
    has(support, `${MANAGE_BILLING_PORTAL_NOTE}`),
    'the support page and the button describe the portal differently',
  )

  // The renewal disclosure under the buy button says the same thing.
  for (const plan of ['monthly', 'annual'] as const) {
    assert.ok(
      renewalLine(plan).includes(MANAGE_BILLING_LABEL),
      `${plan}: the renewal line points at a control it does not name`,
    )
  }
  assert.ok(
    RENEWAL_TERMS.some((s) => s.includes(MANAGE_BILLING_LABEL)),
    'the renewal terms no longer say how to cancel',
  )

  // The phrase is EXACTLY what the documents say it is. If somebody softens the
  // button to "Billing" or "Manage subscription", the instruction in the Terms
  // stops matching anything on screen.
  assert.equal(MANAGE_BILLING_LABEL, 'Manage billing')
  assert.equal(
    MANAGE_BILLING_PORTAL_NOTE,
    'That opens the Stripe billing portal, where you can update your payment method, see and download your invoices, and cancel.',
  )
})

// ─── It goes somewhere real ──────────────────────────────────────────────────

test('the path the button posts to is a route that exists and returns a url', () => {
  // A button that 404s is the bug this card fixed, one layer down.
  assert.equal(BILLING_PORTAL_PATH, '/api/billing/portal')
  const routeFile = `app${BILLING_PORTAL_PATH}/route.ts`
  assert.ok(fs.existsSync(path.join(ROOT, routeFile)), `${routeFile} does not exist`)

  const route = read(routeFile)
  assert.match(route, /export async function POST/, 'the helper posts')
  assert.match(route, /billingPortal\.sessions\.create/, 'it must be Stripe’s hosted portal')
  assert.match(route, /url: session\.url/, 'the client follows `url` and nothing else')

  const helper = read('lib/billingPortal.ts')
  assert.match(helper, /method: 'POST'/)
  assert.match(helper, /Authorization: `Bearer \$\{token\}`/, 'the route reads a Bearer token')
  assert.match(helper, /window\.location\.assign\(url\)/, 'the one-time link must be followed')
})
