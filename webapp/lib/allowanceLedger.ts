import { Types } from 'mongoose'
import dbConnect from '@/lib/mongodb'
import AllowanceUsage, {
  DEDUPE_CAP,
  REFUND_LEDGER_CAP,
  ROW_RETENTION_MS,
} from '@/models/AllowanceUsage'

/**
 * ─── The atomic core of the allowance system ─────────────────────────────────
 *
 * Everything above this file (allowances.ts, spendCaps.ts, the route helpers)
 * decides POLICY. This file does exactly one thing: move a counter by one, in a
 * single round trip, and hand back the value the increment produced.
 *
 * WHY THAT MATTERS. The obvious implementation — read `used`, compare it to the
 * limit, then write `used + 1` — is wrong under concurrency and wrong in a way
 * that only shows up in production. Two requests arriving together against a
 * limit of 1 both read 0, both conclude they are within the limit, and both
 * spend. Double-tapping a button is enough to trigger it.
 *
 * So the decision is never taken from a read. `charge()` increments FIRST with
 * `{ new: true }` and returns the post-increment value; the caller compares
 * THAT against the limit. Two racing charges get back 1 and 2, and exactly one
 * of them is <= 1. There is no window in between.
 *
 * The interface is separated from the Mongo implementation so the atomicity
 * rules are unit-testable against a fake that models the same contract, with no
 * database — see tests/unit/allowance/ledger.test.ts.
 */

export interface LedgerCounts {
  used: number
  followUps: number
  refunds: number
}

export type LedgerField = 'used' | 'followUps'

export interface ChargeQuery {
  userId: string
  /** A `Feature`, or a `cap:<key>` spend ceiling. */
  feature: string
  /** windowBucket().key — the member's local day/week. */
  bucketKey: string
  /** When this window rolls over; stored on insert for the client's resetsAt. */
  resetsAt: Date
  /** True when ENTITLEMENTS_ENFORCED is off — recorded, never gated. */
  shadow: boolean
  /** Which counter moves. Defaults to 'used'. */
  field?: LedgerField
  /**
   * Collapses repeat charges of ONE outcome into one unit. A charge whose key
   * is already recorded in this window is free and reports `charged: false`.
   * Server-minted only: a client-supplied key would be an unlimited-refill
   * button.
   */
  dedupeKey?: string
}

export interface ChargeResult extends LedgerCounts {
  /** False when a dedupe key matched — nothing moved, nothing to refund. */
  charged: boolean
  /** Present only when `charged`. Pass to giveBack() if the work never started. */
  ticketId?: string
}

export interface WindowAnchor {
  bucketKey: string
  resetsAt: Date
}

export interface AllowanceLedger {
  charge(q: ChargeQuery): Promise<ChargeResult>
  read(q: { userId: string; feature: string; bucketKey: string }): Promise<LedgerCounts | null>
  /** Guarded, idempotent decrement. A ticket already honoured is a no-op. */
  giveBack(ticketId: string): Promise<void>
  /**
   * The most recent window this member has a row in, and when it rolls over.
   *
   * This is what makes the bucket resistant to a clock change — see
   * lib/allowances.ts#anchorWindow. OPTIONAL so that a ledger fake written
   * before it existed still satisfies the interface; a ledger that cannot
   * answer simply gets the unanchored bucket, which is the pre-existing
   * behaviour.
   */
  latest?(q: { userId: string; feature: string }): Promise<WindowAnchor | null>
}

export interface LedgerRow extends LedgerCounts {
  dedupes?: string[]
}

/** The two primitive operations charge() is built from. Injected so the retry
 *  rule below can be exercised without a database. */
export interface LedgerOps {
  bump(q: ChargeQuery): Promise<LedgerCounts>
  readRow(q: { userId: string; feature: string; bucketKey: string }): Promise<LedgerRow | null>
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

interface TicketPayload {
  u: string
  f: string
  b: string
  d?: string
  /** Which counter to give back — a follow-up refund must not credit `used`. */
  fl: LedgerField
  /** Nonce, so two charges in one window produce two distinguishable tickets. */
  n: string
}

/**
 * A refund ticket is an opaque server-side handle, never a capability: it is
 * minted in a route and handed straight back to refundAllowance() in the same
 * request, and it authorises a decrement of a counter the caller just
 * incremented. It never reaches a client, so it needs no signature — the
 * follow-up ticket a CLIENT holds is a different thing entirely and IS signed
 * (lib/allowanceTicket.ts).
 */
export function encodeTicket(p: TicketPayload): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url')
}

export function decodeTicket(ticketId: string): TicketPayload | null {
  try {
    const raw = JSON.parse(Buffer.from(ticketId, 'base64url').toString('utf8')) as TicketPayload
    if (!raw || typeof raw.u !== 'string' || typeof raw.f !== 'string' || typeof raw.b !== 'string') {
      return null
    }
    return { ...raw, fl: raw.fl === 'followUps' ? 'followUps' : 'used' }
  } catch {
    return null
  }
}

function mintTicket(q: ChargeQuery): string {
  return encodeTicket({
    u: q.userId,
    f: q.feature,
    b: q.bucketKey,
    ...(q.dedupeKey ? { d: q.dedupeKey } : {}),
    fl: q.field ?? 'used',
    n: Math.random().toString(36).slice(2, 10),
  })
}

// ─── Mongo implementation ────────────────────────────────────────────────────

function isDuplicateKey(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000
}

function counts(doc: Partial<LedgerCounts> | null | undefined): LedgerCounts {
  return {
    used: doc?.used ?? 0,
    followUps: doc?.followUps ?? 0,
    refunds: doc?.refunds ?? 0,
  }
}

