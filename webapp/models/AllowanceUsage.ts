import mongoose, { Schema, Model, Types } from 'mongoose'

/**
 * The persisted ledger behind every WINDOWED allowance.
 *
 * Inventory allowances ("3 custom exercises") are a live count of rows the
 * member owns, so they need no ledger — deleting one frees a slot. Windowed
 * ones ("1 AI food estimate today", "3 workout generations this week") have
 * nothing to count: the thing being spent is a dispatch that leaves no row
 * behind. This collection IS that row.
 *
 * ONE DOCUMENT PER (user, feature, window). That is the whole design:
 *
 *   • The unique index on {userId, feature, bucketKey} means the upsert can
 *     never produce two rows for one window, so `used` is a single number two
 *     concurrent requests contend for rather than two numbers that each look
 *     fine alone.
 *   • Every charge is one `findOneAndUpdate({$inc}, {new:true})`, and the
 *     decision is taken from the value the increment RETURNED. There is no
 *     read-then-write, so there is no interval in which two racing claims both
 *     see "0 used" against a limit of 1.
 *   • `bucketKey` is a LOCAL-KEY STRING from lib/allowances.ts#windowBucket
 *     ('2026-09-01' / 'W2026-08-31'), never a Date. Bucketing on a raw Date is
 *     the day-marker trap in lib/dayWindow.ts: a member west of UTC would get
 *     their reset at their local 7pm and an evening scan would silently spend
 *     tomorrow's allowance.
 *
 * Rows expire 35 days after the window closes, so a month of shadow-mode data
 * survives long enough to be analysed before the paywall is switched on and
 * then cleans itself up.
 */

/** Recent dedupe keys kept per row. Bounded — the array is written every charge. */
export const DEDUPE_CAP = 50

/** Refund ticket ids kept per row, so a repeated refund is a no-op. */
export const REFUND_LEDGER_CAP = 20

/** How long a closed window's row is kept for analysis before the TTL drops it. */
export const ROW_RETENTION_MS = 35 * 24 * 60 * 60 * 1000

export interface IAllowanceUsage {
  _id?: Types.ObjectId
  userId: Types.ObjectId
  /** A `Feature` for a priced allowance, or a `cap:<key>` spend ceiling. */
  feature: string
  /** windowBucket().key — the member's LOCAL day/week. */
  bucketKey: string
  /** The instant this window rolls over. Client-facing `resetsAt`. */
  resetsAt: Date
  /** Units charged, net of refunds. Never negative. */
  used: number
  /** Follow-up dispatches riding an already-charged outcome (a correction). */
  followUps: number
  /** Refunds issued because a dispatch never started. Diagnostics only. */
  refunds: number
  /**
   * True when the row's FIRST charge landed while ENTITLEMENTS_ENFORCED was
   * off. Set on insert only: a window that opened in shadow mode is reported
   * as shadow even if the switch flips mid-window, which is the honest reading
   * — its early units were never gated.
   */
  shadow: boolean
  /** Dedupe keys already charged in this window (see ConsumeOptions.dedupeKey). */
  dedupes: string[]
  /** Refund tickets already honoured, so refunding twice cannot double-credit. */
  refunded: string[]
  expiresAt: Date
  createdAt?: Date
  updatedAt?: Date
}

const AllowanceUsageSchema = new Schema<IAllowanceUsage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    feature: { type: String, required: true },
    bucketKey: { type: String, required: true },
    resetsAt: { type: Date, required: true },
    used: { type: Number, default: 0, min: 0 },
    followUps: { type: Number, default: 0, min: 0 },
    refunds: { type: Number, default: 0, min: 0 },
    shadow: { type: Boolean, default: false },
    dedupes: { type: [String], default: [] },
    refunded: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

// THE claim key. Unique, so the charge upsert cannot fork one window into two
// rows under concurrency — losing that race surfaces as E11000, which the
// ledger retries exactly once instead of double-counting.
AllowanceUsageSchema.index({ userId: 1, feature: 1, bucketKey: 1 }, { unique: true })

// Every live window for one member in a single index hit (the dashboard peek).
AllowanceUsageSchema.index({ userId: 1, resetsAt: -1 })

// Self-cleaning: rows vanish 35 days after the window they describe closed.
AllowanceUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const AllowanceUsage: Model<IAllowanceUsage> =
  (mongoose.models.AllowanceUsage as Model<IAllowanceUsage>) ||
  mongoose.model<IAllowanceUsage>('AllowanceUsage', AllowanceUsageSchema)

export default AllowanceUsage
