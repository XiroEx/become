// "ALREADY A MEMBER? LINK YOUR EMAIL" — the way out of the Hide My Email trap.
//
// THE PROBLEM. A member who already has a Become account (magic link, Google,
// a passkey) signs in with Apple and chooses "Hide My Email". Apple hands us a
// per-app relay alias, which is nobody's account address, so there is nothing
// to match on: `bridgeAppleToBecomeSession` creates a fresh, empty account and
// the member is looking at somebody else's idea of their own app. They now
// have two accounts and no way to say so.
//
// THE FIX, AND WHY IT IS A MAGIC LINK. The only thing that can prove "this
// Apple identity and that existing account are the same person" is control of
// the account's real address — which is exactly what Become's oldest auth path
// already proves. So the offer sends a normal sign-in link to the address the
// member types, and the link carries the intent: when it is verified, the
// Apple subject MOVES onto the account that owns the address, and the
// throwaway row created moments earlier is purged. One account, and the proof
// is the member's inbox rather than our guess.
//
// FOUR RULES, AND THEY ARE ALL HERE
//
//   • THE OFFER IS ONLY EVER MADE ON AN EMPTY ACCOUNT. `canOfferAppleEmailLink`
//     requires an Apple subject, an unusable address (relay or placeholder)
//     AND `onboardingCompleted !== true`. The merge deletes the row it moves
//     the identity off, so it may only ever be a row that has nothing in it:
//     a member who has been using their Apple-created account for a month is
//     not offered a "link" that would delete it.
//   • THE TARGET ADDRESS MUST BE A REAL ONE. Sending a link to a relay alias
//     would be sending it nowhere, and linking the placeholder to itself is a
//     no-op that reads like success.
//   • AN EXISTING ACCOUNT THAT ALREADY HAS A DIFFERENT APPLE IDENTITY IS NOT
//     OVERWRITTEN. Two Apple subjects on one row is not representable (the
//     index is unique), and silently replacing one would sever the OTHER
//     device's sign-in.
//   • THE THROWAWAY ROW IS REMOVED THROUGH THE PURGE PLAN, not an ad-hoc
//     delete. lib/accountPurge.ts is the repo's exhaustive answer to "every
//     row this account owns", and it is checked by a test that walks models/ —
//     so a collection added next month is covered here too, and "ends with one
//     account" cannot quietly become "ends with one account and an orphan".

import mongoose from 'mongoose'
import User, { type IUserApple } from '@/models/User'
import dbConnect from '@/lib/mongodb'
import { purgeAccountData } from '@/lib/accountPurge'
import { PURGE_MODELS } from '@/lib/accountPurgeModels'
import { isApplePlaceholderEmail, isRealMemberAddress } from '@/lib/apple/email'
import { fallbackNameFromEmail, isFallbackName } from '@/lib/displayName'

/** Per-address cooldown on the link email, mirroring send-link's. */
export const APPLE_LINK_COOLDOWN_MS = 30 * 1000

/** The shape both the offer and the route decide on. Lean or hydrated. */
export interface AppleLinkCandidate {
  email?: string | null
  apple?: { sub?: string | null } | null
  onboardingCompleted?: boolean | null
}

/**
 * Should this account be offered "Already a member? Link your email"?
 *
 * All three, every time: an Apple identity (there is nothing to move
 * otherwise), no usable address (a member whose real address Apple shared has
 * already been matched by it), and onboarding not finished — see the rules
 * above for why the last one is load bearing rather than cosmetic.
 */
export function canOfferAppleEmailLink(user: AppleLinkCandidate | null | undefined): boolean {
  if (!user?.apple?.sub) return false
  if (user.onboardingCompleted === true) return false
  const email = user.email ?? ''
  return isApplePlaceholderEmail(email) || !isRealMemberAddress(email)
}

export type AppleLinkRefusal =
  /** The Apple-created row is gone (signed out, purged, already merged). */
  | 'apple_account_gone'
  /** The row is no longer eligible — see canOfferAppleEmailLink. */
  | 'not_linkable'
  /** A relay alias or our own placeholder was typed as the target. */
  | 'not_a_real_address'
  /** The target address is the Apple row's own address. */
  | 'same_account'
  /** The account that owns the address already has a DIFFERENT Apple identity. */
  | 'existing_has_apple'

