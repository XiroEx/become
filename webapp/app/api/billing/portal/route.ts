import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { billingNotConfigured, getBillingConfig } from '@/lib/billing/config'
import {
  describeStripeError,
  getStripe,
  isPortalConfigurationError,
} from '@/lib/billing/stripeClient'
import { readCustomerId } from '@/lib/billing/mongoDeps'
import { parseReturnTarget, portalReturnUrl } from '@/lib/billing/urls'

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
 *
 * Body: `{ returnTo?: 'web' | 'app' }`, and it is OPTIONAL — `openBillingPortal`
 * posts no body at all, which parses as 'web' and returns to /dashboard/plan
 * exactly as before. 'app' returns to the PUBLIC page instead, because the
 * portal opens in Safari for a native member and no session lives there.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Every shipped caller sends nothing, so an absent or unparseable body is
    // 'web' and not an error. An unknown value IS an error, for the same reason
    // it is in checkout: silently returning a native member to /dashboard/plan
    // strands them on a sign-in screen.
    const body: unknown = await request.json().catch(() => ({}))
    const returnTo = parseReturnTarget((body as { returnTo?: unknown } | null)?.returnTo)
    if (!returnTo) {
      return NextResponse.json({ error: 'invalid_return_to' }, { status: 400 })
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
      // Same origin rule as checkout: send them back to the host they are
      // actually signed in on, validated against the allow-list — and the same
      // target rule, so a native member returns to the public page.
      return_url: portalReturnUrl(request.headers, returnTo),
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