function chargeFilter(q: ChargeQuery) {
  return {
    userId: new Types.ObjectId(q.userId),
    feature: q.feature,
    bucketKey: q.bucketKey,
    // Matches when the array is absent OR does not contain the key, which is
    // exactly "this outcome has not been charged in this window yet".
    ...(q.dedupeKey ? { dedupes: { $ne: q.dedupeKey } } : {}),
  }
}

function chargeUpdate(q: ChargeQuery) {
  return {
    $inc: { [q.field ?? 'used']: 1 },
    $setOnInsert: {
      resetsAt: q.resetsAt,
      expiresAt: new Date(q.resetsAt.getTime() + ROW_RETENTION_MS),
      shadow: q.shadow,
    },
    ...(q.dedupeKey
      ? { $push: { dedupes: { $each: [q.dedupeKey], $slice: -DEDUPE_CAP } } }
      : {}),
  }
}

async function bumpOnce(q: ChargeQuery): Promise<LedgerCounts> {
  const doc = await AllowanceUsage.findOneAndUpdate(chargeFilter(q), chargeUpdate(q), {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    projection: { used: 1, followUps: 1, refunds: 1 },
  }).lean<Partial<LedgerCounts> | null>()
  return counts(doc)
}

/**
 * THE charge rule, separated from Mongo so it can be tested.
 *
 * An upsert against the unique index can fail two ways, and they mean opposite
 * things:
 *
 *   (a) the dedupe filter excluded an existing row, so the upsert tried to
 *       INSERT a duplicate — this outcome was already paid for, and charging
 *       again would bill the member twice for one estimate;
 *   (b) two first-of-the-window charges raced and one lost the insert. The row
 *       exists now, so retrying is a plain $inc and cannot double-count.
 *
 * Retry EXACTLY ONCE. Without the retry, the loser of that race gets a 500 on
 * the very first request of the day — a failure that only appears under
 * concurrency, which is to say in production and never in dev. Without the
 * bound, a pathological row could spin.
 */
export async function chargeWithRetry(ops: LedgerOps, q: ChargeQuery): Promise<ChargeResult> {
  try {
    return { ...(await ops.bump(q)), charged: true, ticketId: mintTicket(q) }
  } catch (err) {
    if (!isDuplicateKey(err)) throw err

    const existing = await ops.readRow({
      userId: q.userId,
      feature: q.feature,
      bucketKey: q.bucketKey,
    })

    if (q.dedupeKey && existing?.dedupes?.includes(q.dedupeKey)) {
      return { ...counts(existing), charged: false }
    }

    return { ...(await ops.bump(q)), charged: true, ticketId: mintTicket(q) }
  }
}

const mongoOps: LedgerOps = {
  bump: bumpOnce,
  async readRow(q): Promise<LedgerRow | null> {
    const doc = await AllowanceUsage.findOne({
      userId: new Types.ObjectId(q.userId),
      feature: q.feature,
      bucketKey: q.bucketKey,
    })
      .select('used followUps refunds dedupes')
      .lean<(Partial<LedgerCounts> & { dedupes?: string[] }) | null>()
    return doc ? { ...counts(doc), dedupes: doc.dedupes ?? [] } : null
  },
}

export const mongoAllowanceLedger: AllowanceLedger = {
  async charge(q: ChargeQuery): Promise<ChargeResult> {
    await dbConnect()
    return chargeWithRetry(mongoOps, q)
  },

  async latest(q): Promise<WindowAnchor | null> {
    await dbConnect()
    // {userId, resetsAt: -1} is an index on the collection, so this is the
    // member's newest row for the feature in one hit.
    const doc = await AllowanceUsage.findOne({
      userId: new Types.ObjectId(q.userId),
      feature: q.feature,
    })
      .sort({ resetsAt: -1 })
      .select('bucketKey resetsAt')
      .lean<{ bucketKey?: string; resetsAt?: Date } | null>()
    if (!doc?.bucketKey || !doc.resetsAt) return null
    return { bucketKey: doc.bucketKey, resetsAt: new Date(doc.resetsAt) }
  },

  async read(q): Promise<LedgerCounts | null> {
    await dbConnect()
    const doc = await AllowanceUsage.findOne({
      userId: new Types.ObjectId(q.userId),
      feature: q.feature,
      bucketKey: q.bucketKey,
    })
      .select('used followUps refunds')
      .lean<Partial<LedgerCounts> | null>()
    return doc ? counts(doc) : null
  },

  async giveBack(ticketId: string): Promise<void> {
    const t = decodeTicket(ticketId)
    if (!t) return
    await dbConnect()
    // Three guards, all in the filter so the whole thing is one atomic update:
    //   • the counter is above zero, so a refund can never drive it negative;
    //   • this ticket has not already been honoured, so refunding twice credits
    //     once (stage 2 promised idempotency by ticket id — this is it);
    //   • the row exists, or there was nothing to give back in the first place.
    await AllowanceUsage.updateOne(
      {
        userId: new Types.ObjectId(t.u),
        feature: t.f,
        bucketKey: t.b,
        [t.fl]: { $gt: 0 },
        refunded: { $ne: ticketId },
      },
      {
        $inc: { [t.fl]: -1, refunds: 1 },
        $push: { refunded: { $each: [ticketId], $slice: -REFUND_LEDGER_CAP } },
        // Release the dedupe key too: the outcome it stood for never happened,
        // so the member's next attempt must be able to charge normally.
        ...(t.d ? { $pull: { dedupes: t.d } } : {}),
      }
    ).catch((err) => {
      console.error('[allowanceLedger] refund failed:', err)
    })
  },
}
