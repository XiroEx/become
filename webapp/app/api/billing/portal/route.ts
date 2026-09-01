import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { billingNotConfigured, getBillingConfig } from '@/lib/billing/config'
import {
  describeStripeError,
  getStripe,
  isPortalConfigurationError,
} from '@/lib/billing/stripeClient'
import { readCustomerId } from '@/lib/billing/mongoDeps'
import { portalReturnUrl } from '@/lib/billing/urls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/portal — a one-time link into Stripe's hosted billing
 * portal, where a member updates a card, sees invoices, or cancels.
 *
 * Cancelling is deliberately NOT an endpoint of our own. Stripe's portal is the
 * only surface that handles proration, tax and dunning correctly, and a
 * hand-rolled cancel button is how an app ends up with a subscription Stripe
 * still bills and a database row that says cancelled.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cfg = await getBillingConfig()
    if (!cfg.configured) return billingNotConfigured()

    const stripe = await getStripe()
    if (!stripe) return billingNotConfigured()

    // Mode-specific: a live customer id is meaningless to a test-mode key.
    const customerId = await readCustomerId(auth.userId, cfg.mode)
    if (!customerId) return NextResponse.json({ error: 'no_customer' }, { status: 409 })

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: portalReturnUrl(),
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    // The portal needs a configuration saved in the Stripe dashboard before it
    // will open at all. Unmapped, that arrives as a generic 500 and reads as a
    // bug in this route rather than a setup step nobody has done yet.
    if (isPortalConfigurationError(error)) {
      console.error('[billing] no billing portal configuration in the Stripe dashboard')
      return NextResponse.json({ error: 'billing_portal_not_configured' }, { status: 503 })
    }
    console.error('[billing] portal failed:', describeStripeError(error))
    return NextResponse.json({ error: 'portal_failed' }, { status: 502 })
  }
}
