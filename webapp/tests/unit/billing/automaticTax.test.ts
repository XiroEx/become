// Run with: npm run test:file tests/unit/billing/automaticTax.test.ts
//
// Sales tax at checkout — the card: Stripe Tax is switched ON in the checkout
// route, which also starts collecting the billing address, and the tax comes
// OUT of the same flat $14.99 / $119.99 because the prices are tax-inclusive
// (George, 2026-09-13).
//
// Two halves, tested two ways:
//
//   1. lib/billing/automaticTax.ts is pure and is exercised directly — the
//      params, the refusal detector (which must NOT swallow "No such price"),
//      the log that names the missing dashboard step, and the stripper the
//      fallback uses.
//   2. The route's WIRING is asserted against its source, the idiom in
//      billingRoutes.test.ts and trialCheckout.test.ts: booting the real
//      handler needs a request, a database and a Stripe account, and what
//      actually breaks in practice is wiring.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CHECKOUT_AUTOMATIC_TAX,
  CHECKOUT_BILLING_ADDRESS_COLLECTION,
  CHECKOUT_CUSTOMER_UPDATE,
  isTaxNotConfiguredError,
  taxNotConfiguredLog,
  withoutAutomaticTax,
} from '../../../lib/billing/automaticTax'
import {
  CHECKOUT_CONSENT_COLLECTION,
  isTermsUrlMissingError,
  withoutConsentCollection,
  type CheckoutSessionParams,
} from '../../../lib/billing/consentCollection'
import { RENEWAL_TERMS } from '../../../lib/legal'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const CHECKOUT = 'app/api/billing/checkout/route.ts'

/** A session shaped like the one the route builds, for the pure helpers. */
function session(): CheckoutSessionParams {
  return {
    mode: 'subscription',
    customer: 'cus_123',
    line_items: [{ price: 'price_monthly', quantity: 1 }],
    client_reference_id: 'user_1',
    consent_collection: CHECKOUT_CONSENT_COLLECTION,
    automatic_tax: CHECKOUT_AUTOMATIC_TAX,
    billing_address_collection: CHECKOUT_BILLING_ADDRESS_COLLECTION,
    customer_update: CHECKOUT_CUSTOMER_UPDATE,
    success_url: 'https://become.redbtn.io/dashboard/plan',
    cancel_url: 'https://become.redbtn.io/dashboard/plan',
  }
}

// ─── the three params, and why all three ─────────────────────────────────────

test('automatic tax is enabled, not merely present', () => {
  assert.deepEqual(CHECKOUT_AUTOMATIC_TAX, { enabled: true })
})

test('the billing address is REQUIRED, because tax is calculated from it', () => {
  // 'auto' would let a buyer through with no address, and a tax calculation
  // with no buyer address is a calculation against the Westbury NY origin.
  assert.equal(CHECKOUT_BILLING_ADDRESS_COLLECTION, 'required')
})

test('the collected address is written back onto the existing customer', () => {
  // The session always names a customer (lib/billing/customer.ts), and Stripe
  // refuses automatic tax on an existing customer unless customer_update
  // allows it to use the address collected at checkout.
  assert.equal(CHECKOUT_CUSTOMER_UPDATE.address, 'auto')
})

test('the price the tax comes out of is stated as tax-INCLUSIVE, and nothing says plus tax', () => {
  // This is what makes the switch safe to flip on a live account: it changes
  // what Stripe REPORTS, never what the member is charged.
  const terms = RENEWAL_TERMS.join(' ')
  assert.match(terms, /sales tax is included/i)
  assert.doesNotMatch(terms, /plus tax/i)
  assert.match(terms, /\$14\.99/)
  assert.match(terms, /\$119\.99/)
})

// ─── the refusal detector ────────────────────────────────────────────────────

test('a refusal naming the tax params is a dashboard problem', () => {
  for (const param of ['automatic_tax', 'automatic_tax[enabled]', 'customer_update[address]']) {
    assert.equal(
      isTaxNotConfiguredError({ type: 'StripeInvalidRequestError', param }),
      true,
      `${param} must trigger the fallback`,
    )
  }
})

test('the documented "cannot place this customer" code counts too', () => {
  assert.equal(
    isTaxNotConfiguredError({
      type: 'StripeInvalidRequestError',
      code: 'customer_tax_location_invalid',
      message: 'We could not determine the customer’s tax location.',
    }),
    true,
  )
})

test('Stripe Tax not being set up is recognised from the message alone', () => {
  for (const message of [
    'You cannot use automatic tax until you set an origin address in the Dashboard.',
    'Stripe Tax has not been activated on this account.',
    'Your tax settings are incomplete.',
    'No tax registration exists for this jurisdiction.',
  ]) {
    assert.equal(
      isTaxNotConfiguredError({ type: 'StripeInvalidRequestError', message }),
      true,
      `not recognised: ${message}`,
    )
  }
})

test('only a configuration refusal triggers the fallback — never a buyer or a bug', () => {
  assert.equal(isTaxNotConfiguredError(null), false)
  assert.equal(isTaxNotConfiguredError(new Error('boom')), false)
  assert.equal(
    isTaxNotConfiguredError({ type: 'StripeCardError', param: 'automatic_tax[enabled]' }),
    false,
    'a card error is never a configuration problem',
  )
  assert.equal(
    isTaxNotConfiguredError({
      type: 'StripeInvalidRequestError',
      param: 'line_items[0][price]',
      message: 'No such price: price_x',
    }),
    false,
    'a real bug must not be retried into a half-working checkout',
  )
})

