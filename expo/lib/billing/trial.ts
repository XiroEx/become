// The 10-day Plus trial — onboarding's one-time offer, never the paywall.
//
// ZERO imports on purpose: this file is read by the native bundle
// as well as tests, so keeping it clean of complex dependencies is safe.
//
// Native port of webapp/lib/billing/trial.ts (NP-129).

export const TRIAL_DAYS = 10;

export interface TrialSubscriptionRef {
  status?: string | null;
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
export function isTrialEligible(
  subscription: TrialSubscriptionRef | null | undefined,
): boolean {
  const status = subscription?.status;
  return !status || status === "none";
}

/** The slice of the entitlements snapshot the offer decision needs. */
export interface TrialOfferSnapshot {
  tier?: string | null;
  checkoutAvailable?: boolean | null;
  subscription?: TrialSubscriptionRef | null;
}

/**
 * Is there an honest trial to offer this member right now?
 *
 * DELIBERATELY NOT GATED ON `enforced`. This is the mistake the first cut of
 * this card shipped with: BILLING IS NOT A TIER SURFACE, so it does NOT bail on
 * `enforced === false`.
 *
 * What it IS gated on is whether there is a subscription to sell:
 *   • `checkoutAvailable` — a Stripe secret key AND a price. False on an
 *     install with no billing block configured.
 *   • not already Plus — grandfathered members and admins derive to `plus`.
 *   • `isTrialEligible` — the trial is once per account, ever, and the SERVER
 *     decides (`trialApplied` on the checkout response).
 *
 * Fails CLOSED on a missing snapshot: a failed entitlements read must cost a
 * missed upsell, never a stuck onboarding flow.
 */
export function trialOfferDue(
  snapshot: TrialOfferSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  if (snapshot.checkoutAvailable !== true) return false;
  if (snapshot.tier === "plus") return false;
  return isTrialEligible(snapshot.subscription);
}
