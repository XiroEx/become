'use client'

// The new Mind home — a single focused "next move," not a dashboard of systems.
// Onboarding gates first-run. Then: today's session (the linear, full-screen
// ritual) is THE thing on screen; a quiet "More →" leads to the Arsenal of
// unlocked tools. Begin → launches the immersive SessionPlayer.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Brain, ArrowRight, Check, ChevronRight, Flame, Lock } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import IdentityOnboarding from '@/components/mind/IdentityOnboarding'
import SessionPlayer from '@/components/mind/session/SessionPlayer'
import { isMoodLevel, seedStateForMood, type TodayMood } from '@/lib/mind/moodBridge'
import MindCoachTeaser from '@/components/mind/MindCoachTeaser'
import TrainingGrounds from '@/components/mind/TrainingGrounds'
import SuggestedActions from '@/components/mind/SuggestedActions'
import { composeSession } from '@/lib/mind/composeSession'
import { readMindPlanCache, invalidateMindSession } from '@/lib/mind/sessionCache'
import { precomposeMindSession } from '@/lib/mind/precompose'
import { suggestActions } from '@/lib/mind/suggestActions'
import { getPathSession } from '@/lib/mind/sessionPath'
import { findProtocol, type SuggestedAction } from '@/lib/mind/suggestedProtocols'
import { shouldAutoStartMindSession } from '@/lib/mind/autoStart'
import { runAiTask } from '@/lib/ai/runClient'
import type { MindSessionPlan, MoveKind, SessionContext } from '@/lib/mind/moves'
import type { MindState } from '@/lib/mindContent'
import { CHAPTERS, getUnlockedSystems } from '@/lib/mindXP'
import UpgradeSheet from '@/components/UpgradeSheet'
import { syntheticGate, type GatePayload } from '@/lib/entitlementsClient'

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

// AI suggested-next cache — one set per completed session (cleared on the next
// session's completion; 12h hard cap), so the tile doesn't re-tune every visit.
const SUGG_CACHE_KEY = 'mind-suggested-next'
const SUGG_CACHE_TTL = 12 * 60 * 60 * 1000

