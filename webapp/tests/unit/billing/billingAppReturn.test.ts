// Run with: npm run test:file tests/unit/billing/billingAppReturn.test.ts
//
// Returning a buyer who STARTED IN THE APP.
//
// Stripe chooses the return origin from Origin, then Referer, then Host. A
// native request carries neither of the first two, so the Host decides and the
// buyer is dropped into SAFARI — a browser that has never held this member's
// session, because `auth_token` is a cookie the app does not share. Every
// `/dashboard/*` path is behind middleware.ts, so the plan page sent them to
// /login seconds after their card was charged.
//
// So `returnTo: 'app'` moves the three return URLs onto PUBLIC pages, and the
// tests that matter are the ones proving:
//
//   1. the app's URLs are outside /dashboard (no middleware, no sign-in wall),
//   2. the web's URLs did not move a single character,
//   3. `{CHECKOUT_SESSION_ID}` still survives verbatim on the app path — it is
//      a Stripe TEMPLATE token, and percent-encoded braces are never
//      substituted, a bug that only shows up after a real payment,
//   4. the origin allow-list still decides the host, so the public pages cannot
//      be pointed at somebody else's domain.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  APP_BILLING_RETURN_PATHS,
  BILLING_RETURN_PATH,
  checkoutCancelUrl,
  checkoutSuccessUrl,
  parseReturnTarget,
  portalReturnUrl,
} from '../../../lib/billing/urls'
import {
  BECOME_APP_SCHEME,
  RETURN_TO_APP_LABEL,
  becomeAppLink,
  publicReturnPath,
  safeSessionId,
  webFallbackHref,
} from '../../../lib/billing/appReturn'

const PROD = 'https://become.redbtn.io'
const PUBLIC = 'https://becomeurbest.com'
const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function withAppUrl<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.NEXT_PUBLIC_APP_URL
  if (value === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = value
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = previous
  }
}

const headers = (init: Record<string, string>) => new Headers(init)

const appUrls = (h?: Headers) => [
  checkoutSuccessUrl(h, 'app'),
  checkoutCancelUrl(h, 'app'),
  portalReturnUrl(h, 'app'),
]

// ─── 1. the app returns to public pages ──────────────────────────────────────

test("returnTo 'app' puts success, cancel and portal on the public pages", () => {
  withAppUrl(PROD, () => {
    assert.equal(
      checkoutSuccessUrl(undefined, 'app'),
      `${PROD}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    )
    assert.equal(checkoutCancelUrl(undefined, 'app'), `${PROD}/billing/cancelled`)
    assert.equal(portalReturnUrl(undefined, 'app'), `${PROD}/billing/portal-return`)
  })
})

test('NOT ONE app return URL is under /dashboard — that is the sign-in wall', () => {
  withAppUrl(PROD, () => {
    for (const url of appUrls()) {
      assert.doesNotMatch(url, /\/dashboard/, `${url} is behind middleware.ts`)
    }
    for (const p of Object.values(APP_BILLING_RETURN_PATHS)) {
      assert.ok(p.startsWith('/billing/'), p)
      assert.doesNotMatch(p, /^\/dashboard/)
    }
  })
})

test('the three public pages exist at exactly those paths', () => {
  // A return URL Stripe accepts and this repo does not serve is a 404 after a
  // payment, and nothing here would have noticed.
  for (const p of Object.values(APP_BILLING_RETURN_PATHS)) {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'app', p.replace(/^\//, ''), 'page.tsx')),
      `no page for ${p}`,
    )
  }
})

test('middleware guards /dashboard only, so the public pages load signed out', () => {
  const src = read('middleware.ts')
  assert.match(src, /matcher: \['\/dashboard\/:path\*'\]/, 'the matcher moved')
  assert.doesNotMatch(src, /\/billing/, 'a matcher over /billing would bounce a paid buyer to /login')
})

// ─── 2. the web did not move ─────────────────────────────────────────────────

test("no returnTo, and returnTo 'web', both behave exactly as today", () => {
  withAppUrl(PROD, () => {
    assert.equal(
      checkoutSuccessUrl(),
      `${PROD}${BILLING_RETURN_PATH}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    )
    assert.equal(checkoutSuccessUrl(undefined, 'web'), checkoutSuccessUrl())
    assert.equal(checkoutCancelUrl(undefined, 'web'), `${PROD}${BILLING_RETURN_PATH}?checkout=cancelled`)
    assert.equal(portalReturnUrl(undefined, 'web'), `${PROD}${BILLING_RETURN_PATH}?portal=return`)

    // Including with headers, which is how both routes actually call them.
    const h = headers({ origin: PUBLIC })
    assert.equal(checkoutSuccessUrl(h), checkoutSuccessUrl(h, 'web'))
    assert.ok(checkoutSuccessUrl(h).startsWith(`${PUBLIC}${BILLING_RETURN_PATH}`))
  })
})

