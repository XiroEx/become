'use client'

// The new Mind home — a single focused "next move," not a dashboard of systems.
// Onboarding gates first-run. Then: today's session (the linear, full-screen
// ritual) is THE thing on screen; a quiet "More →" leads to the Arsenal of
// unlocked tools. Begin → launches the immersive SessionPlayer.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Brain, ArrowRight, Sparkles, Check, ChevronRight } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import IdentityOnboarding from '@/components/mind/IdentityOnboarding'
import SessionPlayer from '@/components/mind/session/SessionPlayer'
import { composeSession } from '@/lib/mind/composeSession'
import type { MindSessionPlan, MoveKind } from '@/lib/mind/moves'
import type { MindState } from '@/lib/mindContent'
import { CHAPTERS, getUnlockedSystems } from '@/lib/mindXP'

interface ProgressData {
  chapter: number
  xp: number
  xpProgress: { pct: number } | null
  unlockedSystems: string[]
  vision: { identityStatement?: string } | null
}

const MOVE_CHIP: Record<MoveKind, string> = {
  'state-check': 'Check in',
  breath: 'Breathe',
  identity: 'Affirm',
  win: 'Reflect',
}

function dayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000)
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}` }
}

export default function MindJourney() {
  const [loading, setLoading] = useState(true)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [completedToday, setCompletedToday] = useState(false)
  const [recentState, setRecentState] = useState<MindState | null>(null)
  const [playing, setPlaying] = useState(false)

  const load = useCallback(async () => {
    try {
      const h = authHeaders()
      const [identityRes, progressRes, sessionRes, stateRes] = await Promise.all([
        fetch('/api/mind/identity', { headers: h }),
        fetch('/api/mind/progress', { headers: h }),
        fetch(`/api/mind/session?tz=${new Date().getTimezoneOffset()}`, { headers: h }),
        fetch('/api/mind/state', { headers: h }),
      ])
      const identity = identityRes.ok ? await identityRes.json() : null
      setOnboarded(!!identity?.profile?.onboardingCompleted)

      if (progressRes.ok) {
        const p = await progressRes.json()
        setProgress({
          chapter: p.chapter ?? 1,
          xp: p.xp ?? 0,
          xpProgress: p.xpProgress ?? null,
          unlockedSystems: p.unlockedSystems ?? getUnlockedSystems(p.chapter ?? 1),
          vision: p.vision ?? null,
        })
      }
      if (sessionRes.ok) {
        const s = await sessionRes.json()
        setCompletedToday(!!s.completedToday)
      }
      if (stateRes.ok) {
        const st = await stateRes.json()
        const last = Array.isArray(st.logs) && st.logs.length > 0 ? st.logs[0] : null
        if (last?.state) setRecentState(last.state as MindState)
      }
    } catch (error) {
      console.error('Error loading mind home:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const plan = useMemo<MindSessionPlan | null>(() => {
    if (!progress) return null
    return composeSession({
      chapter: progress.chapter,
      unlockedSystems: progress.unlockedSystems,
      recentState,
      missionAction: null,
      identityStatement: progress.vision?.identityStatement ?? null,
      dayOfYear: dayOfYear(),
    })
  }, [progress, recentState])

  // ── Immersive session overlay ──
  if (playing && plan) {
    return (
      <SessionPlayer
        plan={plan}
        onExit={() => {
          setPlaying(false)
          setLoading(true)
          load()
        }}
      />
    )
  }

  if (loading) {
    return (
      <PageTransition className="pb-6">
        <div className="mt-8 space-y-4">
          <div className="h-7 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-52 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-14 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </PageTransition>
    )
  }

  // ── First-run onboarding ──
  if (onboarded === false) {
    return (
      <PageTransition className="pb-6">
        <IdentityOnboarding onComplete={() => { setLoading(true); load() }} />
      </PageTransition>
    )
  }

  const chapter = progress?.chapter ?? 1
  const chapterName = CHAPTERS[chapter - 1]?.name ?? 'Reset'
  const pct = progress?.xpProgress?.pct ?? 0
  const unlockedCount = progress?.unlockedSystems.length ?? 1

  return (
    <PageTransition className="pb-6">
      {/* Header — calm, minimal */}
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
          <Brain className="h-6 w-6 text-violet-500" />
          Mindset
        </h1>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Ch.{chapter} · {chapterName}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-green-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>

      {/* The next move */}
      {plan && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {!completedToday ? (
            <button
              onClick={() => setPlaying(true)}
              className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-green-600 p-6 text-left text-white shadow-lg transition-transform active:scale-[0.98]"
            >
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Today</p>
              <h2 className="mt-2 text-3xl font-extrabold">{plan.intro.title}</h2>
              <p className="mt-2 max-w-xs text-sm text-white/80">{plan.intro.subtitle}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {plan.moves.map((m) => (
                  <span key={m.id} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
                    {MOVE_CHIP[m.kind]}
                  </span>
                ))}
              </div>
              <span className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-base font-bold text-zinc-900 transition-transform group-active:scale-95">
                Begin
                <ArrowRight className="h-5 w-5" />
              </span>
            </button>
          ) : (
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-green-500 text-white">
                <Check className="h-7 w-7" strokeWidth={3} />
              </span>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">You showed up today</h2>
              <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                Come back tomorrow for your next move.
              </p>
              <button
                onClick={() => setPlaying(true)}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-600 dark:text-violet-400"
              >
                <Sparkles className="h-4 w-4" />
                Train again
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* More → Arsenal */}
      <Link
        href="/dashboard/mind/arsenal"
        className="mt-4 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">More</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Your arsenal — {unlockedCount} {unlockedCount === 1 ? 'tool' : 'tools'} unlocked
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-zinc-400" />
      </Link>
    </PageTransition>
  )
}
