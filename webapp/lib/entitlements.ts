import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import type { UserRole } from './roles'
import type { IUserSubscription } from '@/models/User'

/**
 * ─── The tier model ──────────────────────────────────────────────────────────
 *
 * READ THIS BEFORE ADDING A GATE.
 *
 * `requireFeature` answers "may this member TOUCH this feature at all" — it is
 * the guard for editing and deleting things they already own. It deliberately
 * PASSES for a free member on every capped feature (`access: 'limited'`), so
 * someone sitting at 3/3 custom exercises can still fix a typo or delete one to
 * free a slot. A hard tier gate there would lock them out of their own data.
 *
 * `requireQuota` (lib/entitlementGuards.ts) answers "may this member CREATE
 * another one right now". Every create path uses that, never `requireFeature`.
 */

// 'coach' is deliberately NOT implemented yet. The union + TIER_RANK are the
// only two places that need an entry when it lands.
export type Tier = 'free' | 'plus'
export const TIERS: Tier[] = ['free', 'plus']
export const TIER_RANK: Record<Tier, number> = { free: 0, plus: 1 }
export const DEFAULT_TIER: Tier = 'free'

/**
 * The tier at which a feature becomes UNCAPPED. A free member may still get a
 * nonzero allowance below it — see FREE_LIMITS.
 *
 * EVERY ENTRY HERE MUST BE ENFORCED BY A ROUTE. This map is what
 * GET /api/me/entitlements advertises, so an entry no gate consults is a
 * promise the app does not keep. `share-programs` was one: it appeared here,
 * in FREE_LIMITS and in the client copy, and nothing anywhere called a guard
 * with it. It is gone, and it is not coming back as a tier feature, because
 * sharing is a ROLE capability, not a tier one — POST
 * /api/programs/[programId]/share is `requireTrainerOrAdmin`, staff only, and
 * that is the whole gate. Advertising it as Plus was wrong in both directions
 * at once: a Plus member was told they had sharing and was still refused by
 * the role check, and a free-tier TRAINER was told they did not and shared
 * anyway. tests/unit/entitlements/enforcementCoverage.test.ts fails the build
 * if a feature is advertised here without a route that gates on it.
 */
export const FEATURE_MIN_TIER = {
  'custom-meals': 'plus',
  'custom-exercises': 'plus',
  'custom-programs': 'plus',
  'custom-foods': 'plus',
  'custom-sessions': 'plus',
  'workout-generation': 'plus',
  'ai-food-estimate': 'plus',
  'mind-sessions': 'plus',
  vision: 'plus',
} as const satisfies Record<string, Tier>

export type Feature = keyof typeof FEATURE_MIN_TIER

export const FEATURES = Object.keys(FEATURE_MIN_TIER) as Feature[]

// ─── Free-tier allowances ────────────────────────────────────────────────────
//
// kind:
//   'inventory' — a LIVE count of rows the member owns. Deleting frees a slot.
//   'window'    — a counter inside a local day / ISO week bucket.
//   'milestone' — a monotonic progress number already stored elsewhere.
export type AllowanceKind = 'inventory' | 'window' | 'milestone'
export type AllowanceWindow = 'day' | 'week' | 'lifetime'

export interface FreeLimit {
  limit: number
  kind: AllowanceKind
  window: AllowanceWindow
}

export const FREE_LIMITS = {
  'ai-food-estimate': { limit: 1, kind: 'window', window: 'day' },
  'workout-generation': { limit: 3, kind: 'window', window: 'week' },
  'custom-programs': { limit: 3, kind: 'inventory', window: 'lifetime' },
  'custom-sessions': { limit: 3, kind: 'inventory', window: 'lifetime' },
  'custom-exercises': { limit: 3, kind: 'inventory', window: 'lifetime' },
  'custom-meals': { limit: 3, kind: 'inventory', window: 'lifetime' },
  'custom-foods': { limit: 3, kind: 'inventory', window: 'lifetime' },
  'mind-sessions': { limit: 10, kind: 'milestone', window: 'lifetime' },
  vision: { limit: 0, kind: 'inventory', window: 'lifetime' },
} as const satisfies Record<Feature, FreeLimit>

