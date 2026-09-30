// Run with: npm run test:file tests/unit/billing/billingReturnOrigin.test.ts
//
// Two bugs live in this one function, pulling in opposite directions.
//
// IGNORE the request and the buyer gets logged out. The app answers on both
// become.redbtn.io and becomeurbest.com — one deployment, two RedRun
// customDomains — but `NEXT_PUBLIC_APP_URL` names only one of them, and a
// session does NOT cross hosts: localStorage and the `auth_token` cookie are
// both per-origin. Somebody who signed up on becomeurbest.com paid, was
// returned to become.redbtn.io, had no session there, and middleware.ts sent
// them to /login seconds after their card was charged.
//
// TRUST the request and it is an open redirect. `Origin`, `Referer`, `Host` and
// `X-Forwarded-Host` are all attacker-supplied, and these strings are handed to
// Stripe as redirect targets — so a reflected one is a redirect performed by
// Stripe, from a checkout page the member has every reason to trust.
//
// The answer is an allow-list, and the tests that matter are the ones proving
// an unknown host FALLS BACK rather than being echoed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BILLING_RETURN_PATH,
  KNOWN_RETURN_ORIGINS,
  appBaseUrl,
  checkoutCancelUrl,
  checkoutSuccessUrl,
  normalizeOrigin,
  portalReturnUrl,
  resolveReturnOrigin,
} from '../../../lib/billing/urls'

const PROD = 'https://become.redbtn.io'
const PUBLIC = 'https://becomeurbest.com'

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

/** Every URL builder, so a rule can be asserted against all three at once. */
const allUrls = (h?: Headers) => [checkoutSuccessUrl(h), checkoutCancelUrl(h), portalReturnUrl(h)]

// ─── the fix ─────────────────────────────────────────────────────────────────

test('a buyer on the public launch domain is returned to the domain they are signed in on', () => {
  withAppUrl(PROD, () => {
    const h = headers({ origin: PUBLIC })
    assert.equal(resolveReturnOrigin(h), PUBLIC)
    for (const url of allUrls(h)) {
      assert.ok(url.startsWith(`${PUBLIC}${BILLING_RETURN_PATH}`), url)
      // The whole bug: this must NOT be the configured base.
      assert.doesNotMatch(url, /become\.redbtn\.io/)
    }
  })
})

test('the configured base is still used when the request came from it', () => {
  withAppUrl(PROD, () => {
    const h = headers({ origin: PROD })
    assert.equal(resolveReturnOrigin(h), PROD)
  })
})

test('the return path is the plan page — the only screen that shows a member their plan', () => {
  // It used to be /dashboard/settings, which has no billing UI at all: a buyer
  // was returned to a page that said nothing about what they had just bought.
  assert.equal(BILLING_RETURN_PATH, '/dashboard/plan')
})

// ─── the allow-list ──────────────────────────────────────────────────────────

test('AN UNKNOWN HOST FALLS BACK AND IS NEVER REFLECTED', () => {
  withAppUrl(PROD, () => {
    const h = headers({ origin: 'https://attacker.example' })
    assert.equal(resolveReturnOrigin(h), PROD)
    for (const url of allUrls(h)) {
      assert.doesNotMatch(url, /attacker/, 'an unvalidated origin in a redirect is the bug')
      assert.ok(url.startsWith(PROD))
    }
  })
})

test('a lookalike host does not pass by resembling an allowed one', () => {
  withAppUrl(PROD, () => {
    for (const hostile of [
      // Suffix: string matching would admit this one.
      'https://become.redbtn.io.attacker.example',
      // Prefix.
      'https://become.redbtn.io.evil',
      // Substring in a path, not the origin.
      'https://attacker.example/https://become.redbtn.io',
      // Userinfo: WHATWG reads the backslash as a slash, so the HOST is
      // attacker.example and the rest is a path.
      'https://attacker.example\\@become.redbtn.io',
      'https://become.redbtn.io@attacker.example',
      // A different scheme on an allowed host is still a different origin.
      'http://becomeurbest.com',
      // Not a redirect target at all.
      'javascript:alert(1)',
      'data:text/html,x',
      'not a url',
      '',
    ]) {
      assert.equal(
        resolveReturnOrigin(headers({ origin: hostile })),
        PROD,
        `must fall back for ${hostile}`,
      )
    }
  })
})

