import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { loadUserEntitlement } from '@/lib/entitlements'
import { getBillingConfig, priceIdForPlan } from '@/lib/billing/config'
import {
  cardTrialAvailable,
  freeTrialActive,
  freeTrialDaysRemaining,
  freeTrialEndsAt,
  freeTrialOfferDue,
  hasStartedFreeTrial,
  TRIAL_DAYS,
  type TrialOfferSnapshot,
} from '@/lib/billing/trial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/billing/trial/status — everything the Plan page (and the
// onboarding prompt) need to decide which trial CTA, if any, to draw.
//
// A SEPARATE ROUTE from GET /api/me/entitlements and GET /api/billing/status
// on purpose: both of those are pinned field-for-field against the published
// @become/core schema by tests/unit/contract/np015Routes.test.ts, and the
// no-card trial's one piece of state — `subscription.freeTrialStartedAt` — is
// not in that schema. Extending either would need a core version bump this
// repo cannot publish (AGENTS.md, "@become/core (NP-017)"). So the free
// trial gets its own small surface instead, read alongside the entitlements
// snapshot rather than folded into it.
//
// Every boolean here is the SAME function the routes and the onboarding
// modal call — this route exists to let the server answer them for a reader
// that cannot see `subscription.freeTrialStartedAt` any other way.
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tier, subscription } = await loadUserEntitlement(auth.userId)
  const billing = await getBillingConfig()
  const checkoutAvailable =
    billing.configured && Boolean(priceIdForPlan(billing, 'monthly') || priceIdForPlan(billing, 'annual'))

  const snapshot: TrialOfferSnapshot = { tier, checkoutAvailable, subscription }

  return NextResponse.json({
    tier,
    checkoutAvailable,
    trialDays: TRIAL_DAYS,
    hasStartedFreeTrial: hasStartedFreeTrial(subscription),
    freeTrialActive: freeTrialActive(subscription),
    freeTrialOfferDue: freeTrialOfferDue(snapshot),
    freeTrialEndsAt: freeTrialEndsAt(subscription)?.toISOString() ?? null,
    freeTrialDaysRemaining: freeTrialDaysRemaining(subscription),
    cardTrialAvailable: cardTrialAvailable(snapshot),
  })
}
