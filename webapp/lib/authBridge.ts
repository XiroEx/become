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
      if (dirty) await user.save()
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

  const token = signToken({ userId: String(user._id), email: user.email, role: user.role || 'user' })
  return { token, user: { id: String(user._id), name: user.name, email: user.email }, isNew }
}

/** Build the Become auth cookie header (mirrors verify-link's 7-day HttpOnly cookie). */
export function authCookie(token: string): string {
  const maxAge = 7 * 24 * 60 * 60
  return `auth_token=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax; ${
    process.env.NODE_ENV === 'production' ? 'Secure;' : ''
  }`
}
