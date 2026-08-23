'use client'

// The doorway to The Becoming — the first thing on the dashboard. Home is
// present tense (what do I do right now); The Becoming is where you started →
// where you are → what's next. One compact card here: the three pillars in a
// glance and the single most useful "work on next" line, tapping through to
// the full page. Reads what the dashboard already fetched (mind summary) plus
// /api/goals.

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { ArrowRight, Brain, UtensilsCrossed, Dumbbell, Sparkles, Compass } from 'lucide-react'
import type { GoalProgress } from '@/lib/goals/progress'
import type { Suggestion } from '@/lib/goals/suggestions'
import type { MindSummary } from '@/components/dashboard/MindsetCard'
import { PILLAR } from '@/lib/pillarColors'
import { fmtUnit } from '@/lib/goals/pace'

const RANK: Record<Suggestion['severity'], number> = { warn: 0, nudge: 1, info: 2, good: 3 }

/** The card's own classes: purple + pulsing while a new week sits unread, calm once opened. */
export function doorClassName(loud: boolean): string {
  const tone = loud
    ? 'bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md shadow-violet-500/20 becoming-door-pulse'
    : 'border border-zinc-200 bg-white text-zinc-900 shadow-sm hover:border-violet-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:hover:border-violet-700'
  return `block overflow-hidden rounded-2xl p-3.5 transition-transform active:scale-[0.99] ${tone}`
}

export function topSuggestion(goals: GoalProgress | null): Suggestion | null {
  if (!goals) return null
  return [goals.nutrition.suggestion, goals.training.suggestion]
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])[0] ?? null
}

