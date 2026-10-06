// The words the billing surfaces use, in one place — and NOT in `lib/legal`.
//
// `lib/legal` re-exports the PUBLISHED `@become/core`, which the webapp cannot
// add an export to without a manual publish (AGENTS.md: "publishing a new
// @become/core version is a manual step"), so copy that belongs only to the app
// lives here. Nothing in this file is quoted by the Terms, the Privacy Policy
// or the support page; the one string those documents do share with the app —
// the NAME of the button — stays in `lib/legal` as MANAGE_BILLING_LABEL and is
// imported from there by ManageBillingButton. Two different rules, deliberately
// kept apart:
//
//   • `lib/legal`  — anything a document also says. Changing it changes what a
//                    member agreed to.
//   • this file    — section furniture and the explanation of an ABSENCE,
//                    which no document makes a promise about.

/** The heading over the billing controls, on the Plan page and in Settings.
 *  Not the control's name — that is MANAGE_BILLING_LABEL — just the section's,
 *  so a member scanning either screen for "billing" finds the same word. */
export const BILLING_HEADING = 'Billing'

/**
 * What stands where the button would be for a member Stripe is not billing.
 *
 * True for every one of them: a free member, a member who opened checkout once
 * and never finished (`status: 'none'` — a customer is not a subscription), an
 * admin, and a member holding a complimentary Plus grant. None of them has a
 * payment method on file, so none of them has anything the Stripe portal could
 * show or cancel.
 *
 * It must NEVER contain MANAGE_BILLING_LABEL. The Terms, the support page and
 * the renewal line all tell a member to go and choose a control with that name;
 * printing the name on a screen where it does nothing points them at a dead
 * end. `tests/unit/billing/manageBilling.test.tsx` asserts that.
 *
 * It must also name no tier, no cap and no price, so the same sentence is safe
 * on `UnenforcedPlan` — the neutral card the plan page draws while
 * ENTITLEMENTS_ENFORCED is off.
 */
export const NO_BILLING_TO_MANAGE_NOTE =
  'There is no payment method on this account, so there is nothing to manage here and nothing to cancel.'