// ─── Access ──────────────────────────────────────────────────────────────────

export type FeatureAccess = 'full' | 'limited' | 'none'

/** UNCAPPED access. Semantics unchanged from the original gate — pure, no env reads. */
export function hasFeature(role: UserRole, tier: Tier, feature: Feature): boolean {
  if (role === 'admin') return true
  return (TIER_RANK[tier] ?? 0) >= TIER_RANK[FEATURE_MIN_TIER[feature]]
}

/** Three-state access. 'limited' = free tier holding a nonzero allowance. */
export function featureAccess(role: UserRole, tier: Tier, feature: Feature): FeatureAccess {
  if (hasFeature(role, tier, feature)) return 'full'
  return FREE_LIMITS[feature].limit > 0 ? 'limited' : 'none'
}

// ─── Enforcement kill-switch ─────────────────────────────────────────────────

/**
 * Read PER CALL (never memoised at module scope) so tests can flip it and so a
 * container env change takes effect on restart without a rebuild. Default OFF.
 *
 * NOT a secret — deliberately straight off process.env rather than
 * lib/runtimeConfig.ts, which ignores process.env entirely when
 * NODE_ENV === 'production' (`next start` sets that) and would therefore always
 * read this as unset.
 *
 * OFF  → zero user-visible gating; allowance usage is still counted (shadow).
 * ON   → gates and allowances enforce for tier 'free'.
 */
