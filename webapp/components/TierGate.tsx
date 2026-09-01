'use client'

// Wrap a whole surface that a free member may SEE but not USE — today that is
// Vision, which the product wants visible as a teaser rather than hidden.
//
// This is an explanatory lock, not a security boundary: the routes behind it
// refuse independently (app/api/mind/vision POST + PATCH). Its whole job is to
// stop someone walking into a screen whose every action would 403.
//
// Not to be confused with components/FeatureGuard.tsx, which is the admin-only
// "Coming Soon" gate for sections that do not exist yet.

import { useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useEntitlements } from '@/hooks/useEntitlements'
import UpgradeSheet from '@/components/UpgradeSheet'
import {
  FEATURE_LABELS,
  syntheticGate,
  tierLabel,
  type Feature,
  type GatePayload,
  type Tier,
} from '@/lib/entitlementsClient'

export interface TierGateProps {
  feature: Feature
  children: ReactNode
  /** Replace the default locked card. Receives the tier being asked for. */
  teaser?: (ctx: { requiresTier: Tier; open: () => void }) => ReactNode
  /** Optional blurb under the default teaser's title. */
  description?: string
}

export default function TierGate({ feature, children, teaser, description }: TierGateProps) {
  const { data, loading, feature: get } = useEntitlements()
  const [gate, setGate] = useState<GatePayload | null>(null)

  const ent = get(feature)
  const requiresTier: Tier = ent?.requiresTier ?? 'plus'

  // While the snapshot is in flight, draw a neutral placeholder rather than the
  // children: flashing the real surface and then locking it is worse than a
  // beat of nothing, and the module + localStorage caches make this rare.
  if (loading && !data) {
    return (
      <div className="space-y-3" aria-hidden="true">
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      </div>
    )
  }

  // Enforcement off, unknown feature, or allowed → exactly what shipped before.
  if (!data || data.enforced === false || !ent || ent.allowed) return <>{children}</>

  const open = () => setGate(syntheticGate(feature, requiresTier))

  return (
    <>
      {teaser ? (
        teaser({ requiresTier, open })
      ) : (
        <button
          type="button"
          onClick={open}
          className="flex w-full items-start gap-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-5 text-left transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-zinc-700"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800">
            <Lock className="h-5 w-5 text-zinc-400" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {FEATURE_LABELS[feature]}
              </span>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {tierLabel(requiresTier)}
              </span>
            </span>
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
              {description ?? `Included with ${tierLabel(requiresTier)}. Tap to see what you get.`}
            </span>
          </span>
        </button>
      )}

      <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
    </>
  )
}
