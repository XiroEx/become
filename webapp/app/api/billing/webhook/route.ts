import { NextRequest, NextResponse } from 'next/server'
import { billingNotConfigured, getBillingConfig } from '@/lib/billing/config'
import { verifyStripeSignature } from '@/lib/billing/stripeClient'
import { reduceStripeEvent } from '@/lib/billing/webhookEvents'
import { applyBillingOutcome } from '@/lib/billing/apply'
import { mongoApplyDeps } from '@/lib/billing/mongoDeps'
import { mongoEventClaimStore, withEventClaim } from '@/lib/billing/eventStore'

// constructEvent is node-crypto HMAC — this route can never run on edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/webhook — Stripe's callback.
 *
 * There is NO verifyAuth here and that is correct: the signature IS the auth.
 * middleware.ts only matches /dashboard/:path*, so nothing intercepts this.
 *
 * Order is load-bearing:
 *   1. raw body FIRST. request.json() re-serializes and the HMAC no longer
 *      matches — a webhook that "just stopped verifying" is almost always this.
 *   2. verify, THEN reduce, THEN claim. Claiming before verification would let
 *      an unsigned POST burn a real event id and permanently suppress the
 *      genuine delivery of it.
 *   3. an unhandled type answers 200. A 4xx tells Stripe the delivery failed
 *      and it retries an event we will never act on.
 */
export async function POST(request: NextRequest) {
  const cfg = await getBillingConfig()
  if (!cfg.configured || !cfg.webhookSecret) return billingNotConfigured()

  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  const verified = await verifyStripeSignature(rawBody, signature, cfg.webhookSecret)
  if (!verified.ok) {
    // Never log the body or the header — both are attacker-supplied and the
    // body carries customer PII on a genuine delivery.
    console.warn(`[billing] webhook rejected: ${verified.reason}`)
    return NextResponse.json({ error: verified.reason }, { status: 400 })
  }

  const event = verified.event
  const outcome = reduceStripeEvent(event, cfg)

  if (outcome.kind === 'ignored') {
    return NextResponse.json({ received: true, ignored: outcome.reason })
  }

  try {
    const claimed = await withEventClaim(
      mongoEventClaimStore(),
      event.id,
      event.type,
      cfg.mode,
      () => applyBillingOutcome(outcome, mongoApplyDeps(cfg), event.id),
    )

    if (claimed.duplicate) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    const result = claimed.result
    console.log(
      `[billing] ${event.type} (${event.id}) → ${outcome.kind}: ${
        result.applied ? `applied tier=${result.tier}` : `skipped ${result.reason}`
      }`,
    )
    return NextResponse.json({ received: true, applied: result.applied })
  } catch (error) {
    // 500 so Stripe retries. withEventClaim already released the claim, so the
    // retry can take it again rather than no-opping as a duplicate forever.
    console.error(`[billing] webhook ${event.type} (${event.id}) failed:`, (error as Error)?.message)
    return NextResponse.json({ error: 'webhook_failed' }, { status: 500 })
  }
}
