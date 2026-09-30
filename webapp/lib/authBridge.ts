// The bridge between redAuth-verified identities and Become's own user store.
//
// redAuth proves "this is really this person" (via Google or a passkey) and owns
// the auth identity. We then resolve the Become `User` and mint Become's existing
// JWT — the SAME token shape every other Become auth path produces — so all
// downstream code (verifyAuth, app data keyed by Become userId) just works.
//
// Join key is the STABLE redAuth user id (`User.authId`), not email: emails can
// change, ids don't. We look up by authId first; for a pre-existing magic-link/
// password user we match by email ONCE and backfill authId; otherwise we create.

import crypto from 'crypto'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { signToken } from '@/lib/auth'
import { applePlaceholderEmail, canMatchAppleEmailToMember } from '@/lib/apple/email'
import { canOfferAppleEmailLink } from '@/lib/appleLink'

export interface BridgeIdentity {
  /** Stable redAuth user id — the durable join key. */
  authId: string
  email: string
  name?: string
  avatarUrl?: string
}

export interface BridgeResult {
  token: string
  user: { id: string; name: string; email: string }
  isNew: boolean
}

/** Resolve (link/create) the Become user for a redAuth-verified identity and mint a Become JWT. */
export async function bridgeToBecomeSession(identity: BridgeIdentity): Promise<BridgeResult> {
  await dbConnect()
  const email = identity.email.toLowerCase().trim()
  let isNew = false

  // 1) Durable link by authId.
  let user = identity.authId ? await User.findOne({ authId: identity.authId }) : null

  // 2) Pre-existing account (magic-link/password) → match by email once, backfill authId.
  if (!user) {
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    user = await User.findOne({ email: { $regex: `^${escaped}$`, $options: 'i' } })
    if (user) {
      let dirty = false
      if (identity.authId && !user.authId) { user.authId = identity.authId; dirty = true }
      if (identity.avatarUrl && !user.avatarUrl) { user.avatarUrl = identity.avatarUrl; dirty = true }
      // validateModifiedOnly IS THE SIGN-IN. save() validates every INITIALIZED
      // path, not just the ones this function touched, so a member still
      // holding the pre-collapse tier ('pro'/'premium' — no longer in the
      // enum) would fail validation on a write that only backfills authId.
      // The backfill would then never persist and the same sign-in would fail
      // again on every attempt: Google redirects to /login?error=google,
      // passkey answers 400. That is not behind ENTITLEMENTS_ENFORCED — it
      // lands the moment the enum ships. scripts/migrate-tiers.mjs is the
      // pre-deploy fix for the data; this is the fix for the code, and it has
      // to hold for a row restored from an old backup long after.
      if (dirty) await user.save({ validateModifiedOnly: true })
    }
  }

  // 3) Brand-new user via social/passkey → create with an unusable random password.
  if (!user) {
    user = await User.create({
      name: identity.name?.trim() || email.split('@')[0],
      email,
      password: crypto.randomBytes(24).toString('hex'),
      authId: identity.authId || undefined,
      avatarUrl: identity.avatarUrl,
      onboardingCompleted: false,
    })
    isNew = true
  }

  return mintBecomeSession(user, isNew)
}

/**
 * THE LAST STEP EVERY BRIDGE SHARES. One token shape, one result shape, one
 * place to change either.
 *
 * "One JWT format" is a rule that only holds if there is one line that signs
 * it: Google, passkeys and Sign in with Apple all land here, so a session
 * minted by any of them is indistinguishable downstream from one minted by a
 * magic link — and any check added at sign-in (a pending deletion, say) is
 * added once and travels to all of them.
 */
async function mintBecomeSession(
  user: { _id: unknown; email: string; name: string; role?: string },
  isNew: boolean,
): Promise<BridgeResult> {
  const token = await signToken({ userId: String(user._id), email: user.email, role: user.role || 'user' })
  return { token, user: { id: String(user._id), name: user.name, email: user.email }, isNew }
}

/** A Sign in with Apple identity, already verified against Apple's keys
 *  (lib/apple/identityToken.ts). */
export interface AppleBridgeIdentity {
  /** Apple's `sub` — stable for (this member, this Apple team). */
  sub: string
  email?: string
  emailVerified: boolean
  isPrivateEmail: boolean
  /** From `fullName`, which Apple sends on the FIRST authorization only. */
  name?: string
  /** From the authorization-code exchange, kept so deletion can revoke it. */
  refreshToken?: string
}

export interface AppleBridgeResult extends BridgeResult {
  /** How the member was found. Reported so the route can log it and the
   *  tests can assert that an existing member was MATCHED rather than
   *  re-created with the same data. */
  matchedBy: 'apple_sub' | 'email' | 'created'
  /** The address on the row is a relay alias or our placeholder, so the app
   *  should offer "Already a member? Link your email". */
  canLinkEmail: boolean
}

