// Stripe Tax on Checkout: calculate the sales tax that is ALREADY inside the
// flat price, and collect the billing address it has to be calculated from.
//
// George, 2026-09-13: **sales tax is INCLUDED in the flat price**, and the
// Terms say so (`RENEWAL_TERMS`, Terms §7 — "the price you see is the price you
// pay"). Both Plus prices are configured `tax_behavior: inclusive` on Become
// LLC's account (2026-09-18), so switching this on CANNOT change what a member
// is charged: $14.99 stays $14.99, $119.99 stays $119.99, and Stripe splits the
// tax portion OUT of that total on the invoice and the receipt. What changes is
// that the portion is computed, shown and reportable instead of silently
// absorbed — and the tax is owed from the first sale whether or not it was ever
// collected, which is why this does not wait for volume.
//
// THREE params, and they only work together:
//   • `automatic_tax.enabled`      — Stripe calculates the tax.
//   • `billing_address_collection` — Stripe needs a buyer location to calculate
//     FROM. This is the "checkout starts collecting the billing address" half
//     of the card; it is stated here rather than left implicit so nobody has to
//     guess whether automatic tax happens to imply it.
//   • `customer_update.address`    — the session always carries an EXISTING
//     `customer` (lib/billing/customer.ts), and Stripe refuses automatic tax on
//     an existing customer unless it is allowed to write the address collected
//     at checkout back onto that customer. Without it the session create 400s,
//     which reads as "checkout is broken" and is really "one missing param".
//
// THE CATCH, and it is the same shape as lib/billing/consentCollection.ts:
// automatic tax depends on DASHBOARD state this code cannot see — Stripe Tax
// active, a head-office/origin address, a default tax code, and a REGISTRATION
// for the jurisdiction before anything is actually collected. Registrations are
// per MODE: the live account's New York registration does nothing for the
// test-mode account the beta channel checks out against, so the switch can be
// correct on production and still 400 every beta rehearsal.
//
// So the refusal is survived rather than served to the member: drop
// `automatic_tax` (and the `customer_update` that exists only to feed it),
// retry ONCE under its own idempotency key, and log exactly which dashboard
// step is missing. The member pays the same either way — the price is
// tax-inclusive — so a degraded session costs the tax REPORT, never the sale,
// and a sale is what the tax is owed on. Address collection is kept in the
// fallback: it is valid with no tax at all.

// Typed off the billing boundary's own params type (lib/billing/consentCollection.ts),
// not the SDK: the SDK is imported from lib/billing/stripeClient.ts and nowhere
// else (tests/unit/billing/billingSecretHygiene.test.ts).
import type { CheckoutSessionParams } from './consentCollection'
import type { StripeMode } from './mode'

/** Calculate tax on every session. Inclusive prices make this a no-op on the total. */
export const CHECKOUT_AUTOMATIC_TAX: NonNullable<CheckoutSessionParams['automatic_tax']> = {
  enabled: true,
}

/**
 * 'required', not 'auto': a tax calculation with no address is a calculation
 * against the origin address, which is Westbury NY for a buyer in Texas.
 */
export const CHECKOUT_BILLING_ADDRESS_COLLECTION: NonNullable<
  CheckoutSessionParams['billing_address_collection']
> = 'required'

/**
 * Write what the buyer typed back onto the Stripe customer. Required by Stripe
 * for automatic tax on a session that names an existing customer, and right on
 * its own: every later renewal invoice is then taxed from a stored address
 * instead of re-deriving one.
 */
export const CHECKOUT_CUSTOMER_UPDATE: NonNullable<CheckoutSessionParams['customer_update']> = {
  address: 'auto',
  name: 'auto',
}

/**
 * Is this Stripe refusal about TAX SETUP — something only the dashboard can
 * fix — rather than about this buyer, this price or this request?
 *
 * Narrow on purpose. `StripeInvalidRequestError` is also how "No such price"
 * and a malformed param arrive, and retrying those without tax would hide a
 * real bug behind a checkout that half works. Matched on the param Stripe
 * names, the documented location code, or a message about Stripe Tax itself.
 */
export function isTaxNotConfiguredError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { type?: unknown; code?: unknown; param?: unknown; message?: unknown }
  if (e.type !== 'StripeInvalidRequestError') return false

  const param = typeof e.param === 'string' ? e.param : ''
  if (param.startsWith('automatic_tax') || param.startsWith('customer_update')) return true

  const code = typeof e.code === 'string' ? e.code : ''
  // The one documented code here: Stripe cannot place the customer well enough
  // to tax them. It is a configuration/address problem, never a card problem.
  if (code === 'customer_tax_location_invalid') return true

  const message = typeof e.message === 'string' ? e.message : ''
  return /stripe tax|automatic tax|tax (?:settings|registration|location|code)|origin address/i.test(
    message,
  )
}

/** What to do about it, naming the dashboard step and the ACCOUNT MODE it is missing on. */
export function taxNotConfiguredLog(mode: StripeMode): string {
  const where =
    mode === 'live'
      ? 'the LIVE account (Stripe Dashboard → Tax → Registrations: New York must be registered, and Tax → Settings must carry the Westbury NY origin address and the default tax code)'
      : 'the TEST-mode account (Stripe Dashboard in test mode → Tax: test mode keeps its OWN settings and registrations, so the live New York registration does not apply to it — this is what breaks a beta rehearsal)'
  return `[billing] Stripe refused automatic_tax: Stripe Tax is not set up on ${where}. Retried this checkout WITHOUT tax calculation — the member still pays the same tax-INCLUSIVE price, but Stripe did not break the tax portion out of it, so that sale is unreported. Fix the dashboard to stop this.`
}

/**
 * The same session, minus the two params that only exist for tax. Pure; the
 * input is never mutated, and `billing_address_collection` deliberately
 * SURVIVES — collecting the address is valid with no tax calculation at all,
 * and a fallback that quietly stopped collecting it would make the degraded
 * path look like the old behaviour.
 */
export function withoutAutomaticTax(params: CheckoutSessionParams): CheckoutSessionParams {
  const { automatic_tax: _tax, customer_update: _update, ...rest } = params
  void _tax
  void _update
  return rest
}
