// PUBLIC route: where Stripe returns a buyer whose checkout was started in the
// NATIVE APP (`POST /api/billing/checkout { returnTo: 'app' }`).
//
// It is outside `/dashboard` on purpose. A native request carries no Origin and
// no Referer, so the Host decides the return origin and Stripe drops the buyer
// into SAFARI — which holds no session, because `auth_token` is a browser
// cookie the app does not share. `middleware.ts` guards `/dashboard/*`, so the
// plan page would send them to /login seconds after their card was charged.
//
// It reads `session_id` only to hand it back to the app. It does not call
// anything, and it never activates a subscription: the app asks
// `GET /api/billing/status?session_id=` for itself, signed in (NP-054).

import type { Metadata } from 'next'
import PublicBillingReturn from '@/components/billing/PublicBillingReturn'

export const metadata: Metadata = {
  title: 'Payment complete',
  description: 'Your Become checkout is finished. Open the app to see your plan.',
  // A one-time return URL has no business in a search index.
  robots: { index: false, follow: false },
}

export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>
}) {
  const params = await searchParams

  return (
    <PublicBillingReturn
      kind="success"
      testId="billing-return-success"
      title="Payment complete"
      lines={[
        'Stripe has your payment and the checkout is finished. There is nothing left to do on this page.',
        'Open Become and your plan will be up to date — the app checks your subscription with Stripe as soon as it opens.',
        'This page is signed out, so it cannot show you your account or switch anything on. That happens in the app.',
      ]}
      sessionId={params.session_id}
    />
  )
}
