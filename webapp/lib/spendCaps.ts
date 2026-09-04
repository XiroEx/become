import { anchorBucket, windowBucket, windowTzOffset } from '@/lib/allowances'
import { mongoAllowanceLedger, type AllowanceLedger } from '@/lib/allowanceLedger'
import type { UserRole } from '@/lib/roles'

/**
 * ─── Spend ceilings for the AI surfaces that are NOT priced ──────────────────
 *
 * The free/plus paywall covers exactly two metered things: 1 AI food estimate a
 * day and 3 workout generations a week. Everything else the graph dispatches —
 * coach replies, Mind session composition, the food-verification pipeline —
 * costs real money and has no price attached to it. That is fine as a product
 * decision and dangerous as an engineering one, because several of those
 * dispatches happen with NO USER IN THE LOOP:
 *
 *   • lib/mind/precompose.ts composes a session on APP OPEN, silently. Its only
 *     brake is an 8h localStorage stamp — per device, per browser profile, gone
 *     with any storage wipe. Three devices multiply it directly.
 *   • components/mind/MindJourney.tsx auto-fetches suggestions from an effect,
 *     braked by a 12h localStorage cache with the same weakness.
 *   • the food-flag relaunch loop fires up to three dispatches per round,
 *     including the grounded web search that lib/nutrition/flagPolicy.ts calls
 *     "the metered cost in this pipeline, roughly an order of magnitude above
 *     the tokens".
 *
 * A client-side cooldown is not a spend limit. These are the server-side
 * ceilings that are.
 *
 * THEY ARE NOT A PAYWALL, and the difference is load-bearing:
 *   • identical for free and plus — this is runaway spend, not a price;
 *   • a refusal is 429, never a 403 carrying `requiresTier`, so the upgrade
 *     sheet cannot be raised from one (lib/entitlementsClient.ts#gateFrom
 *     requires both `feature` and `requiresTier`, so a 429 correctly falls
 *     through to the caller's ordinary error handling);
 *   • the ceilings sit an order of magnitude above any genuine session, so a
 *     real member never meets one.
 *
 * ENFORCEMENT DEFAULTS OFF. The launch contract is "zero user-visible gating
 * until the switch is flipped", and a cap that refuses a real member on launch
 * day would break it. The counts accrue from day one regardless, so the real
 * distribution is known before ALLOWANCE_ABUSE_CAPS_ENFORCED is ever set — and
 * when a runaway does appear, turning it on is one env var and a restart rather
 * than a deploy.
 */

export interface SpendCap {
  limit: number
  window: 'day' | 'week'
  /** Shown to the member on a refusal. Never an upsell. */
  message: string
}

export const SPEND_CAPS = {
  'coach-message': {
    limit: 300,
    window: 'day',
    message: "You've sent a lot of messages today. Give it a few hours and come back.",
  },
  'mind-composition': {
    limit: 40,
    window: 'day',
    message: "We've built plenty of sessions for you today. Try again tomorrow.",
  },
  'food-verification': {
    limit: 20,
    window: 'day',
    message: "You've sent a lot of food checks today. Try again tomorrow.",
  },
} as const satisfies Record<string, SpendCap>

export type SpendCapKey = keyof typeof SPEND_CAPS

export const SPEND_CAP_KEYS = Object.keys(SPEND_CAPS) as SpendCapKey[]

/**
 * Ledger key. Prefixed so a spend cap can never collide with a `Feature` in the
 * shared AllowanceUsage collection, and so a row's origin is obvious on sight.
 */
export function spendCapLedgerKey(key: SpendCapKey): string {
  return `cap:${key}`
}

/**
 * Read per call (never memoised), the same way entitlementsEnforced() is, so a
 * container env change takes effect on restart without a rebuild and tests can
 * flip it. Default OFF — see the header.
 */
export function abuseCapsEnforced(): boolean {
  const raw = (process.env.ALLOWANCE_ABUSE_CAPS_ENFORCED ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

export interface SpendCapResult {
  allowed: boolean
  key: SpendCapKey
  limit: number
  used: number
  remaining: number
  resetsAt: string | null
  message: string
  /** Present only when a unit was recorded; pass to refundSpendCap(). */
  ticketId?: string
  /** True when the ledger failed and the charge failed OPEN. */
  degraded?: boolean
}

export interface ChargeSpendCapOptions {
  /** admin bypasses every ceiling, exactly as it bypasses every tier gate. */
  role?: UserRole
  /** @internal Test seam. */
  ledger?: AllowanceLedger
  now?: Date
}

/**
 * Record one dispatch against a ceiling and say whether it may proceed.
 *
 * Atomic in the same way every other allowance is: the ledger increments first
 * and the decision reads the value that came back, so two racing dispatches
 * cannot both pass the last slot.
 */
export async function chargeSpendCap(
  userId: string,
  key: SpendCapKey,
  opts: ChargeSpendCapOptions = {}
): Promise<SpendCapResult> {
  const cap = SPEND_CAPS[key]
  const enforced = abuseCapsEnforced()

  const unlimited = (used: number, resetsAt: string | null): SpendCapResult => ({
    allowed: true,
    key,
    limit: cap.limit,
    used,
    remaining: Math.max(0, cap.limit - used),
    resetsAt,
    message: cap.message,
  })

  if (opts.role === 'admin') return unlimited(0, null)

  const now = opts.now ?? new Date()
  const ledger = opts.ledger ?? mongoAllowanceLedger
  const tz = await windowTzOffset(userId)
  // Anchored for the same reason a priced allowance is: the offset behind this
  // is client-written, so a ceiling that followed it could be re-opened by
  // reporting a different timezone. See lib/allowances.ts#anchorBucket.
  const { key: bucketKey, resetsAt } = anchorBucket(
    windowBucket(cap.window, tz, now),
    await ceilingAnchor(ledger, userId, key),
    now
  )
  if (!bucketKey || !resetsAt) return unlimited(0, resetsAt)
  try {
    const res = await ledger.charge({
      userId,
      feature: spendCapLedgerKey(key),
      bucketKey,
      resetsAt: new Date(resetsAt),
      shadow: !enforced,
    })
    const within = res.used <= cap.limit
    return {
      allowed: enforced ? within : true,
      key,
      limit: cap.limit,
      used: res.used,
      remaining: Math.max(0, cap.limit - res.used),
      resetsAt,
      message: cap.message,
      ...(res.ticketId ? { ticketId: res.ticketId } : {}),
    }
  } catch (err) {
    // Fail OPEN: a metering outage must not take the coach offline.
    console.error(`[spendCaps] charge failed for ${key}:`, err)
    return { ...unlimited(0, resetsAt), degraded: true }
  }
}

async function ceilingAnchor(
  ledger: AllowanceLedger,
  userId: string,
  key: SpendCapKey
) {
  if (!ledger.latest) return null
  try {
    return await ledger.latest({ userId, feature: spendCapLedgerKey(key) })
  } catch (err) {
    console.error(`[spendCaps] window anchor read failed for ${key}:`, err)
    return null
  }
}

/** Give a ceiling unit back when the dispatch it paid for never started. */
export async function refundSpendCap(
  ticketId: string,
  ledger: AllowanceLedger = mongoAllowanceLedger
): Promise<void> {
  if (!ticketId) return
  await ledger.giveBack(ticketId)
}
