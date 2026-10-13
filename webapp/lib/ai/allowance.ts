import { NextResponse } from 'next/server'
import type { AiUser } from './routeHelpers'
import { requireQuotaForUser } from '@/lib/entitlementGuards'
import { refundAllowance, currentWindowKey, FOLLOW_UP_LIMITS } from '@/lib/allowances'
import type { AllowanceLedger } from '@/lib/allowanceLedger'
import { loadUserEntitlement, FREE_LIMITS, type Feature } from '@/lib/entitlements'
import { mintAllowanceTicket, readAllowanceTicket } from '@/lib/allowanceTicket'
import { mongoRunChargeStore, type RunChargeStore } from '@/lib/ai/runCharge'
import { chargeSpendCap, refundSpendCap, type SpendCapKey } from '@/lib/spendCaps'

/**
 * ─── The one helper every dispatching /api/ai route calls ────────────────────
 *
 * Five rules are encoded here so that no individual route has to remember them.
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
 * RULE 4 — a follow-up rides the outcome it refines. Not "an outcome", THE
 * outcome: the ticket names the run it was minted for, the route says whether
 * the request is shaped like a refinement at all, and the run is spent once.
 * See lib/allowanceTicket.ts and lib/ai/runCharge.ts.
 *
 * RULE 5 — the charge is bound to the dispatch it paid for, so a run that is
 * killed before it executes can be given back. withAllowance() does that at the
 * same moment it mints the next ticket, because that is the one place where the
 * charge and the runId are both in hand.
 *
 * RULE 6 — THE GATE GOES WHERE THE MONEY IS SPENT. A guard on the friendly
 * route in front of a dispatch is not a gate on the dispatch: the mind-sessions
 * wall lived only on /api/mind/session, so a free member locked at 10/10 still
 * POSTed /api/ai/mind/session and got a runId back — the composer ran, on our
 * bill, for someone the paywall had already refused. Same shape for Vision:
 * requireFeature('vision') sat on /api/mind/vision while /api/ai/mind/flow
 * { system: 'vision' } dispatched for a member whose entitlements said
 * vision { allowed: false }. requireAiFeature() below is that missing half.
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
  /**
   * @internal Bind this charge to the run it paid for and mint the follow-up
   * ticket for THAT run. Called by withAllowance(), never by a route.
   */
  sealOutcome?: (runId: string) => Promise<string | undefined>
}

export type AiAllowanceGate = AiAllowanceOk | { ok: false; response: NextResponse }

const noRefund = async (): Promise<void> => {}

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null
}

export interface AiAllowanceOptions {
  /** The `allowanceTicket` exactly as the client sent it. Verified here. */
  followUpTicket?: unknown
  /**
   * Does this request REFINE a prior outcome, or is it a new one?
   *
   * Server-derived, from the route's own body shape — a correction note, a
   * prior estimate — never a flag the client can set. A ticket presented on
   * anything else is ignored and the request is charged as what it is: the
   * proven exploit was a genuine ticket replayed with an unrelated description
   * and no prior estimate, which the server had no way to tell apart from a
   * correction.
   */
  refines?: boolean
  /** @internal Test seam. Production always uses the Mongo-backed store. */
  store?: RunChargeStore
  /** @internal Test seam. Production always reads the Mongo ledger. */
  ledger?: AllowanceLedger
}

export interface FollowUpChain {
  rootRunId: string
  /** The seq the NEXT ticket in this chain carries. */
  nextSeq: number
  /** The outcome whose ticket was spent, and under which id. */
  claimedRunId: string
  jti: string
}

/**
 * Charge a PRICED allowance (the free/plus paywall) for an authenticated AI
 * caller, honouring a follow-up ticket when one is presented AND valid.
 */
