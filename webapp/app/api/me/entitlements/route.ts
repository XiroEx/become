import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import {
  loadUserEntitlement,
  featureAccess,
  entitlementsEnforced,
  FEATURE_MIN_TIER,
  FEATURES,
  reportedGrandfathered,
  type Feature,
  type Tier,
  type AllowanceWindow,
} from '@/lib/entitlements'
import { peekAllowance } from '@/lib/allowances'
import { readTzOffset } from '@/lib/dayWindow'
import { getBillingConfig, priceIdForPlan } from '@/lib/billing/config'

// GET /api/me/entitlements?tz=<offset>
//
// The one place a client reads plan state from: role, tier, whether enforcement
// is even on, and a per-feature block carrying BOTH questions the UI has to
// answer — may I touch this at all (`allowed`), and may I create another one
// right now (`canCreate`).
//
// Clients read `canCreate`; they must never recompute it from limit/used,
// because the kill-switch and the admin bypass both live in this calculation.
//
// Never mutates: pure peeks, so opening the dashboard cannot burn an allowance.

export interface FeatureEntitlement {
  allowed: boolean
  canCreate: boolean
  requiresTier: Tier
  limit: number | null
  used: number
  remaining: number | null
  resetsAt: string | null
  window: AllowanceWindow
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { role, tier, grandfathered, subscription } = await loadUserEntitlement(auth.userId)
  const enforced = entitlementsEnforced()
  // Never throws and needs no network — an unconfigured install resolves to
  // false, which is exactly the state the app ships in.
  const billing = await getBillingConfig()
  const tzOffset = readTzOffset(new URL(request.url).searchParams)

  const entries = await Promise.all(
    FEATURES.map(async (feature): Promise<[Feature, FeatureEntitlement]> => {
      const access = featureAccess(role, tier, feature)
      const state = await peekAllowance(feature, { userId: auth.userId!, tzOffset })
      const uncapped = access === 'full'

      // When enforcement is OFF the answer to both questions is always yes —
      // that is the whole point of the switch — but used/remaining stay REAL so
      // the shadow-mode numbers are usable telemetry before the flip.
      const allowed = !enforced || access !== 'none'
      const canCreate = !enforced || (access !== 'none' && (uncapped || state.remaining > 0))

      return [
        feature,
        {
          allowed,
          canCreate,
          requiresTier: FEATURE_MIN_TIER[feature],
          limit: uncapped ? null : state.limit,
          used: state.used,
          remaining: uncapped ? null : state.remaining,
          resetsAt: state.resetsAt,
          window: state.window,
        },
      ]
    })
  )

  return NextResponse.json({
    role,
    tier,
    enforced,
    // The REASON this member holds Plus, never a grant on its own — the gates
    // read `tier` and nothing else. See reportedGrandfathered().
    grandfathered: reportedGrandfathered(tier, grandfathered),
    subscription: subscription
      ? {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
        }
      : null,
    // Whether a checkout can actually be started: a secret key AND at least one
    // price. Either missing and the upgrade CTA renders its "coming soon" state
    // instead of a dead link — which is what launch day looks like, since the
    // billing block is not in BECOME_RUNTIME_CONFIG yet.
    checkoutAvailable:
      billing.configured
      && Boolean(priceIdForPlan(billing, 'monthly') || priceIdForPlan(billing, 'annual')),
    features: Object.fromEntries(entries) as Record<Feature, FeatureEntitlement>,
  })
}
