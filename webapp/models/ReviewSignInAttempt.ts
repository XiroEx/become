import mongoose, { Schema, Document, Model } from 'mongoose'
import crypto from 'crypto'
import { REVIEW_ATTEMPT_WINDOW_MS, REVIEW_MAX_ATTEMPTS } from '@/lib/reviewSignIn'

/**
 * The rate limit behind the reviewer demo sign-in (see lib/reviewSignIn.ts for
 * the rules and why they exist).
 *
 * One row per attempt, per key. There are two keys on every attempt — the
 * email that was typed and the client address it came from — because either
 * one alone is bypassable: a single attacker rotating addresses would never
 * hit an email limit they share, and one typing many addresses would never hit
 * an address limit. Whichever key is over its budget refuses the attempt.
 *
 * Two things about this collection are load-bearing:
 *
 *   • THE KEY IS NEVER STORED IN THE CLEAR. Only a SHA-256 of it is. A
 *     rate-limit table is otherwise a log of who tried to sign in and from
 *     where, and this one would be a list of addresses that had just been
 *     handed a review code.
 *   • EXPIRY IS DECIDED IN CODE, not by the TTL sweep. mongod runs that about
 *     once a minute, so counting "rows that still exist" would let the window
 *     stretch. The count is always filtered on `at` — the index is
 *     housekeeping, so the collection cannot grow without bound.
 */

export interface IReviewSignInAttempt extends Document {
  /** SHA-256 of `email:<address>` or `ip:<address>`. */
  keyHash: string
  /** When the attempt was made. The window is measured against this. */
  at: Date
  createdAt: Date
}

type ReviewSignInAttemptModel = Model<IReviewSignInAttempt>

const ReviewSignInAttemptSchema = new Schema<IReviewSignInAttempt, ReviewSignInAttemptModel>(
  {
    keyHash: { type: String, required: true, index: true },
    at: { type: Date, required: true },
  },
  { timestamps: true },
)

// Housekeeping only — see the note above. Swept an hour after the row dies,
// which is well past the window it could ever count towards.
ReviewSignInAttemptSchema.index(
  { at: 1 },
  { expireAfterSeconds: Math.ceil(REVIEW_ATTEMPT_WINDOW_MS / 1000) + 3600 },
)

const ReviewSignInAttempt: ReviewSignInAttemptModel =
  (mongoose.models.ReviewSignInAttempt as ReviewSignInAttemptModel) ||
  mongoose.model<IReviewSignInAttempt, ReviewSignInAttemptModel>(
    'ReviewSignInAttempt',
    ReviewSignInAttemptSchema,
  )

/** What is stored, and what a count looks a key up by. */
export function hashAttemptKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/** The two keys every attempt is counted under. */
export function attemptKeys(email: string, clientAddress: string | null): string[] {
  const keys = [`email:${email}`]
  if (clientAddress) keys.push(`ip:${clientAddress}`)
  return keys
}

export interface ReviewAttemptBudget {
  /** The highest number of attempts any one key has already used. */
  priorAttempts: number
  /** Milliseconds until the oldest counted attempt leaves the window. */
  retryAfterMs: number
}

/**
 * How much of the budget the keys on this attempt have already spent, and how
 * long until the oldest of those attempts falls out of the window.
 *
 * Counted BEFORE the attempt is recorded, so `priorAttempts >= MAX` is the
 * refusal — see decideReviewSignIn, which owns that comparison.
 */
export async function readReviewAttemptBudget(
  keys: string[],
  now: Date = new Date(),
): Promise<ReviewAttemptBudget> {
  const windowStart = new Date(now.getTime() - REVIEW_ATTEMPT_WINDOW_MS)
  const hashes = keys.map(hashAttemptKey)
  const rows = await ReviewSignInAttempt.find(
    { keyHash: { $in: hashes }, at: { $gt: windowStart } },
    { keyHash: 1, at: 1 },
  ).lean<Array<{ keyHash: string; at: Date }>>()

  let priorAttempts = 0
  let oldestAt: number | null = null
  for (const hash of hashes) {
    const mine = rows.filter((row) => row.keyHash === hash)
    if (mine.length > priorAttempts) priorAttempts = mine.length
    for (const row of mine) {
      const at = new Date(row.at).getTime()
      if (oldestAt === null || at < oldestAt) oldestAt = at
    }
  }

  const retryAfterMs = oldestAt === null
    ? REVIEW_ATTEMPT_WINDOW_MS
    : Math.max(1, oldestAt + REVIEW_ATTEMPT_WINDOW_MS - now.getTime())

  return { priorAttempts, retryAfterMs }
}

/** Spend one attempt against every key. Every attempt is recorded, valid or not. */
export async function recordReviewAttempt(
  keys: string[],
  now: Date = new Date(),
): Promise<void> {
  if (keys.length === 0) return
  await ReviewSignInAttempt.insertMany(
    keys.map((key) => ({ keyHash: hashAttemptKey(key), at: now })),
  )
}

/**
 * Hand the budget back. Called ONLY after a code was accepted: a reviewer who
 * signs in on a phone, then a tablet, then again after a reinstall must not be
 * locked out by their own successes, and a correct code is not an attack.
 */
export async function clearReviewAttempts(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await ReviewSignInAttempt.deleteMany({ keyHash: { $in: keys.map(hashAttemptKey) } })
}

/** Exported for the tests that pin the budget arithmetic. */
export const REVIEW_ATTEMPT_BUDGET = REVIEW_MAX_ATTEMPTS

export default ReviewSignInAttempt
