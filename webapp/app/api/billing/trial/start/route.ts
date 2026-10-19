import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { loadUserEntitlement } from '@/lib/entitlements'
import { tierUpdateFor } from '@/lib/subscription'
import {
  freeTrialDaysRemaining,
  freeTrialEndsAt,
  freeTrialOfferDue,
  TRIAL_DAYS,
  type TrialOfferSnapshot,
} from '@/lib/billing/trial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/trial/start — grant the no-card, no-Stripe free trial.
 *
 * The card (George, 2026-10-19): 7 days of Plus, free, with no card and no
 * Stripe checkout at all. ACTIVATED, never automatic — this route only ever
 * runs because a member pressed a button, same discipline as the card-backed
 * trial in app/api/billing/checkout/route.ts.
 *
 * `freeTrialOfferDue` is read here exactly as it is in the UI
 * (lib/billing/trial.ts), so a member who presses a stale button — one who
 * already started the trial in another tab, or who is already Plus some
 * other way — gets a 409 rather than a second grant. This route is the one
 * and only writer of `subscription.freeTrialStartedAt`.
 *
 * NEVER HAND-WRITES `tier`. `tierUpdateFor` (lib/subscription.ts) is the same
 * derive-then-persist pattern every other writer uses — the billing webhook,
 * scripts/migrate-tiers.mjs, lib/billing/tierResweep.ts — so this route is
 * not a FOURTH way of deciding what tier means, only a fourth EVENT.
 * `deriveTier`'s third clock branch (freeTrialActive) is what turns
 * `freeTrialStartedAt: now` into 'plus'; tests/unit/entitlements/gates.test.ts
 * ("no API route other than the admin one writes tier") is the scan that
 * keeps every route honest about this, including this one.
 *
 * Does NOT touch any OTHER subscription field: a member with an existing
 * (spent) Stripe history keeps every one of those fields exactly as they
 * were, which also means `freeTrialOfferDue` already refused them if
 * `tier` were 'plus' for that reason — this grant is additive, never a reset.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tier, subscription } = await loadUserEntitlement(auth.userId)
  const snapshot: TrialOfferSnapshot = { tier, subscription }
  if (!freeTrialOfferDue(snapshot)) {
    return NextResponse.json({ error: 'free_trial_unavailable' }, { status: 409 })
  }

  await dbConnect()
  const now = new Date()
  // Formalises the schema default on a row with no subscription subdocument
  // yet, rather than leaving it to Mongoose's own default (which a raw $set
  // with dot-paths does not apply).
  const status = subscription?.status ?? 'none'
  const update = tierUpdateFor({ subscription: { status, freeTrialStartedAt: now }, now })

  await User.updateOne(
    { _id: auth.userId },
    {
      $set: {
        ...update,
        'subscription.freeTrialStartedAt': now,
        'subscription.status': status,
      },
    },
  )

  return NextResponse.json({
    tier: update.tier,
    freeTrialStartedAt: now.toISOString(),
    freeTrialEndsAt: freeTrialEndsAt({ freeTrialStartedAt: now })?.toISOString() ?? null,
    freeTrialDaysRemaining: freeTrialDaysRemaining({ freeTrialStartedAt: now }, now),
    trialDays: TRIAL_DAYS,
  })
}
