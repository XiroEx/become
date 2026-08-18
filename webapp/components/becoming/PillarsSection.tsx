'use client'

// The Becoming page's Nutrition and Training panels — then → now → next for
// each, the same frame Mind already has — plus one "Where to work on" card for
// all three pillars. Reads /api/goals (lib/goals) and /api/progress (program).
// The suggestions shown here are the SAME rules the nudge cron reads, so the
// page and the notification never disagree.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, UtensilsCrossed, Dumbbell, Brain, ArrowRight, TrendingUp, Check, Minus } from 'lucide-react'
import { Card } from '@/components/ui'
import { fmtUnit } from '@/lib/goals/pace'
import type { GoalProgress } from '@/lib/goals/progress'
import type { Suggestion } from '@/lib/goals/suggestions'

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` }
}
function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'
}
const SEV: Record<Suggestion['severity'], string> = {
  info: 'text-zinc-500',
  nudge: 'text-amber-600 dark:text-amber-400',
  warn: 'text-red-600 dark:text-red-400',
  good: 'text-emerald-600 dark:text-emerald-400',
}

function Cell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-2.5 text-center dark:bg-zinc-800/60">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
      <p className={`mt-1 truncate text-sm font-bold ${tone ?? 'text-zinc-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
  )
}

interface ProgramLite { name: string; completedWorkouts?: number; totalWorkouts?: number; currentWeek: number; totalWeeks: number; programId: string }

