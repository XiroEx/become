import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import type { UserRole } from './roles'

export type Tier = 'free' | 'plus' | 'premium' | 'pro'
export const TIERS: Tier[] = ['free', 'plus', 'premium', 'pro']
export const TIER_RANK: Record<Tier, number> = { free: 0, plus: 1, premium: 2, pro: 3 }

export const FEATURE_MIN_TIER = {
  'custom-meals': 'plus',
  'custom-exercises': 'plus',
  'custom-programs': 'premium',
  'share-programs': 'pro',
} as const

export type Feature = keyof typeof FEATURE_MIN_TIER

/**
 * Check whether a user with a given role/tier has access to `feature`.
 * Admins always have access, regardless of tier.
 */
export function hasFeature(role: UserRole, tier: Tier, feature: Feature): boolean {
  if (role === 'admin') return true
  return (TIER_RANK[tier] ?? 0) >= TIER_RANK[FEATURE_MIN_TIER[feature]]
}

export interface UserEntitlement {
  role: UserRole
  tier: Tier
}

/**
 * Fetch the role + tier for a user. Defaults to 'user' / 'pro' if any field is
 * missing from the document — matches the model defaults so existing users
 * (where the field is absent on disk) get the rollout default.
 */
export async function loadUserEntitlement(userId: string): Promise<UserEntitlement> {
  await dbConnect()
  const user = await User.findById(userId).select('role tier').lean<{ role?: UserRole; tier?: Tier }>()
  return {
    role: (user?.role as UserRole) || 'user',
    tier: (user?.tier as Tier) || 'pro',
  }
}

export type RequireFeatureResult =
  | { ok: true; userId: string; email: string; role: UserRole; tier: Tier }
  | { ok: false; response: NextResponse }

/**
 * API guard helper — mirrors the requireAdmin() pattern.
 * Verifies auth, loads role/tier, and returns either { ok: true, ... } or
 * { ok: false, response } on failure.
 */
export async function requireFeature(
  request: NextRequest,
  feature: Feature
): Promise<RequireFeatureResult> {
  const authResult = await verifyAuth(request)
  if (!authResult.success || !authResult.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { role, tier } = await loadUserEntitlement(authResult.userId)
  if (!hasFeature(role, tier, feature)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Feature not available on your tier',
          requiresTier: FEATURE_MIN_TIER[feature],
        },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true,
    userId: authResult.userId,
    email: authResult.email!,
    role,
    tier,
  }
}
