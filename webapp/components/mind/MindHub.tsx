'use client'

import { useState, useEffect } from 'react'
import {
  Wind, Eye, BookOpen, Sword, Shield, Users, Sparkles,
  Flame, ChevronRight, Loader2, Edit2, TrendingUp, Lock
} from 'lucide-react'
import { motion } from 'framer-motion'
import { getToken } from '@/lib/clientAuth'
import IdentityOnboarding from '@/components/mind/IdentityOnboarding'
import MindLevelUpModal from '@/components/mind/MindLevelUpModal'
import { getDailyPiece, CONTENT_PIECES, type ContentPiece } from '@/lib/mindContent'
import {
  CHAPTERS, SYSTEM_INFO, getXpToNextChapter, isReadyToLevelUp, getUnlockedSystems,
  type XpMilestone,
} from '@/lib/mindXP'

export type SectionId =
  | 'home' | 'state-shift' | 'self-image' | 'mission'
  | 'discipline' | 'anti-sabotage' | 'social' | 'vision'

// ─── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Wind, Eye, BookOpen, Sword, Shield, Users, Sparkles,
}

// ─── Mind state types ──────────────────────────────────────────────────────────

type MindState = 'stressed' | 'distracted' | 'low_energy' | 'locked_in'

const MIND_STATES: {
  id: MindState; label: string; emoji: string
  color: string; border: string; bg: string; section: SectionId
}[] = [
  { id: 'stressed',   label: 'Stressed',   emoji: '😤', color: 'text-red-500',     border: 'border-red-500/40',     bg: 'bg-red-500/10',     section: 'state-shift' },
  { id: 'distracted', label: 'Distracted', emoji: '🌀', color: 'text-yellow-500',  border: 'border-yellow-500/40',  bg: 'bg-yellow-500/10',  section: 'state-shift' },
  { id: 'low_energy', label: 'Low Energy', emoji: '😴', color: 'text-blue-400',    border: 'border-blue-400/40',    bg: 'bg-blue-400/10',    section: 'mission' },
  { id: 'locked_in',  label: 'Locked In',  emoji: '🔒', color: 'text-emerald-500', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', section: 'discipline' },
]

// ─── Data types ────────────────────────────────────────────────────────────────

interface IdentityData {
  profile: { futureSelf: string; currentSelf: string; primaryObstacle: string; startingPoint: string; onboardingCompleted: boolean } | null
  evolution: { score: number; challengesCompleted: number; statesLogged: number; hasMission: boolean; startingLabel: string } | null
  guidance: { section: string; reason: string; startWith: string } | null
}

interface ProgressData {
  chapter: number
  xp: number
  xpProgress: { needed: number; current: number; pct: number } | null
  readyToLevelUp: boolean
  canSelfDeclare: boolean
  unlockedSystems: string[]
  currentChapter: typeof CHAPTERS[0]
  nextChapter: typeof CHAPTERS[0] | null
  vision: { identityStatement?: string; completedAt?: string } | null
  currentMilestone: XpMilestone | null
  nextMilestone: XpMilestone | null
}

interface Props {
  onNavigate: (section: SectionId) => void
  streak: number
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function MindHub({ onNavigate, streak }: Props) {
  const [identity, setIdentity] = useState<IdentityData>({ profile: null, evolution: null, guidance: null })
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showLevelUp, setShowLevelUp] = useState(false)

  const [checkedIn, setCheckedIn] = useState<MindState | null>(null)
  const [contentPiece, setContentPiece] = useState<ContentPiece | null>(null)
  const [contentDone, setContentDone] = useState(false)
  const [logging, setLogging] = useState(false)

  async function loadAll() {
    const token = getToken()
    if (!token) { setLoading(false); return }
    const h = { Authorization: `Bearer ${token}` }

    const [identityRes, progressRes, contentRes] = await Promise.all([
      fetch('/api/mind/identity', { headers: h }),
      fetch('/api/mind/progress', { headers: h }),
      fetch('/api/mind/content/daily', { headers: h }),
    ])

    const [identityData, progressData, contentData] = await Promise.all([
      identityRes.ok ? identityRes.json() : null,
      progressRes.ok ? progressRes.json() : null,
      contentRes.ok ? contentRes.json() : null,
    ])

    if (identityData?.profile?.onboardingCompleted) {
      setIdentity({ profile: identityData.profile, evolution: identityData.evolution, guidance: identityData.guidance })
      setShowOnboarding(false)
    } else {
      setShowOnboarding(true)
    }

    if (progressData) setProgress(progressData)

    if (contentData?.log) {
      const log = contentData.log as { state: string; contentId: string; ctaClicked: boolean }
      const piece = CONTENT_PIECES.find((p) => p.id === log.contentId) ?? null
      if (piece) {
        setCheckedIn(log.state as MindState)
        setContentPiece(piece)
        setContentDone(log.ctaClicked)
      }
    }

    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function checkIn(state: MindState) {
    const piece = getDailyPiece(state)
    setCheckedIn(state)
    setContentPiece(piece)
    setContentDone(false)
    setLogging(true)
    try {
      const token = getToken()
      await Promise.all([
        fetch('/api/mind/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ state }),
        }),
        fetch('/api/mind/content/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ state, contentId: piece.id }),
        }),
      ])
      // Refresh XP
      const p = await fetch('/api/mind/progress', { headers: { Authorization: `Bearer ${token}` } })
      if (p.ok) setProgress(await p.json())
    } finally {
      setLogging(false)
    }
  }

  async function markCtaDone(section: SectionId) {
    const token = getToken()
    setContentDone(true)
    fetch('/api/mind/content/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ctaClicked: true }),
    }).catch(() => {})
    onNavigate(section)
  }

  function onboardingComplete() {
    setShowOnboarding(false)
    setLoading(true)
    loadAll()
  }

  function handleLevelUp(newChapter: number) {
    setShowLevelUp(false)
    setProgress(prev => prev ? { ...prev, chapter: newChapter } : prev)
    loadAll()
  }

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  // ─── Onboarding ─────────────────────────────────────────────────────────────

  if (showOnboarding) {
    return (
      <div>
        <div className="mb-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">Before anything else</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-white leading-snug">
            You are not your current circumstances.
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            You are who you&apos;re choosing to become. This takes 60 seconds. Answer honestly — the system calibrates to you.
          </p>
        </div>
        <IdentityOnboarding onComplete={onboardingComplete} />
      </div>
    )
  }

  // ─── Hub ────────────────────────────────────────────────────────────────────

  const { profile, evolution } = identity
  const chapter = progress?.chapter ?? 1
  const xp = progress?.xp ?? 0
  const xpProgress = progress?.xpProgress ?? null
  const readyToLevelUp = progress?.readyToLevelUp ?? false
  const canSelfDeclare = progress?.canSelfDeclare ?? false
  const unlockedSystems = progress?.unlockedSystems ?? getUnlockedSystems(chapter)
  const currentChapterData = progress?.currentChapter ?? CHAPTERS[chapter - 1]
  const nextChapterData = progress?.nextChapter ?? null
  const visionSet = !!progress?.vision?.completedAt
  const checkedInState = checkedIn ? MIND_STATES.find((s) => s.id === checkedIn) : null
  const currentMilestone = progress?.currentMilestone ?? null
  const nextMilestone = progress?.nextMilestone ?? null

  // Systems not yet unlocked
  const allSystems = Object.keys(SYSTEM_INFO)
  const lockedSystems = allSystems.filter(s => !unlockedSystems.includes(s))

  return (
    <>
      {showLevelUp && (
        <MindLevelUpModal
          currentChapter={chapter}
          xp={xp}
          readyToLevelUp={readyToLevelUp}
          canSelfDeclare={canSelfDeclare}
          onLevelUp={handleLevelUp}
          onClose={() => setShowLevelUp(false)}
        />
      )}

      <div className="space-y-4">

        {/* ── Chapter progression card ──────────────────────────────────── */}
        <div className={`rounded-2xl border ${currentChapterData.border} ${currentChapterData.bg} p-4`}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className={`text-xs font-bold uppercase tracking-widest ${currentChapterData.color} mb-0.5`}>
                Chapter {chapter} of 5
              </p>
              <p className="text-base font-bold text-zinc-900 dark:text-white">{currentChapterData.name}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 italic">&ldquo;{currentChapterData.theme}&rdquo;</p>
            </div>
            <div className="flex items-center gap-2">
              {streak > 0 && (
                <div className="flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-xs font-bold text-orange-400">{streak}d</span>
                </div>
              )}
              <button
                onClick={() => setShowOnboarding(true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/50 dark:bg-zinc-800/50 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* XP bar — chapter progression */}
          {xpProgress && chapter < 5 ? (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-zinc-500">{xp} XP total</p>
                <p className={`text-xs font-semibold ${currentChapterData.color}`}>
                  {xpProgress.current}/{xpProgress.needed} → {nextChapterData?.name}
                </p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/30 dark:bg-zinc-900/30">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${xpProgress.pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={`h-full rounded-full bg-gradient-to-r ${
                    chapter === 1 ? 'from-blue-400 to-blue-600' :
                    chapter === 2 ? 'from-amber-400 to-amber-600' :
                    chapter === 3 ? 'from-red-400 to-red-600' :
                    chapter === 4 ? 'from-orange-400 to-orange-600' :
                    'from-emerald-400 to-emerald-600'
                  }`}
                />
              </div>
            </div>
          ) : chapter === 5 ? (
            /* Post-chapter-5: milestone mode — XP never stops */
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <p className={`text-xs font-bold ${currentChapterData.color}`}>
                  {currentMilestone ? currentMilestone.label : 'Building'}
                </p>
                <p className="text-xs text-zinc-500">{xp} XP</p>
              </div>
              {nextMilestone && (
                <>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/30 dark:bg-zinc-900/30">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.round(((xp - (currentMilestone?.xp ?? 500)) / (nextMilestone.xp - (currentMilestone?.xp ?? 500))) * 100))}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                    />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 text-right">{nextMilestone.xp - xp} XP to {nextMilestone.label}</p>
                </>
              )}
              {!nextMilestone && (
                <p className={`text-xs font-semibold ${currentChapterData.color}`}>No ceiling. Keep going.</p>
              )}
            </div>
          ) : null}

          {/* Ready to level up — blocked if self-declare already used and under threshold */}
          {chapter < 5 && (
            <button
              onClick={() => setShowLevelUp(true)}
              className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all ${
                readyToLevelUp
                  ? `${currentChapterData.bg} ${currentChapterData.color} border ${currentChapterData.border} animate-pulse`
                  : canSelfDeclare
                  ? 'bg-white/30 dark:bg-zinc-800/30 text-zinc-400 border border-transparent hover:text-zinc-600 dark:hover:text-zinc-300'
                  : 'bg-white/10 dark:bg-zinc-900/20 text-zinc-300 dark:text-zinc-600 border border-transparent cursor-not-allowed'
              }`}
            >
              {readyToLevelUp ? (
                <>✦ Ready to advance — Enter {nextChapterData?.name}</>
              ) : canSelfDeclare ? (
                <>I&apos;m ready for more <ChevronRight className="h-3 w-3" /></>
              ) : (
                <>Earn the XP to advance <ChevronRight className="h-3 w-3" /></>
              )}
            </button>
          )}
        </div>

        {/* ── Identity/Vision card ────────────────────────────────────────── */}
        {profile && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  {visionSet ? 'Your Vision' : 'Your Identity'}
                </p>
                <span className="text-xs text-zinc-400">{evolution?.startingLabel}</span>
              </div>
              {visionSet && progress?.vision?.identityStatement ? (
                <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug">
                  I am the kind of person who {progress.vision.identityStatement}
                </p>
              ) : (
                <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug line-clamp-2">
                  {profile.futureSelf}
                </p>
              )}
              {unlockedSystems.includes('vision') && !visionSet && (
                <button
                  onClick={() => onNavigate('vision')}
                  className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs font-bold text-amber-500"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Build your vision — 75 XP
                </button>
              )}
              {visionSet && (
                <button
                  onClick={() => onNavigate('vision')}
                  className="mt-2 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  View full vision <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Evolution bar */}
            {evolution && (
              <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Evolution</span>
                  </div>
                  <span className="text-xs font-bold text-zinc-500">{evolution.score} pts</span>
                </div>
                <div className="h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-zinc-400 to-zinc-900 dark:from-zinc-500 dark:to-white transition-all duration-700"
                    style={{ width: `${Math.max(evolution.score, 2)}%` }}
                  />
                </div>
                <div className="mt-2 flex gap-4">
                  {[
                    { label: 'Check-ins', value: evolution.statesLogged },
                    { label: 'Challenges', value: evolution.challengesCompleted },
                    { label: 'Mission', value: evolution.hasMission ? '✓' : '—' },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{s.value}</p>
                      <p className="text-xs text-zinc-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── State check-in ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          {!checkedIn ? (
            <>
              <p className="mb-1 text-sm font-bold text-zinc-900 dark:text-white">Where&apos;s your head right now?</p>
              <p className="mb-3 text-xs text-zinc-500">Be honest. Your next move depends on it.</p>
              <div className="grid grid-cols-2 gap-2">
                {MIND_STATES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => checkIn(s.id)}
                    disabled={logging}
                    className="flex items-center gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-3 text-left hover:border-zinc-300 dark:hover:border-zinc-700 transition-all disabled:opacity-50"
                  >
                    <span className="text-lg leading-none">{s.emoji}</span>
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{s.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : contentPiece ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{checkedInState?.emoji}</span>
                <span className={`text-sm font-bold ${checkedInState?.color}`}>{checkedInState?.label}</span>
                {contentDone && (
                  <span className="ml-1 flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500">
                    ✓ Done
                  </span>
                )}
                <button
                  onClick={() => { setCheckedIn(null); setContentPiece(null); setContentDone(false) }}
                  className="ml-auto text-xs text-zinc-400 hover:text-zinc-600"
                >
                  change
                </button>
              </div>
              <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-3 mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-1">{contentPiece.source}</p>
                <p className="text-sm font-bold text-zinc-900 dark:text-white mb-1">{contentPiece.title}</p>
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300 italic">&ldquo;{contentPiece.mantra}&rdquo;</p>
              </div>
              {!contentDone && (
                <button
                  onClick={() => markCtaDone(contentPiece.section as SectionId)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 dark:bg-white px-4 py-2.5 text-xs font-bold text-white dark:text-zinc-900"
                >
                  {contentPiece.cta} <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          ) : null}
        </div>

        {/* ── Unlocked systems ───────────────────────────────────────────── */}
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Your Tools
          </p>
          <div className="grid grid-cols-2 gap-3">
            {unlockedSystems.map((sysId) => {
              const info = SYSTEM_INFO[sysId]
              const Icon = ICON_MAP[info.iconName] ?? ChevronRight
              return (
                <motion.button
                  key={sysId}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => onNavigate(sysId as SectionId)}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all"
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${info.iconBg}`}>
                    <Icon className={`h-4 w-4 ${info.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">{info.label}</p>
                    <p className="mt-0.5 text-xs leading-snug text-zinc-500 dark:text-zinc-400">{info.hook}</p>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* ── Locked systems preview ─────────────────────────────────────── */}
        {lockedSystems.length > 0 && nextChapterData && (
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
              Coming in {nextChapterData.name}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {lockedSystems
                .filter(sysId => SYSTEM_INFO[sysId].chapter === chapter + 1)
                .map((sysId) => {
                  const info = SYSTEM_INFO[sysId]
                  const Icon = ICON_MAP[info.iconName] ?? ChevronRight
                  return (
                    <div
                      key={sysId}
                      className="flex flex-col gap-3 rounded-2xl border border-zinc-100 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900/50 p-4 opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${info.iconBg} opacity-50`}>
                          <Icon className={`h-4 w-4 ${info.color}`} />
                        </div>
                        <Lock className="h-3.5 w-3.5 text-zinc-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-400 dark:text-zinc-600 leading-tight">{info.label}</p>
                        <p className="mt-0.5 text-xs leading-snug text-zinc-400 dark:text-zinc-600">{info.hook}</p>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

      </div>
    </>
  )
}
