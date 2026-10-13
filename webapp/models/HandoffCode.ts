import mongoose, { Schema, Document, Model } from 'mongoose'
import crypto from 'crypto'
import { HANDOFF_CODE_TTL_MS, type HandoffClaim } from '@/lib/authHandoff'

/**
 * The storage behind the one-time session hand-off (see lib/authHandoff.ts for
 * the rules and why they exist).
 *
 * Two things about this collection are load-bearing:
 *
 *   • The CODE IS NEVER STORED. Only its SHA-256 is, the same way a password
 *     never lives in a row — a code is a bearer credential for sixty seconds,
 *     and a dump of this collection must not be a pile of usable ones.
 *   • Claiming is ONE atomic findOneAndUpdate filtered on `usedAt: null`. Two
 *     browsers racing the same code therefore produce exactly one winner;
 *     read-then-write would produce two sessions.
 */

export interface IHandoffCode extends Document {
  /** SHA-256 of the code. The code itself is returned once and never kept. */
  codeHash: string
  /** The member this hand-off belongs to, and the only one it can sign in. */
  userId: string
  /** The allow-listed path this code may land on, and no other. */
  path: string
  expiresAt: Date
  /** Set by the claim. Non-null means this code is spent. */
  usedAt?: Date | null
  createdAt: Date
}

type HandoffCodeModel = Model<IHandoffCode>

const HandoffCodeSchema = new Schema<IHandoffCode, HandoffCodeModel>(
  {
    codeHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    path: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
)

// Housekeeping only: rows are swept a few minutes after they die so the
// collection cannot grow without bound. Expiry is NEVER left to this sweep —
// mongod runs it about once a minute, which would let a dead code work — it is
// decided in code by decideRedemption().
HandoffCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 300 })

const HandoffCode: HandoffCodeModel =
  (mongoose.models.HandoffCode as HandoffCodeModel) ||
  mongoose.model<IHandoffCode, HandoffCodeModel>('HandoffCode', HandoffCodeSchema)

/** 256 bits of randomness, URL-safe. Returned once, to one caller. */
export function generateHandoffCode(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** What is stored, and what a claim looks a code up by. */
export function hashHandoffCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export interface CreatedHandoffCode {
  code: string
  expiresAt: Date
}

/**
 * Mint a code for one member and one already-validated path. The caller is
 * responsible for having put `path` through `normalizeHandoffPath` first.
 */
export async function createHandoffCode(params: {
  userId: string
  path: string
  now?: Date
}): Promise<CreatedHandoffCode> {
  const now = params.now ?? new Date()
  const code = generateHandoffCode()
  const expiresAt = new Date(now.getTime() + HANDOFF_CODE_TTL_MS)
  await HandoffCode.create({
    codeHash: hashHandoffCode(code),
    userId: params.userId,
    path: params.path,
    expiresAt,
    usedAt: null,
  })
  return { code, expiresAt }
}

/**
 * Spend a code, atomically. Returns the row as it stood BEFORE this call — so a
 * non-null answer is proof that THIS call is the one that claimed it — or null
 * when there is no such code or somebody already spent it.
 *
 * Expiry is deliberately NOT part of the filter: an expired code is still
 * burned by the attempt, and `decideRedemption` refuses it afterwards.
 */
export async function claimHandoffCode(
  code: string,
  now: Date = new Date(),
): Promise<HandoffClaim | null> {
  if (!code || typeof code !== 'string') return null
  const doc = await HandoffCode.findOneAndUpdate(
    { codeHash: hashHandoffCode(code), usedAt: null },
    { $set: { usedAt: now } },
    // The row as it stood BEFORE the update — the proof that this call is the
    // one that spent it.
    { returnDocument: 'before' },
  ).lean<IHandoffCode | null>()
  if (!doc) return null
  return {
    userId: String(doc.userId),
    path: String(doc.path),
    expiresAt: doc.expiresAt,
  }
}

export default HandoffCode
