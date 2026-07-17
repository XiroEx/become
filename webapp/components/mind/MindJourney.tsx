'use client'

// The new Mind home — a single focused "next move," not a dashboard of systems.
// Onboarding gates first-run. Then: today's session (the linear, full-screen
// ritual) is THE thing on screen; a quiet "More →" leads to the Arsenal of
// unlocked tools. Begin → launches the immersive SessionPlayer.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Brain, ArrowRight, Check, ChevronRight, Flame } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import IdentityOnboarding from '@/components/mind/IdentityOnboarding'
import SessionPlayer from '@/components/mind/session/SessionPlayer'
import MindCoachTeaser from '@/components/mind/MindCoachTeaser'
import TrainingGrounds from '@/components/mind/TrainingGrounds'
import { composeSession } from '@/lib/mind/composeSession'
import { readMindPlanCache, invalidateMindSession } from '@/lib/mind/sessionCache'
import { precomposeMindSession } from '@/lib/mind/precompose'
import type { MindSessionPlan, MoveKind } from '@/lib/mind/moves'
import type { MindState } from '@/lib/mindContent'
import { CHAPTERS, getUnlockedSystems } from '@/lib/mindXP'

interface LevelProgress { level: number; intoLevel: number; span: number; pct: number; xpToNext: number }

interface ProgressData {
  chapter: number
  xp: number
  xpProgress: { pct: number } | null
  unlockedSystems: string[]
  vision: { identityStatement?: string } | null
  // Split level/chapter model
  level: number
  levelProgress: LevelProgress | null
  mainSessionCount: number
  sessionsIntoChapter: { done: number; needed: number; toNext: number } | null
  mainSessionAvailable: boolean
  nextMainSessionAt: number | null
}

