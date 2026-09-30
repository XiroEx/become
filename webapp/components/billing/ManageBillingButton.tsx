'use client'

// THE WAY INTO THE STRIPE BILLING PORTAL — update a card, read an invoice,
// cancel.
//
// The Terms (sections 9 and 10), the support page and the renewal disclosure
// under the buy button all tell a member to "open the Plan page, choose Manage
// billing". Until this component existed that button did not: the only caller
// of POST /api/billing/portal was the upgrade sheet's "Update payment method",
// which appears solely after checkout refuses a member whose card has ALREADY
// failed. An active subscriber saw "You're on Plus" and a renewal date, and
// would have had to email to cancel — which is precisely what New York GBL
// 527-a's "as easy to cancel as it was to subscribe" rule exists to prevent.
//
// Two rules:
//
//  1. THE LABEL IS THE DOCUMENTS' LABEL. It is MANAGE_BILLING_LABEL from
//     lib/legal, the same constant the Terms and the support page interpolate,
//     so a member following a written instruction finds a control with exactly
//     that name on it. Never type the words out here.
//  2. PURE. Props in, markup out — no hook, no fetch. The repo has no DOM test
//     environment, so a button that is only reachable through an effect is a
//     button no test can see; this one renders in
//     tests/unit/billing/manageBilling.test.tsx with renderToStaticMarkup.
//     Whoever mounts it owns the request (see openBillingPortal).

import { CreditCard, Loader2 } from 'lucide-react'
import { MANAGE_BILLING_LABEL, MANAGE_BILLING_PORTAL_NOTE } from '@/lib/legal'
import type { PortalState } from '@/lib/billingPortal'

export interface ManageBillingButtonProps {
  state: PortalState
  onOpenPortal: () => void
  /** Draw the sentence explaining what the portal does. Off inside a compact
   *  card that already carries the plan summary. */
  showNote?: boolean
  className?: string
}

export default function ManageBillingButton({
  state,
  onOpenPortal,
  showNote = false,
  className,
}: ManageBillingButtonProps) {
  return (
    <div className={className} aria-live="polite">
      <button
        type="button"
        onClick={onOpenPortal}
        disabled={state === 'opening'}
        data-testid="manage-billing"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800/60"
      >
        {state === 'opening' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4" />
        )}
        {MANAGE_BILLING_LABEL}
      </button>
      {showNote && (
        <p className="mt-2 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
          {MANAGE_BILLING_PORTAL_NOTE}
        </p>
      )}
      {state === 'failed' && (
        <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Billing didn&apos;t open just now. Try that again in a moment.
        </p>
      )}
    </div>
  )
}
