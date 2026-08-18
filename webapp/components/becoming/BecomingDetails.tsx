'use client'

// The Becoming — details sheet. The chapter arc, Becoming score, state/mood
// trend, the Nutrition + Training then → now → next panels, "where to work
// on" and the evidence wall. Lives behind the "Details" button on the journey
// (components/becoming/journey); this is the reading view, the stage is the
// felt one.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Flame, Trophy, Lock, ArrowRight } from 'lucide-react'
import PillarsSection from '@/components/becoming/PillarsSection'
import { Card } from '@/components/ui'
import { CHAPTERS, SYSTEM_INFO, getXpToNextChapter } from '@/lib/mindXP'
import type { MindState } from '@/lib/mindContent'

interface ProgressData {
  chapter: number
  xp: number
  xpBank: number
  vision: { identityStatement?: string } | null
  chapterHistory: { chapter: number; unlockedAt: string }[]
}
interface Win { _id?: string; win: string; date: string }
interface StateLogEntry { state: MindState; timestamp: string }

const STATE_META: Record<MindState, { label: string; dot: string; text: string }> = {
  locked_in:  { label: 'Locked in',  dot: 'bg-emerald-400', text: 'text-emerald-400' },
  low_energy: { label: 'Low energy', dot: 'bg-blue-400',    text: 'text-blue-400' },
  distracted: { label: 'Distracted', dot: 'bg-amber-400',   text: 'text-amber-400' },
  stressed:   { label: 'Stressed',   dot: 'bg-red-400',     text: 'text-red-400' },
}

// Gentle "where to work on" suggestion from the dominant recent off-state.
const FOCUS_BY_STATE: Record<MindState, { title: string; sub: string }> = {
  stressed:   { title: 'Calm the storm', sub: 'Stress keeps showing up — lean on state-shift + breath.' },
  distracted: { title: 'Cut the noise',  sub: 'Distraction is the pattern — practice focus + one-thing.' },
  low_energy: { title: 'Do it anyway',   sub: 'Low energy lately — discipline reps move you regardless.' },
  locked_in:  { title: 'Keep stacking',  sub: 'You’re locked in — bank the momentum and protect the streak.' },
}

function fmtDate(d: string | number | Date): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
function relDay(d: string | number | Date): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return fmtDate(d)
}

