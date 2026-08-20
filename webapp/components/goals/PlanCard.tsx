'use client'

// "Your plan" — the nutrition weight goal as a plan: target, chosen pace, ETA,
// and where you stand against the line. Reads /api/goals; editing the pace
// writes it back. Sits on the nutrition goals page (and anywhere else that
// wants the plan in one card).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Target, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { Card } from '@/components/ui'
import PacePicker from '@/components/goals/PacePicker'
import { fmtUnit } from '@/lib/goals/pace'
import type { GoalProgress } from '@/lib/goals/progress'

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` }
}

export default function PlanCard({ className = '' }: { className?: string }) {
  const [data, setData] = useState<GoalProgress | null>(null)
  const [saving, setSaving] = useState(false)
  const tz = new Date().getTimezoneOffset()

  useEffect(() => {
    let cancelled = false
    fetch(`/api/goals?tz=${tz}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then((g: GoalProgress | null) => { if (!cancelled && g) setData(g) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tz])

  const setPace = async (kg: number) => {
    setSaving(true)
    try {
      const res = await fetch('/api/goals', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ pillar: 'nutrition', paceKgPerWeek: kg, tz }) })
      if (res.ok) setData(await res.json())
    } finally { setSaving(false) }
  }

  const n = data?.nutrition
  if (!data) {
    return <Card className={className}><div className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" /></Card>
  }
  if (!n || n.status === 'none' || !n.target.weight) {
    return (
      <Card className={className} data-testid="plan-card">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Your plan</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No target weight yet. Set one in <Link href="/dashboard/settings" className="font-medium text-blue-600 dark:text-blue-400">Settings</Link> and this becomes a plan with a pace and a date.
        </p>
      </Card>
    )
  }
  const unit = n.unit
  const DirIcon = n.direction === 'lose' ? TrendingDown : n.direction === 'gain' ? TrendingUp : Minus
  const p = n.pace
  const status = n.status === 'achieved' || p?.status === 'done' ? 'Reached' : p?.status === 'behind' ? `${fmtUnit(p.behindByKg, unit)} behind` : p?.status === 'ahead' ? `${fmtUnit(p.aheadByKg, unit)} ahead` : p?.status === 'on' ? 'On pace' : null

  return (
    <Card className={className} data-testid="plan-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Your plan</h2>
        {status && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p?.status === 'behind' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>
            {status}
          </span>
        )}
      </div>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
          <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            <DirIcon className="mr-1 inline h-4 w-4 text-zinc-400" />
            {n.now.weight != null ? `${Math.round(n.now.weight)} → ` : ''}{Math.round(n.target.weight)} {unit}
            {p && p.remainingKg > 0 && <span className="text-zinc-500 dark:text-zinc-400"> · {fmtUnit(p.remainingKg, unit)} to go</span>}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {n.baseline.weight != null && n.baseline.date ? `Started ${Math.round(n.baseline.weight)} ${unit} on ${new Date(n.baseline.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
            {p?.etaDate && p.status !== 'done' ? ` · at this pace ${p.eta} → ${new Date(p.etaDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
          </p>
        </div>
      </div>
      {n.direction && n.direction !== 'maintain' && n.status === 'active' && (
        <PacePicker
          unit={unit}
          direction={n.direction}
          valueKgPerWeek={n.target.paceKgPerWeek}
          onChange={setPace}
          latestWeight={n.now.weight}
          targetWeight={n.target.weight}
          disabled={saving}
          compact
        />
      )}
    </Card>
  )
}
