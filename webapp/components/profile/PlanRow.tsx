'use client'

// "Plan — Free / Plus" in the profile's settings-row list. The always-visible
// entry point to the upgrade sheet, for someone who never hit a gate.
//
// Like every other tier surface it renders nothing while ENTITLEMENTS_ENFORCED
// is off, so the profile page is byte-identical to today until the flip.

import { useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { useEntitlements } from '@/hooks/useEntitlements'
import UpgradeSheet from '@/components/UpgradeSheet'
import { syntheticGate, tierLabel, type GatePayload } from '@/lib/entitlementsClient'

export default function PlanRow() {
  const { data } = useEntitlements()
  const [gate, setGate] = useState<GatePayload | null>(null)

  if (!data || data.enforced === false) return null

  const isPlus = data.tier !== 'free'

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setGate(syntheticGate('custom-programs', 'plus', 'Everything in Become, with no limits.'))
        }
        className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
      >
        <span className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <span className="text-sm font-medium text-zinc-900 dark:text-white">Plan</span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isPlus
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}
          >
            {tierLabel(data.tier)}
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-400" />
        </span>
      </button>

      <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
    </>
  )
}