/**
 * Resolve (link/create) the Become user for an Apple-verified identity and
 * mint the same Become JWT every other path mints.
 *
 * THE ORDER IS THE WHOLE POINT:
 *
 *   1. Apple's SUBJECT. The durable join key; it survives an email change and
 *      a member turning "Hide My Email" on or off.
 *   2. A VERIFIED, REAL email — once, backfilling the subject. This is what
 *      lands an existing member (magic link, Google, passkey) in the account
 *      they already have instead of a fresh one.
 *   3. Create. `onboardingCompleted: false`, an unusable random password, and
 *      a placeholder address when Apple shared none.
 *
 * Step 2 is deliberately NOT tried for a relay address: no member's account is
 * under an alias, so the lookup would miss and the create below would make the
 * duplicate this card exists to prevent. The way back for that member is the
 * email link (lib/appleLink.ts), which proves the real address before moving
 * the identity.
 */
export async function bridgeAppleToBecomeSession(
  identity: AppleBridgeIdentity,
): Promise<AppleBridgeResult> {
  await dbConnect()
  const sub = identity.sub.trim()
  if (!sub) throw new Error('bridgeAppleToBecomeSession: an Apple subject is required')
  const email = identity.email?.toLowerCase().trim() || undefined

  let matchedBy: AppleBridgeResult['matchedBy'] = 'apple_sub'
  // The refresh token is `select: false` on the model; this write path needs
  // it so a re-sign-in can replace a token Apple has rotated.
  let user = await User.findOne({ 'apple.sub': sub }).select('+apple.refreshToken')

  if (!user && canMatchAppleEmailToMember({ ...identity, email })) {
    const escaped = email!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    user = await User.findOne({ email: { $regex: `^${escaped}$`, $options: 'i' } })
      .select('+apple.refreshToken')
    if (user) matchedBy = 'email'
  }

  let isNew = false
  if (user) {
    // Adopt or refresh the identity. validateModifiedOnly for the same reason
    // bridgeToBecomeSession uses it: save() validates every INITIALIZED path,
    // so a member still holding a pre-collapse tier would otherwise fail
    // validation on a write that only attaches an Apple subject — and the
    // same sign-in would then fail on every attempt.
    let dirty = false
    if (!user.apple || user.apple.sub !== sub) {
      user.apple = { sub, isPrivateEmail: identity.isPrivateEmail, linkedAt: new Date() }
      dirty = true
    }
    if (identity.refreshToken && user.apple.refreshToken !== identity.refreshToken) {
      user.apple.refreshToken = identity.refreshToken
      dirty = true
    }
    if (dirty) await user.save({ validateModifiedOnly: true })
  } else {
    user = await User.create({
      name: identity.name?.trim() || (email ? email.split('@')[0] : 'Member'),
      // Apple shares the address on the first authorization only, so a row
      // may have to be created without one. See lib/apple/email.ts.
      email: email || applePlaceholderEmail(sub),
      password: crypto.randomBytes(24).toString('hex'),
      apple: {
        sub,
        refreshToken: identity.refreshToken,
        isPrivateEmail: identity.isPrivateEmail,
        linkedAt: new Date(),
      },
      onboardingCompleted: false,
    })
    matchedBy = 'created'
    isNew = true
  }

  const session = await mintBecomeSession(user, isNew)
  return {
    ...session,
    matchedBy,
    // Only ever offered for an account that has nothing in it yet — see
    // canOfferAppleEmailLink, which is also what the link route enforces.
    canLinkEmail: canOfferAppleEmailLink(user),
  }
}

/**
 * The PUBLIC origin to build redirects from. Behind Traefik, `req.url`/Host is
 * the container's internal bind address (0.0.0.0:PORT), which the browser can't
 * load ("restricted network port"). Prefer the forwarded host, then the
 * configured app URL; never fall back to an internal/loopback host.
 */
export function publicOrigin(req: { headers: Headers }): string {
  const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const host = fwdHost.split(',')[0].trim()
  const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim()
  const bad = !host || host.startsWith('0.0.0.0') || host.startsWith('localhost') || host.startsWith('127.')
  if (!bad) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_APP_URL || 'https://become.redbtn.io'
}

/** Build the Become auth cookie header (mirrors verify-link's 7-day HttpOnly cookie). */
export function authCookie(token: string): string {
  const maxAge = 7 * 24 * 60 * 60
  return `auth_token=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax; ${
    process.env.NODE_ENV === 'production' ? 'Secure;' : ''
  }`
}