/** This week's Sunday key, in the member's local zone. */
function localWeekKey(): string {
  const d = new Date(); d.setDate(d.getDate() - d.getDay())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * "Unread" = a new week has closed (it is a new week) and The Becoming has not
 * been opened since. Read after mount so server and client agree.
 */
function readUnread(): boolean {
  try {
    const seenThisWeek = !!localStorage.getItem(`becoming.seen.${localWeekKey()}`)
    const everSeen = Object.keys(localStorage).some(k => k.startsWith('becoming.seen.') || k.startsWith('becoming.intro.'))
    // Loud only when there is a history to catch up on: opened before, not yet this week.
    return !seenThisWeek && everSeen
  } catch { return false }
}
function useUnread(): boolean {
  // Server snapshot false → calm on the server and on the first client paint; the
  // real value lands with hydration (no mismatch, no setState-in-effect).
  return useSyncExternalStore(() => () => {}, readUnread, () => false)
}

function Chip({ icon, label, value, sub, tone, loud, ink }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string; loud: boolean; ink?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 ${loud ? 'bg-white/10' : 'bg-zinc-50 dark:bg-zinc-800/60'}`}>
      <span className={`shrink-0 ${loud ? 'opacity-90' : ink ?? 'text-zinc-500 dark:text-zinc-400'}`}>{icon}</span>
      <div className="min-w-0">
        <p className={`text-[9px] font-semibold uppercase tracking-widest ${loud ? 'text-white/60' : 'text-zinc-400 dark:text-zinc-500'}`}>{label}</p>
        <p className={`truncate text-[12px] font-bold leading-tight ${tone ?? (loud ? 'text-white' : 'text-zinc-900 dark:text-white')}`}>{value}</p>
        {sub && <p className={`truncate text-[10px] leading-tight ${loud ? 'text-white/65' : 'text-zinc-500 dark:text-zinc-400'}`}>{sub}</p>}
      </div>
    </div>
  )
}

export default function BecomingDoor({ goals, mind }: { goals: GoalProgress | null; mind: MindSummary | null }) {
  const n = goals?.nutrition
  const t = goals?.training
  const top = topSuggestion(goals)
  // Calm by default; the full colour is for a week that has just been written
  // and not yet opened.
  const loud = useUnread()

  const mindChip = mind
    ? { value: `Lv ${mind.level}`, sub: `Ch ${mind.chapter}${mind.chapterName ? ` · ${mind.chapterName}` : ''}` }
    : { value: '—', sub: undefined }
  const nutritionChip = !n ? { value: '—', sub: undefined }
    : !n.target.weight ? { value: 'Set a target', sub: undefined }
    : n.status === 'achieved' || n.pace?.status === 'done' ? { value: 'Reached ✓', sub: undefined }
    : n.pace?.status === 'behind' ? { value: `${fmtUnit(n.pace.behindByKg, n.unit)} behind`, sub: `→ ${Math.round(n.target.weight)} ${n.unit}` }
    : n.pace?.status === 'ahead' ? { value: 'Ahead', sub: n.pace.eta ? `${n.pace.eta} to ${Math.round(n.target.weight)}` : undefined }
    : n.pace?.status === 'on' ? { value: 'On pace', sub: n.pace.eta ? `${n.pace.eta} to ${Math.round(n.target.weight)}` : undefined }
    : n.direction === 'maintain' ? { value: 'Holding', sub: `${Math.round(n.target.weight)} ${n.unit}` }
    : { value: `→ ${Math.round(n.target.weight)}`, sub: n.unit }
  const trainingChip = !t ? { value: '—', sub: undefined }
    : !t.target.daysPerWeek ? { value: 'Set days', sub: undefined }
    : { value: `${t.thisWeek.done}/${t.target.daysPerWeek}`, sub: t.thisWeek.weekLost ? 'week off track' : t.thisWeek.remaining === 0 ? 'week done' : 'this week' }

  return (
    <Link
      href="/dashboard/mind/becoming"
      data-testid="becoming-door"
      data-unread={loud ? 'true' : 'false'}
      className={doorClassName(loud)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${loud ? 'bg-white/15' : 'bg-violet-100 dark:bg-violet-900/30'}`}>
            <Compass className={`h-4.5 w-4.5 ${loud ? 'text-white' : 'text-violet-600 dark:text-violet-300'}`} />
          </span>
          <div className="min-w-0">
            <p className={`text-[10px] font-semibold uppercase tracking-widest ${loud ? 'text-white/70' : 'text-violet-600 dark:text-violet-300'}`}>
              The Becoming{loud ? ' · a new week is written' : ''}
            </p>
            <p className="truncate text-sm font-bold">Then → now → next, across all three</p>
          </div>
        </div>
        <ArrowRight className={`h-5 w-5 shrink-0 ${loud ? 'text-white/80' : 'text-zinc-400'}`} />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <Chip loud={loud} ink={PILLAR.mind.text} icon={<Brain className="h-3.5 w-3.5" />} label="Mind" value={mindChip.value} sub={mindChip.sub} />
        <Chip loud={loud} ink={PILLAR.fuel.text} icon={<UtensilsCrossed className="h-3.5 w-3.5" />} label="Nutrition" value={nutritionChip.value} sub={nutritionChip.sub} tone={n?.pace?.status === 'behind' ? (loud ? 'text-amber-200' : 'text-amber-600 dark:text-amber-400') : undefined} />
        <Chip loud={loud} ink={PILLAR.training.text} icon={<Dumbbell className="h-3.5 w-3.5" />} label="Training" value={trainingChip.value} sub={trainingChip.sub} tone={t?.thisWeek.weekLost ? (loud ? 'text-amber-200' : 'text-amber-600 dark:text-amber-400') : undefined} />
      </div>
      {top && (
        <p className={`mt-2 flex items-center gap-1.5 truncate text-[11px] ${loud ? 'text-white/85' : 'text-zinc-600 dark:text-zinc-300'}`} data-testid="becoming-door-next">
          <Sparkles className={`h-3.5 w-3.5 shrink-0 ${loud ? 'text-amber-200' : 'text-violet-500'}`} />
          <span className="font-semibold">{top.title}</span>
          <span className={`truncate ${loud ? 'text-white/65' : 'text-zinc-400 dark:text-zinc-500'}`}>· {top.sub}</span>
        </p>
      )}
    </Link>
  )
}
