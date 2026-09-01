// SERVER-ONLY. The only module that constructs a Stripe client.
//
// Mirrors lib/redis.ts: a lazily-constructed memoized singleton that returns
// null rather than throwing when there is nothing to construct, plus a reset
// hook so tests can re-exercise construction. Routes take the null and answer
// 503; nothing about an unconfigured install is exceptional.
//
// Never log the raw webhook body, the signature header, or any part of a key.
// On a failure the only safe identifiers are event.id and event.type.

import Stripe from 'stripe'
import { getBillingConfig } from './config'

/**
 * ONLY the surface this app actually uses. Route and unit tests inject a fake
 * implementing this, so no test ever needs the SDK, a key, or a socket.
 */
export interface StripeLike {
  customers: {
    create(params: Stripe.CustomerCreateParams): Promise<{ id: string }>
  }
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options?: { idempotencyKey?: string },
      ): Promise<{ id: string; url: string | null }>
      retrieve(id: string): Promise<Stripe.Checkout.Session>
    }
  }
  billingPortal: {
    sessions: {
      create(params: Stripe.BillingPortal.SessionCreateParams): Promise<{ url: string }>
    }
  }
  subscriptions: {
    retrieve(id: string): Promise<Stripe.Subscription>
  }
}

let singleton: StripeLike | null | undefined
let singletonKey: string | undefined

/**
 * Returns null when billing is unconfigured OR when construction itself fails —
 * both mean "no checkout", and both are answered with a 503 rather than a 500.
 *
 * Deliberately does NOT pass `apiVersion`. StripeConfig types it as the literal
 * LatestApiVersion, so any hardcoded date string breaks `tsc` on the next SDK
 * bump; the version the installed SDK pins is correct by construction.
 */
export async function getStripe(): Promise<StripeLike | null> {
  const cfg = await getBillingConfig()
  if (!cfg.configured || !cfg.secretKey) return null

  // Re-memoize when the resolved key changes (a rotated secret, or a test
  // flipping config), so a stale client can never outlive its key.
  const cacheKey = `${cfg.mode}:${cfg.secretKey}`
  if (singleton !== undefined && singletonKey === cacheKey) return singleton

  try {
    singleton = new Stripe(cfg.secretKey, {
      maxNetworkRetries: 2,
      timeout: 15_000,
      appInfo: { name: 'become', url: 'https://become.redbtn.io' },
    })
  } catch (error) {
    console.error('[billing] stripe client construction failed:', (error as Error)?.name)
    singleton = null
  }
  singletonKey = cacheKey
  return singleton
}

export type SignatureResult =
  | { ok: true; event: Stripe.Event }
  | { ok: false; reason: 'unconfigured' | 'missing_signature' | 'invalid_signature' }

/** Injectable for tests that want to exercise the failure branches without HMAC. */
export interface SignatureDeps {
  constructEvent?(payload: string, header: string, secret: string): Stripe.Event
}

/**
 * Verify a webhook payload against the endpoint secret.
 *
 * `Stripe.webhooks` is a STATIC on the class — verification is pure node-crypto
 * HMAC and needs neither a key nor a network, which is what lets the signature
 * test run fully offline against the real SDK.
 *
 * The three refusals are distinct on purpose: 'unconfigured' is our fault,
 * 'missing_signature' is a stray POST, 'invalid_signature' is a tampered or
 * stale delivery. All three answer 400 — never 500, which Stripe retries.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret?: string,
  deps: SignatureDeps = {},
): Promise<SignatureResult> {
  if (!secret) return { ok: false, reason: 'unconfigured' }
  if (!signatureHeader) return { ok: false, reason: 'missing_signature' }

  const construct =
    deps.constructEvent ??
    ((payload: string, header: string, key: string) =>
      Stripe.webhooks.constructEvent(payload, header, key))

  try {
    return { ok: true, event: construct(rawBody, signatureHeader, secret) }
  } catch {
    // Nothing from the failure is safe to log: the message can echo the header.
    return { ok: false, reason: 'invalid_signature' }
  }
}

/** True for the "you have not configured a portal in the dashboard" failure. */
export function isPortalConfigurationError(error: unknown): boolean {
  if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) return false
  return /configuration/i.test(error.message ?? '')
}

/** Safe-to-log shape of a Stripe failure. Never includes the message body. */
export function describeStripeError(error: unknown): string {
  if (error instanceof Stripe.errors.StripeError) return `${error.type}/${error.code ?? 'none'}`
  return (error as Error)?.name ?? 'unknown'
}

// Test-only: drop the memoized client so construction can be re-exercised.
export function __resetStripeClientForTests(): void {
  singleton = undefined
  singletonKey = undefined
}
