// The Plus trial — onboarding's one-time offer, never the paywall.
//
// ZERO imports on purpose, same discipline as lib/billing/mode.ts: this file
// is read by the CLIENT bundle (the post-onboarding trial offer, the Plan
// page) as well as the checkout route, so anything pulled in here ships to
// the browser too.
//
// WHY A SEPARATE FILE FROM lib/planCopy.ts: that file's prices and rows are
// re-exported from the PUBLISHED @become/core package, whose own header says
// "there is no trial implemented anywhere" — true until this shipped, and not
// a sentence this repo can edit without a version bump and a manual publish
// (AGENTS.md). The trial is a webapp-local decision layered on top of the
// same Stripe prices, not a change to what Plus costs.
//
// TWO WAYS IN, same length, same "once per account, ever" discipline:
//
//   1. NO CARD, NO STRIPE. `freeTrialOfferDue` / `hasStartedFreeTrial` /
//      `freeTrialActive` govern a grant this file never talks to Stripe
//      about — POST /api/billing/trial/start writes `subscription.
//      freeTrialStartedAt` and nothing else, and lib/subscription.ts#
//      deriveTier is what turns that timestamp into `tier: 'plus'` for
//      TRIAL_DAYS. George, 2026-10-19: a member who says no to the prompt
//      must still find this on the Plan page, so this predicate is
//      deliberately NOT gated on `checkoutAvailable` — no checkout session is
//      ever created to grant it.
//   2. A CARD, for TRIAL_DAYS billed through Stripe (`trial_period_days` on
//      the checkout session — see app/api/billing/checkout/route.ts). This is
//      the ORIGINAL mechanism this file shipped with, gated by
//      `trialOfferDue` / `isTrialEligible`, and it is also how a member who
//      already spent the no-card trial gets the extra TRIAL_DAYS the card
//      asks for: starting the no-card trial never touches `subscription.
//      status`, so `isTrialEligible` (and therefore `cardTrialAvailable`)
//      stays true right through it and right past its end.

export const TRIAL_DAYS = 7
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000

export interface TrialSubscriptionRef {
  status?: string | null
  /** When the no-card trial started. See models/User.ts#IUserSubscription. */
  freeTrialStartedAt?: string | Date | null
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
 *
 * Starting the NO-CARD trial never writes `status`, so this stays true right
 * through it — which is exactly what lets a member extend with a card either
 * during or after it.
 */
export function isTrialEligible(subscription: TrialSubscriptionRef | null | undefined): boolean {
  const status = subscription?.status
  return !status || status === 'none'
}

/** The slice of the entitlements snapshot the offer decisions need. Structural
 *  on purpose — @become/core's EntitlementsSnapshot satisfies it, and keeping
 *  this file import-free is what lets the checkout route and the client bundle
 *  share one copy of the rule. */
export interface TrialOfferSnapshot {
  tier?: string | null
  checkoutAvailable?: boolean | null
  subscription?: TrialSubscriptionRef | null
}

/**
 * Is there an honest CARD trial to offer this member right now?
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
 *     question here keeps the surface from promising free days that the
 *     route would then quietly decline to grant.
 */
export function trialOfferDue(snapshot: TrialOfferSnapshot | null | undefined): boolean {
  if (!snapshot) return false
  if (snapshot.checkoutAvailable !== true) return false
  if (snapshot.tier === 'plus') return false
  return isTrialEligible(snapshot.subscription)
}

// ─── The no-card trial ────────────────────────────────────────────────────────

/** Has the no-card trial EVER been granted on this account? Written once by
 *  POST /api/billing/trial/start and never cleared — the same discipline as
 *  `isTrialEligible` above, so a member cannot claim a second one by waiting
 *  it out. */
export function hasStartedFreeTrial(subscription: TrialSubscriptionRef | null | undefined): boolean {
  return Boolean(subscription?.freeTrialStartedAt)
}

/** When the no-card trial window closes. Null when it was never started, or
 *  when the stored timestamp is unreadable — never a date, so a caller cannot
 *  mistake a bad value for "still running forever". */
export function freeTrialEndsAt(subscription: TrialSubscriptionRef | null | undefined): Date | null {
  const startedAt = subscription?.freeTrialStartedAt
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  if (!Number.isFinite(start)) return null
  return new Date(start + TRIAL_MS)
}

/**
 * Is the no-card trial window open RIGHT NOW? PURE function of the stored
 * timestamp and the clock — the one place lib/subscription.ts#deriveTier and
 * every reader of "is the free trial active" computes this, so a read and a
 * write can never disagree about when the days are up.
 */
export function freeTrialActive(
  subscription: TrialSubscriptionRef | null | undefined,
  now: Date | number = new Date(),
): boolean {
  const end = freeTrialEndsAt(subscription)
  if (!end) return false
  const nowMs = typeof now === 'number' ? now : now.getTime()
  return nowMs < end.getTime()
}

/** Whole days left in an active window, for copy like "3 days left". Zero
 *  once the window has closed or was never opened — never negative. */
export function freeTrialDaysRemaining(
  subscription: TrialSubscriptionRef | null | undefined,
  now: Date | number = new Date(),
): number {
  const end = freeTrialEndsAt(subscription)
  if (!end) return 0
  const nowMs = typeof now === 'number' ? now : now.getTime()
  const msLeft = end.getTime() - nowMs
  return msLeft > 0 ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : 0
}

/**
 * Is the no-card trial reachable right now — the Plan page's own offer gate,
 * and the second thing (besides `trialOfferDue`) the onboarding modal checks
 * before it bails.
 *
 * UNLIKE `trialOfferDue` this does NOT require `checkoutAvailable`: no Stripe
 * session is ever created to grant it, so an install with no billing block
 * configured can still hand it out — George, 2026-10-19, "no Stripe / no card
 * required". What it shares with `trialOfferDue` is "once per account, ever"
 * (`isTrialEligible`) and "not already Plus", plus its own memory
 * (`hasStartedFreeTrial`) so declining the prompt leaves it standing rather
 * than spending it — the bug the card opens with.
 */
export function freeTrialOfferDue(snapshot: TrialOfferSnapshot | null | undefined): boolean {
  if (!snapshot) return false
  if (snapshot.tier === 'plus') return false
  if (hasStartedFreeTrial(snapshot.subscription)) return false
  return isTrialEligible(snapshot.subscription)
}

/**
 * Can this account still add a card for the TRIAL_DAYS Stripe trial, whether
 * or not the no-card trial ever ran? Mirrors exactly what the checkout
 * route's own `applyTrial` rule will grant (`wantsTrial && isTrialEligible`),
 * repeated here only so a surface can decide whether to draw the CTA at all —
 * the route remains the one place that actually grants it.
 *
 * Deliberately NOT gated on `tier`: the whole point of this one is to reach a
 * member who is on Plus FOR FREE right now (the no-card trial) and offer them
 * the paid continuation, so excluding `tier === 'plus'` would hide the CTA
 * from the one person it exists for.
 */
export function cardTrialAvailable(snapshot: TrialOfferSnapshot | null | undefined): boolean {
  if (!snapshot) return false
  if (snapshot.checkoutAvailable !== true) return false
  return isTrialEligible(snapshot.subscription)
}
