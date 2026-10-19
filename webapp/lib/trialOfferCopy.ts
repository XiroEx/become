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

// ─── The no-card trial — George, 2026-10-19 ─────────────────────────────────
//
// Separate copy from the card-trial block above on purpose: that block is the
// agreement a member ticks before Stripe ever sees them, and nothing here is
// quoted BY it — this is the no-Stripe grant, and its own up-front mention of
// the card option, per the card: "Mention this up front in the prompt so they
// know they have the option to put the card down immediately and get 7 more
// days instantly."

export const FREE_TRIAL_HEADING = `Try Plus free for ${TRIAL_DAYS} days — no card needed`

/** The up-front mention. Read before the no-card button, so nobody presses it
 *  without knowing the faster path exists too. */
export const FREE_TRIAL_SUBHEADING =
  `Nothing to type in — this starts right away. Prefer to put a card down now instead, ` +
  `for monthly or yearly? You get the same ${TRIAL_DAYS} days instantly, and either way, ` +
  `once your free days are up you can add a card any time for ${TRIAL_DAYS} more.`

export const FREE_TRIAL_CTA_LABEL = `Start my ${TRIAL_DAYS} free days — no card`

/** The card-trial CTA, wherever it stands in for "add a card instead" rather
 *  than the agreement button above (e.g. the Plan page, or next to this
 *  offer). Same mechanism as TRIAL_CTA_LABEL, different moment. */
export const ADD_CARD_INSTEAD_LABEL = `Add a card instead — get ${TRIAL_DAYS} days now`

/** While the no-card trial is running. */
export function freeTrialDaysLeftLabel(daysRemaining: number): string {
  return `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in your free trial`
}

/** Once it has run out and no card was ever added. */
export const FREE_TRIAL_ENDED_HEADING = 'Your free trial has ended'

/** The card-trial CTA once it is an EXTENSION rather than the first offer —
 *  shown while the no-card trial is active or after it ends, never before. */
export const ADD_CARD_EXTEND_LABEL = `Add a card — get ${TRIAL_DAYS} more days`
