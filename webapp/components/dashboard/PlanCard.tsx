'use client'

// The member's plan, on the dashboard.
//
// LAUNCH-DAY CONTRACT: this renders NOTHING until ENTITLEMENTS_ENFORCED is on.
// The dashboard is the first screen everybody sees, so it is the one place a
// premature counter would be most visible — the `enforced` check is the whole
// reason the monetization work can ship dark.
//
// On free it shows only the four allowances a member actually feels. The other
// six exist in the API response and are deliberately not drawn: a wall of
// meters reads as a paywall, four reads as a plan.

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Card } from '@/components/ui'
import { useEntitlements } from '@/hooks/useEntitlements'
import UpgradeSheet from '@/components/UpgradeSheet'
import {
  FEATURE_LABELS,
  syntheticGate,
  tierLabel,
  type Feature,
  type FeatureEntitlement,
  type GatePayload,
} from '@/lib/entitlementsClient'

/** The four a member feels, in the order they meet them. */
const METERS: { feature: Feature; suffix: string }[] = [
  { feature: 'ai-food-estimate', suffix: 'today' },
  { feature: 'workout-generation', suffix: 'this week' },
  { feature: 'custom-programs', suffix: '' },
  { feature: 'mind-sessions', suffix: '' },
]

function Meter({ ent, label, suffix }: { ent: FeatureEntitlement; label: string; suffix: string }) {
  const limit = ent.limit ?? 0
  if (limit <= 0) return null
  const used = Math.min(ent.used, limit)
  const pct = Math.round((used / limit) * 100)
  const spent = (ent.remaining ?? limit - used) <= 0

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-zinc-600 dark:text-zinc-400">{label}</span>
        <span
          className={`shrink-0 font-medium tabular-nums ${
            spent ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          {used}/{limit}
          {suffix ? ` ${suffix}` : ''}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full transition-all duration-300 ${spent ? 'bg-amber-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function PlanCard() {
  const { data } = useEntitlements()
  const [gate, setGate] = useState<GatePayload | null>(null)

  if (!data || data.enforced === false) return null

  const isPlus = data.tier !== 'free'
  const renews = data.subscription?.currentPeriodEnd
    ? new Date(data.subscription.currentPeriodEnd)
    : null

  if (isPlus) {
    return (
      <Card variant="compact" className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
          <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
            {tierLabel(data.tier)} — everything unlocked
          </h3>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {data.grandfathered
              ? 'Thanks for being here early'
              : renews && !Number.isNaN(renews.getTime())
                ? `Renews ${renews.toLocaleDateString()}`
                : 'No limits on anything'}
          </p>
        </div>
      </Card>
    )
  }

  const rows = METERS.map(({ feature, suffix }) => ({
    feature,
    suffix,
    ent: data.features?.[feature] ?? null,
  })).filter((r) => r.ent !== null && r.ent.limit !== null && r.ent.limit > 0)

  return (
    <>
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Free plan</h2>
          <button
            type="button"
            onClick={() => setGate(syntheticGate('custom-programs', 'plus', 'Everything below, with no limits.'))}
            className="shrink-0 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400"
          >
            See Plus
          </button>
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Meter
              key={r.feature}
              ent={r.ent!}
              label={FEATURE_LABELS[r.feature]}
              suffix={r.suffix}
            />
          ))}
        </div>
      </Card>

      <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
    </>
  )
}
