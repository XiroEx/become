// PUBLIC route: where Stripe's billing portal returns a member who opened it
// from the NATIVE APP (`POST /api/billing/portal { returnTo: 'app' }`).
//
// The portal is where a card is updated and where a subscription is cancelled,
// and it opens in Safari for a native member — a browser with no session — so
// its return_url cannot be a `/dashboard/*` page either. Whatever they changed
// is already saved with Stripe; this page states that and sends them back.

import type { Metadata } from 'next'
import PublicBillingReturn from '@/components/billing/PublicBillingReturn'

export const metadata: Metadata = {
  title: 'Back from Stripe',
  description: 'Your billing changes are saved with Stripe. Open Become to see your plan.',
  robots: { index: false, follow: false },
}

export default function BillingPortalReturnPage() {
  return (
    <PublicBillingReturn
      kind="portal-return"
      testId="billing-return-portal"
      title="Back from Stripe"
      lines={[
        'Anything you changed in the billing portal — your card, your plan, a cancellation — is saved with Stripe.',
        'Open Become to see where your plan stands. The app checks with Stripe as soon as it opens.',
        'This page is signed out, so it cannot show you your account details.',
      ]}
    />
  )
}