export function entitlementsEnforced(): boolean {
  const raw = (process.env.ENTITLEMENTS_ENFORCED ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

// ─── The canonical 403 ───────────────────────────────────────────────────────

export interface GatePayload {
  error: string
  requiresTier: Tier
  feature: Feature
  limit?: number
  remaining?: number
  resetsAt?: string | null
  window?: AllowanceWindow
}

/**
 * THE canonical gate response. Every gate in the app returns exactly this
 * shape, so the client has one branch to render an upsell from.
 */
export function gateResponse(p: GatePayload): NextResponse {
  return NextResponse.json(p, { status: 403 })
}

/**
 * One copy map so every gate speaks the same language. The server owns the
 * wording — the upgrade sheet renders `gate.error` verbatim.
 *
 * Counts are interpolated from FREE_LIMITS rather than typed out, so changing
 * an allowance cannot leave the member reading a number that is no longer true.
 */
const GATE_MESSAGES: Record<Feature, string> = {
  'custom-meals': `You've saved all ${FREE_LIMITS['custom-meals'].limit} of your free meals.`,
  'custom-exercises': `You've saved all ${FREE_LIMITS['custom-exercises'].limit} of your free custom exercises.`,
  'custom-programs': `You've built all ${FREE_LIMITS['custom-programs'].limit} of your free programs.`,
  'custom-foods': `You've saved all ${FREE_LIMITS['custom-foods'].limit} of your free custom foods.`,
  'custom-sessions': `You've starred all ${FREE_LIMITS['custom-sessions'].limit} of your free sessions.`,
  'workout-generation': `You've used all ${FREE_LIMITS['workout-generation'].limit} of your free workout generations this week.`,
  'ai-food-estimate': "You've used your free AI food scan for today.",
  'mind-sessions': `You've finished your first ${FREE_LIMITS['mind-sessions'].limit} Mind sessions.`,
  vision: 'Vision is a Plus feature.',
}

export function defaultMessage(feature: Feature): string {
  return GATE_MESSAGES[feature]
}

// ─── Entitlement load ────────────────────────────────────────────────────────

export interface UserEntitlement {
  role: UserRole
  tier: Tier
  /** RAW, straight off the row. Report it through reportedGrandfathered(). */
  grandfathered: boolean
  subscription: IUserSubscription | null
}

/**
 * What a client may be told about `grandfathered` — and it is NOT "you have
 * access".
 *
 * Grandfathering is a WRITER-SIDE promise. The tier derivation in
 * lib/subscription.ts maps `grandfathered: true` to Plus, but it runs where
 * tier is WRITTEN (the billing webhook, scripts/migrate-tiers.mjs), never on
 * the request path: the gates read `tier` and nothing else, deliberately, so
 * that nobody is promoted silently at read time. The invariant that makes the
 * flag LOOK like a grant — grandfathered rows are already `tier: 'plus'` —
 * holds only because the migration set both in one `$set`. Do NOT "fix" this by deriving tier in
 * loadUserEntitlement — that would grandfather members automatically, which is
 * exactly what the offline script exists to do deliberately. The test file
 * next to this one fails the build if the read path ever derives a tier.
 *
 * So the flag is reported as what it actually is: the REASON this member holds
 * Plus, not a claim of access on its own. A row carrying `grandfathered: true`
 * with `tier: 'free'` is being gated as free — whatever the flag says — and
 * telling the client otherwise would put "Thanks for being here early" on a
 * screen full of locks. That state should be impossible; loadUserEntitlement
 * logs it if it is ever seen.
 */
export function reportedGrandfathered(tier: Tier, grandfathered: boolean): boolean {
  return grandfathered === true && tier === 'plus'
}

/**
 * FAIL CLOSED. A missing or legacy tier value reads as DEFAULT_TIER. The old
 * fallback defaulted a missing field to the TOP tier, which silently granted
 * everything to every row written before the field existed. Legacy tier strings
 * still on disk also collapse to free here — scripts/migrate-tiers.mjs is what
 * promotes those.
 *
 * Tier is READ here, never derived. Deriving it at request time would
 * grandfather members automatically, which is exactly what the migration script
 * exists to do offline and on purpose.
 */
export async function loadUserEntitlement(userId: string): Promise<UserEntitlement> {
  await dbConnect()
  const user = await User.findById(userId)
    .select('role tier grandfathered subscription')
    .lean<{
      role?: UserRole
      tier?: string
      grandfathered?: boolean
      subscription?: IUserSubscription
    } | null>()
  const tier: Tier = user?.tier === 'plus' ? 'plus' : DEFAULT_TIER
  const grandfathered = user?.grandfathered === true

  // Should be impossible: scripts/migrate-tiers.mjs is the only writer of
  // `grandfathered` and it sets `tier: 'plus'` in the same $set, and the
  // billing webhook never clears it. If the two ever disagree the member is
  // being gated as FREE — the request path reads tier alone, on purpose — so
  // this is a silent downgrade of someone we promised not to charge. Cheap
  // enough to check on a row already in hand; loud enough to find.
  if (grandfathered && tier !== 'plus') {
    console.error(
      `[entitlements] impossible state: user ${userId} is grandfathered but tier='${user?.tier ?? '(absent)'}' — ` +
        'gated as free. Re-run scripts/migrate-tiers.mjs or set tier explicitly.',
    )
  }

  return {
    role: (user?.role as UserRole) || 'user',
    tier,
    grandfathered,
    subscription: user?.subscription ?? null,
  }
}

export type RequireFeatureResult =
  | {
      ok: true
      userId: string
      email: string
      role: UserRole
      tier: Tier
      access: FeatureAccess
    }
  | { ok: false; response: NextResponse }

/**
 * API guard helper — mirrors the requireAdmin() pattern.
 *
 * "May this member touch the feature at all?" Passes on 'full' AND 'limited';
 * only a hard 'none' (a feature with no free allowance, e.g. Vision) is
 * refused, and only while the kill-switch is on.
 *
 * Create paths must use requireQuota() instead — see the header comment.
 */
export async function requireFeature(
  request: NextRequest,
  feature: Feature
): Promise<RequireFeatureResult> {
  const authResult = await verifyAuth(request)
  if (!authResult.success || !authResult.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { role, tier } = await loadUserEntitlement(authResult.userId)
  const access = featureAccess(role, tier, feature)

  if (entitlementsEnforced() && access === 'none') {
    return {
      ok: false,
      response: gateResponse({
        error: defaultMessage(feature),
        requiresTier: FEATURE_MIN_TIER[feature],
        feature,
        limit: FREE_LIMITS[feature].limit,
        remaining: 0,
        resetsAt: null,
        window: FREE_LIMITS[feature].window,
      }),
    }
  }

  return {
    ok: true,
    userId: authResult.userId,
    email: authResult.email!,
    role,
    tier,
    access,
  }
}
