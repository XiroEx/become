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
//   5. THE SUBJECT IS NEVER INVISIBLE. Hiding the button from a member with no
//      Stripe customer is right; hiding every trace of billing from them is
//      what kept the bug alive. Three reports of "there is still no button to
//      manage billing at all" came from a complimentary-Plus member looking at
//      a plan page that, correctly, had no button — and, incorrectly, had
//      nothing else either. The block is now unconditional and NoBillingNote
//      states the absence, in words that borrow neither the control's name nor
//      a tier.
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
import { CurrentPlan, UnenforcedPlan } from '../../../app/dashboard/plan/PlanPageClient'
import ManageBillingButton from '../../../components/billing/ManageBillingButton'
import NoBillingNote from '../../../components/billing/NoBillingNote'
import { BILLING_PORTAL_PATH } from '../../../lib/billingPortal'
import { BILLING_HEADING, NO_BILLING_TO_MANAGE_NOTE } from '../../../lib/billingCopy'
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

/**
 * EVERYTHING the plan page shows this member, in whichever of its two states
 * they land in.
 *
 * The page has exactly two, and the branch between them is ENTITLEMENTS_ENFORCED
 * — `UnenforcedPlan` when the switch is off, `CurrentPlan` (plus a comparison
 * table and, for a free member, prices) when it is on. Both are ALL a subscriber
 * sees: the pricing block is hidden for anyone who already holds Plus.
 *
 * The unenforced half is not a hypothetical. The switch defaults to OFF and is
 * off in production, while billing runs regardless of it
 * (lib/billing/apply.ts) — so that card is the screen a first subscriber
 * actually lands on, and for its first release it returned early with no way
 * into the portal at all while the Terms said otherwise. This mirrors the page's
 * own branch; the source scan below is what keeps the mirror honest.
 */
const planScreen = (data: EntitlementsSnapshot) =>
  data.enforced === false
    ? renderToStaticMarkup(
        <UnenforcedPlan snapshot={data} portalState="idle" onOpenPortal={() => {}} />,
      )
    : planCard(data)

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
  // THE REGRESSION TEST for the bug itself: whichever state the page is in is
  // the only thing an active subscriber sees on it (the pricing block is hidden
  // for anyone who already holds Plus), so if the portal is not in that markup
  // it is nowhere on that screen.
  //
  // Asserted in BOTH switch states, because the first release of this fix only
  // held in one of them: `enforced: true`. With the switch off — its default,
  // and how the app is deployed — the page returned its neutral card and the
  // button was on no screen at all, which is the report this run came from.
  for (const enforced of [true, false]) {
    const where = `enforced=${enforced}`
    for (const status of ['active', 'trialing', 'past_due']) {
      const html = planScreen(snapshot({ enforced, subscription: sub({ status }) }))
      assert.ok(
        has(html, MANAGE_BILLING_LABEL),
        `${where} ${status}: no way into the billing portal`,
      )
      assert.match(html, /<button/, `${where} ${status}: the label must be on something pressable`)
    }

    const cancelled = planScreen(
      snapshot({ enforced, subscription: sub({ status: 'canceled', currentPeriodEnd: future }) }),
    )
    assert.ok(
      has(cancelled, MANAGE_BILLING_LABEL),
      `${where} cancelled-but-still-running: no portal`,
    )

    // ...and it says what pressing it does, in the support page's own words.
    const active = planScreen(snapshot({ enforced, subscription: sub({}) }))
    assert.ok(has(active, MANAGE_BILLING_PORTAL_NOTE), `${where}: the button explains nothing`)
  }
})

