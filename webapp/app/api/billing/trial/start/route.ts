import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { reportedGrandfathered } from '@/lib/entitlements'
import { deriveTier } from '@/lib/subscription'
import {
  freeTrialActive,
  freeTrialEndsAt,
  hasStartedFreeTrial,
  isTrialEligible,
  TRIAL_DAYS,
} from '@/lib/billing/trial'
import type { IUserSubscription, UserRole } from '@/models/User'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/trial/start — grant the TRIAL_DAYS no-card, no-Stripe
 * trial. George, 2026-10-19: "Trial prompt grants 7 days free absolutely no
 * Stripe / no card required."
 *
 * No body. No Stripe call. This route's entire job is writing ONE timestamp
 * (`subscription.freeTrialStartedAt`) and, in the same `$set`, the `tier` that
 * timestamp now means — lib/subscription.ts#deriveTier is the only thing that
 * decides what it means, and lib/billing/tierResweep.ts is what closes the
 * window again once TRIAL_DAYS pass with no card added (no Stripe event ever
 * fires for that, so nothing else will).
 *
 * Idempotent while the window is open: a double-click, or revisiting the Plan
 * page mid-trial, answers the SAME grant rather than a second one or a
 * refusal. Once it has run out — or once the account ever held a real
 * subscription (`isTrialEligible`, the exact rule the Stripe-trial checkout
 * enforces) — it refuses with `trial_spent`, the same vocabulary a client
 * already reads off this route's sibling.
 *
 * Refusals: 401 unauthenticated · 409 already_plus (grandfathered/admin — Plus
 * for a reason no free trial improves) · 409 trial_spent (already ran this
 * trial and it is over, or the account has real subscription history).
 */
export async function POST(request: NextRequest) {
  try {
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
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Read THROUGH reportedGrandfathered, same as the checkout route: the raw
    // flag is not a claim of access on its own, only `tier: 'plus'` is.
    const grandfathered = reportedGrandfathered(
      user.tier === 'plus' ? 'plus' : 'free',
      user.grandfathered === true,
    )
    if (grandfathered || user.role === 'admin') {
      return NextResponse.json({ error: 'already_plus' }, { status: 409 })
    }

    // Already running — answer the SAME grant rather than an error, so a
    // double-click or a Plan-page revisit mid-trial never reads as a refusal.
    if (hasStartedFreeTrial(user.subscription) && freeTrialActive(user.subscription)) {
      return NextResponse.json({
        freeTrialStartedAt: user.subscription?.freeTrialStartedAt ?? null,
        freeTrialEndsAt: freeTrialEndsAt(user.subscription),
        tier: 'plus',
      })
    }

    // Already used, and over — or the account has real subscription history,
    // the exact "once per account, ever" rule the Stripe-trial checkout
    // applies. Either way there is nothing left to grant for free.
    if (hasStartedFreeTrial(user.subscription) || !isTrialEligible(user.subscription)) {
      return NextResponse.json({ error: 'trial_spent' }, { status: 409 })
    }

    const now = new Date()
    const nextSubscription: IUserSubscription = {
      ...(user.subscription ?? { status: 'none' }),
      freeTrialStartedAt: now,
    }
    const tier = deriveTier({
      subscription: nextSubscription,
      grandfathered,
      role: user.role,
      now,
    })

    await User.updateOne(
      { _id: auth.userId },
      { $set: { 'subscription.freeTrialStartedAt': now, tier, updatedAt: now } },
    )

    return NextResponse.json({
      freeTrialStartedAt: now,
      freeTrialEndsAt: freeTrialEndsAt(nextSubscription),
      trialDays: TRIAL_DAYS,
      tier,
    })
  } catch (error) {
    console.error('[billing] free trial start failed:', error)
    return NextResponse.json({ error: 'trial_start_failed' }, { status: 500 })
  }
}
