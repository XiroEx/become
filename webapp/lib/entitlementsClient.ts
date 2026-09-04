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

const FEATURE_NOUN: Record<Feature, { label: string; plural: boolean }> = {
  'custom-meals': { label: 'Saved meals', plural: true },
  'custom-exercises': { label: 'Custom exercises', plural: true },
  'custom-programs': { label: 'Custom programs', plural: true },
  'custom-foods': { label: 'Custom foods', plural: true },
  'custom-sessions': { label: 'Starred sessions', plural: true },
  'workout-generation': { label: 'Unlimited workout generation', plural: false },
  'ai-food-estimate': { label: 'Unlimited AI food scans', plural: true },
  'mind-sessions': { label: 'The rest of the Mind path', plural: false },
  vision: { label: 'Vision', plural: false },
}

/** Short label for a meter row / lock badge. */
export const FEATURE_LABELS: Record<Feature, string> = {
  'custom-meals': 'Saved meals',
  'custom-exercises': 'Custom exercises',
  'custom-programs': 'Programs',
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
 */
export function featureHeadline(feature: Feature, requiresTier: Tier): string {
  const noun = FEATURE_NOUN[feature]
  if (!noun) return `Upgrade to ${tierLabel(requiresTier)}`
  return `${noun.label} ${noun.plural ? 'are' : 'is'} a ${tierLabel(requiresTier)} feature`
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

/** The allowance line under the sheet body. Null when there is nothing to say. */
export function allowanceLine(gate: GatePayload): string | null {
  if (gate.limit == null || !Number.isFinite(gate.limit) || gate.limit <= 0) return null
  if (gate.window === 'lifetime') {
    return `You're using all ${gate.limit} of your free slots. Delete one to free a slot, or upgrade for unlimited.`
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

/**
 * A gate the CLIENT raises for a surface no request was made from — the plan
 * card's "See Plus", a locked teaser tile. Same shape as a server gate so the
 * sheet has exactly one input.
 */
export function syntheticGate(
  feature: Feature,
  requiresTier: Tier = 'plus',
  message?: string,
): GatePayload {
  return {
    error: message ?? `${FEATURE_LABELS[feature] ?? 'This'} is included with ${tierLabel(requiresTier)}.`,
    feature,
    requiresTier,
  }
}