test('the plan page always has a billing block, whoever is looking at it', () => {
  // THE SECOND HALF OF THE BUG, and the one that kept being reported after the
  // first was fixed. Hiding the button for a member with no Stripe customer is
  // correct — the portal answers 409 no_customer — but hiding it also hid the
  // SUBJECT: the plan page then had no billing anything on it, and "you are not
  // being billed" was indistinguishable from "this app forgot to ship the
  // button". Three reports in a row came from a complimentary-Plus member, i.e.
  // from exactly the member the visibility rule excludes.
  //
  // So the block is unconditional in both switch states and for every member;
  // only its contents branch.
  const everyone: [string, EntitlementsSnapshot][] = [
    ['subscriber', snapshot({ subscription: sub({}) })],
    ['past_due subscriber', snapshot({ tier: 'free', subscription: sub({ status: 'past_due' }) })],
    ['grandfathered', snapshot({ grandfathered: true, subscription: null })],
    ['admin', snapshot({ role: 'admin', subscription: null })],
    ['free', snapshot({ tier: 'free', subscription: null })],
    ['opened checkout once', snapshot({ tier: 'free', subscription: sub({ status: 'none' }) })],
  ]

  for (const enforced of [true, false]) {
    for (const [who, data] of everyone) {
      const html = planScreen({ ...data, enforced })
      assert.ok(
        has(html, BILLING_HEADING),
        `enforced=${enforced} ${who}: the plan page says nothing at all about billing`,
      )
    }
  }
})

test('a member with nothing to manage is told so, instead of shown a blank', () => {
  for (const enforced of [true, false]) {
    const where = `enforced=${enforced}`
    for (const [who, data] of [
      ['grandfathered', snapshot({ grandfathered: true, subscription: null })],
      ['admin', snapshot({ role: 'admin', subscription: null })],
      ['free', snapshot({ tier: 'free', subscription: null })],
      ['opened checkout once', snapshot({ tier: 'free', subscription: sub({ status: 'none' }) })],
    ] as [string, EntitlementsSnapshot][]) {
      const html = planScreen({ ...data, enforced })
      assert.ok(
        has(html, NO_BILLING_TO_MANAGE_NOTE),
        `${where} ${who}: nothing explains why there is no billing control`,
      )
    }

    // ...and a member Stripe IS billing gets the button and NOT the excuse.
    const paying = planScreen(snapshot({ enforced, subscription: sub({}) }))
    assert.ok(
      !has(paying, NO_BILLING_TO_MANAGE_NOTE),
      `${where}: a paying member is told they have no payment method`,
    )
  }
})

test('the note is not a control, and never borrows the control’s name', () => {
  // Rule 2 of NoBillingNote. The Terms, the support page and the renewal line
  // all send a member to find something called "Manage billing"; printing that
  // name on a screen where nothing happens is the original bug wearing a hat.
  assert.ok(
    !NO_BILLING_TO_MANAGE_NOTE.includes(MANAGE_BILLING_LABEL),
    'the no-billing note names a control that is not there',
  )
  const note = renderToStaticMarkup(<NoBillingNote />)
  assert.doesNotMatch(note, /<button|<a /, 'nothing here is pressable — there is nowhere to go')
  assert.ok(has(note, NO_BILLING_TO_MANAGE_NOTE), 'the note does not render its own sentence')

  // Launch-day contract: safe to put on the unenforced card.
  assert.doesNotMatch(note, /\$\d/, 'no price in the no-billing note')
  assert.doesNotMatch(note, /\bPlus\b/, 'no tier in the no-billing note')
})

