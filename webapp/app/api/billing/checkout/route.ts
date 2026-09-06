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
import { reportedGrandfathered } from '@/lib/entitlements'
import type { IUserSubscription, UserRole } from '@/models/User'

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
 *   409 already_subscribed · 409 fix_payment_method · 409 already_plus
 *   502 checkout_failed
 *
 * The three 409s are all "you cannot buy this", for three different reasons,
 * and each one is a bill somebody would otherwise pay twice. All three are
 * MODE-SCOPED: a refusal that ignores the mode also refuses the test-mode
 * checkout beta exists to rehearse.
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
      .select('email name role tier grandfathered subscription')
      .lean<{
        email?: string
        name?: string
        role?: UserRole
        tier?: string
        grandfathered?: boolean
        subscription?: IUserSubscription
      } | null>()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Already paying IN THIS MODE. Checking the mode matters: a live subscriber
    // testing on beta must still be able to run a test checkout, and a test
    // subscription must never block a real purchase.
    const sub = user.subscription
    const sameMode = !sub?.mode || sub.mode === cfg.mode
    if (sameMode && (sub?.status === 'active' || sub?.status === 'trialing')) {
      return NextResponse.json({ error: 'already_subscribed' }, { status: 409 })
    }

    // Mid-dunning. This one LOOKS like a member who should be allowed to buy —
    // past_due/unpaid/incomplete all derive to `free`, so the upgrade CTA is
    // showing and nothing above stops them — and letting them through opens a
    // SECOND live subscription on the same Stripe customer. Both then bill; and
    // when dunning finally gives up on the first, its terminal event downgrades
    // a member the second one is charging every month. The way out of a failed
    // payment is a working card, which is the portal, not another purchase.
    if (
      sameMode &&
      (sub?.status === 'past_due' || sub?.status === 'unpaid' || sub?.status === 'incomplete')
    ) {
      return NextResponse.json(
        { error: 'fix_payment_method', status: sub.status, portal: '/api/billing/portal' },
        { status: 409 },
      )
    }

    // Nothing to sell: they already hold Plus for a reason no payment improves.
    // `grandfathered` is the founding-members promise the tier migration wrote
    // (64 of 66 members today), and `admin` is pinned to Plus by deriveTier.
    // Charging either is taking money for access the account already has.
    //
    // The flag is read THROUGH reportedGrandfathered, the same way
    // GET /api/me/entitlements and GET /api/billing/status read it, because the
    // raw flag is not a claim of access — the gates read `tier` and nothing
    // else. A row that is grandfathered but stored on the free tier is being
    // gated as free, so every surface correctly shows it an upgrade CTA; the raw
    // flag here then refused the purchase behind that CTA with `already_plus`
    // and left the member with no way to pay for what they are being denied.
    const grandfathered = reportedGrandfathered(
      user.tier === 'plus' ? 'plus' : 'free',
      user.grandfathered === true,
    )
    const holdsPlusWithoutPaying = grandfathered || user.role === 'admin'

    // ...and the refusal is MODE-SCOPED, for the same reason every other guard
    // in this file is. Unscoped, no admin and none of the 64 grandfathered
    // members could run a TEST checkout on beta, which is the whole team: there
    // was nobody left who could walk the Stripe flow end to end before billing
    // is switched on. A test-mode session spends no money and writes only
    // `subscription.stripeTestCustomerId`, which live state never reads.
    // Live mode still refuses — that is where the double-charge lives.
    if (holdsPlusWithoutPaying && cfg.mode === 'live') {
      return NextResponse.json(
        { error: 'already_plus', reason: user.role === 'admin' ? 'admin' : 'grandfathered' },
        { status: 409 },
      )
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
