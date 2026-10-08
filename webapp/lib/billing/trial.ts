// The 10-day Plus trial — onboarding's one-time offer, never the paywall.
//
// ZERO imports on purpose, same discipline as lib/billing/mode.ts: this file
// is read by the CLIENT bundle (the post-onboarding trial offer) as well as
// the checkout route, so anything pulled in here ships to the browser too.
//
// WHY A SEPARATE FILE FROM lib/planCopy.ts: that file's prices and rows are
// re-exported from the PUBLISHED @become/core package, whose own header says
// "there is no trial implemented anywhere" — true until this shipped, and not
// a sentence this repo can edit without a version bump and a manual publish
// (AGENTS.md). The trial is a webapp-local decision layered on top of the
// same Stripe prices, not a change to what Plus costs.

export const TRIAL_DAYS = 10

export interface TrialSubscriptionRef {
  status?: string | null
}

/**
 * Has this account EVER held a Stripe subscription, in any mode, in any
 * status?
 *
 * Stripe does not refuse a second `trial_period_days` on its own — nothing
 * stops a cancel-and-rejoin from minting a free month every time unless the
 * app itself remembers. `subscription.status` is the cheapest durable memory
 * already on the document: it starts 'none' (or the whole subdocument is
 * absent) for every account and moves to a real status the moment a checkout
 * resolves, and NOTHING ever moves it back to 'none' — a cancellation lands as
 * 'canceled', not a reset. So "never subscribed" is exactly the accounts this
 * returns true for, regardless of which Stripe mode (test/live) wrote the
 * status, which is deliberately conservative: a member who ran a test-mode
 * trial on beta must not get a second one in live.
 */
export function isTrialEligible(subscription: TrialSubscriptionRef | null | undefined): boolean {
  const status = subscription?.status
  return !status || status === 'none'
}
