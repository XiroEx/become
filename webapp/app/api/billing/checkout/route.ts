import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { IS_BETA } from '@/lib/appChannel'
import {
  billingNotConfigured,
  getBillingConfig,
  isPlan,
  priceIdForPlan,
  type BillingPlan,
} from '@/lib/billing/config'
import { describeStripeError, getStripe } from '@/lib/billing/stripeClient'
import { ensureStripeCustomer } from '@/lib/billing/customer'
import { readCustomerId, writeCustomerIdIfAbsent } from '@/lib/billing/mongoDeps'
import { checkoutCancelUrl, checkoutSuccessUrl } from '@/lib/billing/urls'
import type { IUserSubscription } from '@/models/User'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/checkout — start a Stripe Checkout session.
 *
 * Body: `{ plan?: 'monthly' | 'annual' }`. The plan is OPTIONAL and defaults to
 * monthly, because the shipped UpgradeSheet posts `{ feature, tier }` with no
 * plan at all — a required field here would 400 the only caller in the app. An
 * explicitly wrong value is still a 400; a missing one is not.
 *
 * Every refusal is a distinct status the client already distinguishes:
 *   401 unauthenticated · 400 invalid_plan · 503 billing_not_configured
 *   409 already_subscribed · 502 checkout_failed
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: unknown = await request.json().catch(() => ({}))
    const rawPlan = (body as { plan?: unknown } | null)?.plan
    if (rawPlan !== undefined && rawPlan !== null && !isPlan(rawPlan)) {
      return NextResponse.json({ error: 'invalid_plan' }, { status: 400 })
    }
    const plan: BillingPlan = isPlan(rawPlan) ? rawPlan : 'monthly'

    const cfg = await getBillingConfig()
    const priceId = priceIdForPlan(cfg, plan)
    if (!cfg.configured || !priceId) return billingNotConfigured()

    const stripe = await getStripe()
    if (!stripe) return billingNotConfigured()

    await dbConnect()
    const user = await User.findById(auth.userId)
      .select('email name subscription')
      .lean<{ email?: string; name?: string; subscription?: IUserSubscription } | null>()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Already paying IN THIS MODE. Checking the mode matters: a live subscriber
    // testing on beta must still be able to run a test checkout, and a test
    // subscription must never block a real purchase.
    const sub = user.subscription
    const sameMode = !sub?.mode || sub.mode === cfg.mode
    if (sameMode && (sub?.status === 'active' || sub?.status === 'trialing')) {
      return NextResponse.json({ error: 'already_subscribed' }, { status: 409 })
    }

    const appChannel = IS_BETA ? 'beta' : 'prod'
    const customerId = await ensureStripeCustomer({
      userId: auth.userId,
      email: user.email ?? auth.email ?? '',
      name: user.name,
      mode: cfg.mode,
      appChannel,
      stripe,
      readCustomerId,
      writeCustomerIdIfAbsent,
    })

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        // Promo codes are created in the Stripe dashboard, never in code.
        allow_promotion_codes: true,
        client_reference_id: auth.userId,
        metadata: { userId: auth.userId, plan },
        // Copied onto the subscription, so every later subscription event and
        // every invoice snapshot can attribute itself without a customer lookup.
        subscription_data: { metadata: { userId: auth.userId, plan, appChannel } },
        success_url: checkoutSuccessUrl(),
        cancel_url: checkoutCancelUrl(),
      },
      {
        // A 1-minute bucket collapses a double-click into one session without
        // pinning the member to a single expired session forever.
        idempotencyKey: `become:checkout:${auth.userId}:${plan}:${cfg.mode}:${Math.floor(
          Date.now() / 60_000,
        )}`,
      },
    )

    if (!session.url) {
      console.error('[billing] checkout session created without a url')
      return NextResponse.json({ error: 'checkout_failed' }, { status: 502 })
    }

    return NextResponse.json({ url: session.url, sessionId: session.id, mode: cfg.mode })
  } catch (error) {
    // Never the message: a Stripe error can echo request params back.
    console.error('[billing] checkout failed:', describeStripeError(error))
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 })
  }
}
