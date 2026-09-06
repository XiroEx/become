// Client-safe half of the entitlement model.
//
// lib/entitlements.ts is the SERVER leaf: it imports mongoose, the User model
// and next/server, so a client component may only take TYPES from it (erased at
// compile time). Everything a browser bundle needs as a *value* — the response
// shape of GET /api/me/entitlements, the copy the upgrade sheet renders, and
// the one parser that turns a 403 body into a gate — lives here instead.
//
// The server owns the WORDING of every refusal (`gate.error`); this file owns
// only the framing around it (headline, benefit rows, reset phrasing), so a
// copy change on one side can never contradict the other.

import type { Feature, Tier, GatePayload, AllowanceWindow } from '@/lib/entitlements'

export type { Feature, Tier, GatePayload, AllowanceWindow }

// ─── The GET /api/me/entitlements shape ──────────────────────────────────────

export interface FeatureEntitlement {
  /** May they touch the feature at all (edit/delete what they already own)? */
  allowed: boolean
  /** May they create ANOTHER one right now? Clients read this, never recompute
   *  it — the kill-switch and the admin bypass both live in that calculation. */
  canCreate: boolean
  requiresTier: Tier
  /** null when uncapped for this member. */
  limit: number | null
  used: number
  remaining: number | null
  resetsAt: string | null
  window: AllowanceWindow
}