/** "in 12h 30m" until the next main session unlocks (null once available). */
function untilLabel(ts: number | null): string | null {
  if (!ts) return null
  const ms = ts - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`
}

const MOVE_CHIP: Record<MoveKind, string> = {
  'state-check': 'Check in',
  breath: 'Breathe',
  identity: 'Affirm',
  win: 'Win',
  challenge: 'Discipline',
  mission: 'Lock in',
  vision: 'Vision',
  antisabotage: 'Pattern',
  social: 'Connect',
  mirror: 'Mirror',
  choice: 'Reflect',
  type: 'Type it',
  speak: 'Say it',
  assemble: 'Build it',
  compose: 'Fill it in',
  acknowledge: 'Check in',
  interrogative: 'Reflect',
  contrast: 'Plan it',
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
  const [streak, setStreak] = useState(0)
  const [recentState, setRecentState] = useState<MindState | null>(null)
  const [missionAction, setMissionAction] = useState<string | null>(null)
  const [lastBreathAt, setLastBreathAt] = useState<number | null>(null)
  const [recentKinds, setRecentKinds] = useState<string[]>([])
  const [playing, setPlaying] = useState(false)
  // Fresh seed per launch so replays compose a varied set (not the same items).
  const [sessionSeed, setSessionSeed] = useState<number | null>(null)
  // AI-composed session (become-ai graph). Pre-composed in the background after
  // the page loads so there's NO added wait at Begin: if it's ready we play it,
  // otherwise we fall back to the instant deterministic plan.
  const [aiPlan, setAiPlan] = useState<MindSessionPlan | null>(null)

  const load = useCallback(async () => {
    try {
      const h = authHeaders()
      const [identityRes, progressRes, sessionRes, stateRes, missionRes] = await Promise.all([
        fetch('/api/mind/identity', { headers: h }),
        fetch('/api/mind/progress', { headers: h }),
        fetch(`/api/mind/session?tz=${new Date().getTimezoneOffset()}`, { headers: h }),
        fetch('/api/mind/state', { headers: h }),
        fetch('/api/mind/mission', { headers: h }),
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
          level: p.level ?? 1,
          levelProgress: p.levelProgress ?? null,
          mainSessionCount: p.mainSessionCount ?? 0,
          sessionsIntoChapter: p.sessionsIntoChapter ?? null,
          mainSessionAvailable: p.mainSessionAvailable ?? true,
          nextMainSessionAt: p.nextMainSessionAt ?? null,
        })
      }
      if (sessionRes.ok) {
        const s = await sessionRes.json()
        setStreak(s.streak ?? 0)
        setLastBreathAt(typeof s.lastBreathAt === 'number' ? s.lastBreathAt : null)
        setRecentKinds(Array.isArray(s.recentKinds) ? s.recentKinds : [])
      }
      if (stateRes.ok) {
        const st = await stateRes.json()
        const last = Array.isArray(st.logs) && st.logs.length > 0 ? st.logs[0] : null
        if (last?.state) setRecentState(last.state as MindState)
      }
      if (missionRes.ok) {
        const m = await missionRes.json()
        setMissionAction(m?.mission?.dailyAction ?? null)
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
      missionAction,
      identityStatement: progress.vision?.identityStatement ?? null,
      recentKinds,
      dayOfYear: dayOfYear(),
      seed: sessionSeed ?? undefined,
      now: Date.now(),
      lastBreathAt,
    })
  }, [progress, recentState, missionAction, sessionSeed, lastBreathAt, recentKinds])

  // Adopt the AI-composed session if one is cached. Generation itself runs in
  // the background on APP OPEN (lib/mind/precompose, mounted in the shell) — we
  // never block the Mind view on it. If the cache is empty (first run, or a
  // workout/nutrition log invalidated it), kick a cooldown-gated, silent warm so
  // the next view shows the fresh AI plan; meanwhile the deterministic plan
  // renders instantly.
  useEffect(() => {
    if (!progress || aiPlan) return
    const cache = readMindPlanCache()
    if (cache?.plan) { setAiPlan(cache.plan); return }
    let cancelled = false
    precomposeMindSession().then(() => {
      if (cancelled) return
      const c = readMindPlanCache()
      if (c?.plan) setAiPlan(c.plan)
    })
    return () => { cancelled = true }
  }, [progress, aiPlan])

  const effectivePlan = aiPlan ?? plan

  const begin = useCallback(() => {
    setSessionSeed(Date.now())
    setPlaying(true)
  }, [])

  // ── Immersive session overlay ──
  if (playing && effectivePlan) {
    return (
      <SessionPlayer
        plan={effectivePlan}
        unlockedSystems={progress?.unlockedSystems ?? getUnlockedSystems(progress?.chapter ?? 1)}
        onExit={() => {
          setPlaying(false)
          // Finished a session → drop the cache and warm a fresh one in the
          // background (non-blocking), so the next view shows a new AI session.
          invalidateMindSession()
          setAiPlan(null)
          precomposeMindSession()
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
  const level = progress?.level ?? 1
  const levelPct = progress?.levelProgress?.pct ?? 0
  const xpToNext = progress?.levelProgress?.xpToNext ?? 0
  const chSessions = progress?.sessionsIntoChapter ?? null
  const available = progress?.mainSessionAvailable ?? true
  const cooldownLabel = untilLabel(progress?.nextMainSessionAt ?? null)

  return (
    <PageTransition className="flex min-h-[78vh] flex-col pb-6">
      {/* Header — calm, minimal */}
      <header className="mb-5">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
            <Brain className="h-6 w-6 text-violet-500" />
            Mindset
          </h1>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-sm font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
              <Flame className="h-4 w-4" />
              {streak}
            </span>
          )}
        </div>
        {/* LEVEL — per-user, XP-driven, uncapped (from ALL mind activity). */}
        <div className="mt-3 flex items-center gap-3">
          <span className="shrink-0 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-extrabold text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
            Lv {level}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-green-500" style={{ width: `${levelPct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
            {xpToNext} XP
          </span>
        </div>

        {/* Visual chapter path */}
        {/* data-tour anchors the onboarding tour (lib/tutorials/sections/mind.ts) */}
        <div className="mt-4 flex items-center" data-tour="mind-chapters">
          {CHAPTERS.map((c, i) => {
            const done = c.id < chapter
            const current = c.id === chapter
            return (
              <Fragment key={c.id}>
                {i > 0 && (
                  <div className={`h-0.5 flex-1 ${c.id <= chapter ? 'bg-violet-500' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                )}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    done
                      ? 'bg-violet-500 text-white'
                      : current
                        ? 'bg-white text-violet-600 ring-2 ring-violet-500 dark:bg-zinc-900'
                        : 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
                  }`}
                  title={c.name}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : c.id}
                </div>
              </Fragment>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          Ch.{chapter} · {chapterName}
          {chapter < CHAPTERS.length && chSessions
            ? ` — ${chSessions.done}/${chSessions.needed} sessions to Ch.${chapter + 1}`
            : ' — final chapter'}
        </p>
      </header>

      {/* Centered focus area — fills the space below the header */}
      <div className="flex flex-1 flex-col justify-center">
      {/* The next move — always the instant (deterministic) session; if an
          AI-composed plan is cached it's used transparently. Never blocks on
          generation (that happens in the background on app open). */}
      {available && effectivePlan ? (
        // Main session available (first ever, or 20h since the last one).
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <button
            onClick={begin}
            data-tour="mind-session"
            className="group relative w-full rounded-3xl bg-zinc-900 p-6 text-left text-white shadow-sm transition-transform active:scale-[0.98] dark:bg-zinc-800"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
              Today&apos;s session
            </p>
            <h2 className="mt-2 text-3xl font-extrabold">{effectivePlan.intro.title}</h2>
            <p className="mt-2 max-w-xs text-sm text-white/70">{effectivePlan.intro.subtitle}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {effectivePlan.moves.map((m) => (
                <span key={m.id} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
                  {MOVE_CHIP[m.kind]}
                </span>
              ))}
            </div>
            <span className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-base font-bold text-zinc-900 transition-transform group-active:scale-95">
              Begin
              <ArrowRight className="h-5 w-5" />
            </span>
          </button>
        </motion.div>
      ) : (
        // In the 20h cooldown → Training Grounds (arsenal, no quick-play).
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <TrainingGrounds unlocked={progress?.unlockedSystems ?? []} nextInLabel={cooldownLabel} />
        </motion.div>
      )}

      {/* The Becoming — progression / training log */}
      <Link
        href="/dashboard/mind/becoming"
        data-tour="mind-becoming-link"
        className="mt-3 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">The Becoming</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Where you started, where you are, what&apos;s next
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-zinc-400" />
      </Link>

      {/* AI coach — scaffolded (drops into the MoveEngine via redbtn later) */}
      <MindCoachTeaser />
      </div>
    </PageTransition>
  )
}
