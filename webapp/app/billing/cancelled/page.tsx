// PUBLIC route: where Stripe returns somebody who backed out of a checkout
// started in the NATIVE APP (`POST /api/billing/checkout { returnTo: 'app' }`).
//
// Public for the same reason as /billing/return: the app's checkout opens in
// Safari, which holds no session, and `/dashboard/*` would bounce to /login.
// Nothing was charged, so there is nothing to look up and nothing to activate.

import type { Metadata } from 'next'
import PublicBillingReturn from '@/components/billing/PublicBillingReturn'

export const metadata: Metadata = {
  title: 'Checkout cancelled',
  description: 'The Become checkout was cancelled. Nothing was charged.',
  robots: { index: false, follow: false },
}

export default function BillingCancelledPage() {
  return (
    <PublicBillingReturn
      kind="cancelled"
      testId="billing-return-cancelled"
      title="Checkout cancelled"
      lines={[
        'The checkout was closed before it finished, so nothing was charged and nothing about your plan changed.',
        'Open Become if you would like to try again — everything is exactly as you left it.',
      ]}
    />
  )
}
