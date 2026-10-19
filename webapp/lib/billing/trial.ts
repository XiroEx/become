// The Plus trial — two offers sharing one clock.
//
// ZERO imports on purpose, same discipline as lib/billing/mode.ts: this file
// is read by the CLIENT bundle (the onboarding prompt AND the plan page) as
// well as both trial routes, so anything pulled in here ships to the browser
// too.
//
// WHY A SEPARATE FILE FROM lib/planCopy.ts: that file's prices and rows are
// re-exported from the PUBLISHED @become/core package, whose own header says
// "there is no trial implemented anywhere" — true until this shipped, and not
// a sentence this repo can edit without a version bump and a manual publish
// (AGENTS.md). The trial is a webapp-local decision layered on top of the
// same Stripe prices, not a change to what Plus costs.
//
// THE CARD (George, 2026-10-19): a member is offered 7 days of Plus for free,
// no card and no Stripe involved at all. Declining costs them nothing — the
// offer stays reachable from the Plan page, forever, until they take it. And
// up front, before they decide, they are told the other half: putting a card
// down (any time, including immediately) starts a SECOND clock — the
// original card-backed Stripe trial below — worth another 7 days instantly.
// Both halves share one length on purpose: TRIAL_DAYS is "how long a week of
// Plus lasts", asked twice.
//
//   • freeTrialOfferDue / hasStartedFreeTrial / freeTrialActive /
//     freeTrialEndsAt / freeTrialDaysRemaining — the NO-CARD half. Granted by
//     POST /api/billing/trial/start, which stamps `subscription.freeTrialStartedAt`
//     and writes `tier: 'plus'` directly (a WRITER, same standing as the
//     billing webhook and scripts/migrate-tiers.mjs — see lib/entitlements.ts).
//     Read back by lib/subscription.ts#deriveTier's third clock branch, and
//     expired by lib/billing/tierResweep.ts the same way a missed webhook is.
//   • isTrialEligible / trialOfferDue — UNCHANGED, the original CARD-backed
//     half: a real Stripe subscription with `trial_period_days` on it,
//     started from the onboarding offer or (per this card) from the plan
//     page's "put a card down" CTA. `cardTrialAvailable` below is the same
//     question asked from a SECOND place that `trialOfferDue` was never meant
//     to answer: during an ACTIVE no-card trial, `tier` already reads 'plus'
//     for a reason that is not a subscription, and `trialOfferDue` bails the
//     moment tier is 'plus' — correct for a grandfathered member, wrong for a
//     member mid-free-trial who should still be one tap from a card.

export const TRIAL_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export interface TrialSubscriptionRef {
  status?: string | null
}

/** The slice of stored subscription state the no-card trial reads. Structural
 *  on purpose, same reasoning as TrialOfferSnapshot below — IUserSubscription
 *  satisfies it without either file importing the other. */
