'use client'

// The Billing section of Settings — the second way into the Stripe portal.
//
// The Plan page is the one the Terms and the support page name, and it is the
// one Stripe returns to after checkout. Settings is where a member actually
// goes looking to stop paying for something, so it carries the same button
// rather than a link to the page that carries it: "as easy to cancel as it was
// to subscribe" (New York GBL 527-a) is measured in taps.
//
// THE BUTTON IS STILL ONLY FOR A MEMBER STRIPE IS BILLING. Grandfathered
// members and admins hold Plus with no Stripe customer at all, and a free
// member has never had one; for every one of them the portal answers
// `409 no_customer`, so none of them is offered it. That rule is
// hasManageableBilling() and it has not moved.
//
// WHAT CHANGED IS THE SILENCE. This section used to return null for all of
// them, which meant a member who had just been told by the Terms, the support
// page and the renewal line to "open the Plan page, choose Manage billing"
// could find no billing anything in Settings either, and had no way to tell
// that from a missing feature. It was reported three times. The section now
// always renders once the snapshot has loaded, and `NoBillingNote` states the
// absence in a sentence that is true for every member who sees it.
//
// ON THE KILL-SWITCH, deliberately: this does NOT bail on
// `enforced === false`, and it is not an exception to the launch-day contract.
// Billing runs regardless of ENTITLEMENTS_ENFORCED — the switch governs whether
// TIER is enforced, not whether money is real — and this section names no tier,
// no cap and no price, in either of its two states.

import { useCallback, useState } from 'react'
import { useEntitlements } from '@/hooks/useEntitlements'
import { hasManageableBilling } from '@/lib/entitlementsClient'
import { openBillingPortal, type PortalState } from '@/lib/billingPortal'
import { MANAGE_BILLING_LABEL } from '@/lib/legal'
import { BILLING_HEADING } from '@/lib/billingCopy'
import ManageBillingButton from './ManageBillingButton'
import NoBillingNote from './NoBillingNote'

export default function BillingSection() {
  const { data } = useEntitlements()
  const [portalState, setPortalState] = useState<PortalState>('idle')

  const openPortal = useCallback(async () => {
    setPortalState('opening')
    // Navigates on success, so the 'opening' state is the last thing this
    // component ever renders in the happy path.
    const opened = await openBillingPortal()
    if (!opened) setPortalState('failed')
  }, [])

  // No snapshot yet (cold first paint, or signed out). Nothing is known about
  // this member's billing, and guessing out loud in either direction is worse
  // than waiting a beat — so this is the one case that still return nulls.
  if (!data) return null

  const manageable = hasManageableBilling(data?.subscription)

  return (
    <section
      id="billing"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
    >
      <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-white">
        {BILLING_HEADING}
      </h2>
      {manageable ? (
        <>
          <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
            {MANAGE_BILLING_LABEL} is also on your Plan page.
          </p>
          <ManageBillingButton state={portalState} onOpenPortal={openPortal} showNote />
        </>
      ) : (
        <NoBillingNote className="mt-1" />
      )}
    </section>
  )
}
