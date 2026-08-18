'use client'

// The doorway to The Becoming — the first thing on the dashboard. Home is
// present tense (what do I do right now); The Becoming is where you started →
// where you are → what's next. One compact card here: the three pillars in a
// glance and the single most useful "work on next" line, tapping through to
// the full page. Reads what the dashboard already fetched (mind summary) plus
// /api/goals.

import Link from 'next/link'
import { ArrowRight, Brain, UtensilsCrossed, Dumbbell, Sparkles } from 'lucide-react'
import type { GoalProgress } from '@/lib/goals/progress'
import type { Suggestion } from '@/lib/goals/suggestions'
import type { MindSummary } from '@/components/dashboard/MindsetCard'
import { fmtUnit } from '@/lib/goals/pace'

const RANK: Record<Suggestion['severity'], number> = { warn: 0, nudge: 1, info: 2, good: 3 }

export function topSuggestion(goals: GoalProgress | null): Suggestion | null {
  if (!goals) return null
  return [goals.nutrition.suggestion, goals.training.suggestion]
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])[0] ?? null
}

function Chip({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5">
      <span className="shrink-0 opacity-90">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60">{label}</p>
        <p className={`truncate text-[12px] font-bold leading-tight ${tone ?? 'text-white'}`}>{value}</p>
        {sub && <p className="truncate text-[10px] leading-tight text-white/65">{sub}</p>}
      </div>
    </div>
  )
}

export default function BecomingDoor({ goals, mind }: { goals: GoalProgress | null; mind: MindSummary | null }) {
  const n = goals?.nutrition
  const t = goals?.training
  const top = topSuggestion(goals)

  const mindChip = mind
    ? { value: `Lv ${mind.level}`, sub: `Ch ${mind.chapter}${mind.chapterName ? ` · ${mind.chapterName}` : ''}` }
    : { value: '—', sub: undefined }
  const nutritionChip = !n ? { value: '—', sub: undefined }
    : !n.target.weight ? { value: 'Set a target', sub: undefined }
    : n.status === 'achieved' ? { value: 'Reached ✓', sub: undefined }
    : n.pace?.status === 'behind' ? { value: `${fmtUnit(n.pace.behindByKg, n.unit)} behind`, sub: `→ ${Math.round(n.target.weight)} ${n.unit}` }
    : n.pace?.status === 'ahead' ? { value: 'Ahead', sub: n.pace.eta ? `${n.pace.eta} to ${Math.round(n.target.weight)}` : undefined }
    : n.pace?.status === 'on' ? { value: 'On pace', sub: n.pace.eta ? `${n.pace.eta} to ${Math.round(n.target.weight)}` : undefined }
    : n.pace?.status === 'done' ? { value: 'At target', sub: undefined }
    : n.direction === 'maintain' ? { value: 'Holding', sub: `${Math.round(n.target.weight)} ${n.unit}` }
    : { value: `→ ${Math.round(n.target.weight)}`, sub: n.unit }
  const trainingChip = !t ? { value: '—', sub: undefined }
    : !t.target.daysPerWeek ? { value: 'Set days', sub: undefined }
    : { value: `${t.thisWeek.done}/${t.target.daysPerWeek}`, sub: t.thisWeek.weekLost ? 'week off track' : t.thisWeek.remaining === 0 ? 'week done' : 'this week' }

  return (
    <Link
      href="/dashboard/mind/becoming"
      data-testid="becoming-door"
      className="block overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 p-3.5 text-white shadow-sm transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">The Becoming</p>
          <p className="truncate text-sm font-bold">Then → now → next, across all three</p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-white/80" />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <Chip icon={<Brain className="h-3.5 w-3.5" />} label="Mind" value={mindChip.value} sub={mindChip.sub} />
        <Chip icon={<UtensilsCrossed className="h-3.5 w-3.5" />} label="Nutrition" value={nutritionChip.value} sub={nutritionChip.sub} tone={n?.pace?.status === 'behind' ? 'text-amber-200' : undefined} />
        <Chip icon={<Dumbbell className="h-3.5 w-3.5" />} label="Training" value={trainingChip.value} sub={trainingChip.sub} tone={t?.thisWeek.weekLost ? 'text-amber-200' : undefined} />
      </div>
      {top && (
        <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-white/85" data-testid="becoming-door-next">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-200" />
          <span className="font-semibold">{top.title}</span>
          <span className="truncate text-white/65">· {top.sub}</span>
        </p>
      )}
    </Link>
  )
}