test('grandfathered members and admins are shown no billing controls', () => {
  // Neither has a Stripe customer, so the portal would answer 409 no_customer.
  // Both switch states again: the unenforced card must not turn into a second
  // place that offers a portal to somebody Stripe has never heard of.
  for (const enforced of [true, false]) {
    const where = `enforced=${enforced}`

    const grandfathered = planScreen(snapshot({ enforced, grandfathered: true, subscription: null }))
    assert.ok(
      !has(grandfathered, MANAGE_BILLING_LABEL),
      `${where}: grandfathered member offered a portal`,
    )

    const admin = planScreen(snapshot({ enforced, role: 'admin', subscription: null }))
    assert.ok(!has(admin, MANAGE_BILLING_LABEL), `${where}: admin offered a portal`)

    const free = planScreen(snapshot({ enforced, tier: 'free', subscription: null }))
    assert.ok(!has(free, MANAGE_BILLING_LABEL), `${where}: free member offered a portal`)

    // And a member who merely OPENED checkout once is not a subscriber either.
    const opened = planScreen(
      snapshot({ enforced, tier: 'free', subscription: sub({ status: 'none' }) }),
    )
    assert.ok(
      !has(opened, MANAGE_BILLING_LABEL),
      `${where}: a bare customer id is not a subscription`,
    )
  }

  // The enforced card still explains WHY a grandfathered member is on Plus, and
  // does it without offering them billing they do not have.
  const card = planCard(snapshot({ grandfathered: true, subscription: null }))
  assert.ok(has(card, 'Thanks for being here early'), 'wrong card rendered')
})

test('the plan page owns the request the button fires', () => {
  // The button is pure on purpose; this is the wiring it cannot assert itself.
  const src = read('app/dashboard/plan/PlanPageClient.tsx')
  assert.match(src, /<CurrentPlan[\s\S]{0,120}onOpenPortal=\{openPortal\}/, 'CurrentPlan is not wired to the portal')
  assert.match(src, /openBillingPortal\(portalPath\)/, 'the page must open the portal through the shared helper')
  assert.match(src, /setPortalState\('failed'\)/, 'a portal that does not open must say so')
})

test('the kill-switch branch of the plan page is wired to the portal too', () => {
  // The render tests above take the page's branch on trust, because the page
  // itself cannot be rendered here (it reads a hook and useSearchParams). THIS
  // is what makes them worth something: the unenforced return must go through
  // the component they render, with the same handler.
  //
  // A plain early return with a card and no billing exit is not a style choice,
  // it is the bug: ENTITLEMENTS_ENFORCED is off by default and off in
  // production, and lib/billing/apply.ts runs regardless of it — the switch
  // governs tier, never money.
  const src = read('app/dashboard/plan/PlanPageClient.tsx')
  assert.match(src, /export function UnenforcedPlan/, 'the unenforced card must be renderable')

  const at = src.indexOf('if (data.enforced === false)')
  assert.ok(at > 0, 'the kill-switch branch must exist')
  const branch = src.slice(at, src.indexOf('const isPlus', at))
  assert.match(
    branch,
    /<UnenforcedPlan[\s\S]{0,200}onOpenPortal=\{openPortal\}/,
    'the unenforced plan page has no way into the billing portal',
  )
  assert.doesNotMatch(
    branch,
    /<Card>/,
    'the unenforced card is UnenforcedPlan; inlining it again drops the billing exit',
  )

  // And it decides with the one shared rule, not a second copy of it.
  const component = src.slice(src.indexOf('export function UnenforcedPlan'))
  assert.match(
    component.slice(0, component.indexOf('\n}\n') + 3),
    /hasManageableBilling\(snapshot\.subscription\)/,
    'the unenforced card must use the shared visibility rule',
  )
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
  // The BUTTON is still only for a member Stripe is billing; everyone else gets
  // the note. The one thing that still renders nothing at all is a snapshot
  // that has not arrived yet — guessing out loud before it does is worse than
  // waiting a beat.
  assert.match(section, /if \(!data\) return null/, 'an unknown snapshot must render nothing')
  assert.match(section, /<NoBillingNote/, 'Settings must explain an absent portal, not hide it')
  assert.match(section, /openBillingPortal\(\)/, 'and open the portal through the shared helper')
  assert.match(section, /BILLING_HEADING/, 'both billing surfaces use one section heading')
  // No second definition of the label anywhere in the app.
  for (const file of [
    'components/billing/BillingSection.tsx',
    'components/billing/ManageBillingButton.tsx',
    'components/billing/NoBillingNote.tsx',
    'lib/billingCopy.ts',
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
