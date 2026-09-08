import type { Metadata } from 'next'
// SERVER COMPONENT, and that is the whole point of the split.
//
// FREE_LIMITS and FEATURE_MIN_TIER are the source of truth for what a free
// member actually gets, and they live in lib/entitlements.ts — which imports
// mongoose, the User model and next/server. Importing it from a client
// component would drag all of that into the browser bundle, so the numbers are
// read HERE and handed across as plain props. Nothing on this page is typed out
// by hand: add a feature to FEATURE_MIN_TIER and it appears in the table on the
// next build, with its real allowance.
import { FEATURES, FREE_LIMITS, FEATURE_MIN_TIER } from '@/lib/entitlements'
import { MAX_CHAPTER, SESSIONS_PER_CHAPTER } from '@/lib/mindXP'
import type { PlanFeatureRow } from '@/lib/planCopy'
import PlanPageClient from './PlanPageClient'

export const metadata: Metadata = { title: 'Plan' }

const ROWS: PlanFeatureRow[] = FEATURES.map((feature) => ({
  feature,
  requiresTier: FEATURE_MIN_TIER[feature],
  limit: FREE_LIMITS[feature].limit,
  kind: FREE_LIMITS[feature].kind,
  window: FREE_LIMITS[feature].window,
}))

/** The whole Mind path, so "first 10" can be shown against what it is part of. */
const MIND_TOTAL_SESSIONS = SESSIONS_PER_CHAPTER * MAX_CHAPTER

export default function PlanPage() {
  return <PlanPageClient rows={ROWS} mindTotalSessions={MIND_TOTAL_SESSIONS} />
}