test('the checkout route still sends the web buyer to /dashboard/plan', () => {
  // The route reads `returnTo` off the body and defaults it to 'web'; the UI
  // posts `{ feature, tier }` or `{ plan }` and no target at all.
  const src = read('app/api/billing/checkout/route.ts')
  assert.match(src, /parseReturnTarget\(/, 'the route does not parse a target')
  assert.match(src, /success_url: checkoutSuccessUrl\(request\.headers, returnTo\)/)
  assert.match(src, /cancel_url: checkoutCancelUrl\(request\.headers, returnTo\)/)
  assert.match(src, /invalid_return_to/, 'an unknown target must be a 400, not a guess')
  // ...and the portal takes the same optional flag, with no body still meaning web.
  const portal = read('app/api/billing/portal/route.ts')
  assert.match(portal, /parseReturnTarget\(/)
  assert.match(portal, /return_url: portalReturnUrl\(request\.headers, returnTo\)/)
  assert.match(portal, /request\.json\(\)\.catch\(/, 'a bodyless post must not throw')
})

test('parseReturnTarget: absent is web, app is app, anything else is a refusal', () => {
  assert.equal(parseReturnTarget(undefined), 'web')
  assert.equal(parseReturnTarget(null), 'web')
  assert.equal(parseReturnTarget(''), 'web')
  assert.equal(parseReturnTarget('web'), 'web')
  assert.equal(parseReturnTarget('app'), 'app')
  // A silent fall back here would return a native buyer to /dashboard/plan in
  // Safari — the exact bug — and log nothing.
  for (const bad of ['App', 'APP', 'native', 'ios', 1, true, {}, [], ['app']]) {
    assert.equal(parseReturnTarget(bad), undefined, `${JSON.stringify(bad)} must be refused`)
  }
})

// ─── 3. the Stripe template token ────────────────────────────────────────────

test('the app success URL carries the LITERAL {CHECKOUT_SESSION_ID}', () => {
  withAppUrl(PROD, () => {
    const url = checkoutSuccessUrl(headers({ host: 'becomeurbest.com' }), 'app')
    assert.match(url, /\{CHECKOUT_SESSION_ID\}/, 'braces must survive verbatim')
    assert.doesNotMatch(url, /%7B|%7D/i, 'percent-encoded braces are never substituted')
    assert.match(url, /[?&]session_id=\{CHECKOUT_SESSION_ID\}$/)
  })
})

// ─── 4. the origin allow-list still decides the host ─────────────────────────

test('an app return URL is on the origin the request came from, when we know it', () => {
  withAppUrl(PROD, () => {
    for (const url of appUrls(headers({ origin: PUBLIC }))) {
      assert.ok(url.startsWith(`${PUBLIC}/billing/`), url)
    }
  })
})

test('AN UNKNOWN HOST STILL FALLS BACK AND IS NEVER REFLECTED', () => {
  withAppUrl(PROD, () => {
    for (const url of appUrls(headers({ origin: 'https://attacker.example' }))) {
      assert.doesNotMatch(url, /attacker/)
      assert.ok(url.startsWith(PROD), url)
    }
  })
})

test('a trailing slash on the base never doubles the public path', () => {
  withAppUrl('https://become-beta.redbtn.io///', () => {
    for (const url of appUrls()) {
      assert.doesNotMatch(url, /io\/\/billing/)
      assert.ok(url.startsWith('https://become-beta.redbtn.io/billing/'), url)
    }
  })
})

// ─── the way back into the app ───────────────────────────────────────────────

test('the button back to the app uses the become:// scheme, not this domain', () => {
  // iOS keeps a tap on a SAME-DOMAIN link inside Safari, and the buyer is
  // standing in Safari on one of our own hosts — so a universal link to it
  // would only load another web page. A different scheme is handed to the app.
  const link = becomeAppLink('success', 'cs_test_a1b2c3')
  assert.ok(link.startsWith(BECOME_APP_SCHEME), link)
  assert.equal(BECOME_APP_SCHEME, 'become://', "expo/app.json declares scheme 'become'")
  assert.doesNotMatch(link, /https?:\/\//, 'an https link to our own host stays in Safari')
  assert.match(link, /[?&]billing=success/)
  assert.match(link, /[?&]session_id=cs_test_a1b2c3/)

  assert.equal(becomeAppLink('cancelled'), 'become://?billing=cancelled')
  assert.equal(becomeAppLink('portal-return'), 'become://?billing=portal-return')
})

test('the deep link lands on the app root, because there is no billing route in it yet', () => {
  // expo/app has index, login, onboarding, verify and account/restore and
  // nothing else; an unmatched deep link opens the app on a not-found screen,
  // which is worse than no button for somebody who has just paid.
  const link = becomeAppLink('success')
  assert.equal(link, 'become://?billing=success')
  assert.doesNotMatch(link, /become:\/\/[a-z]/, 'a path here must exist in expo/app')
})

test('a session id that is not a session id is dropped, never reflected', () => {
  assert.equal(safeSessionId('cs_test_a1b2c3'), 'cs_test_a1b2c3')
  assert.equal(safeSessionId(['cs_live_ABC123']), 'cs_live_ABC123')
  assert.equal(safeSessionId(' cs_test_a1b2c3 '), 'cs_test_a1b2c3')
  for (const bad of [
    undefined,
    null,
    '',
    '   ',
    '{CHECKOUT_SESSION_ID}',
    'sub_123',
    'cs_',
    'cs_test_a1b2c3"><script>alert(1)</script>',
    'javascript:alert(1)',
    'cs_test_a1b2c3&session_id=cs_other',
  ]) {
    assert.equal(safeSessionId(bad as string | undefined), undefined, `${String(bad)} must be dropped`)
  }
  // ...so a hostile value cannot reach the href at all.
  assert.equal(becomeAppLink('success', 'javascript:alert(1)'), 'become://?billing=success')
})

test('there is a web fallback, and it is the plan page a web buyer gets', () => {
  assert.equal(
    webFallbackHref('success', 'cs_test_a1b2c3'),
    `${BILLING_RETURN_PATH}?checkout=success&session_id=cs_test_a1b2c3`,
  )
  assert.equal(webFallbackHref('success'), `${BILLING_RETURN_PATH}?checkout=success`)
  assert.equal(webFallbackHref('cancelled'), `${BILLING_RETURN_PATH}?checkout=cancelled`)
  assert.equal(webFallbackHref('portal-return'), `${BILLING_RETURN_PATH}?portal=return`)
})

test('publicReturnPath and the builders name the same three paths', () => {
  assert.equal(publicReturnPath('success'), APP_BILLING_RETURN_PATHS.success)
  assert.equal(publicReturnPath('cancelled'), APP_BILLING_RETURN_PATHS.cancelled)
  assert.equal(publicReturnPath('portal-return'), APP_BILLING_RETURN_PATHS.portalReturn)
  assert.equal(RETURN_TO_APP_LABEL, 'Return to Become')
})
