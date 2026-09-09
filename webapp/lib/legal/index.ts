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

/** Shown at the top of every legal page, and asserted by the unit test. */
export const LEGAL_LAST_UPDATED = 'September 9, 2026'
export const LEGAL_LAST_UPDATED_ISO = '2026-09-09'
export const LEGAL_VERSION = 'v1.0.0'

/** How long deletion takes once we have confirmed the request. */
export const LEGAL_DELETION_DAYS = 30
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
  `Become Plus costs ${PLAN_PRICING.monthly.display} per ${PLAN_PRICING.monthly.per}, or ${PLAN_PRICING.annual.display} per ${PLAN_PRICING.annual.per}, in ${PLAN_PRICING.currency}, plus any tax Stripe collects at checkout.`,
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
  slug: 'terms' | 'privacy' | 'support'
  title: string
  /** One line under the title, in plain language. */
  standfirst: string
  sections: LegalSection[]
}

/** Every legal route, in the order they are linked. One list, linked everywhere. */
export const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
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
