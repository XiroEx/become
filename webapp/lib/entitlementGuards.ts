import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import {
  loadUserEntitlement,
  featureAccess,
  entitlementsEnforced,
  gateResponse,
  defaultMessage,
  FEATURE_MIN_TIER,
  type Feature,
  type Tier,
  type FeatureAccess,
  type GatePayload,
} from '@/lib/entitlements'
import {
  consumeAllowance,
  consumeFollowUp,
  peekAllowance,
  type AllowanceState,
  type AllowanceCtx,
} from '@/lib/allowances'
import type { UserRole } from '@/lib/roles'

/**
 * The CREATE-path guard.
 *
 * requireFeature (lib/entitlements.ts) answers "may this member touch the
 * feature at all" and deliberately passes for a capped free member so they can
 * still edit and delete what they own. This answers the other question: "may
 * they create ANOTHER one right now". Every create route uses this; every
 * own-item mutate route stays on requireFeature.
 *
 * Import direction is one-way and enforced by review:
 *   entitlements.ts (leaf) ← allowances.ts ← entitlementGuards.ts ← routes
 */

// Re-exported so a route needs one import to gate and to answer.
export { gateResponse, defaultMessage }
export type { GatePayload }

export interface RequireQuotaOptions {
  /** Minutes WEST of UTC, from readTzOffset/readTzOffsetFromBody. */
  tzOffset?: number
  /** Stage 4: collapses repeat consumes of a windowed allowance into one unit. */
  dedupeKey?: string
  dedupeWindowMs?: number
  /** Override the copy in the 403 body. */
  message?: string
}

export type RequireQuotaResult =
  | {
      ok: true
      userId: string
      email: string
      role: UserRole
      tier: Tier
      access: FeatureAccess
      allowance: AllowanceState
      ticketId?: string
    }
  | { ok: false; response: NextResponse }

function uncappedAllowance(feature: Feature): AllowanceState {
  return {
    feature,
    limit: Infinity,
    used: 0,
    remaining: Infinity,
    resetsAt: null,
    window: 'lifetime',
    kind: 'inventory',
  }
}

function payloadFor(
  feature: Feature,
  state: AllowanceState,
  message?: string
): GatePayload {
  return {
    error: message ?? defaultMessage(feature),
    requiresTier: FEATURE_MIN_TIER[feature],
    feature,
    limit: state.limit,
    remaining: state.remaining,
    resetsAt: state.resetsAt,
    window: state.window,
  }
}

export async function requireQuota(
  request: NextRequest,
  feature: Feature,
  opts: RequireQuotaOptions = {}
): Promise<RequireQuotaResult> {
  const authResult = await verifyAuth(request)
  if (!authResult.success || !authResult.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return requireQuotaForUser(authResult.userId, feature, {
    ...opts,
    email: authResult.email,
  })
}

/**
 * The same guard for a caller that has ALREADY been authenticated.
 *
 * The /api/ai/* routes verify through requireAiUser() before they parse a body,
 * so re-deriving the user from the request would mean a second JWT verify and,
 * worse, two places that could disagree about who is being charged. This is the
 * single decision path; requireQuota() is the wrapper that authenticates first.
 */
export async function requireQuotaForUser(
  userId: string,
  feature: Feature,
  opts: RequireQuotaOptions & { email?: string; followUp?: boolean } = {}
): Promise<RequireQuotaResult> {
  const { role, tier } = await loadUserEntitlement(userId)
  const access = featureAccess(role, tier, feature)
  const ctx: AllowanceCtx = { userId, tzOffset: opts.tzOffset }

  // Uncapped (plus, or any admin) — nothing to count, nothing to charge. The
  // returned allowance is the "no ceiling" sentinel, never serialised to a
  // client (Infinity would JSON as null).
  if (access === 'full') {
    return {
      ok: true,
      userId,
      email: opts.email ?? '',
      role,
      tier,
      access,
      allowance: uncappedAllowance(feature),
    }
  }

  const consume = opts.followUp ? consumeFollowUp : consumeAllowance
  const { allowed, state, ticketId } = await consume(feature, ctx, {
    enforce: entitlementsEnforced(),
    dedupeKey: opts.dedupeKey,
    dedupeWindowMs: opts.dedupeWindowMs,
  })

  if (!allowed) {
    return { ok: false, response: gateResponse(payloadFor(feature, state, opts.message)) }
  }

  return {
    ok: true,
    userId,
    email: opts.email ?? '',
    role,
    tier,
    access,
    allowance: state,
    ticketId,
  }
}

/**
 * The SOFT check: "would a create be allowed?", answered without consuming and
 * without failing the request. For paths where the primary action must always
 * succeed and only an optional extra is dropped — saving a workout still saves
 * the workout; only the star is refused.
 */
export async function peekQuota(
  userId: string,
  feature: Feature,
  opts: { tzOffset?: number; role?: UserRole; tier?: Tier } = {}
): Promise<{ allowed: boolean; state: AllowanceState; gate: GatePayload | null }> {
  const { role, tier } =
    opts.role && opts.tier
      ? { role: opts.role, tier: opts.tier }
      : await loadUserEntitlement(userId)

  const state = await peekAllowance(feature, { userId, tzOffset: opts.tzOffset })
  const access = featureAccess(role, tier, feature)

  const allowed =
    access === 'full' || !entitlementsEnforced() || state.used < state.limit

  return { allowed, state, gate: allowed ? null : payloadFor(feature, state) }
}
