// The legal surface: /terms, /privacy and /support.
//
// WHY THE PROSE LIVES IN A .ts FILE AND NOT IN JSX
// Three reasons, and all three have bitten a legal page somewhere before:
//   1. Facts must not drift. The price a member reads in the Terms is the same
//      constant checkout charges against (PLAN_PRICING), not a number somebody
//      retyped. The renewal sentences the plan page shows next to its button
//      are the same sentences the Terms commit to, because they are one array.
//   2. Every unresolved item is a DATA node (`kind: 'todo'`), so the whole set
//      can be enumerated by a test and by a reviewer, rather than found by
//      reading three long pages.
//   3. Plain strings need no JSX entity escaping, so an apostrophe in a
//      sentence cannot quietly become a lint failure or a mangled word.
//
// THESE DOCUMENTS WERE DRAFTED BY AN AI AND ARE NOT LEGAL ADVICE. Every
// `kind: 'todo'` block below marks something a lawyer has to decide. They are
// rendered VISIBLY on the page on purpose: an unresolved placeholder that is
// invisible is an unresolved placeholder that ships.

import { PLAN_PRICING } from '@/lib/planCopy'

// ─── The entity, and the facts about it ──────────────────────────────────────

export const LEGAL_ENTITY = 'Become LLC'
export const LEGAL_ENTITY_DESCRIPTION =
  'a New York limited liability company formed on August 1, 2026'
export const LEGAL_ADDRESS_LINES = [
  'Become LLC',
  '516 Cambridge Ave',
  'Westbury, NY 11590',
  'United States',
] as const
export const LEGAL_CONTACT_EMAIL = 'info@becomeurbest.com'
export const LEGAL_PRIMARY_DOMAIN = 'becomeurbest.com'
export const LEGAL_SECONDARY_DOMAIN = 'become.redbtn.io'
export const LEGAL_GOVERNING_LAW = 'the laws of the State of New York'
export const LEGAL_VENUE = 'the state and federal courts located in Nassau County, New York'

/** Shown at the top of every legal page, and asserted by the unit test.
 *
 *  LEGAL_VERSION IS WHAT A MEMBER AGREES TO. `User.consent.termsVersion` stores
 *  it, and the in-app consent gate (components/ConsentGate.tsx) re-asks every
 *  member whose stored version differs. So: bump it for a change a member has to
 *  agree to again (a new obligation, a new price, a new age rule), and leave it
 *  alone for a typo, or every member is stopped at the door for a comma. */
export const LEGAL_LAST_UPDATED = 'September 23, 2026'
export const LEGAL_LAST_UPDATED_ISO = '2026-09-23'
// NOT bumped for the account-deletion rewrite of Privacy §13 (2026-09-23). The
// change gives a member a right they can now exercise themselves; it imposes no
// new obligation on them, so re-asking 60-odd people to tick a box for it would
// be a gate with nothing behind it. The DATE moved, which is what section 18
// promises. Bump the VERSION for a new obligation, a new price or a new age rule.
export const LEGAL_VERSION = 'v1.1.0'

/** The minimum age to hold an account. George's call, 2026-09-13: 13, not 18.
 *  Under-13s are COPPA territory and are refused outright; 13 to 17 may use
 *  the Service with a parent or guardian's permission (Terms, section 4). */
export const LEGAL_MINIMUM_AGE = 13

/**
 * The ONE sentence a member ticks to agree. It is rendered by the sign-up form
 * and by the in-app consent gate, and it is what `User.consent` records having
 * been shown. Age and agreement travel together on purpose: a single tick
 * gives one timestamp that answers both "did they agree?" and "did they say
 * they were old enough?", which is the evidence NY GBL 527-a and a chargeback
 * dispute both ask for.
 */
export const CONSENT_STATEMENT = `I am at least ${LEGAL_MINIMUM_AGE} years old, and I agree to the Terms of Service and the Privacy Policy.`

/**
 * The health disclaimer, short enough for a screen a member is trying to get
 * past. The full version is section 1 of the Terms and this must never say
 * more than that does. Shown on the consent gate, at the end of onboarding,
 * and in Settings, so it exists somewhere other than a page nobody reads.
 */
export const HEALTH_DISCLAIMER_SHORT =
  'Become is a fitness, nutrition and mindset product, not medical care or medical advice. Talk to a physician before starting any exercise or nutrition program, scale the work to your own ability, and stop if something feels wrong.'

/** The outer bound we commit to for FINISHING a deletion, counted from the
 *  request. Not the same number as the undo window — see
 *  ACCOUNT_DELETION_GRACE_DAYS in lib/accountDeletion.ts, which is how long the
 *  data stays recoverable. Both are real and they answer different questions:
 *  this one is the promise in the Privacy Policy, that one is the safety net. */
export const LEGAL_DELETION_DAYS = 30

