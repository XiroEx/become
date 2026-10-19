import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { reportedGrandfathered } from '@/lib/entitlements'
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
import type { IUserSubscription, UserRole } from '@/models/User'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/trial/status — everything a client needs to render the
 * no-card trial, in one call, without widening @become/core's published
 * `EntitlementsSnapshot` (which has no `freeTrialStartedAt` and cannot gain one
 * without a version bump and a manual publish — AGENTS.md). Deliberately a
 * NEW route rather than a new field on GET /api/me/entitlements or
 * GET /api/billing/status: both of those are pinned, at every key, against a
 * published zod schema by tests/unit/contract/np015Routes.test.ts, so an
 * undeclared field there fails the contract instead of this route.
 *
 * ALWAYS 200 when authenticated, same rule as GET /api/billing/status: this is
 * state to RENDER, never a refusal.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()
  const user = await User.findById(auth.userId)
    .select('role tier grandfathered subscription')
    .lean<{
      role?: UserRole
      tier?: string
      grandfathered?: boolean
      subscription?: IUserSubscription
    } | null>()

  const billing = await getBillingConfig()
  const checkoutAvailable =
    billing.configured && Boolean(priceIdForPlan(billing, 'monthly') || priceIdForPlan(billing, 'annual'))

  const tier = user?.tier === 'plus' ? 'plus' : 'free'
  const grandfathered = reportedGrandfathered(tier, user?.grandfathered === true)
  // The SAME tier a request-path gate would see: grandfathered/admin report as
  // 'plus' even though `user.tier` already says so on disk — kept explicit so
  // this route never drifts from loadUserEntitlement's own rule.
  const reportedTier = grandfathered || user?.role === 'admin' ? 'plus' : tier

  const snapshot: TrialOfferSnapshot = {
    tier: reportedTier,
    checkoutAvailable,
    subscription: user?.subscription ?? null,
  }

  return NextResponse.json({
    trialDays: TRIAL_DAYS,
    // Never started, still eligible — the no-card offer itself.
    offerDue: freeTrialOfferDue(snapshot),
    // Started and still inside its window.
    active: freeTrialActive(user?.subscription),
    daysRemaining: freeTrialDaysRemaining(user?.subscription),
    freeTrialEndsAt: freeTrialEndsAt(user?.subscription),
    // Started, and the window has closed.
    ended: hasStartedFreeTrial(user?.subscription) && !freeTrialActive(user?.subscription),
    // Can a card still be added for the Stripe trial, whether or not the
    // no-card trial ever ran? Gated on checkoutAvailable, unlike offerDue.
    cardAvailable: cardTrialAvailable(snapshot),
  })
}