test('a port or a trailing slash does not smuggle an origin past the list', () => {
  withAppUrl(PROD, () => {
    assert.equal(resolveReturnOrigin(headers({ origin: 'https://becomeurbest.com:8443' })), PROD)
    // A trailing slash is not part of an origin, so this one IS allowed.
    assert.equal(resolveReturnOrigin(headers({ origin: 'https://becomeurbest.com/' })), PUBLIC)
  })
})

test('every entry on the list is a well-formed https origin', () => {
  for (const entry of KNOWN_RETURN_ORIGINS) {
    const normalized = normalizeOrigin(entry)
    assert.equal(normalized, entry, `${entry} must already be canonical`)
    assert.ok(entry.startsWith('https://'), entry)
  }
})

// ─── header precedence ───────────────────────────────────────────────────────

test('the forwarded host is used when the browser sent no Origin', () => {
  withAppUrl(PROD, () => {
    const h = headers({ 'x-forwarded-host': 'becomeurbest.com', 'x-forwarded-proto': 'https' })
    assert.equal(resolveReturnOrigin(h), PUBLIC)
  })
})

test('only the FIRST hop of a proxy chain is read', () => {
  withAppUrl(PROD, () => {
    const h = headers({
      'x-forwarded-host': 'becomeurbest.com, attacker.example',
      'x-forwarded-proto': 'https, http',
    })
    assert.equal(resolveReturnOrigin(h), PUBLIC)
  })
})

test('Referer is consulted after Origin, and Host after both', () => {
  withAppUrl(PROD, () => {
    assert.equal(
      resolveReturnOrigin(headers({ referer: `${PUBLIC}/dashboard/plan` })),
      PUBLIC,
      'a referer carries a path; only its origin is taken',
    )
    assert.equal(resolveReturnOrigin(headers({ host: 'becomeurbest.com' })), PUBLIC)
    // Origin wins when both are present and disagree.
    assert.equal(
      resolveReturnOrigin(headers({ origin: PROD, host: 'becomeurbest.com' })),
      PROD,
    )
  })
})

// ─── nothing regressed ───────────────────────────────────────────────────────

test('no headers at all behaves exactly as before: the configured base', () => {
  withAppUrl('https://become-beta.redbtn.io', () => {
    assert.equal(resolveReturnOrigin(), appBaseUrl())
    assert.equal(resolveReturnOrigin(null), 'https://become-beta.redbtn.io')
    for (const url of allUrls()) assert.ok(url.startsWith('https://become-beta.redbtn.io'))
  })
})

test('the configured base is trusted even when it is not on the list', () => {
  // The base IS the fallback, so listing it per channel would be busywork — and
  // a channel whose base is missing from the list must still return to itself.
  withAppUrl('https://become-preview.example', () => {
    const h = headers({ origin: 'https://become-preview.example' })
    assert.equal(resolveReturnOrigin(h), 'https://become-preview.example')
  })
})

test('the {CHECKOUT_SESSION_ID} token survives an origin-aware build', () => {
  withAppUrl(PROD, () => {
    const url = checkoutSuccessUrl(headers({ origin: PUBLIC }))
    assert.match(url, /\{CHECKOUT_SESSION_ID\}/)
    assert.doesNotMatch(url, /%7B|%7D/i)
    assert.ok(url.startsWith(`${PUBLIC}${BILLING_RETURN_PATH}?checkout=success`))
  })
})

test('a trailing slash on the configured base still never doubles the path', () => {
  withAppUrl('https://becomeurbest.com///', () => {
    for (const url of allUrls()) {
      assert.doesNotMatch(url, /com\/\/dashboard/)
      assert.ok(url.startsWith(`https://becomeurbest.com${BILLING_RETURN_PATH}`), url)
    }
  })
})
