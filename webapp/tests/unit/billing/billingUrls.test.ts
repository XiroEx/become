// Run with: npm run test:file tests/unit/billing/billingUrls.test.ts
//
// One test here guards a bug that only appears AFTER a real payment.
//
// `{CHECKOUT_SESSION_ID}` in success_url is a Stripe template token. Build the
// URL with URLSearchParams (or run it through encodeURIComponent) and the braces
// become %7B…%7D, Stripe finds no token to substitute, and the success page
// receives the literal placeholder as its session id. Nothing fails at build,
// nothing fails in dev, and the first person to notice has already paid.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BILLING_RETURN_PATH,
  appBaseUrl,
  checkoutCancelUrl,
  checkoutSuccessUrl,
  portalReturnUrl,
} from '../../../lib/billing/urls'

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

test('the success URL carries the LITERAL {CHECKOUT_SESSION_ID} token', () => {
  withAppUrl('https://become.redbtn.io', () => {
    const url = checkoutSuccessUrl()
    assert.match(url, /\{CHECKOUT_SESSION_ID\}/, 'braces must survive verbatim')
    assert.doesNotMatch(url, /%7B|%7D/i, 'percent-encoded braces are never substituted')
    assert.match(url, /[?&]session_id=\{CHECKOUT_SESSION_ID\}/)
    assert.match(url, /[?&]checkout=success/)
  })
})

test('every URL is rooted at the return path', () => {
  withAppUrl('https://become.redbtn.io', () => {
    for (const url of [checkoutSuccessUrl(), checkoutCancelUrl(), portalReturnUrl()]) {
      assert.ok(url.startsWith(`https://become.redbtn.io${BILLING_RETURN_PATH}`), url)
    }
    assert.match(checkoutCancelUrl(), /[?&]checkout=cancelled/)
    assert.match(portalReturnUrl(), /[?&]portal=return/)
  })
})

test('a trailing slash on NEXT_PUBLIC_APP_URL never produces a doubled path', () => {
  for (const base of ['https://become-beta.redbtn.io/', 'https://become-beta.redbtn.io///']) {
    withAppUrl(base, () => {
      assert.equal(appBaseUrl(), 'https://become-beta.redbtn.io')
      assert.doesNotMatch(checkoutSuccessUrl(), /io\/\/dashboard/)
      assert.ok(checkoutSuccessUrl().startsWith('https://become-beta.redbtn.io/dashboard'))
    })
  }
})

test('an unset or blank NEXT_PUBLIC_APP_URL falls back to production', () => {
  withAppUrl(undefined, () => assert.equal(appBaseUrl(), 'https://become.redbtn.io'))
  withAppUrl('', () => assert.equal(appBaseUrl(), 'https://become.redbtn.io'))
  withAppUrl('   ', () => assert.equal(appBaseUrl(), 'https://become.redbtn.io'))
})

test('the beta base is honoured, so a beta checkout returns to beta', () => {
  // Beta and production differ in exactly two env values, and this is one of
  // the two that MUST differ — otherwise a beta tester lands on production.
  withAppUrl('https://become-beta.redbtn.io', () => {
    assert.match(checkoutSuccessUrl(), /^https:\/\/become-beta\.redbtn\.io\//)
  })
})
