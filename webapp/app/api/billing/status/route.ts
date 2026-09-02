import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import type { IUser, IUserSubscription } from '@/models/User'
import { customerIdField } from '@/lib/billing/mode'
import { getBillingConfig, type BillingConfig } from '@/lib/billing/config'
import { describeStripeError, getStripe } from '@/lib/billing/stripeClient'
import { applyBillingOutcome } from '@/lib/billing/apply'
import { mongoApplyDeps } from '@/lib/billing/mongoDeps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/status — what the client needs to render plan state.
 *
 * ALWAYS 200 when authenticated, including when billing is switched off. The
 * UpgradeSheet reads `configured` to choose between a real CTA and its
 * coming-soon note; a 503 here would be indistinguishable from an outage and
 * would show an error where "not yet" is the truth.
 *
 * It never returns a key, a price id, a customer id or a subscription id. The
 * client has no use for any of them and every one of them is a support-channel
 * leak waiting to happen.
 */

/**
 * Optional `?session_id=cs_…` — activate straight from the success redirect
 * instead of waiting on the webhook.
 *
 * Strictly a shortcut: it applies the SAME outcome the webhook would, through
 * the same idempotent path (an event that already landed is dropped by the
 * ordering guard), and every failure is swallowed — the webhook remains the
 * source of truth. It exists so the member is not staring at a free-tier
 * dashboard for the few seconds Stripe takes to call us.
 */
async function activateFromSession(
  userId: string,
  sessionId: string,
  cfg: BillingConfig,
): Promise<void> {
  try {
    const stripe = await getStripe()
    if (!stripe) return

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    // The session id travels in a URL the member can edit. Without this check
    // anyone could paste someone else's session id and claim their subscription.
    if (session.client_reference_id !== userId) return
    if (session.mode !== 'subscription' || session.payment_status === 'unpaid') return

    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    if (!subscriptionId) return

    await applyBillingOutcome(
      {
        kind: 'link',
        ref: { by: 'userId', userId },
        customerId:
          typeof session.customer === 'string' ? session.customer : session.customer?.id,
        subscriptionId,
        mode: cfg.mode,
        eventCreated: typeof session.created === 'number' ? session.created : 0,
      },
      mongoApplyDeps(cfg),
    )
  } catch (error) {
    console.warn('[billing] session activation skipped:', describeStripeError(error))
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cfg = await getBillingConfig()

  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (sessionId && cfg.configured) {
    await activateFromSession(auth.userId, sessionId, cfg)
  }

  await dbConnect()
  const user = await User.findById(auth.userId)
    .select('role tier grandfathered subscription')
    .lean<Pick<IUser, 'role' | 'tier' | 'grandfathered'> & {
      subscription?: IUserSubscription
    } | null>()

  const sub = user?.subscription
  // "Managed" = there is something in THIS mode for the portal to open. A live
  // customer id is useless to a test-mode key and vice versa, so the flag has to
  // be mode-scoped or beta shows a Manage-billing button that 409s.
  const managed = Boolean(sub?.[customerIdField(cfg.mode)])

  return NextResponse.json({
    configured: cfg.configured,
    mode: cfg.mode,
    tier: user?.tier ?? 'free',
    role: user?.role ?? 'user',
    // Presence flags only — a price id is configuration, not client data.
    plans: {
      monthly: Boolean(cfg.prices.monthly),
      annual: Boolean(cfg.prices.annual),
    },
    subscription: {
      status: sub?.status ?? 'none',
      plan: sub?.plan ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      grandfathered: user?.grandfathered === true,
      managed,
    },
  })
}
