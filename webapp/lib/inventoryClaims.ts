import { Types } from 'mongoose'
import dbConnect from '@/lib/mongodb'
import InventoryClaim, {
  CLAIM_CAP,
  CLAIM_DOC_RETENTION_MS,
  CLAIM_TTL_MS,
} from '@/models/InventoryClaim'

/**
 * ─── The atomic core of an INVENTORY allowance ───────────────────────────────
 *
 * lib/allowanceLedger.ts made windowed allowances safe by never taking a
 * decision from a read: it increments and decides from what the increment
 * returned. Inventory allowances could not copy that, because what they cap is
 * not a counter but a live count of rows the member owns — and that is the
 * whole reason deleting one frees a slot.
 *
 * So the read stays, and this file makes it SAFE to read:
 *
 *     1. push a claim   →  returns every claim in flight, mine last
 *     2. count the rows →  sees everything committed so far
 *     3. decide         →  liveRows + rank <= limit
 *
 * ORDER IS THE WHOLE POINT, and so is the release rule. A claim is released
 * only AFTER the row it paid for is committed, which is what makes the two
 * reads jointly complete: for any competing create C and any claimant A,
 *
 *   • if C released before A pushed, then C's row was committed before A
 *     pushed, so A's COUNT sees it;
 *   • otherwise C's claim was still in the array when A pushed, so A's RANK
 *     counts it.
 *
 * Never neither. A row can be seen twice for a moment (committed but not yet
 * released), which makes the gate briefly one stricter — the safe direction —
 * and never seen zero times, which is the direction that hands out free slots.
 *
 * Ten concurrent creates against a limit of three therefore land three rows
 * instead of ten. Measured on production before the fix; pinned by
 * tests/unit/allowance/inventoryClaims.test.ts after it.
 *
 * NOTHING HERE IS DURABLE. There is no counter to reconcile, no drift to
 * repair, and a claim that is never released simply stops counting after
 * CLAIM_TTL_MS. That matters more than the cap does: a member locked out of
 * creating by a stuck counter has no way to fix it themselves, whereas an
 * over-admitted row is a product problem the abuse caps already cover.
 */

/** Re-exported so callers need one import. */
export { CLAIM_TTL_MS, CLAIM_CAP }

export interface OpenClaim {
  /** This claim's token. Unique within the member's document. */
  token: string
  /**
   * 1-based position among the claims in flight, counting this one — so
   * `rank === 1` means nothing else is in flight and the live count is the
   * whole truth. `liveRows + rank - 1` is "rows that exist, or are being
   * created ahead of me".
   */
  rank: number
  /**
   * Idempotent, and MUST NOT run until the row this claim paid for is
   * committed (or the create has definitively failed). Releasing early
   * reopens exactly the race this file closes.
   */
  release(): Promise<void>
}

export interface InventoryClaimStore {
  open(userId: string, feature: string, now?: Date): Promise<OpenClaim>
}

/** The two primitive operations, injected so the rules above are testable. */
export interface ClaimOps {
  /** Appends `token` and returns the claim array AS IT STANDS AFTER the push. */
  push(q: { userId: string; feature: string; token: string; nowMs: number }): Promise<string[]>
  pull(q: { userId: string; feature: string; token: string }): Promise<void>
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

/**
 * `<epochMs>:<nonce>`.
 *
 * The timestamp is what lets a leaked claim stop counting; the nonce is what
 * keeps two claims minted in the same millisecond distinguishable, so a release
 * `$pull`s exactly one of them. ORDER is never read from the token — see
 * claimRank().
 */
export function mintClaimToken(nowMs: number = Date.now()): string {
  return `${nowMs}:${Math.random().toString(36).slice(2, 10)}`
}

export function claimTimestamp(token: string): number {
  const ms = Number.parseInt(token.slice(0, token.indexOf(':')), 10)
  return Number.isFinite(ms) ? ms : 0
}

function isFresh(token: string, nowMs: number): boolean {
  return claimTimestamp(token) > nowMs - CLAIM_TTL_MS
}

/**
 * How many claims are in flight at or before `mine`, counting `mine`.
 *
 * ORDER COMES FROM THE ARRAY, never from the tokens. `$push` appends, so the
 * array Mongo hands back IS arrival order, and every claimant sees the same
 * one. Ordering by mint time instead would be silently wrong: a burst mints
 * every token inside the same millisecond, so the tie-break would be the random
 * nonce — two racers could each rank themselves first and both spend the same
 * slot. That is the original defect, rebuilt one layer down.
 *
 * `mine` is counted whether or not it appears in `tokens`: a claim that fell
 * off the end of the capped array still belongs to a create that is about to
 * happen, and pretending otherwise would hand out a free slot.
 *
 * Claims older than CLAIM_TTL_MS are ignored. A claim that old has either
 * settled already (its row is in the live count) or leaked, and counting it in
 * either case would make the member's cap stricter than the product promises.
 * Clock skew the other way — a token from the future — reads as fresh, which is
 * the safe direction.
 */
export function claimRank(tokens: readonly string[], mine: string, nowMs: number): number {
  const idx = tokens.lastIndexOf(mine)
  const ahead = (idx < 0 ? tokens : tokens.slice(0, idx)).filter((t) => isFresh(t, nowMs))
  return ahead.length + 1
}

// ─── The open rule ───────────────────────────────────────────────────────────

function isDuplicateKey(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000
}

/**
 * Take a claim, retrying a lost insert race exactly once.
 *
 * The unique {userId, feature} index means two members' first-ever concurrent
 * claims can collide on the upsert: one inserts, the other gets E11000. The
 * document exists by then, so the retry is a plain `$push` and cannot
 * double-claim. Without the retry, the loser gets a 500 on the first create of
 * their life — a failure that only ever appears under concurrency.
 */
export async function openWithRetry(
  ops: ClaimOps,
  q: { userId: string; feature: string; nowMs: number }
): Promise<OpenClaim> {
  const token = mintClaimToken(q.nowMs)
  const push = () => ops.push({ userId: q.userId, feature: q.feature, token, nowMs: q.nowMs })

  let tokens: string[]
  try {
    tokens = await push()
  } catch (err) {
    if (!isDuplicateKey(err)) throw err
    tokens = await push()
  }

  let released = false
  return {
    token,
    rank: claimRank(tokens, token, q.nowMs),
    async release() {
      if (released) return
      released = true
      await ops.pull({ userId: q.userId, feature: q.feature, token })
    },
  }
}

export function claimStoreFrom(ops: ClaimOps): InventoryClaimStore {
  return {
    open(userId, feature, now = new Date()) {
      return openWithRetry(ops, { userId, feature, nowMs: now.getTime() })
    },
  }
}

// ─── Mongo implementation ────────────────────────────────────────────────────

const mongoOps: ClaimOps = {
  async push({ userId, feature, token, nowMs }): Promise<string[]> {
    await dbConnect()
    const doc = await InventoryClaim.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), feature },
      {
        $push: { claims: { $each: [token], $slice: -CLAIM_CAP } },
        $set: { expiresAt: new Date(nowMs + CLAIM_DOC_RETENTION_MS) },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, projection: { claims: 1 } }
    ).lean<{ claims?: string[] } | null>()
    return doc?.claims ?? [token]
  },

  async pull({ userId, feature, token }): Promise<void> {
    await dbConnect()
    await InventoryClaim.updateOne(
      { userId: new Types.ObjectId(userId), feature },
      { $pull: { claims: token } }
    )
  },
}

export const mongoInventoryClaims: InventoryClaimStore = claimStoreFrom(mongoOps)