export interface SubscriptionSnapshot {
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export interface EntitlementsSnapshot {
  role: string
  tier: Tier
  /** The kill-switch. FALSE means the app must look exactly as it did before
   *  any of this shipped — every lock, counter and plan card stays unrendered. */
  enforced: boolean
  /** WHY this member is on Plus, not a grant. The server reports it as false
   *  on any row that is not `tier: 'plus'`, because the gates read tier alone
   *  — see reportedGrandfathered() in lib/entitlements.ts. Never branch on it
   *  outside a `tier !== 'free'` branch. */
  grandfathered: boolean
  subscription: SubscriptionSnapshot | null
  checkoutAvailable: boolean
  features: Partial<Record<Feature, FeatureEntitlement>>
}

// ─── Copy ────────────────────────────────────────────────────────────────────

/** Tier as a member reads it. Extend alongside the Tier union, not instead. */
export function tierLabel(tier: Tier | string): string {
  const t = String(tier)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Two nouns per feature and one number for both, because the sheet says the
// feature's name twice and they are not the same sentence.
//
//  • `headline` is what Plus SELLS. Every capped feature reads "Unlimited ...",
//    because what is bought is the removal of the cap, not the feature: a free
//    member plainly HAS saved meals, so "Saved meals are a Plus feature" sat
//    directly above "You've saved all 3 of your free meals" and contradicted
//    it. The two windowed features already read this way; the inventory five
//    now match them.
//  • `noun` is what the feature IS, for the body line of a client-raised gate.
//
// `plural` governs both (they agree in every row) and lives HERE rather than
// beside FEATURE_LABELS, whose plurals are the meter row's and differ — a
// member reads "Workout generations 1/3 this week" but "Workout generation is
// included with Plus". Splitting the label from its own verb is what produced
// "Custom exercises is included with Plus."
const FEATURE_NOUN: Record<Feature, { headline: string; noun: string; plural: boolean }> = {
  'custom-meals': { headline: 'Unlimited saved meals', noun: 'Saved meals', plural: true },
  'custom-exercises': { headline: 'Unlimited custom exercises', noun: 'Custom exercises', plural: true },
  'custom-programs': { headline: 'Unlimited custom programs', noun: 'Custom programs', plural: true },
  'custom-foods': { headline: 'Unlimited custom foods', noun: 'Custom foods', plural: true },
  'custom-sessions': { headline: 'Unlimited starred sessions', noun: 'Starred sessions', plural: true },
  'workout-generation': { headline: 'Unlimited workout generation', noun: 'Workout generation', plural: false },
  'ai-food-estimate': { headline: 'Unlimited AI food scans', noun: 'AI food scans', plural: true },
  'mind-sessions': { headline: 'The rest of the Mind path', noun: 'The rest of the Mind path', plural: false },
  vision: { headline: 'Vision', noun: 'Vision', plural: false },
}

/** Short label for a meter row / lock badge. */
export const FEATURE_LABELS: Record<Feature, string> = {
  'custom-meals': 'Saved meals',
  'custom-exercises': 'Custom exercises',
  'custom-programs': 'Custom programs',
  'custom-foods': 'Custom foods',
  'custom-sessions': 'Starred sessions',
  'workout-generation': 'Workout generations',
  'ai-food-estimate': 'AI food scans',
  'mind-sessions': 'Mind sessions',
  vision: 'Vision',
}

/**
 * The sheet headline. Derived from `requiresTier` rather than hard-coding
 * "Plus", so a later tier needs no copy edit here.
 *
 * `feature` is optional because the PLAN ENTRY POINTS — the dashboard plan
 * card's "See Plus", the profile's Plan row — refuse nothing and name no
 * feature. They used to pass `custom-programs` purely to obtain a sheet, so
 * "See Plus" was headlined "Custom programs are a Plus feature"; now they pass
 * nothing and get a headline about the tier itself.
 */
export function featureHeadline(feature: Feature | undefined, requiresTier: Tier): string {
  const noun = feature ? FEATURE_NOUN[feature] : undefined
  if (!noun) return `What ${tierLabel(requiresTier)} unlocks`
  return `${noun.headline} ${noun.plural ? 'are' : 'is'} a ${tierLabel(requiresTier)} feature`
}

/** Three things a member gets for upgrading. Rendered as check rows. */
export const PLUS_BENEFITS: string[] = [
  'Unlimited AI food scans and workout generation',
  'Unlimited programs, sessions, exercises, meals and foods',
  'The full Mind path, including Vision',
]

/**
 * When a windowed allowance comes back. Phrased from the WINDOW rather than the
 * timestamp: a member reads "at midnight" and "on Monday", not an ISO string,
 * and both are exactly what windowBucket() anchors to.
 */
export function formatResetsAt(
  resetsAt: string | null | undefined,
  window?: AllowanceWindow,
): string | null {
  if (!resetsAt) return null
  const t = Date.parse(resetsAt)
  if (Number.isNaN(t)) return null
  if (window === 'day') return 'at midnight'
  if (window === 'week') return 'on Monday'
  return new Date(t).toLocaleDateString()
}

/**
 * What UpgradeSheet renders: a server gate, a client teaser for one feature, or
 * a PLAN OVERVIEW that names no feature at all. Identical to the server's
 * GatePayload except that `feature` may be absent — see featureHeadline().
 */
export interface SheetGate extends Omit<GatePayload, 'feature'> {
  feature?: Feature
}

/** The allowance line under the sheet body. Null when there is nothing to say. */
export function allowanceLine(gate: SheetGate): string | null {
  if (gate.limit == null || !Number.isFinite(gate.limit) || gate.limit <= 0) return null
  if (gate.window === 'lifetime') {
    const remaining = gate.remaining ?? 0
    if (remaining > 0) return `${remaining} of ${gate.limit} left.`
    // At the cap. The way back is NOT the same for all three of these, and the
    // window alone cannot tell them apart:
    //   • an inventory cap is escaped by DELETING a row you own;
    //   • starred sessions are escaped by UNSTARRING one — there is nothing to
    //     delete, the session is not yours;
    //   • mind-sessions is a MILESTONE. Nothing can be deleted or unstarred and
    //     the stop never lifts, so promising a slot back would be a lie.
    if (gate.feature === 'mind-sessions') {
      return `You've finished all ${gate.limit} of your free sessions.`
    }
    const back = gate.feature === 'custom-sessions' ? 'Unstar one' : 'Delete one'
    return `You're using all ${gate.limit} of your free slots. ${back} to free a slot, or upgrade for unlimited.`
  }
  const remaining = gate.remaining ?? 0
  const when = formatResetsAt(gate.resetsAt, gate.window)
  return `${remaining} of ${gate.limit} left.${when ? ` Resets ${when}.` : ''}`
}

// ─── The 403 → gate parser ───────────────────────────────────────────────────

/**
 * Turn a refused response into a gate, or null when it is an ordinary error.
 *
 * Deliberately strict: only a 403 carrying BOTH `feature` and `requiresTier` is
 * a gate. A 403 from anywhere else (an ownership check, a role check) keeps
 * falling through to the caller's normal error banner instead of raising an
 * upsell for something money cannot buy.
 */
export function gateFrom(status: number, body: unknown): GatePayload | null {
  if (status !== 403 || body === null || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.error !== 'string' || !b.error) return null
  if (typeof b.feature !== 'string' || typeof b.requiresTier !== 'string') return null
  return {
    error: b.error,
    feature: b.feature as Feature,
    requiresTier: b.requiresTier as Tier,
    ...(typeof b.limit === 'number' ? { limit: b.limit } : {}),
    ...(typeof b.remaining === 'number' ? { remaining: b.remaining } : {}),
    ...(typeof b.resetsAt === 'string' || b.resetsAt === null
      ? { resetsAt: b.resetsAt as string | null }
      : {}),
    ...(typeof b.window === 'string' ? { window: b.window as AllowanceWindow } : {}),
  }
}

/** The half of a FeatureEntitlement a gate carries. The hook's own type is
 *  assignable to it, so a caller passes what it already read. */
export type AllowanceFacts = Pick<
  FeatureEntitlement,
  'limit' | 'remaining' | 'resetsAt' | 'window'
>

/**
 * A gate the CLIENT raises for a surface no request was made from — a locked
 * create button, a teaser tile. Same shape as a server gate so the sheet has
 * exactly one input.
 *
 * Pass the entitlement the caller already holds. Without it the gate carries no
 * limit, allowanceLine() returns null, and the member is refused with no cap
 * and no way out — on the PROACTIVE path, which is the one most free members
 * meet (the locked button, before any request is ever made).
 */
export function syntheticGate(
  feature: Feature,
  requiresTier: Tier = 'plus',
  allowance?: AllowanceFacts | null,
): GatePayload {
  const noun = FEATURE_NOUN[feature]
  return {
    // Noun and verb from the same row, so they cannot disagree. Reading the
    // label out of FEATURE_LABELS and the verb out of nowhere is how this
    // produced "Custom exercises is included with Plus."
    error: noun
      ? `${noun.noun} ${noun.plural ? 'are' : 'is'} included with ${tierLabel(requiresTier)}.`
      : `This is included with ${tierLabel(requiresTier)}.`,
    feature,
    requiresTier,
    ...(typeof allowance?.limit === 'number' ? { limit: allowance.limit } : {}),
    ...(typeof allowance?.remaining === 'number' ? { remaining: allowance.remaining } : {}),
    ...(allowance ? { resetsAt: allowance.resetsAt, window: allowance.window } : {}),
  }
}

/**
 * The gate the PLAN ENTRY POINTS raise — the dashboard plan card's "See Plus",
 * the profile's Plan row. Nothing was refused and no single feature is being
 * asked for, so it carries no `feature` and the sheet headlines the tier.
 */
export function planGate(message: string, requiresTier: Tier = 'plus'): SheetGate {
  return { error: message, requiresTier }
}