export interface FreeTrialSubscriptionRef extends TrialSubscriptionRef {
  freeTrialStartedAt?: Date | string | null
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
 * The no-card free trial does NOT move `status` away from 'none' — only a
 * real Stripe event does that — so a member who starts the free week and
 * never puts a card down stays eligible for the card-backed trial too.
 */
export function isTrialEligible(subscription: TrialSubscriptionRef | null | undefined): boolean {
  const status = subscription?.status
  return !status || status === 'none'
}

/** The slice of the entitlements snapshot the offer decisions need.
 *  Structural on purpose — @become/core's EntitlementsSnapshot satisfies it,
 *  and keeping this file import-free is what lets both trial routes and the
 *  client bundle share one copy of each rule. */
export interface TrialOfferSnapshot {
  tier?: string | null
  checkoutAvailable?: boolean | null
  subscription?: FreeTrialSubscriptionRef | null
}

/**
 * Is there an honest CARD-BACKED trial to offer this member right now?
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
 *     question here keeps the surface from promising 7 free days that the
 *     route would then quietly decline to grant.
 *
 * Fails CLOSED on a missing snapshot: a failed entitlements read must cost a
 * missed upsell, never a stuck onboarding flow.
 *
 * ONBOARDING-ONLY, by product intent: this bails the moment `tier === 'plus'`,
 * which is right the one time this fires (right after the profile save, no
 * free trial could possibly have started yet) and would be WRONG anywhere a
 * member can already be mid-free-trial. `cardTrialAvailable` below is the
 * predicate every OTHER surface (the plan page) reads instead.
 */
export function trialOfferDue(snapshot: TrialOfferSnapshot | null | undefined): boolean {
  if (!snapshot) return false
  if (snapshot.checkoutAvailable !== true) return false
  if (snapshot.tier === 'plus') return false
  return isTrialEligible(snapshot.subscription)
}

// ─── The no-card free trial ──────────────────────────────────────────────────

/** Has this account ever been granted the no-card free trial? Never cleared
 *  once set — same one-shot discipline as `subscription.status` for Stripe. */
export function hasStartedFreeTrial(
  subscription: FreeTrialSubscriptionRef | null | undefined,
): boolean {
  return Boolean(subscription?.freeTrialStartedAt)
}

/** When the no-card trial's week runs out, or null if it was never started. */
export function freeTrialEndsAt(
  subscription: FreeTrialSubscriptionRef | null | undefined,
): Date | null {
  const startedAt = subscription?.freeTrialStartedAt
  if (!startedAt) return null
  const started = new Date(startedAt).getTime()
  if (!Number.isFinite(started)) return null
  return new Date(started + TRIAL_DAYS * DAY_MS)
}

/**
 * Is the no-card trial still carrying this account RIGHT NOW?
 *
 * Gated on `status` being 'none' (or absent) on purpose: the moment a card
 * lands and Stripe's own trial takes over (`status: 'trialing'`), THAT clock
 * governs tier — see lib/subscription.ts#deriveTier's 'trialing' branch — and
 * this one steps aside rather than racing it. A real subscription of any
 * other status (active, canceled, past_due, …) means the free week is moot
 * either way: the account has moved on from "never subscribed".
 */
export function freeTrialActive(
  subscription: FreeTrialSubscriptionRef | null | undefined,
  now: Date = new Date(),
): boolean {
  if (subscription?.status && subscription.status !== 'none') return false
  const endsAt = freeTrialEndsAt(subscription)
  if (!endsAt) return false
  return now.getTime() < endsAt.getTime()
}

/** Whole days left in the no-card trial, rounded UP so "started an hour ago"
 *  reads as the full week rather than zero. Floored at 0 once it has ended or
 *  was never started — this is a display number, never a gate on its own. */
export function freeTrialDaysRemaining(
  subscription: FreeTrialSubscriptionRef | null | undefined,
  now: Date = new Date(),
): number {
  const endsAt = freeTrialEndsAt(subscription)
  if (!endsAt) return 0
  const msLeft = endsAt.getTime() - now.getTime()
  return msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : 0
}

/**
 * Is the no-card trial still available to OFFER?
 *
 * Never started, and the account is not already holding Plus some other way
 * (grandfathered, admin, or a real subscription already in motion) — all of
 * those derive `tier: 'plus'` with `hasStartedFreeTrial` still false, which is
 * exactly the state with nothing honest left to offer. Once the free week has
 * been granted, this returns false whether it is still running or has already
 * expired: it answers "may this be STARTED", not "is it active" — see
 * `freeTrialActive` for that.
 *
 * Deliberately NOT gated on `checkoutAvailable`: the whole point of this half
 * of the card is that no Stripe configuration is required to grant it. Fails
 * CLOSED on a missing snapshot, same as `trialOfferDue`.
 */
export function freeTrialOfferDue(snapshot: TrialOfferSnapshot | null | undefined): boolean {
  if (!snapshot) return false
  if (snapshot.tier === 'plus') return false
  return !hasStartedFreeTrial(snapshot.subscription)
}

/**
 * Is the CARD trial — the original Stripe `trial_period_days` path, the
 * "+7 days instantly" the free trial's own copy promises up front — available
 * right now?
 *
 * Available whenever the account has never held a real subscription
 * (`isTrialEligible`) AND there is something to sell (`checkoutAvailable`),
 * INCLUDING during an active no-card trial — where `tier` already reads
 * 'plus' for a reason that is not a subscription. That is the one case
 * `trialOfferDue` was never asked to handle, because it only ever ran once,
 * before onboarding could have granted anything. The difference between "plus
 * because of a real grant" and "plus because of the free trial" is
 * `hasStartedFreeTrial`.
 */
export function cardTrialAvailable(snapshot: TrialOfferSnapshot | null | undefined): boolean {
  if (!snapshot) return false
  if (snapshot.checkoutAvailable !== true) return false
  if (!isTrialEligible(snapshot.subscription)) return false
  // Already Plus for a reason that is NOT the free trial (grandfathered,
  // admin, or — impossibly, since isTrialEligible would already be false —
  // a real sub): nothing honest to offer.
  if (snapshot.tier === 'plus' && !hasStartedFreeTrial(snapshot.subscription)) return false
  return true
}
