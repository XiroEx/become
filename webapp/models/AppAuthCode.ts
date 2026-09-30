import mongoose, { Schema, Document, Model } from 'mongoose'
import crypto from 'crypto'
import { APP_AUTH_CODE_TTL_MS, type AppAuthClaim } from '@/lib/appAuthCode'

/**
 * The storage behind the native sign-in hand-back (see lib/appAuthCode.ts for
 * the rules and why they exist). The mirror of models/HandoffCode.ts, and the
 * same three things are load-bearing:
 *
 *   • THE CODE IS NEVER STORED. Only its SHA-256 is, the way a password never
 *     lives in a row — a code is a bearer credential for sixty seconds and a
 *     dump of this collection must not be a pile of usable ones.
 *   • THE VERIFIER IS NEVER STORED EITHER, and never even sent here until it is
 *     spent: the row carries the CHALLENGE, which is its SHA-256. The app holds
 *     the only copy of the verifier itself.
 *   • CLAIMING IS ONE ATOMIC findOneAndUpdate filtered on `usedAt: null`. Two
 *     callers racing the same code therefore produce exactly one winner;
 *     read-then-write would produce two sessions.
 */

export interface IAppAuthCode extends Document {
  /** SHA-256 of the code. The code itself is returned once and never kept. */
  codeHash: string
  /** The member this code signs in, and the only one it can. */
  userId: string
  /** SHA-256 (base64url) of the verifier the app must present to spend it. */
  challenge: string
  /** Which sign-in produced it. Google today; the shape is not Google-specific. */
  provider: string
  expiresAt: Date
  /** Set by the claim. Non-null means this code is spent. */
  usedAt?: Date | null
  createdAt: Date
}

type AppAuthCodeModel = Model<IAppAuthCode>

const AppAuthCodeSchema = new Schema<IAppAuthCode, AppAuthCodeModel>(
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
    challenge: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      required: true,
      default: 'google',
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
// decided in code by decideAppAuthExchange().
AppAuthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 300 })

const AppAuthCode: AppAuthCodeModel =
  (mongoose.models.AppAuthCode as AppAuthCodeModel) ||
  mongoose.model<IAppAuthCode, AppAuthCodeModel>('AppAuthCode', AppAuthCodeSchema)

/** 256 bits of randomness, URL-safe. Returned once, in one redirect. */
export function generateAppAuthCode(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** What is stored, and what a claim looks a code up by. */
export function hashAppAuthCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

/**
 * The challenge for a verifier: SHA-256, base64url — the same transform the
 * app performs before it sends the challenge (expo/lib/auth/googleSignIn.ts),
 * so the two halves agree without either one ever transmitting the verifier
 * until the exchange.
 */
export function hashAppAuthVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier, 'utf8').digest('base64url')
}

export interface CreatedAppAuthCode {
  code: string
  expiresAt: Date
}

/**
 * Mint a code for one member, bound to one already-validated challenge. The
 * caller is responsible for having put `challenge` through
 * `isAppAuthChallenge` first.
 */
export async function createAppAuthCode(params: {
  userId: string
  challenge: string
  provider?: string
  now?: Date
}): Promise<CreatedAppAuthCode> {
  const now = params.now ?? new Date()
  const code = generateAppAuthCode()
  const expiresAt = new Date(now.getTime() + APP_AUTH_CODE_TTL_MS)
  await AppAuthCode.create({
    codeHash: hashAppAuthCode(code),
    userId: params.userId,
    challenge: params.challenge,
    provider: params.provider ?? 'google',
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
 * Neither expiry nor the challenge is part of the filter, on purpose: an
 * attempt burns the code either way, so a wrong verifier cannot be retried
 * against the same code until it is right. `decideAppAuthExchange` refuses it
 * afterwards.
 */
export async function claimAppAuthCode(
  code: string,
  now: Date = new Date(),
): Promise<AppAuthClaim | null> {
  if (!code || typeof code !== 'string') return null
  const doc = await AppAuthCode.findOneAndUpdate(
    { codeHash: hashAppAuthCode(code), usedAt: null },
    { $set: { usedAt: now } },
    // The row as it stood BEFORE the update — the proof that this call is the
    // one that spent it.
    { returnDocument: 'before' },
  ).lean<IAppAuthCode | null>()
  if (!doc) return null
  return {
    userId: String(doc.userId),
    challenge: String(doc.challenge),
    expiresAt: doc.expiresAt,
  }
}

export default AppAuthCode
