// Run with: npm run test:file tests/unit/billing/billingReturnPages.test.tsx
//
// The three PUBLIC return pages, rendered the way a buyer gets them: signed out.
//
// Stripe returns a native buyer to Safari, where no session exists — so these
// pages must render with no cookie, no token and no fetch, say in plain words
// what happened, show NOTHING about the account, and offer the way back into the
// app. Rendered with renderToStaticMarkup (the house pattern; the repo has no
// DOM test environment), which is only possible because they are server
// components that read nothing but their own query string.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import BillingReturnPage from '../../../app/billing/return/page'
import BillingCancelledPage from '../../../app/billing/cancelled/page'
import BillingPortalReturnPage from '../../../app/billing/portal-return/page'
import { RETURN_TO_APP_LABEL } from '../../../lib/billing/appReturn'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** Source with comments removed (the idiom from manageBilling.test.tsx). The
 *  comments in these files QUOTE the route the APP calls and the things the page
 *  must not do — a scan that cannot tell prose from code fails on the
 *  explanation rather than on the code. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const code = (rel: string) => stripComments(read(rel))

const PAGE_SOURCES = [
  'app/billing/return/page.tsx',
  'app/billing/cancelled/page.tsx',
  'app/billing/portal-return/page.tsx',
  'components/billing/PublicBillingReturn.tsx',
]

const success = async (sessionId?: string) =>
  renderToStaticMarkup(
    await BillingReturnPage({
      searchParams: Promise.resolve(sessionId ? { session_id: sessionId } : {}),
    }),
  )

const cancelled = () => renderToStaticMarkup(BillingCancelledPage())
const portalReturn = () => renderToStaticMarkup(BillingPortalReturnPage())

// ─── they render at all, with no session anywhere near them ──────────────────

test('all three pages render signed out and say what happened', async () => {
  const paid = await success('cs_test_a1b2c3')
  assert.match(paid, /billing-return-success/)
  assert.match(paid, /Payment complete/)
  assert.match(paid, /Stripe has your payment/)

  const stopped = cancelled()
  assert.match(stopped, /billing-return-cancelled/)
  assert.match(stopped, /Checkout cancelled/)
  assert.match(stopped, /nothing was charged/)

  const back = portalReturn()
  assert.match(back, /billing-return-portal/)
  assert.match(back, /Back from Stripe/)
  assert.match(back, /saved with Stripe/)
})

test('the success page renders without a session_id too', async () => {
  // Stripe always appends one, but a member can bookmark, share or retype the
  // URL. A blank page or a crash after a payment is the worst possible outcome.
  const html = await success()
  assert.match(html, /Payment complete/)
  assert.match(html, /become:\/\/\?billing=success/)
  assert.doesNotMatch(html, /session_id=/, 'nothing to pass on, so nothing is passed on')
})

test('nothing on these pages needs a session: no client code, no token, no fetch', () => {
  for (const rel of PAGE_SOURCES) {
    const src = code(rel)
    assert.doesNotMatch(src, /'use client'/, `${rel} must render without JavaScript`)
    assert.doesNotMatch(src, /getToken|clientAuth|AuthGuard|verifyAuth/, `${rel} needs a session`)
    assert.doesNotMatch(src, /\bfetch\(/, `${rel} calls something`)
    assert.doesNotMatch(src, /useEffect|useState/, `${rel} is not a server component any more`)
  }
})

// ─── they show no account data, and activate nothing ─────────────────────────

test('no account data reaches the markup — there is none to show', async () => {
  for (const html of [await success('cs_test_a1b2c3'), cancelled(), portalReturn()]) {
    for (const forbidden of [
      /@[a-z0-9.-]+\.[a-z]{2,}/i, // an email address
      /\bPlus\b/, // the tier they may or may not now hold
      /\bfree\b/i,
      /\$\d/, // a price
      /\bgrandfathered\b/i,
      /\brenews?\b/i,
      /\bcus_[A-Za-z0-9]/, // a Stripe customer
      /\bsub_[A-Za-z0-9]/, // a Stripe subscription
    ]) {
      assert.doesNotMatch(html, forbidden, `${forbidden} is account data on a public page`)
    }
  }
})

test('the session id is never printed, only handed back to the app', async () => {
  const html = await success('cs_test_a1b2c3')
  // It travels in the deep link (and the web fallback), and appears nowhere a
  // reader — or a shoulder — can see it as text.
  assert.match(html, /become:\/\/\?billing=success&(?:amp;)?session_id=cs_test_a1b2c3/)
  assert.doesNotMatch(html, />[^<]*cs_test_a1b2c3/, 'the session id is rendered as visible text')
})

test('a hostile session_id cannot get into an href', async () => {
  const html = await success('javascript:alert(1)')
  assert.doesNotMatch(html, /javascript:/, 'anything not shaped like cs_… must be dropped')
  assert.match(html, /become:\/\/\?billing=success"/, 'the button still works without it')
})

test('the pages activate nothing themselves — the app asks, signed in', () => {
  // NP-054: the app calls GET /api/billing/status?session_id= with its own
  // token. A page on a URL mail scanners and link previewers fetch must never
  // be a second activation path, and signed out it could not be a safe one.
  for (const rel of PAGE_SOURCES) {
    const src = code(rel)
    assert.doesNotMatch(src, /\/api\/billing/, `${rel} calls a billing route`)
    assert.doesNotMatch(
      src,
      /getStripe|applyBillingOutcome|stripe\.(checkout|billingPortal|subscriptions)/,
      `${rel} touches billing state`,
    )
  }
})

// ─── the way back ────────────────────────────────────────────────────────────

test('every page offers "Return to Become" over the become:// scheme', async () => {
  for (const [name, html] of [
    ['success', await success('cs_test_a1b2c3')],
    ['cancelled', cancelled()],
    ['portal-return', portalReturn()],
  ] as const) {
    assert.ok(html.includes(RETURN_TO_APP_LABEL), `${name} has no way back into the app`)
    assert.match(html, /href="become:\/\//, `${name} does not use the custom scheme`)
    assert.match(html, /data-testid="billing-return-app"/, name)
    // A same-domain link would stay in Safari, which is the whole problem.
    assert.doesNotMatch(html, /href="https:\/\/become/, `${name} links back to a web page`)
  }
})

test('a member without the app gets a web fallback, and is told it needs a sign-in', async () => {
  for (const [name, html] of [
    ['success', await success('cs_test_a1b2c3')],
    ['cancelled', cancelled()],
    ['portal-return', portalReturn()],
  ] as const) {
    assert.match(html, /data-testid="billing-return-web"/, `${name} has no web fallback`)
    assert.match(html, /href="\/dashboard\/plan\?/, `${name} does not link the plan page`)
    assert.match(html, /sign in/i, `${name} does not say the browser will ask them to sign in`)
  }
})

test('none of the three is indexable', () => {
  // These are one-time return URLs handed out by Stripe.
  for (const rel of PAGE_SOURCES.slice(0, 3)) {
    assert.match(read(rel), /robots: \{ index: false, follow: false \}/, rel)
  }
})
