import type { Tier } from '@/lib/entitlements'
import type { IUserSubscription } from '@/models/User'
import type { UserRole } from '@/lib/roles'

/**
 * Grace on a stale currentPeriodEnd, so ONE missed webhook does not downgrade a
 * paying member mid-session. Applies to active/trialing only — a genuinely
 * lapsed sub keeps Plus for at most this long if Stripe never sends the event.
 */
export const SUBSCRIPTION_GRACE_MS = 3 * 24 * 60 * 60 * 1000

export interface DeriveTierInput {
  subscription?: IUserSubscription | null
  grandfathered?: boolean
  /** Admin override. role:'admin' pins plus so admin tooling never self-locks. */
  role?: UserRole
  now?: Date
}

/**
 * PURE. The single definition of "what tier does this billing state mean".
 *
 * WRITERS ONLY — the billing webhook, admin tooling, and
 * scripts/migrate-tiers.mjs call this and persist the result into User.tier.
 * Request-path readers use loadUserEntitlement(), which reads the stored tier.
 * Deriving on read would grandfather people automatically, which is forbidden;
 * lib/entitlements.ts deliberately does not import this module.
 */
export function deriveTier(input: DeriveTierInput): Tier {
  const now = (input.now ?? new Date()).getTime()
  if (input.role === 'admin') return 'plus'
  if (input.grandfathered === true) return 'plus'

  const sub = input.subscription
  if (!sub) return 'free'
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null

  switch (sub.status) {
    case 'active':
    case 'trialing':
      // A period that lapsed well past the grace means the webhook never came.
      if (end !== null && Number.isFinite(end) && end + SUBSCRIPTION_GRACE_MS < now) return 'free'
      return 'plus'
    case 'canceled':
      // They paid through the period; honor it, with no grace past the end.
      return end !== null && Number.isFinite(end) && end > now ? 'plus' : 'free'
    case 'past_due': // explicitly NOT plus — a lapsed payment is not access
    case 'incomplete':
    case 'unpaid':
    case 'none':
    default:
      return 'free'
  }
}

/** Convenience for the billing webhook: what to $set on the user document. */
export function tierUpdateFor(input: DeriveTierInput): { tier: Tier } {
  return { tier: deriveTier(input) }
}