export default function MindJourney() {
  // The home dashboard's Mindset tile links here with ?start=1 to jump
  // straight into today's session instead of just onto this page.
  const searchParams = useSearchParams()
  const autoStart = searchParams?.get('start') === '1'
  const autoStartedRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [streak, setStreak] = useState(0)
  const [recentState, setRecentState] = useState<MindState | null>(null)
  const [recentFeeling, setRecentFeeling] = useState<string | null>(null)
  const [moodToday, setMoodToday] = useState<TodayMood | null>(null)
  const [missionAction, setMissionAction] = useState<string | null>(null)
  const [lastBreathAt, setLastBreathAt] = useState<number | null>(null)
  const [recentKinds, setRecentKinds] = useState<string[]>([])
  const [playing, setPlaying] = useState(false)
  // Fresh seed per launch so replays compose a varied set (not the same items).
  const [sessionSeed, setSessionSeed] = useState<number | null>(null)
  // An unfinished session from an earlier visit. Begin picks this up verbatim
  // rather than composing something new, so walking away does not silently swap
  // your session for a different one.
  const [resumable, setResumable] = useState<{ seed: number; plan: MindSessionPlan } | null>(null)
  // AI-composed session (become-ai graph). Pre-composed in the background after
  // the page loads so there's NO added wait at Begin: if it's ready we play it,
  // otherwise we fall back to the instant deterministic plan.
  const [aiPlan, setAiPlan] = useState<MindSessionPlan | null>(null)
  // Post-session suggested actions — AI-picked; null until the AI resolves (the
  // deterministic set shows meanwhile). Cached in localStorage so revisits don't
  // refetch; suggFetching drives the "tuning…" hint ONLY during a real fetch.
  const [aiSuggestions, setAiSuggestions] = useState<SuggestedAction[] | null>(null)
  const [suggFetching, setSuggFetching] = useState(false)
  // Free members get main sessions 1-10; the server reports the wall on GET so
  // the lock is drawn BEFORE Begin rather than after a whole session.
  const [sessionLock, setSessionLock] = useState<{ limit: number } | null>(null)
  const [gate, setGate] = useState<GatePayload | null>(null)

  const load = useCallback(async () => {
    try {
      const h = authHeaders()
      const [identityRes, progressRes, sessionRes, stateRes, missionRes] = await Promise.all([
        fetch('/api/mind/identity', { headers: h }),
        fetch('/api/mind/progress', { headers: h }),
        fetch(`/api/mind/session?tz=${new Date().getTimezoneOffset()}`, { headers: h }),
        fetch(`/api/mind/state?tz=${new Date().getTimezoneOffset()}`, { headers: h }),
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
        // A session composed earlier and never finished. The server already
        // decided it is still valid — it drops it on a new day, or once a
        // workout or meal changes what it was built from.
        if (s.resume?.plan && typeof s.resume?.seed === 'number') {
          setResumable({ seed: s.resume.seed, plan: s.resume.plan as MindSessionPlan })
        }
        setSessionLock(
          s.locked === true && typeof s.sessionsLimit === 'number' ? { limit: s.sessionsLimit } : null,
        )
      }
      if (stateRes.ok) {
        const st = await stateRes.json()
        const last = Array.isArray(st.logs) && st.logs.length > 0 ? st.logs[0] : null
        if (last?.state) setRecentState(last.state as MindState)
        if (typeof last?.feeling === 'string') setRecentFeeling(last.feeling)
        // The dashboard mood, when it is newer than the last Mind check-in,
        // seeds the session instead: "Bad" on the home screen an hour ago says
        // more about right now than "Locked in" from yesterday. The live
        // check-in still overrides at play time.
        const mood = st.todayMood as TodayMood | null | undefined
        if (mood && isMoodLevel(mood.value)) {
          setMoodToday(mood)
          const lastAt = last?.timestamp ? new Date(last.timestamp).getTime() : 0
          if (mood.at > lastAt) {
            const seeded = seedStateForMood(mood.value)
            if (seeded) {
              setRecentState(seeded)
              setRecentFeeling(mood.label)
            }
          }
        }
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

  // The context the session is composed from. Also handed to the player so the
  // live check-in can REBUILD the session around what the user actually reports.
  const sessionContext = useMemo<SessionContext | null>(() => {
    if (!progress) return null
    return {
      chapter: progress.chapter,
      unlockedSystems: progress.unlockedSystems,
      recentState,
      recentFeeling,
      moodToday,
      missionAction,
      identityStatement: progress.vision?.identityStatement ?? null,
      recentKinds,
      pathFocus: getPathSession(progress.mainSessionCount),
      dayOfYear: dayOfYear(),
      seed: sessionSeed ?? undefined,
      now: Date.now(),
      lastBreathAt,
    }
  }, [progress, recentState, recentFeeling, moodToday, missionAction, sessionSeed, lastBreathAt, recentKinds])

  const plan = useMemo<MindSessionPlan | null>(
    () => (sessionContext ? composeSession(sessionContext) : null),
    [sessionContext],
  )

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
    if (resumable) {
      setSessionSeed(resumable.seed)
      setAiPlan(resumable.plan)
      setPlaying(true)
      return
    }
    const seed = Date.now()
    setSessionSeed(seed)
    setPlaying(true)
    // Remember what we just committed to, so a refresh or a walk-away returns
    // THIS session. Best effort: failing to persist costs continuity, never the
    // session itself.
    const planToStore = aiPlan ?? plan
    if (planToStore) {
      fetch('/api/mind/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ seed, plan: planToStore, tzOffset: new Date().getTimezoneOffset() }),
      }).catch(() => {})
    }
  }, [resumable, aiPlan, plan])

  // Auto-begin for the dashboard tile's ?start=1. Fires at most once, and
  // only once there's an actual session to jump into — during onboarding or
  // the post-session cooldown it silently no-ops and the page renders as
  // normal instead of forcing a session that doesn't exist.
  useEffect(() => {
    if (!shouldAutoStartMindSession({
      autoStart,
      alreadyStarted: autoStartedRef.current,
      loading,
      playing,
      onboarded,
      available: progress?.mainSessionAvailable ?? true,
      hasPlan: !!effectivePlan,
    })) return
    autoStartedRef.current = true
    begin()
  }, [autoStart, loading, playing, onboarded, progress, effectivePlan, begin])

  // Deterministic suggested actions — shown instantly (and the fallback if the AI
  // drifts). The AI upgrade replaces them when it resolves.
  const deterministicSuggestions = useMemo(
    () => (progress ? suggestActions({ state: recentState, unlocked: progress.unlockedSystems, seed: dayOfYear() }) : []),
    [progress, recentState],
  )

  // After a session (i.e. in the 20h cooldown → Training Grounds), ask the AI to
  // pick 3 next protocols from the user's state + tendencies. CACHED in
  // localStorage until the next session completes (max 12h) so revisiting the
  // page doesn't refetch — "tuning…" shows only while a real fetch is running,
  // and settles (to the deterministic set) if the AI fails.
  useEffect(() => {
    if (!progress || (progress.mainSessionAvailable ?? true) || aiSuggestions) return
    // 1. Cache hit → adopt instantly, no fetch, no "tuning".
    try {
      const raw = localStorage.getItem(SUGG_CACHE_KEY)
      if (raw) {
        const c = JSON.parse(raw) as { suggestions?: SuggestedAction[]; ts?: number }
        const fresh = typeof c.ts === 'number' && Date.now() - c.ts < SUGG_CACHE_TTL
        const valid = (c.suggestions ?? []).filter((s) => findProtocol(s.system, s.id))
        if (fresh && valid.length === 3) { setAiSuggestions(valid); return }
      }
    } catch { /* fall through to fetch */ }
    // 2. No usable cache → one fetch.
    let cancelled = false
    setSuggFetching(true)
    runAiTask(
      '/api/ai/mind/suggestions',
      { context: { state: recentState, recentKinds, unlockedSystems: progress.unlockedSystems } },
      { silent: true },
    ).then((r) => {
      if (cancelled) return
      const raw = r.ok && r.result ? (r.result as { suggestions?: Array<{ system: string; protocolId: string; reason?: string }> }).suggestions : null
      const valid = (Array.isArray(raw) ? raw : [])
        .map((x) => {
          const p = findProtocol(x.system, x.protocolId)
          return p ? { ...p, reason: (x.reason || '').trim() || p.blurb } : null
        })
        .filter((x): x is SuggestedAction => x !== null)
        .slice(0, 3)
      if (valid.length === 3) {
        setAiSuggestions(valid)
        try { localStorage.setItem(SUGG_CACHE_KEY, JSON.stringify({ suggestions: valid, ts: Date.now() })) } catch { /* ignore */ }
      }
    }).finally(() => { if (!cancelled) setSuggFetching(false) })
    return () => { cancelled = true }
  }, [progress, recentState, recentKinds, aiSuggestions])

  // ── Immersive session overlay ──
  if (playing && effectivePlan) {
    return (
      <SessionPlayer
        plan={effectivePlan}
        sessionContext={sessionContext ?? undefined}
        unlockedSystems={progress?.unlockedSystems ?? getUnlockedSystems(progress?.chapter ?? 1)}
        onExit={() => {
          setPlaying(false)
          setResumable(null)
          // Finished a session → drop the cache and warm a fresh one in the
          // background (non-blocking), so the next view shows a new AI session.
          invalidateMindSession()
          setAiPlan(null)
          setAiSuggestions(null)
          // New session → yesterday's suggestions are stale; recompute once.
          try { localStorage.removeItem(SUGG_CACHE_KEY) } catch { /* ignore */ }
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
      {/* Header — calm, minimal (compact in Training Grounds mode) */}
      <header className={available ? 'mb-5' : 'mb-4'}>
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
        {available ? (
          <>
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
          </>
        ) : (
          // Training Grounds mode — level + chapter collapse onto ONE line so the
          // grounds sit higher up.
          <div className="mt-3 flex items-center gap-2.5">
            <span className="shrink-0 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-extrabold text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
              Lv {level}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-green-500" style={{ width: `${levelPct}%` }} />
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              Ch.{chapter} · {chapterName}
            </span>
          </div>
        )}
      </header>

      {/* Focus area — centered for the daily session, top-aligned for Training
          Grounds so its tiles sit higher up. */}
      <div className={`flex flex-1 flex-col ${available ? 'justify-center' : 'justify-start'}`}>
      {/* The next move — always the instant (deterministic) session; if an
          AI-composed plan is cached it's used transparently. Never blocks on
          generation (that happens in the background on app open). */}
      {sessionLock ? (
        // Out of free main sessions. Distinct from the 20h cooldown below,
        // which lifts on its own — this one never does, so it says so and
        // offers the only thing that changes it.
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <button
            onClick={() => setGate(syntheticGate('mind-sessions'))}
            className="group w-full rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-left dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-zinc-400" />
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Session {sessionLock.limit + 1}
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-extrabold text-zinc-700 dark:text-zinc-200">
              You&apos;ve finished your first {sessionLock.limit} sessions
            </h2>
            <p className="mt-2 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
              Every chapter after this one, plus Vision, comes with Plus.
            </p>
            <span className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 py-3.5 text-base font-bold text-white transition-transform group-active:scale-95 dark:bg-white dark:text-zinc-900">
              See Plus
              <ArrowRight className="h-5 w-5" />
            </span>
          </button>
        </motion.div>
      ) : available && effectivePlan ? (
        // Main session available (first ever, or 20h since the last one).
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <button
            onClick={begin}
            data-tour="mind-session"
            className="group relative w-full rounded-3xl bg-zinc-900 p-6 text-left text-white shadow-sm transition-transform active:scale-[0.98] dark:bg-zinc-800"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
              {(() => { const ps = getPathSession(progress?.mainSessionCount ?? 0); return ps ? `Session ${ps.n} of 50 · ${CHAPTERS[ps.chapter - 1]?.name ?? ''}` : "Today's session" })()}
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
        // In the 20h cooldown → suggested next actions + Training Grounds.
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <SuggestedActions actions={aiSuggestions ?? deterministicSuggestions} loading={suggFetching} />
          <TrainingGrounds unlocked={progress?.unlockedSystems ?? []} nextInLabel={cooldownLabel} mainSessionCount={progress?.mainSessionCount ?? 0} />
        </motion.div>
      )}

      {/* The Becoming — where you started, where you are, what's next, for
          all three pillars. Open to everyone (it used to unlock after the 5th
          main session; the dashboard now leads with it). */}
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

      {/* AI coach — unlocks after 3 main sessions. */}
      {(progress?.mainSessionCount ?? 0) >= 3 ? (
        <MindCoachTeaser />
      ) : (
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3.5 opacity-80 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div>
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Your coach</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Talk it through — unlocks after your 3rd main session ({progress?.mainSessionCount ?? 0}/3 done)
            </p>
          </div>
          <Lock className="h-4 w-4 text-zinc-400" />
        </div>
      )}
      </div>

      <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
    </PageTransition>
  )
}
