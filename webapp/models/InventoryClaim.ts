import mongoose, { Schema, Model, Types } from 'mongoose'

/**
 * The IN-FLIGHT half of an inventory allowance.
 *
 * An inventory allowance ("3 custom foods") is a LIVE COUNT of rows the member
 * owns, and that is deliberate: deleting one frees a slot instantly, with no
 * counter to drift out of step with reality. But a live count is also a READ,
 * and a create route that reads a count, compares it to the limit and then
 * writes a row has a window between the two in which nothing is serialised.
 *
 * That window is not theoretical. Ten concurrent
 * `POST /api/nutrition/foods` from a free member sitting at 0/3 returned 201
 * ten times against a limit of three, on production, reproducibly, from zero,
 * on three separate accounts. Every counted cap had it — custom foods,
 * programs, exercises, meals, sessions — and a delete-then-burst loop made it
 * unbounded.
 *
 * This collection closes the window WITHOUT introducing a durable counter.
 * One document per (member, feature) holds the claims currently in flight:
 *
 *   • A create takes a claim (one atomic `$push` that returns the array as it
 *     stands AFTER the push) and only THEN counts the member's rows. The push
 *     orders concurrent claimants; the count sees every row committed so far.
 *     Because a claim is released only after its row is committed, a competing
 *     create is visible in exactly one of the two — never neither — so the
 *     decision `liveRows + rank <= limit` can never admit more than `limit`.
 *   • The claim is released after the response, so nothing here is durable and
 *     there is no counter to reconcile: the live count remains the only truth
 *     about what the member owns, and DELETING STILL FREES A SLOT IMMEDIATELY.
 *
 * Everything about it is designed to fail SAFE, because a stuck claim would
 * lock a member out of their own data:
 *
 *   • A claim older than CLAIM_TTL_MS stops counting (lib/inventoryClaims.ts),
 *     so a release that never ran — a crashed process, a dropped `after()`
 *     callback — costs at most that long of being one slot stricter, and
 *     nothing at all if the member was not at their cap.
 *   • The array is capped, so a hostile burst cannot grow a document.
 *   • The document itself expires, so the collection holds only members who
 *     created something recently.
 *
 * Windowed allowances ("1 AI estimate a day") have their own, DURABLE ledger —
 * models/AllowanceUsage.ts — because what they spend leaves no row behind to
 * count. These two are deliberately separate: one records what was spent, this
 * one only records what is being spent RIGHT NOW.
 */

/**
 * How long an unreleased claim keeps counting.
 *
 * Long enough that a create can never outlive its own claim (a Next.js route
 * that takes 30s to write one row has bigger problems), short enough that a
 * leaked claim is a blip rather than a lockout.
 */
export const CLAIM_TTL_MS = 30_000

/**
 * Claims retained per (member, feature) document.
 *
 * Bounded so the document cannot grow: `$slice: -CLAIM_CAP` keeps the newest.
 * Well above any honest concurrency — the cap it guards is 3 — and an
 * adversary who really does hold 64 claims open at once has, at worst, one
 * older claim stop counting for them.
 */
export const CLAIM_CAP = 64

/** Idle documents are reaped rather than kept forever. */
export const CLAIM_DOC_RETENTION_MS = 60 * 60 * 1000

export interface IInventoryClaim {
  _id?: Types.ObjectId
  userId: Types.ObjectId
  /** An inventory `Feature` — 'custom-foods', 'custom-meals', … */
  feature: string
  /** In-flight claim tokens, `<epochMs>:<nonce>`. See lib/inventoryClaims.ts. */
  claims: string[]
  expiresAt: Date
  createdAt?: Date
  updatedAt?: Date
}

const InventoryClaimSchema = new Schema<IInventoryClaim>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    feature: { type: String, required: true },
    claims: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

// THE claim key. Unique, so two concurrent first-ever claims cannot fork one
// member's row into two documents — which would hand each racer its own
// private ordering and defeat the whole mechanism. Losing that race surfaces as
// E11000, which lib/inventoryClaims.ts retries exactly once.
InventoryClaimSchema.index({ userId: 1, feature: 1 }, { unique: true })

// Self-cleaning.
InventoryClaimSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const InventoryClaim: Model<IInventoryClaim> =
  (mongoose.models.InventoryClaim as Model<IInventoryClaim>) ||
  mongoose.model<IInventoryClaim>('InventoryClaim', InventoryClaimSchema)

export default InventoryClaim