/** The PUBLIC page where deletion can be requested — no account needed to read
 *  it. This is the URL Google Play's Data safety form asks for, and it is
 *  linked from the landing footer, the Privacy Policy and Support. Kept here
 *  rather than only in lib/accountDeletion.ts so the legal copy and the app
 *  cannot end up naming two different paths. */
export const LEGAL_DELETION_REQUEST_PATH = '/delete-account'
/** The refund window on a member's FIRST charge (George, 2026-09-18): a full
 *  refund on request within this many days of the first payment on the
 *  account. Renewals are not covered — the Terms say so in the same breath. */
export const LEGAL_REFUND_WINDOW_DAYS = 14
/** The range support answers in. A range, never a promise of "instantly". */
export const LEGAL_SUPPORT_RESPONSE = '1 to 3 business days'
/** Early members holding a permanent complimentary Plus grant. */
export const LEGAL_COMPLIMENTARY_PLUS_COUNT = 64

/** The literal marker. Anything a lawyer must decide carries exactly this. */
export const COUNSEL_TODO = '[TODO: confirm with counsel]'

// ─── Automatic renewal (New York GBL 527-a) ──────────────────────────────────

/**
 * The automatic-renewal disclosure, in one place.
 *
 * New York General Business Law 527-a wants the renewal terms stated clearly
 * and conspicuously, in visual proximity to the request for consent. The
 * request for consent is the checkout button on the plan page, so the plan page
 * renders `renewalLine()` directly under it and the Terms render the full set
 * below. One source, so the two surfaces can never say different things.
 *
 * Nothing here is typed by hand: the amounts come from PLAN_PRICING, which is
 * the same constant checkout charges against.
 */
export const RENEWAL_TERMS: readonly string[] = [
  // Tax-INCLUSIVE, by decision (George, 2026-09-13): the flat price is the
  // price, and any sales tax Become owes comes out of it rather than being
  // added on top at checkout. Stripe prices must therefore be configured as
  // tax-inclusive; nothing here may say "plus tax".
  `Become Plus costs ${PLAN_PRICING.monthly.display} per ${PLAN_PRICING.monthly.per}, or ${PLAN_PRICING.annual.display} per ${PLAN_PRICING.annual.per}, in ${PLAN_PRICING.currency}. Any applicable sales tax is included in that price.`,
  'Your plan renews automatically at the end of every billing period. Unless you cancel first, the payment method you gave Stripe is charged the same amount again, for another period of the same length, and this repeats until you cancel.',
  'You can cancel at any time. Open the Plan page in the app, choose Manage billing, and cancel in the Stripe billing portal that opens. You can also email us and we will cancel it for you.',
  'When you cancel, your Plus access stays on until the end of the period you have already paid for, and the plan is not renewed after that. Cancelling does not cut that period short, and it does not by itself produce a refund of that period.',
]

/** The short version, for the one surface that asks for consent. */
export function renewalLine(plan: 'monthly' | 'annual'): string {
  const p = PLAN_PRICING[plan]
  return `Renews automatically at ${p.display} every ${p.per} until you cancel. Cancel any time under Manage billing; your access runs to the end of the period you paid for.`
}

// ─── Document shape ──────────────────────────────────────────────────────────

/**
 * Inline markup understood by the renderer, and nothing else:
 *   `**bold**`            emphasis
 *   `[label](/path)`      a link
 * No HTML is ever injected. See components/legal/LegalDocument.tsx.
 */
export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'dl'; items: { term: string; detail: string }[] }
  | { kind: 'callout'; tone: 'warning' | 'info'; title: string; items: string[] }
  /** An unresolved question for a lawyer. Rendered visibly, marked clearly. */
  | { kind: 'todo'; text: string }

export interface LegalSection {
  /** Anchor id, so a single clause can be linked to directly. */
  id: string
  heading: string
  blocks: LegalBlock[]
}

export interface LegalDoc {
  slug: 'terms' | 'privacy' | 'health-data' | 'support' | 'delete-account'
  title: string
  /** One line under the title, in plain language. */
  standfirst: string
  sections: LegalSection[]
}

/** Every legal route, in the order they are linked. One list, linked everywhere. */
export const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  // Washington RCW 19.373.020 and Nevada SB 370 both require the consumer
  // health data policy to be a DISTINCT document linked from the home page.
  // Being in this list is what puts it on the home page (and everywhere else).
  { href: '/health-data', label: 'Health data' },
  { href: '/support', label: 'Support' },
] as const

/** Pull every unresolved item out of a document, for the test and for review. */
export function counselTodos(doc: LegalDoc): string[] {
  return doc.sections.flatMap((section) =>
    section.blocks
      .filter((b): b is Extract<LegalBlock, { kind: 'todo' }> => b.kind === 'todo')
      .map((b) => `${doc.slug} / ${section.heading}: ${b.text}`),
  )
}
