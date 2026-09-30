/**
 * Pure billing primitives. ZERO imports on purpose — lib/runtimeConfig.ts
 * imports this, so anything pulled in here would be pulled into the config
 * boundary (and into every module that reads config) along with it.
 *
 * The whole file exists because production and beta share ONE MongoDB. Two
 * RedRun workspaces, two Stripe modes, one `user.subscription` document. Every
 * function below is part of keeping a test-mode checkout on beta from granting
 * real, paid access on production.
 */

export type StripeMode = 'test' | 'live'
export type BillingPlan = 'monthly' | 'annual'

export const BILLING_PLANS: readonly BillingPlan[] = ['monthly', 'annual'] as const

export function isPlan(value: unknown): value is BillingPlan {
  return value === 'monthly' || value === 'annual'
}

/**
 * The KEY decides the mode, not the declaration.
 *
 * An explicit `STRIPE_MODE` / `billing.stripeMode` can only break a tie when no
 * key is present, because the key is what actually selects which Stripe account
 * the request hits. Trusting a mislabelled `STRIPE_MODE=test` next to a live key
 * would let the mode guard below wave live money through as if it were a test.
 *
 * Restricted keys (`rk_live_` / `rk_test_`) carry the same prefix convention.
 * Anything unrecognised defaults to 'test' — the safe direction.
 */
export function resolveStripeMode(explicit: unknown, secretKey?: string): StripeMode {
  if (secretKey?.startsWith('sk_live_') || secretKey?.startsWith('rk_live_')) return 'live'
  if (secretKey?.startsWith('sk_test_') || secretKey?.startsWith('rk_test_')) return 'test'
  return explicit === 'live' ? 'live' : 'test'
}

/**
 * Mode-specific customer-id field on `user.subscription`. A member can hold a
 * live customer and a test customer at once (they are different Stripe
 * accounts), so the two ids can never share a field.
 */
export const CUSTOMER_ID_FIELD = {
  live: 'stripeCustomerId',
  test: 'stripeTestCustomerId',
} as const

export function customerIdField(mode: StripeMode): 'stripeCustomerId' | 'stripeTestCustomerId' {
  return CUSTOMER_ID_FIELD[mode]
}

/**
 * May an event in `incoming` mode overwrite subscription state written in
 * `existing` mode?
 *
 * Live state is authoritative. A test-mode event must never clobber it — that
 * is the single rule keeping beta from cancelling a real subscription, or
 * granting one. The reverse IS allowed: real money always wins.
 *
 * Consequence, and it is deliberate: a member who is live-subscribed and then
 * test-subscribes on beta will see beta's changes silently rejected. That reads
 * as "beta is broken" and is not — do not fix it by dropping this guard.
 */
export function canApplyMode(existing: StripeMode | undefined | null, incoming: StripeMode): boolean {
  if (!existing) return true
  if (existing === 'live' && incoming === 'test') return false
  return true
}
