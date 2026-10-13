// SERVER-ONLY. Reads the resolved Stripe config and answers one question every
// billing route opens with: is billing set up at all?
//
// Nothing in here throws. "Not configured" is a normal, expected state — it is
// what the app looks like today and on launch day, and every route degrades to
// a 503 the client already knows how to render as a coming-soon note.

import { NextResponse } from 'next/server'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { isPlan, type BillingPlan, type StripeMode } from './mode'

export { isPlan }
export type { BillingPlan, StripeMode }

export interface BillingConfig {
  /** A secret key is present. Everything else is meaningless without it. */
  configured: boolean
  mode: StripeMode
  secretKey?: string
  webhookSecret?: string
  prices: { monthly?: string; annual?: string }
}

const UNCONFIGURED: BillingConfig = { configured: false, mode: 'test', prices: {} }

/**
 * Never throws. A config-store failure reads as "billing is not configured",
 * which is the same answer as "no keys yet" and produces the same 503 — and any
 * failure severe enough to break getRuntimeConfig() has already 401'd the route
 * at verifyAuth, so swallowing it here hides nothing.
 */
export async function getBillingConfig(): Promise<BillingConfig> {
  let billing: Awaited<ReturnType<typeof getRuntimeConfig>>['billing']
  try {
    billing = (await getRuntimeConfig()).billing
  } catch {
    return UNCONFIGURED
  }

  return {
    configured: Boolean(billing.stripeSecretKey),
    mode: billing.stripeMode,
    secretKey: billing.stripeSecretKey,
    webhookSecret: billing.stripeWebhookSecret,
    prices: {
      monthly: billing.stripePricePlusMonthly,
      annual: billing.stripePricePlusAnnual,
    },
  }
}

export function priceIdForPlan(cfg: BillingConfig, plan: BillingPlan): string | undefined {
  return plan === 'annual' ? cfg.prices?.annual : cfg.prices?.monthly
}

/**
 * Reverse lookup for the webhook. Returns undefined for a price we do not
 * recognise, and the caller MUST tolerate that: status decides tier, never the
 * price id, so renaming a price in the Stripe dashboard can never strand a
 * paying member on the free tier.
 */
export function planForPriceId(
  cfg: BillingConfig,
  priceId?: string | null,
): BillingPlan | undefined {
  if (!priceId) return undefined
  const prices = cfg.prices ?? {}
  if (prices.monthly && priceId === prices.monthly) return 'monthly'
  if (prices.annual && priceId === prices.annual) return 'annual'
  return undefined
}

/** The single source of the "billing isn't switched on" response. */
export function billingNotConfigured(): NextResponse {
  return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
}