export async function requireAiAllowance(
  user: AiUser,
  feature: Feature,
  opts: AiAllowanceOptions = {}
): Promise<AiAllowanceGate> {
  const store = opts.store ?? mongoRunChargeStore
  const chain = await resolveFollowUp(user.userId, feature, opts)

  const gate = await requireQuotaForUser(user.userId, feature, {
    email: user.email,
    followUp: chain !== null,
  })
  if (!gate.ok) {
    // Refused before anything was dispatched, so the ticket is not spent: a
    // claim is only ever kept by a run that went out.
    if (chain) await store.releaseFollowUp({ runId: chain.claimedRunId, jti: chain.jti })
    return gate
  }

  const ticketId = gate.ticketId
  const state = gate.allowance
  const capped = Number.isFinite(state.limit)

  return {
    ok: true,
    // Nothing was queued, so nothing happened: the unit goes back AND the
    // ticket the member spent to get here is un-spent, or their retry of a
    // correction that never dispatched would be charged as a fresh scan.
    refund: async () => {
      if (ticketId) await refundAllowance(ticketId)
      if (chain) await store.releaseFollowUp({ runId: chain.claimedRunId, jti: chain.jti })
    },
    // Only a capped member needs a follow-up ticket: for plus and admin there
    // is nothing for a follow-up to ride. The BINDING still happens for anyone
    // who was charged, because that is what a skipped run is refunded from.
    sealOutcome: (runId: string) =>
      sealOutcome(runId, {
        userId: user.userId,
        feature,
        ticketId,
        mintTicket: capped,
        chain,
        store,
        ledger: opts.ledger,
      }),
    envelope: {
      feature,
      limit: finiteOrNull(state.limit),
      remaining: finiteOrNull(state.remaining),
      resetsAt: state.resetsAt,
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
 * Features that carry no per-window ledger, so asking "may this member use it?"
 * is a READ and can be asked as many times as we like.
 *
 * A windowed feature is deliberately unrepresentable here: 'ai-food-estimate'
 * and 'workout-generation' SPEND a unit when they are checked, so they must go
 * through requireAiAllowance(), which owns the refund and the follow-up ticket.
 * Routing one through this helper would charge it with nothing able to give it
 * back — hence the type, rather than a runtime check that ships first and is
 * discovered later.
 */
export type NonWindowFeature = {
  [K in Feature]: (typeof FREE_LIMITS)[K]['kind'] extends 'window' ? never : K
}[Feature]

export interface AiFeatureOk { ok: true }
export type AiFeatureGate = AiFeatureOk | { ok: false; response: NextResponse }

/**
 * Gate a DISPATCH on the feature it belongs to.
 *
 * The paywall has to sit where the money is spent, not only on the friendlier
 * route in front of it (RULE 6). Every /api/ai route that composes a paid
 * surface takes this in addition to whatever ceiling it charges: the ceiling is
 * an abuse brake that is off in production, and a 429 must never read as an
 * upsell.
 *
 * Nothing is written and nothing is spent — an inventory or milestone allowance
 * is a count of rows the member already owns — so it is safe on a route that
 * may be retried, and safe to ask before a ceiling is charged. It is asked
 * FIRST for exactly that reason: a member the paywall has refused should not
 * also burn a ceiling unit finding that out.
 *
 * Refusals are the canonical 403 (`feature` + `requiresTier`), which is what
 * lib/entitlementsClient.ts#gateFrom parses into the upgrade sheet, so a locked
 * surface raises the upsell instead of looking like an outage.
 */
export async function requireAiFeature(
  user: AiUser,
  feature: NonWindowFeature
): Promise<AiFeatureGate> {
  const gate = await requireQuotaForUser(user.userId, feature, { email: user.email })
  return gate.ok ? { ok: true } : { ok: false, response: gate.response }
}

/**
 * Merge the allowance envelope into a success body WITHOUT touching what is
 * already there. Every existing client keeps working untouched; the ones that
 * care read `allowance`.
 *
 * ASYNC because this is also where the outcome is sealed: the body carries the
 * `runId` of the dispatch that just succeeded, which is the first moment the
 * charge and the outcome exist together. Reading it from the body rather than
 * taking it as an argument keeps every route's call site identical — and a
 * route that returns no runId (nothing was dispatched) simply seals nothing.
 */
export async function withAllowance<T extends object>(
  body: T,
  gate: AiAllowanceOk
): Promise<T & { allowance?: AllowanceEnvelope }> {
  if (!gate.envelope) return body
  const runId = (body as { runId?: unknown }).runId
  const ticket =
    typeof runId === 'string' && runId && gate.sealOutcome
      ? await gate.sealOutcome(runId)
      : undefined
  return { ...body, allowance: { ...gate.envelope, ...(ticket ? { ticket } : {}) } }
}

// ─── Follow-up plumbing ──────────────────────────────────────────────────────

/**
 * Is this request a bounded refinement of an outcome already charged in the
 * CURRENT window? Returns the chain to carry forward, or null.
 *
 * Every clause matters:
 *   • no ticket, or a feature with no follow-ups → a plain charge;
 *   • `refines` false → the request is a NEW outcome however genuine the
 *     ticket is, and a new outcome never rides a previous charge;
 *   • another member's ticket would spend from their allowance; another
 *     feature's would let a cheap charge unlock an expensive one;
 *   • a ticket carrying yesterday's bucket key would let a member keep
 *     refining forever across the reset — so a stale ticket falls through to a
 *     normal charge rather than being rejected, which is the behaviour a member
 *     expects the morning after;
 *   • `seq` bounds the chain independently of the window counter;
 *   • and finally the run itself: it must be one WE dispatched for THIS member,
 *     and it is spent once (lib/ai/runCharge.ts).
 *
 * Every failure means "charge normally", never "reject": the member keeps their
 * correction, they just pay for it.
 *
 * Exported so the rule can be exercised without a database — the route path it
 * runs on needs an authenticated user and a live Mongo, and this decision is
 * the whole of the security property.
 */
export async function resolveFollowUp(
  userId: string,
  feature: Feature,
  opts: AiAllowanceOptions
): Promise<FollowUpChain | null> {
  const cap = FOLLOW_UP_LIMITS[feature] ?? 0
  if (!opts.followUpTicket || !cap) return null
  if (!opts.refines) return null

  const claims = await readAllowanceTicket(opts.followUpTicket)
  if (!claims) return null
  if (claims.userId !== userId || claims.feature !== feature) return null
  if (claims.seq < 1 || claims.seq > cap) return null

  const inCurrentWindow = claims.bucketKey === (await currentBucketKey(userId, feature, opts.ledger))
  if (!inCurrentWindow) return null

  const store = opts.store ?? mongoRunChargeStore
  const claimed = await store.claimFollowUp({
    runId: claims.runId,
    userId,
    jti: claims.jti,
  })
  if (!claimed) return null

  return {
    rootRunId: claims.rootRunId,
    nextSeq: claims.seq + 1,
    claimedRunId: claims.runId,
    jti: claims.jti,
  }
}

/**
 * Tie the charge to the dispatch it paid for, and mint the ticket that lets the
 * member refine THAT dispatch.
 *
 * Both halves have to happen here rather than at charge time, because at charge
 * time the outcome does not exist yet: a ticket minted before the trigger names
 * nothing, which is exactly how one could be replayed against anything.
 *
 * Exported for tests — routes reach it through withAllowance().
 */
export async function sealOutcome(
  runId: string,
  ctx: {
    userId: string
    feature: Feature
    ticketId?: string
    mintTicket: boolean
    chain: FollowUpChain | null
    store: RunChargeStore
    ledger?: AllowanceLedger
  }
): Promise<string | undefined> {
  // The refund binding first: it is what makes a run that never executed
  // refundable, and it matters even for a feature that has no follow-ups.
  if (ctx.ticketId) {
    await ctx.store.bindCharge({ runId, userId: ctx.userId, ticketId: ctx.ticketId })
  }

  if (!ctx.mintTicket || !FOLLOW_UP_LIMITS[ctx.feature]) return undefined
  const bucketKey = await currentBucketKey(ctx.userId, ctx.feature, ctx.ledger)
  if (!bucketKey) return undefined

  const seq = ctx.chain?.nextSeq ?? 1
  if (seq > (FOLLOW_UP_LIMITS[ctx.feature] ?? 0)) return undefined

  return mintAllowanceTicket({
    userId: ctx.userId,
    feature: ctx.feature,
    bucketKey,
    runId,
    rootRunId: ctx.chain?.rootRunId ?? runId,
    seq,
  })
}

/** The window the ledger would charge right now — anchored, so it is the same
 *  key the parent unit landed in even if the member's clock has moved since. */
async function currentBucketKey(
  userId: string,
  feature: Feature,
  ledger?: AllowanceLedger
): Promise<string | null> {
  return currentWindowKey(feature, { userId, ...(ledger ? { ledger } : {}) })
}