export default function PillarsSection({ mindFocus }: { mindFocus: { title: string; sub: string } | null }) {
  const [goals, setGoals] = useState<GoalProgress | null>(null)
  const [program, setProgram] = useState<ProgramLite | null>(null)
  const [settingLifts, setSettingLifts] = useState(false)
  const tz = new Date().getTimezoneOffset()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [g, p] = await Promise.all([
          fetch(`/api/goals?tz=${tz}`, { headers: authHeaders() }),
          fetch(`/api/progress?tz=${tz}`, { headers: authHeaders() }),
        ])
        if (g.ok) { const j = (await g.json()) as GoalProgress; if (!cancelled) setGoals(j) }
        if (p.ok) { const j = await p.json(); if (!cancelled) setProgram(j.currentProgram ?? null) }
      } catch { /* panels degrade to skeletons */ }
    })()
    return () => { cancelled = true }
  }, [tz])

  const setSuggestedLifts = async () => {
    setSettingLifts(true)
    try {
      const res = await fetch('/api/goals', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ pillar: 'training', lifts: 'suggested', tz }) })
      if (res.ok) setGoals(await res.json())
    } finally { setSettingLifts(false) }
  }

  const n = goals?.nutrition
  const t = goals?.training
  const unit = n?.unit ?? 'lbs'
  const progPct = program && program.totalWorkouts && program.completedWorkouts != null
    ? Math.round((program.completedWorkouts / program.totalWorkouts) * 100)
    : program ? Math.round((program.currentWeek / (program.totalWeeks || 1)) * 100) : null

  return (
    <>
      {/* ── Nutrition ─────────────────────────────────────────────────── */}
      <Card className="mb-4" data-testid="becoming-nutrition">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            <UtensilsCrossed className="h-3.5 w-3.5 text-red-500" /> Nutrition
          </p>
          {n?.pace && n.status === 'active' && (
            <span className={`text-xs font-semibold ${n.pace.status === 'behind' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {n.pace.status === 'behind' ? `${fmtUnit(n.pace.behindByKg, unit)} behind pace` : n.pace.status === 'ahead' ? `${fmtUnit(n.pace.aheadByKg, unit)} ahead` : n.pace.status === 'on' ? 'On pace' : n.pace.status === 'done' ? 'At target' : ''}
            </span>
          )}
          {n?.status === 'achieved' && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Reached ✓</span>}
        </div>
        {!goals ? (
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        ) : n && n.target.weight ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Cell label="Then" value={n.baseline.weight != null ? `${Math.round(n.baseline.weight)} ${unit}` : '—'} sub={n.baseline.date ? `plan from ${fmtDate(n.baseline.date)}` : undefined} />
              <Cell
                label="Now"
                value={n.now.weight != null ? `${Math.round(n.now.weight)} ${unit}` : '—'}
                sub={n.now.fourWeeksAgo != null && n.now.weight != null ? `${n.now.weight - n.now.fourWeeksAgo <= -0.05 ? '↓' : n.now.weight - n.now.fourWeeksAgo >= 0.05 ? '↑' : '→'} ${Math.abs(n.now.weight - n.now.fourWeeksAgo).toFixed(1)} in 4 wks` : n.now.date ? fmtDate(n.now.date) : undefined}
              />
              <Cell
                label="Next"
                value={`${Math.round(n.target.weight)} ${unit}`}
                sub={n.pace?.etaDate ? `${n.pace.eta} → ${fmtDate(n.pace.etaDate)}` : n.direction === 'maintain' ? 'hold ±2' : n.target.pacePerWeek ? `${n.target.pacePerWeek} ${unit}/wk` : undefined}
                tone="text-purple-600 dark:text-purple-400"
              />
            </div>
            {n.journeyStart.weight != null && n.journeyStart.date && n.baseline.date && new Date(n.journeyStart.date) < new Date(n.baseline.date) && (
              <p className="mt-2 text-[11px] text-zinc-400">
                First weigh-in {Math.round(n.journeyStart.weight)} {unit} on {fmtDate(n.journeyStart.date)}.
              </p>
            )}
            {n.adherence && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className={`inline-flex items-center gap-1 ${n.adherence.logOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  {n.adherence.logOk ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  Logged {n.adherence.logDays}/{n.adherence.totalDays} days <span className="text-zinc-400">(aim {n.adherence.logTarget})</span>
                </span>
                {n.adherence.proteinJudged && (
                  <span className={`inline-flex items-center gap-1 ${n.adherence.proteinOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                    {n.adherence.proteinOk ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    Protein hit {n.adherence.proteinDays}/{n.adherence.totalDays} <span className="text-zinc-400">(aim {n.adherence.proteinTarget}{n.proteinGoal ? ` · ${n.proteinGoal}g` : ''})</span>
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No target weight yet — set one in <Link href="/dashboard/settings" className="font-medium text-blue-600 dark:text-blue-400">Settings</Link> and this panel becomes then → now → next.
          </p>
        )}
      </Card>

      {/* ── Training ──────────────────────────────────────────────────── */}
      <Card className="mb-4" data-testid="becoming-training">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            <Dumbbell className="h-3.5 w-3.5 text-green-600" /> Training
          </p>
          {t?.target.daysPerWeek && (
            <span className={`text-xs font-semibold ${t.thisWeek.weekLost ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              This week {t.thisWeek.done}/{t.target.daysPerWeek}{t.thisWeek.weekLost ? ' · off track' : t.thisWeek.remaining === 0 ? ' · done' : ''}
            </span>
          )}
        </div>
        {!goals ? (
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        ) : t && t.target.daysPerWeek ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Cell label="Then" value={t.baseline.prs.length ? `${t.baseline.prs.length} lifts` : t.startedAt ? fmtDate(t.startedAt) : '—'} sub={t.baseline.date ? `PRs on ${fmtDate(t.baseline.date)}` : 'baseline'} />
              <Cell label="Now" value={t.avgLast4 != null ? `${t.avgLast4}/wk` : '—'} sub="avg, last 4 weeks" />
              <Cell label="Next" value={`${t.target.daysPerWeek}/wk`} sub={program && progPct != null ? `${program.name} · ${progPct}%` : 'your target'} tone="text-purple-600 dark:text-purple-400" />
            </div>
            {t.lifts.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {t.lifts.slice(0, 4).map(l => (
                  <div key={l.slug} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-200">{l.name}</span>
                    <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                      {l.then} → <span className="font-semibold text-zinc-900 dark:text-white">{l.now}</span>
                      {l.target ? <> → <span className="text-purple-600 dark:text-purple-400">{l.target}</span></> : null}
                      {l.delta !== 0 && <span className={`ml-1.5 ${l.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</span>}
                    </span>
                  </div>
                ))}
                <p className="text-[10px] text-zinc-400">e1RM, then → now{t.hasLiftTargets ? ' → target' : ''}.</p>
              </div>
            )}
            {!t.hasLiftTargets && t.suggestedLifts.length > 0 && (
              <button
                type="button"
                onClick={setSuggestedLifts}
                disabled={settingLifts}
                data-testid="becoming-set-lifts"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Set strength targets: +5% on {t.suggestedLifts.map(s => s.name).join(', ')}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Set how many days a week you train in <Link href="/dashboard/settings" className="font-medium text-blue-600 dark:text-blue-400">Settings</Link> — the week, the streak and this panel are measured against it.
          </p>
        )}
      </Card>

      {/* ── Where to work on — all three pillars ──────────────────────── */}
      {(mindFocus || n || t) && (
        <Card className="mb-4" data-testid="becoming-work-on">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Where to work on
          </p>
          <div className="space-y-2">
            {mindFocus && (
              <div className="flex items-start gap-2.5">
                <Brain className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                <div className="min-w-0"><p className="text-sm font-bold text-zinc-900 dark:text-white">{mindFocus.title}</p><p className="text-xs text-zinc-500 dark:text-zinc-400">{mindFocus.sub}</p></div>
              </div>
            )}
            {n && (
              <Link href={n.suggestion.url} className="flex items-start gap-2.5">
                <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="min-w-0 flex-1"><p className={`text-sm font-bold ${SEV[n.suggestion.severity]}`}>{n.suggestion.title}</p><p className="text-xs text-zinc-500 dark:text-zinc-400">{n.suggestion.sub}</p></div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300" />
              </Link>
            )}
            {t && (
              <Link href={t.suggestion.url} className="flex items-start gap-2.5">
                <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div className="min-w-0 flex-1"><p className={`text-sm font-bold ${SEV[t.suggestion.severity]}`}>{t.suggestion.title}</p><p className="text-xs text-zinc-500 dark:text-zinc-400">{t.suggestion.sub}</p></div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300" />
              </Link>
            )}
          </div>
        </Card>
      )}
    </>
  )
}