export interface AppleLinkOutcome {
  ok: boolean
  reason?: AppleLinkRefusal
  /** The account the session must be minted for when `ok`. */
  user?: { _id: unknown; email: string; name: string; role?: string }
  /** True when an EXISTING account adopted the identity and the Apple-created
   *  row was purged; false when the Apple row simply adopted the address
   *  (nobody was registered under it). */
  merged?: boolean
  /** Rows removed with the throwaway account, for the log. */
  purgedRows?: number
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Case-insensitive exact-address lookup, the same way authBridge does it. */
export async function findUserByEmail(email: string) {
  return User.findOne({ email: { $regex: `^${escapeForRegex(normalizeEmail(email))}$`, $options: 'i' } })
    .select('+apple.refreshToken')
}

/**
 * Finish the link: the member has just proved control of `email` by clicking a
 * link sent to it. Move the Apple identity onto the account that owns the
 * address (purging the throwaway row), or — if nobody is registered under it —
 * let the Apple row adopt the address.
 *
 * Returns the account to mint a session for. Never throws for an expected
 * refusal; the caller turns `reason` into a message.
 */
export async function completeAppleEmailLink(input: {
  appleUserId: string
  email: string
}): Promise<AppleLinkOutcome> {
  await dbConnect()
  const email = normalizeEmail(input.email)
  if (!isRealMemberAddress(email)) return { ok: false, reason: 'not_a_real_address' }

  const appleRow = await User.findById(input.appleUserId).select('+apple.refreshToken')
  if (!appleRow) return { ok: false, reason: 'apple_account_gone' }
  if (!canOfferAppleEmailLink(appleRow)) return { ok: false, reason: 'not_linkable' }
  if (normalizeEmail(appleRow.email) === email) return { ok: false, reason: 'same_account' }

  const identity: IUserApple = {
    sub: appleRow.apple!.sub,
    refreshToken: appleRow.apple!.refreshToken,
    isPrivateEmail: appleRow.apple!.isPrivateEmail,
    linkedAt: appleRow.apple!.linkedAt ?? new Date(),
  }

  const existing = await findUserByEmail(email)

  if (!existing) {
    // Nobody is registered under the address. The member typed their real one,
    // so the Apple account takes it — still one account, and now reachable.
    const previousEmail = appleRow.email
    appleRow.email = email
    // Only replace a name nobody chose. Apple's `fullName` arrives on the
    // first authorization and is a real answer; the local part of a
    // placeholder address is not.
    if (isFallbackName(appleRow.name, previousEmail)) {
      appleRow.name = fallbackNameFromEmail(email)
    }
    appleRow.apple!.isPrivateEmail = false
    await appleRow.save({ validateModifiedOnly: true })
    return { ok: true, user: appleRow, merged: false }
  }

  if (String(existing._id) === String(appleRow._id)) {
    return { ok: false, reason: 'same_account' }
  }
  if (existing.apple?.sub && existing.apple.sub !== identity.sub) {
    return { ok: false, reason: 'existing_has_apple' }
  }

  // The existing account adopts the identity FIRST. The unique index on
  // `apple.sub` is what makes the order matter: the subject cannot live on two
  // rows, so the throwaway row has to give it up before the real one takes it.
  //
  // And if the second write fails, the first is PUT BACK. There is no
  // transaction here (the deployment is a standalone mongod, see
  // db/compose.yml), and an identity that ended up on neither row is a member
  // whose next Apple sign-in creates a third account — the exact outcome this
  // file exists to prevent. Leaving it where it was means the offer can simply
  // be made again.
  appleRow.set('apple', undefined)
  await appleRow.save({ validateModifiedOnly: true })

  existing.apple = identity
  try {
    await existing.save({ validateModifiedOnly: true })
  } catch (error) {
    console.error('[apple-link] the existing account refused the identity; putting it back', error)
    appleRow.set('apple', identity)
    await appleRow.save({ validateModifiedOnly: true }).catch((restoreError: unknown) => {
      console.error('[apple-link] AND the restore failed — the Apple identity is on no row', restoreError)
    })
    return { ok: false, reason: 'existing_has_apple' }
  }

  // And the throwaway row goes, through the declared plan rather than a
  // hand-rolled delete. It was created minutes ago with onboarding unfinished,
  // so there is nothing in it — but "nothing" is a claim the purge plan can
  // actually make good on.
  const report = await purgeAccountData({
    models: PURGE_MODELS,
    userId: String(appleRow._id),
    email: appleRow.email,
    objectId: appleRow._id as mongoose.Types.ObjectId,
  })
  if (!report.userDeleted) {
    console.error(
      `[apple-link] the Apple-created row ${String(appleRow._id)} survived the purge`
        + ` (${report.errors} step(s) failed) — the member has two accounts`,
      report.steps.filter((s) => s.error),
    )
  }

  return { ok: true, user: existing, merged: true, purgedRows: report.affected }
}
