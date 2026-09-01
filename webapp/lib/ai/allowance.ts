import { NextResponse } from 'next/server'
import type { AiUser } from './routeHelpers'
import { requireQuotaForUser } from '@/lib/entitlementGuards'
import {
  refundAllowance,
  windowBucket,
  windowTzOffset,
  FOLLOW_UP_LIMITS,
} from '@/lib/allowances'
import { FREE_LIMITS, loadUserEntitlement, type Feature } from '@/lib/entitlements'
import { mintAllowanceTicket, readAllowanceTicket } from '@/lib/allowanceTicket'
import { chargeSpendCap, refundSpendCap, type SpendCapKey } from '@/lib/spendCaps'

/**
 * ─── The one helper every dispatching /api/ai route calls ────────────────────
 *
 * Four rules are encoded here so that no individual route has to remember them.
 *
 * RULE 1 — one user-requested outcome, one charge, at route entry. The order
 * inside every gated route is fixed: authenticate → parse and validate the body
 * → charge → trigger → refund if the trigger failed. Validating first means a
 * malformed body returns 400 without burning an allowance. Charging before the
 * trigger means the allowance GATES the dispatch rather than merely counting it
 * afterwards.
 *
 * RULE 2 — polling never charges. GET /api/ai/run/<id> is hit every 2s for up
 * to 180s per generation; charging there would bill ~90 units for one estimate.
 * It does not import this module, and tests/unit/allowance/inventory.test.ts
 * asserts that it never starts to.
 *
 * RULE 3 — platform retries never charge. runStore POSTs exactly once and
 * returns null on a network failure; only the POLL retries. Any future retry
 * wrapper must reuse the follow-up ticket rather than re-entering here.
 *
 * RULE 4 — a follow-up rides the outcome it refines. See lib/allowanceTicket.ts.
 */

export interface AllowanceEnvelope {
  feature: Feature
  /** null = uncapped (plus, admin, or enforcement off for an uncapped member). */
  limit: number | null
  remaining: number | null
  resetsAt: string | null
  /** Present for features that allow bounded follow-ups (corrections). */
  ticket?: string
}

export interface AiAllowanceOk {
  ok: true
  envelope?: AllowanceEnvelope
  /**
   * Give the unit back. Call this ONLY on the branch where the trigger itself
   * failed — nothing was queued, so nothing was billed. Never call it for a run
   * that started and then failed: the graph ran, and a client-reported failure
   * is a forgeable free-refill button.
   */
  refund: () => Promise<void>
}

export type AiAllowanceGate = AiAllowanceOk | { ok: false; response: NextResponse }

const noRefund = async (): Promise<void> => {}

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null
}

/**
 * Charge a PRICED allowance (the free/plus paywall) for an authenticated AI
 * caller, honouring a follow-up ticket when one is presented.
 */
export async function requireAiAllowance(
  user: AiUser,
  feature: Feature,
  opts: { followUpTicket?: unknown } = {}
): Promise<AiAllowanceGate> {
  const followUp = await isValidFollowUp(user.userId, feature, opts.followUpTicket)

  const gate = await requireQuotaForUser(user.userId, feature, {
    email: user.email,
    followUp,
  })
  if (!gate.ok) return gate

  const ticketId = gate.ticketId
  const state = gate.allowance
  const capped = Number.isFinite(state.limit)

  return {
    ok: true,
    refund: ticketId ? () => refundAllowance(ticketId) : noRefund,
    envelope: {
      feature,
      limit: finiteOrNull(state.limit),
      remaining: finiteOrNull(state.remaining),
      resetsAt: state.resetsAt,
      // Only a capped member needs one: for plus and admin there is nothing for
      // a follow-up to ride, and minting it would cost a timezone read on every
      // call to answer a question nobody asked.
      ...(capped ? await followUpTicketFor(user.userId, feature) : {}),
    },
  }
}

/**
 * Charge a SPEND CEILING — an abuse cap on an AI surface that carries no price.
 *
 * A refusal is 429, deliberately not the 403 shape: this is not something money
 * fixes, so the upgrade sheet must never be raised from it.
 */
export async function requireSpendCap(
  userId: string,
  key: SpendCapKey
): Promise<AiAllowanceGate> {
  // admin bypasses every ceiling, exactly as it bypasses every tier gate.
  let role: string | undefined
  try {
    role = (await loadUserEntitlement(userId)).role
  } catch {
    role = undefined
  }

  const res = await chargeSpendCap(userId, key, {
    ...(role === 'admin' ? { role: 'admin' as const } : {}),
  })

  if (!res.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: res.message,
          reason: 'rate_limit',
          limit: res.limit,
          remaining: res.remaining,
          resetsAt: res.resetsAt,
        },
        { status: 429 }
      ),
    }
  }

  const ticketId = res.ticketId
  return { ok: true, refund: ticketId ? () => refundSpendCap(ticketId) : noRefund }
}

/**
 * Merge the allowance envelope into a success body WITHOUT touching what is
 * already there. Every existing client keeps working untouched; the ones that
 * care read `allowance`.
 */
export function withAllowance<T extends object>(
  body: T,
  gate: AiAllowanceOk
): T & { allowance?: AllowanceEnvelope } {
  return gate.envelope ? { ...body, allowance: gate.envelope } : body
}

// ─── Follow-up plumbing ──────────────────────────────────────────────────────

/**
 * Is this request a bounded refinement of an outcome already charged in the
 * CURRENT window?
 *
 * Every clause matters. A ticket for another member would let one account spend
 * from another's allowance. A ticket for another feature would let a cheap
 * charge unlock an expensive one. A ticket carrying yesterday's bucket key
 * would let a member keep refining forever across the reset — so a stale ticket
 * falls through to a normal charge rather than being rejected, which is the
 * behaviour a member expects the morning after.
 */
async function isValidFollowUp(
  userId: string,
  feature: Feature,
  raw: unknown
): Promise<boolean> {
  if (!raw || !FOLLOW_UP_LIMITS[feature]) return false
  const claims = await readAllowanceTicket(raw)
  if (!claims) return false
  if (claims.userId !== userId || claims.feature !== feature) return false
  return claims.bucketKey === (await currentBucketKey(userId, feature))
}

async function currentBucketKey(userId: string, feature: Feature): Promise<string | null> {
  const spec = FREE_LIMITS[feature]
  if (spec.kind !== 'window') return null
  return windowBucket(spec.window, await windowTzOffset(userId)).key
}

async function followUpTicketFor(
  userId: string,
  feature: Feature
): Promise<{ ticket?: string }> {
  if (!FOLLOW_UP_LIMITS[feature]) return {}
  const bucketKey = await currentBucketKey(userId, feature)
  if (!bucketKey) return {}
  const ticket = await mintAllowanceTicket({ userId, feature, bucketKey })
  return ticket ? { ticket } : {}
}