export default function BecomingDetails() {
  const [prog, setProg] = useState<ProgressData | null>(null)
  const [wins, setWins] = useState<Win[]>([])
  const [logs, setLogs] = useState<StateLogEntry[]>([])
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('token')
        if (!token) { setLoading(false); return }
        const h = { Authorization: `Bearer ${token}` }
        const tz = new Date().getTimezoneOffset()
        const [pRes, wRes, sRes, sessRes] = await Promise.all([
          fetch('/api/mind/progress', { headers: h }),
          fetch('/api/mind/wins?limit=30', { headers: h }),
          fetch('/api/mind/state?limit=60', { headers: h }),
          fetch(`/api/mind/session?tz=${tz}`, { headers: h }),
        ])
        if (pRes.ok) setProg(await pRes.json())
        if (wRes.ok) setWins((await wRes.json()).wins ?? [])
        if (sRes.ok) setLogs((await sRes.json()).logs ?? [])
        if (sessRes.ok) setStreak((await sessRes.json()).streak ?? 0)
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const chapter = prog?.chapter ?? 1
  const score = prog?.xpBank ?? 0
  const identity = prog?.vision?.identityStatement?.trim() || null
  const xpProgress = useMemo(() => getXpToNextChapter(chapter, prog?.xp ?? 0), [chapter, prog?.xp])

  // "Since" — the earliest signal we can find.
  const sinceDate = useMemo(() => {
    const candidates: number[] = []
    if (logs.length) candidates.push(new Date(logs[logs.length - 1].timestamp).getTime())
    const firstCh = prog?.chapterHistory?.[0]?.unlockedAt
    if (firstCh) candidates.push(new Date(firstCh).getTime())
    if (wins.length) candidates.push(new Date(wins[wins.length - 1].date).getTime())
    return candidates.length ? Math.min(...candidates) : null
  }, [logs, wins, prog])

  // Recent state trend (last ~14, oldest→newest for the strip).
  const recentStates = useMemo(() => logs.slice(0, 14).reverse(), [logs])
  const dominantState = useMemo<MindState | null>(() => {
    if (!logs.length) return null
    const counts: Record<string, number> = {}
    for (const l of logs.slice(0, 14)) counts[l.state] = (counts[l.state] ?? 0) + 1
    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as MindState) ?? null
  }, [logs])
  const lockedInPct = useMemo(() => {
    const recent = logs.slice(0, 14)
    if (!recent.length) return null
    return Math.round((recent.filter((l) => l.state === 'locked_in').length / recent.length) * 100)
  }, [logs])

  const currentCh = CHAPTERS[chapter - 1]
  const nextCh = chapter < 5 ? CHAPTERS[chapter] : null
  const focus = dominantState ? FOCUS_BY_STATE[dominantState] : null

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
  }

  return (
    <div className="pb-6">

      {/* Becoming score */}
      {/* data-tour anchors the onboarding tour (lib/tutorials/sections/mind.ts) */}
      <Card data-tour="becoming-score" className="mb-4 overflow-hidden bg-gradient-to-br from-violet-600 to-violet-500 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">
              <Trophy className="h-3.5 w-3.5" /> Becoming score
            </p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums">{score.toLocaleString()}</p>
          </div>
          {streak > 0 && (
            <div className="flex flex-col items-center rounded-2xl bg-white/15 px-4 py-2">
              <Flame className="h-5 w-5 text-orange-300" />
              <span className="mt-0.5 text-lg font-bold tabular-nums">{streak}</span>
              <span className="text-[10px] uppercase tracking-wide text-white/70">day streak</span>
            </div>
          )}
        </div>
        {identity && <p className="mt-4 text-sm font-medium text-white/90">“{identity}”</p>}
      </Card>

      {/* Then → Now → Next */}
      <div className="mb-4 grid grid-cols-3 gap-2" data-tour="becoming-journey">
        <Card className="p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Then</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
            {sinceDate ? fmtDate(sinceDate) : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">where you started</p>
        </Card>
        <Card className={`p-3 text-center ${currentCh?.border ?? ''}`}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Now</p>
          <p className={`mt-1 text-sm font-bold ${currentCh?.color ?? 'text-zinc-900 dark:text-white'}`}>
            Ch {chapter} · {currentCh?.name}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{currentCh?.theme}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Next</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
            {nextCh ? nextCh.name : 'Architect+'}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {nextCh ? nextCh.theme : 'keep building'}
          </p>
        </Card>
      </div>

      {/* The arc */}
      <Card className="mb-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">The arc</p>
        <div className="space-y-2">
          {CHAPTERS.map((c) => {
            const done = c.id < chapter
            const active = c.id === chapter
            const locked = c.id > chapter
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  active ? `${c.bg} ${c.border}` : 'border-transparent'
                }`}
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done ? 'bg-emerald-500 text-white'
                  : active ? `${c.bg} ${c.color}`
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
                }`}>
                  {locked ? <Lock className="h-3.5 w-3.5" /> : c.id}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${locked ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-900 dark:text-white'}`}>
                    {c.name}
                  </p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{c.theme}</p>
                </div>
                {active && xpProgress && (
                  <span className="shrink-0 text-xs font-semibold text-zinc-400">{xpProgress.pct}%</span>
                )}
                {done && <span className="shrink-0 text-xs font-semibold text-emerald-500">✓</span>}
              </div>
            )
          })}
        </div>
      </Card>

      {/* State trend */}
      {recentStates.length > 0 && (
        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">How you’ve shown up</p>
            {lockedInPct !== null && (
              <span className="text-xs font-semibold text-emerald-500">{lockedInPct}% locked in</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recentStates.map((l, i) => (
              <span key={i} title={`${STATE_META[l.state].label} · ${relDay(l.timestamp)}`}
                className={`h-3 w-3 rounded-full ${STATE_META[l.state].dot}`} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {(Object.keys(STATE_META) as MindState[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className={`h-2 w-2 rounded-full ${STATE_META[s].dot}`} /> {STATE_META[s].label}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Nutrition + Training, then → now → next, and "Where to work on" for
          all three pillars (Mind's focus comes from the state trend above). */}
      <PillarsSection mindFocus={focus} />

      {/* Evidence wall */}
      <Card data-tour="becoming-wins">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">Evidence wall</p>
        {wins.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No wins banked yet. Bank one in a session — the proof that you’re changing builds here.
          </p>
        ) : (
          <div className="space-y-2">
            {wins.map((w, i) => (
              <motion.div
                key={w._id ?? i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="flex items-start gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">{w.win}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{relDay(w.date)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      {/* Unlocked next */}
      {nextCh && (
        <Link
          href="/dashboard/mind"
          className="mt-4 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Next: {nextCh.name}</p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              Unlocks {nextCh.systems.map((s) => SYSTEM_INFO[s]?.label ?? s).join(', ')}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-zinc-400" />
        </Link>
      )}
    </div>
  )
}
