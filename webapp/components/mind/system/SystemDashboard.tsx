'use client'

// Shared scaffolding for the Mind system dashboards — the consistent skeleton
// every system uses (hero w/ living stat, "do one now", toolkit cards that
// LAUNCH guided flows, track record). No dead text: every card does something.

import type { LucideIcon } from 'lucide-react'
import { ChevronRight, Play } from 'lucide-react'

export function SystemHero({
  Icon, title, tagline, statValue, statLabel, color, bg,
}: {
  Icon: LucideIcon
  title: string
  tagline: string
  statValue: string | number
  statLabel: string
  color: string
  bg: string
}) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800 ${bg}`}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/70 dark:bg-black/30 ${color}`}>
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white">{title}</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{tagline}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-2xl font-extrabold tabular-nums ${color}`}>{statValue}</p>
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{statLabel}</p>
      </div>
    </div>
  )
}

export function ToolkitCard({
  Icon, title, blurb, onClick, color,
}: {
  Icon: LucideIcon
  title: string
  blurb: string
  onClick: () => void
  color: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 ${color}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{blurb}</p>
      </div>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black">
        <Play className="h-3 w-3 fill-current" />
      </span>
    </button>
  )
}

export interface TrackRecordEntry {
  id: string
  title: string
  kind: string
  createdAt: string
}

const KIND_LABEL: Record<string, string> = {
  'protocol': 'Protocol run',
  'fear-breakdown': 'Fear broken down',
  'pattern-catch': 'Pattern caught',
}

function relDay(d: string): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function TrackRecord({ entries }: { entries: TrackRecordEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400 dark:border-zinc-700">
        Your reps will show up here. Run a tool above — it all counts.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-800 dark:text-zinc-200">{e.title}</p>
            <p className="text-[11px] text-zinc-400">{KIND_LABEL[e.kind] ?? e.kind} · {relDay(e.createdAt)}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" />
        </div>
      ))}
    </div>
  )
}
