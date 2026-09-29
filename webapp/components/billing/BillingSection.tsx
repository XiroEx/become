'use client'

// The Billing section of Settings — the second way into the Stripe portal.
//
// The Plan page is the one the Terms and the support page name, and it is the
// one Stripe returns to after checkout. Settings is where a member actually
// goes looking to stop paying for something, so it carries the same button
// rather than a link to the page that carries it: "as easy to cancel as it was
// to subscribe" (New York GBL 527-a) is measured in taps.
//
// IT RENDERS NOTHING FOR ANYBODY WITHOUT A SUBSCRIPTION. Grandfathered members
// and admins hold Plus with no Stripe customer at all, and free members have
// never had one, so for all of them this section does not exist — no empty
// card, no disabled button, no "you have no plan" row. See
// hasManageableBilling() for exactly who that leaves.
//
// ON THE KILL-SWITCH, deliberately: this does NOT bail on
// `enforced === false`, and it is not an exception to the launch-day contract.
// Billing runs regardless of ENTITLEMENTS_ENFORCED — the switch governs whether
// TIER is enforced, not whether money is real — and this section names no tier,
// no cap and no price. With nothing for sale nobody holds a subscription, so it
// renders for nobody and the app is byte-identical anyway; the one member it
// could ever appear for is one Stripe is charging, and that member must be able
// to cancel whatever the switch says.

import { useCallback, useState } from 'react'
import { useEntitlements } from '@/hooks/useEntitlements'
import { hasManageableBilling } from '@/lib/entitlementsClient'
import { openBillingPortal, type PortalState } from '@/lib/billingPortal'
import { MANAGE_BILLING_LABEL } from '@/lib/legal'
import ManageBillingButton from './ManageBillingButton'

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

  if (!hasManageableBilling(data?.subscription)) return null

  return (
    <section
      id="billing"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
    >
      <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-white">Billing</h2>
      <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
        {MANAGE_BILLING_LABEL} is also on your Plan page.
      </p>
      <ManageBillingButton state={portalState} onOpenPortal={openPortal} showNote />
    </section>
  )
}