test('the two fallbacks do not steal each other’s refusal', () => {
  const termsRefusal = {
    type: 'StripeInvalidRequestError',
    param: 'consent_collection[terms_of_service]',
    message: 'You must set a Terms of Service URL in your Stripe Dashboard.',
  }
  const taxRefusal = {
    type: 'StripeInvalidRequestError',
    param: 'automatic_tax[enabled]',
    message: 'Stripe Tax is not configured.',
  }
  assert.equal(isTaxNotConfiguredError(termsRefusal), false)
  assert.equal(isTermsUrlMissingError(termsRefusal), true)
  assert.equal(isTermsUrlMissingError(taxRefusal), false)
  assert.equal(isTaxNotConfiguredError(taxRefusal), true)
})

// ─── the log that tells somebody what to do ──────────────────────────────────

test('the log names the mode, the dashboard step, and what the member was still charged', () => {
  const live = taxNotConfiguredLog('live')
  assert.match(live, /LIVE account/)
  assert.match(live, /New York/)
  assert.match(live, /Registrations/)

  const beta = taxNotConfiguredLog('test')
  assert.match(beta, /TEST-mode account/)
  // The whole reason a beta rehearsal can fail while production is correct.
  assert.match(beta, /own settings and registrations/i)

  for (const line of [live, beta]) {
    assert.match(line, /WITHOUT tax calculation/, 'it must say what it did')
    assert.match(line, /pays the same tax-INCLUSIVE price/, 'nobody was overcharged')
    assert.match(line, /unreported/, 'the consequence is a reporting gap, and it must be stated')
  }
})

// ─── the strippers the fallback uses ─────────────────────────────────────────

test('withoutAutomaticTax drops the tax params and KEEPS address collection', () => {
  const original = session()
  const stripped = withoutAutomaticTax(original)

  assert.equal('automatic_tax' in stripped, false)
  assert.equal('customer_update' in stripped, false)
  // Collecting the address is valid with no tax calculation at all, and a
  // fallback that stopped collecting it would be the old behaviour in disguise.
  assert.equal(stripped.billing_address_collection, 'required')
  assert.deepEqual(stripped.consent_collection, CHECKOUT_CONSENT_COLLECTION)
  assert.deepEqual(stripped.line_items, original.line_items)
  // Pure: the caller still holds the full params for its next attempt.
  assert.deepEqual(original, session(), 'the input was mutated')
})

test('the two strippers compose, in either order, to the same session', () => {
  // A dashboard missing BOTH the Terms URL and Stripe Tax refuses one param at
  // a time, so the route's last attempt drops both — and must not depend on
  // which refusal arrived first.
  const taxThenConsent = withoutConsentCollection(withoutAutomaticTax(session()))
  const consentThenTax = withoutAutomaticTax(withoutConsentCollection(session()))
  assert.deepEqual(taxThenConsent, consentThenTax)
  for (const key of ['automatic_tax', 'customer_update', 'consent_collection']) {
    assert.equal(key in taxThenConsent, false, `${key} survived`)
  }
  assert.equal(taxThenConsent.billing_address_collection, 'required')
  assert.equal(taxThenConsent.customer, 'cus_123')
})

// ─── the route's wiring ──────────────────────────────────────────────────────

test('checkout sends automatic tax, the billing address and customer_update — from the constants', () => {
  const src = read(CHECKOUT)
  assert.match(src, /automatic_tax:\s*CHECKOUT_AUTOMATIC_TAX/, 'no automatic_tax on the session')
  assert.match(
    src,
    /billing_address_collection:\s*CHECKOUT_BILLING_ADDRESS_COLLECTION/,
    'the switch must also start collecting the billing address',
  )
  assert.match(src, /customer_update:\s*CHECKOUT_CUSTOMER_UPDATE/)
  // One source for each: a literal here would drift from lib/billing/automaticTax.ts.
  assert.doesNotMatch(src, /automatic_tax:\s*\{/, 'inline literal instead of the shared constant')
  assert.doesNotMatch(src, /billing_address_collection:\s*['"]/, 'inline literal')
})

test('a tax-setup refusal is retried without tax, under its OWN idempotency key', () => {
  const src = read(CHECKOUT)
  assert.match(src, /isTaxNotConfiguredError\(err\)/, 'no fallback for the tax refusal')
  assert.match(src, /taxNotConfiguredLog\(cfg\.mode\)/, 'the refusal must be logged, with the mode')
  assert.match(src, /withoutAutomaticTax\(params\)/)
  // Stripe replays the ERROR for a reused key, so the retry needs a new one.
  assert.match(src, /idempotencyKey:\s*`\$\{idempotencyKey\}:notax`/, 'the retry reuses the key')
})

test('both dashboard steps can be missing at once, and checkout still completes', () => {
  // Exactly beta's situation the day this ships: test mode has its own Tax
  // settings. Stripe names one param per refusal, so the second one only
  // appears on the retry.
  const src = read(CHECKOUT)
  assert.match(src, /withoutAutomaticTax\(withoutConsentCollection\(params\)\)/)
  assert.match(src, /idempotencyKey:\s*`\$\{idempotencyKey\}:noconsent:notax`/)
})

test('an unrelated Stripe error is still thrown, and still answers 502', () => {
  const src = read(CHECKOUT)
  assert.match(src, /if \(!termsRefused && !taxRefused\) throw err/)
  assert.match(src, /if \(!alsoRefused\) throw retryErr/)
  assert.match(src, /checkout_failed/)
})
