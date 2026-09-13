// Stripe's own record of agreement, on top of ours.
//
// `consent_collection.terms_of_service: 'required'` makes Checkout show a
// "I agree to the terms" box the buyer must tick, and stores the acceptance on
// the session, where a chargeback dispute can cite it. It is belt-and-braces
// over `User.consent` (which the in-app gate guarantees before the plan page
// is reachable), and belt-and-braces is the point of chargeback evidence.
//
// THE CATCH: Stripe refuses the parameter unless a Terms of Service URL is
// saved in the Dashboard (Settings → Business → Public details). That is a
// dashboard step on Become LLC's account, which this code cannot see. A hard
// failure there would turn every checkout into a 502 until somebody noticed,
// and "checkout silently never works" is the failure mode this codebase has
// been bitten by more than once. So: try with, and if Stripe's refusal is
// specifically about the terms URL, retry ONCE without, logging loudly. The
// in-app record still stands; only Stripe's copy of it is lost.

// Typed off the billing boundary's own interface, not the SDK: the SDK is
// imported from lib/billing/stripeClient.ts and nowhere else
// (tests/unit/billing/billingSecretHygiene.test.ts).
import type { StripeLike } from './stripeClient'

export type CheckoutSessionParams = Parameters<StripeLike['checkout']['sessions']['create']>[0]

export const CHECKOUT_CONSENT_COLLECTION: NonNullable<CheckoutSessionParams['consent_collection']> = {
  terms_of_service: 'required',
}

/** The one refusal that means "dashboard not set up", and nothing else. */
export function isTermsUrlMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { type?: unknown; param?: unknown; message?: unknown }
  if (e.type !== 'StripeInvalidRequestError') return false
  const param = typeof e.param === 'string' ? e.param : ''
  const message = typeof e.message === 'string' ? e.message : ''
  return param.startsWith('consent_collection') || /terms of service url/i.test(message)
}

export const TERMS_URL_MISSING_LOG =
  '[billing] Stripe refused consent_collection: no Terms of Service URL is saved in the Stripe Dashboard (Settings → Business → Public details). Retrying this checkout WITHOUT Stripe-side consent; the in-app agreement (User.consent) is still recorded. Save the URL to stop this.'
