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
export const LEGAL_LAST_UPDATED = 'September 24, 2026'
export const LEGAL_LAST_UPDATED_ISO = '2026-09-24'
export const LEGAL_VERSION = 'v1.2.0'

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

// ─── AI, and the permission to send anything to it ───────────────────────────

/**
 * WHO THE THIRD-PARTY AI ACTUALLY IS. Named, not described as "our AI
 * partner": App Store Review Guideline 5.1.2(i) asks for the disclosure to say
 * where the data goes, and a member cannot check a company they were never
 * told the name of. Both names belong in the sentence — Google LLC runs the
 * model, REDBTN LLC's platform is the route it travels.
 */
export const AI_PROVIDER = 'Google Gemini'
export const AI_PROVIDER_ROUTE = 'the redbtn platform'

/**
 * AI consent is versioned SEPARATELY from LEGAL_VERSION.
 *
 * They answer different questions and move for different reasons: the Terms
 * version re-asks everybody for a new clause anywhere in two long documents,
 * while this one re-asks only about what leaves the app and only when THAT
 * changes — a new provider, a new category of input, a new purpose. Bumping
 * one must never silently re-ask the other, because a member who is re-asked
 * for AI permission and declines loses a feature they were using.
 */
export const AI_CONSENT_VERSION = 'v1.0.0'

/**
 * The ONE sentence a member ticks to let their data reach the model. Separate
 * tick, separate record, separate version: Guideline 5.1.2(i) wants EXPLICIT
 * permission, and a tick that also carries the Terms and an age attestation is
 * not explicit permission for anything in particular.
 *
 * It is opt-IN. Unticked is a valid answer, it is recorded as one, and the app
 * keeps working without AI — every AI surface in Become degrades to a
 * deterministic version of the same job.
 */
export const AI_CONSENT_STATEMENT = `I agree that Become may send what I submit to an AI feature to ${AI_PROVIDER}, through ${AI_PROVIDER_ROUTE}, so it can answer. I can withdraw this in Settings at any time.`

/** Exactly what leaves the app, itemised. Shown beside the tick, because "your
 *  data" is not a disclosure and a member should not have to infer that a
 *  photo of their dinner is included. Mirrors section 7 of the Privacy Policy
 *  and section 5 of the Consumer Health Data Privacy Policy. */
export const AI_CONSENT_SENDS: readonly string[] = [
  'Meal photos and the descriptions you type with them, when you scan or describe a meal.',
  'The inputs behind a generated workout or program, which can include your injury notes.',
  'The inputs for a Mind session, and what you write to the coach in chat.',
  'A short summary of your profile and progress, assembled by Become, so the answer fits you.',
] as const

/** What saying no costs, stated at the point of asking rather than discovered
 *  later. Nothing here may promise more than the fallbacks actually deliver. */
export const AI_CONSENT_DECLINE_NOTE =
  'Say no and nothing you enter is sent to the AI. Become still logs your food, builds your sessions and runs your Mind work from its own non-AI versions, which are less tailored.'

/** The canonical refusal a server route returns when a member has not agreed.
 *  Deliberately NOT the entitlement 403 shape (`feature` + `requiresTier`), so
 *  lib/entitlementsClient.ts#gateFrom cannot parse it into an upgrade sheet:
 *  this is not something money fixes. */
export const AI_CONSENT_REASON = 'ai_consent_required'

/** What the member is told when a route refuses for want of consent. */
export const AI_CONSENT_REFUSAL_MESSAGE =
  'Become needs your permission before sending anything to its AI provider.'

/**
 * The health disclaimer, short enough for a screen a member is trying to get
 * past. The full version is section 1 of the Terms and this must never say
 * more than that does. Shown on the consent gate, at the end of onboarding,
 * and in Settings, so it exists somewhere other than a page nobody reads.
 */
export const HEALTH_DISCLAIMER_SHORT =
  'Become is a fitness, nutrition and mindset product, not medical care or medical advice. Talk to a physician before starting any exercise or nutrition program, scale the work to your own ability, and stop if something feels wrong.'

/** How long deletion takes once we have confirmed the request. */
export const LEGAL_DELETION_DAYS = 30
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
  slug: 'terms' | 'privacy' | 'health-data' | 'support'
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
