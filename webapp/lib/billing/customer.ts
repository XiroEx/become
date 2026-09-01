/**
 * Get-or-create the Stripe customer for a member, in one mode.
 *
 * The whole shape exists to survive a double-click. Read-then-create is racy —
 * two concurrent checkout POSTs both read "no customer" and both create one —
 * so the persist is a GUARDED update that only matches a document whose
 * mode-specific field is still empty. Exactly one writer wins; the loser reads
 * back the winner's id and uses that. Its own freshly-created Stripe customer
 * is orphaned, which costs nothing and is logged at warn.
 *
 * Two customers on one member would be a genuine mess: a subscription on one and
 * the portal pointed at the other, so the member cannot cancel what they bought.
 */

import type Stripe from 'stripe'
import type { StripeLike } from './stripeClient'
import type { StripeMode } from './mode'

export interface EnsureCustomerArgs {
  userId: string
  email: string
  name?: string
  mode: StripeMode
  appChannel: string
  stripe: StripeLike
  readCustomerId(userId: string, mode: StripeMode): Promise<string | undefined>
  /** Guarded write. MUST return the id actually stored — the winner's. */
  writeCustomerIdIfAbsent(
    userId: string,
    mode: StripeMode,
    customerId: string,
  ): Promise<{ id: string; won: boolean }>
}

export async function ensureStripeCustomer(args: EnsureCustomerArgs): Promise<string> {
  const existing = await args.readCustomerId(args.userId, args.mode)
  if (existing) return existing

  const params: Stripe.CustomerCreateParams = {
    email: args.email,
    ...(args.name ? { name: args.name } : {}),
    // userId is the join key every webhook falls back to; appChannel makes a
    // beta-created customer identifiable in the Stripe dashboard.
    metadata: { userId: args.userId, appChannel: args.appChannel },
  }

  const created = await args.stripe.customers.create(params)
  const stored = await args.writeCustomerIdIfAbsent(args.userId, args.mode, created.id)

  if (!stored.won) {
    console.warn(
      `[billing] lost customer-create race for user ${args.userId} (${args.mode}); keeping stored customer`,
    )
  }
  return stored.id
}
