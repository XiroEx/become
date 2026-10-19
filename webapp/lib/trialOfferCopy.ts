// Copy for the post-onboarding trial offer — section furniture and the
// agreement sentence, never a clause.
//
// Same split as lib/billingCopy.ts and for the same reason: `lib/legal`
// re-exports the PUBLISHED @become/core, which this repo cannot add an export
// to without a manual publish (AGENTS.md), and the Terms do not describe a
// trial today. Nothing in this file is quoted BY the Terms — it is the
// in-app explanation a member reads and ticks before Stripe ever sees them,
// built from the two numbers that already exist elsewhere
// (TRIAL_DAYS, LEGAL_REFUND_WINDOW_DAYS) rather than typed out twice.

import { TRIAL_DAYS } from '@/lib/billing/trial'
import { LEGAL_REFUND_WINDOW_DAYS } from '@/lib/legal'

export const TRIAL_OFFER_HEADING = `Try Plus free for ${TRIAL_DAYS} days`

export const TRIAL_OFFER_SUBHEADING =
  'Start your trial now, or keep using Become for free — your choice either way.'

/**
 * What pressing the paid button actually starts. Named explicitly so nobody
 * reads "free trial" and skips the sentence that follows it.
 */
export const TRIAL_OFFER_DETAIL =
  `Your card is charged nothing today. After ${TRIAL_DAYS} days, unless you cancel first, ` +
  'we charge the plan you picked below and it renews automatically until you cancel ' +
  '— cancelling any time is Manage billing, one tap away, never an email.'

/** The checkbox a member must tick before the trial button is enabled. */
export const TRIAL_AGREEMENT_TEXT =
  `I agree to the Terms of Service and Privacy Policy, and I understand this starts a ` +
  `${TRIAL_DAYS}-day free trial of Plus. If I don't cancel before it ends, I'll be charged ` +
  `for the plan I picked, and it will renew automatically until I cancel. I've read the ` +
  `refund policy: my first payment is refundable in full if I ask within ` +
  `${LEGAL_REFUND_WINDOW_DAYS} days of being charged.`

export const TRIAL_CTA_LABEL = `Start my ${TRIAL_DAYS}-day free trial`
export const CONTINUE_FREE_LABEL = 'Continue free'

/** Anchor into the published Terms' cancelling/refund section — the same one
 *  the support page links (lib/legal's RENEWAL_TERMS neighbourhood). */
export const TERMS_REFUND_HREF = '/terms#cancelling'

// ─── The no-card free trial (George, 2026-10-19) ─────────────────────────────
//
// A SECOND, separate offer from the card-backed trial above — no Stripe, no
// card, granted the moment a member presses the button. Shown ABOVE the card
// trial in the onboarding modal, and (per the card: declining must not make
// it disappear) reachable again any time from the Plan page.

export const FREE_TRIAL_HEADING = `${TRIAL_DAYS} days of Plus, free — no card needed`

export const FREE_TRIAL_SUBHEADING =
  `Everything Plus unlocks, free for ${TRIAL_DAYS} days. No Stripe, no card, nothing to ` +
  'cancel — it just ends on its own unless you decide to keep it.'

/**
 * THE UP-FRONT MENTION the card asks for: before anyone decides, they are
 * told the card-backed option exists and that it pays off immediately, not
 * only after the free week runs out.
 */
export const FREE_TRIAL_CARD_UPSELL =
  `Prefer not to wait? Put a card down now for monthly or yearly billing and we start ` +
  `${TRIAL_DAYS} more days immediately — nothing is charged until that trial ends too.`

export const FREE_TRIAL_CTA_LABEL = `Start my free ${TRIAL_DAYS} days`

/** Declining costs nothing — see the gate, freeTrialOfferDue: it stays true
 *  until the member actually starts the trial, from here or from the Plan
 *  page. "Not now" rather than "No thanks", because there is no other answer
 *  that is still true the second time this is shown. */
export const FREE_TRIAL_DECLINE_LABEL = 'Not now'

/** The one line a member mid-free-trial sees. Not a warning — the trial ends
 *  on its own either way; this is just the clock. */
export function freeTrialRemainingLine(daysRemaining: number): string {
  const days = daysRemaining === 1 ? '1 day' : `${daysRemaining} days`
  return `${days} left in your free trial.`
}

/** The CTA for putting a card down FROM MID-TRIAL (or after it has lapsed) —
 *  distinct wording from TRIAL_CTA_LABEL above, which is the onboarding-only
 *  card trial's own button, because by the time this one is on screen the
 *  member has already had a free week and this is explicitly the "more days"
 *  ask, not the first offer. */
export const CARD_TRIAL_CTA_LABEL = `Add a card for ${TRIAL_DAYS} more days`
