import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import {
  loadUserEntitlement,
  hasFeature,
  FEATURE_MIN_TIER,
  type Feature,
} from '@/lib/entitlements'

// GET: returns the current user's role/tier and a per-feature entitlement map.
// Useful for client-side feature gates (e.g. show upsell vs. show form).
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { role, tier } = await loadUserEntitlement(auth.userId)

  const features = (Object.keys(FEATURE_MIN_TIER) as Feature[]).reduce(
    (acc, feature) => {
      acc[feature] = {
        allowed: hasFeature(role, tier, feature),
        requiresTier: FEATURE_MIN_TIER[feature],
      }
      return acc
    },
    {} as Record<Feature, { allowed: boolean; requiresTier: string }>
  )

  return NextResponse.json({ role, tier, features })
}
