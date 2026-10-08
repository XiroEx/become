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
