// The 10-day Plus trial — onboarding's one-time offer, never the paywall.
//
// ZERO imports on purpose, same discipline as lib/billing/mode.ts: this file
// is read by the CLIENT bundle (the post-onboarding trial offer) as well as
// the checkout route, so anything pulled in here ships to the app too.
//
// WHY A SEPARATE FILE FROM lib/planCopy.ts: that file's prices and rows are
// re-exported from the PUBLISHED @become/core package, whose own header says
// "there is no trial implemented anywhere" — true until this shipped, and not
// a sentence this repo can edit without a version bump and a manual publish
// (AGENTS.md). The trial is a webapp-local decision layered on top of the
// same Stripe prices, not a change to what Plus costs.

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
export function isTrialEligible(subscription: TrialSubscriptionRef | null | undefined): boolean {
  const status = subscription?.status;
  return !status || status === "none";
}

/** The slice of the entitlements snapshot the offer decision needs. Structural
 *  on purpose — @become/core's EntitlementsSnapshot satisfies it, and keeping
 *  this file import-free is what lets the checkout route and the client bundle
 *  share one copy of the rule. */
export interface TrialOfferSnapshot {
  tier?: string | null;
  checkoutAvailable?: boolean | null;
  subscription?: TrialSubscriptionRef | null;
}

/**
 * Is there an honest trial to offer this member right now?
 *
 * ONE definition, read by the modal's effect AND its render — those were two
 * hand-written copies of the same boolean, which is how a surface ends up
 * dismissing itself and rendering at the same time.
 *
 * DELIBERATELY NOT GATED ON `enforced`. This is the mistake the first cut of
 * this card shipped with, and the repo has already paid for it once: AGENTS.md,
 * "Manage billing" — "BILLING IS NOT A TIER SURFACE, so it does NOT bail on
 * `enforced === false`. The kill-switch governs whether TIER is enforced, not
 * whether money is real". `ENTITLEMENTS_ENFORCED` defaults to off and is off in
 * production (tests/unit/billing/manageBilling.test.tsx says so in as many
 * words), so an offer that bails on it is an offer that is on NO screen on a
 * real deploy — exactly what happened to the portal button when it sat behind
 * the plan page's kill-switch return. The card asks for a member to ACTIVATE
 * their membership; an activation CTA nobody can see activates nothing.
 *
 * What it IS gated on is whether there is a subscription to sell:
 *   • `checkoutAvailable` — a Stripe secret key AND a price. False on an
 *     install with no billing block configured, which is still today, so this
 *     stays a zero-change deploy until the prices exist. No button that cannot
 *     work: the same rule UpgradeSheet and the plan page follow.
 *   • not already Plus — grandfathered members and admins derive to `plus`, and
 *     charging them for access they already hold is the `already_plus` refusal
 *     the checkout route exists to make impossible.
 *   • `isTrialEligible` — the trial is once per account, ever, and the SERVER
 *     decides (`trialApplied` on the checkout response). Asking the same
 *     question here keeps the surface from promising 10 free days that the
 *     route would then quietly decline to grant.
 *
 * Fails CLOSED on a missing snapshot: a failed entitlements read must cost a
 * missed upsell, never a stuck onboarding flow.
 */
export function trialOfferDue(snapshot: TrialOfferSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  if (snapshot.checkoutAvailable !== true) return false;
  if (snapshot.tier === "plus") return false;
  return isTrialEligible(snapshot.subscription);
}
