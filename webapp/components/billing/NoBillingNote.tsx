// WHAT A MEMBER WITH NOTHING TO MANAGE SEES WHERE THE BUTTON WOULD BE.
//
// "Manage billing" is drawn from `hasManageableBilling()` — whether STRIPE is
// holding a subscription — and for everybody else it was drawn not at all. That
// is right for the BUTTON (a portal button for a member with no Stripe customer
// answers `409 no_customer`, which reads as a broken app) and wrong for the
// SCREEN: the Plan page then had no billing anything on it, so there was no way
// to tell "you are not being billed" from "this app forgot to ship the button".
// It was reported three times as "there is still no button to manage billing at
// all", each time by a member holding a complimentary Plus grant — exactly the
// member the visibility rule excludes, and exactly the member who therefore had
// nothing on screen to read.
//
// So the absence is stated instead of implied. Three rules:
//
//  1. IT IS NOT A BUTTON. Nothing here is pressable, because there is nothing
//     for it to open. "No button that cannot work" is the same rule the plan
//     page applies to checkout.
//  2. IT NEVER SAYS "Manage billing". The Terms, the support page and the
//     renewal line all point at a control by that name; printing that name on a
//     screen where it does nothing points a member at a dead end.
//     `tests/unit/billing/manageBilling.test.tsx` fails if this text ever
//     carries MANAGE_BILLING_LABEL.
//  3. IT NAMES NO TIER, NO CAP AND NO PRICE, so the same sentence is safe on
//     `UnenforcedPlan` — the neutral card the plan page draws while
//     ENTITLEMENTS_ENFORCED is off — under the same launch-day contract as the
//     button it stands in for.
//
// Pure, like ManageBillingButton: props in, markup out, so it can be rendered
// with renderToStaticMarkup in a repo that has no DOM test environment.

import { NO_BILLING_TO_MANAGE_NOTE } from '@/lib/billingCopy'

export interface NoBillingNoteProps {
  className?: string
}

export default function NoBillingNote({ className }: NoBillingNoteProps) {
  return (
    <div className={className} data-testid="no-billing-to-manage">
      <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
        {NO_BILLING_TO_MANAGE_NOTE}
      </p>
    </div>
  )
}
