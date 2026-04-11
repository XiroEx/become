'use client'

import { useState, useEffect } from 'react'
import { Wind, Eye, BookOpen, Sword, Shield, Users, Flame, ChevronRight } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import type { SectionId } from '@/app/dashboard/mind/page'

// ─── Section card config ───────────────────────────────────────────────────────

interface SectionCard {
  id: SectionId
  label: string
  hook: string
  Icon: React.ElementType
  accent: string
  iconBg: string
}

const SECTIONS: SectionCard[] = [
  {
    id: 'state-shift',
    label: 'State Shift',
    hook: 'Reset your mind in under 3 minutes',
    Icon: Wind,
    accent: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
  },
  {
    id: 'self-image',
    label: 'Self-Image',
    hook: 'Reinforce who you\'re becoming',
    Icon: Eye,
    accent: 'text-violet-400',
    iconBg: 'bg-violet-500/10',
  },
  {
    id: 'mission',
    label: 'Mission',
    hook: 'The reason behind everything',
    Icon: BookOpen,
    accent: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
  },
  {
    id: 'discipline',
    label: 'Discipline',
    hook: 'Today\'s non-negotiable',
    Icon: Sword,
    accent: 'text-red-400',
    iconBg: 'bg-red-500/10',
  },
  {
    id: 'anti-sabotage',
    label: 'Anti-Sabotage',
    hook: 'Kill the pattern before it kills your progress',
    Icon: Shield,
    accent: 'text-orange-400',
    iconBg: 'bg-orange-500/10',
  },
  {
    id: 'social',
    label: 'Social',
    hook: 'Your environment is your destiny',
    Icon: Users,
    accent: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
  },
]

// ─── State check-in ────────────────────────────────────────────────────────────

type MindState = 'stressed' | 'distracted' | 'low_energy' | 'locked_in'

const MIND_STATES: {
  id: MindState
  label: string
  emoji: string
  color: string
  border: string
  bg: string
  section: SectionId
}[] = [
  { id: 'stressed',    label: 'Stressed',    emoji: '😤', color: 'text-red-500',     border: 'border-red-500/40',     bg: 'bg-red-500/10',     section: 'state-shift' },
  { id: 'distracted',  label: 'Distracted',  emoji: '🌀', color: 'text-yellow-500',  border: 'border-yellow-500/40',  bg: 'bg-yellow-500/10',  section: 'state-shift' },
  { id: 'low_energy',  label: 'Low Energy',  emoji: '😴', color: 'text-blue-400',    border: 'border-blue-400/40',    bg: 'bg-blue-400/10',    section: 'mission' },
  { id: 'locked_in',   label: 'Locked In',   emoji: '🔒', color: 'text-emerald-500', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', section: 'discipline' },
]

const RECOMMENDATIONS: Record<MindState, string> = {
  stressed:   'Breathe first. A 4-7-8 cycle will reset your nervous system in 90 seconds.',
  distracted: "Your attention is scattered — that's fixable. Lock in with Focus Mode.",
  low_energy: "Low energy is often a signal you've drifted from purpose. Read your mission.",
  locked_in:  "Don't waste it. Go train, or go after your most important task right now.",
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (section: SectionId) => void
  streak: number
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function MindHub({ onNavigate, streak }: Props) {
  const [checkedIn, setCheckedIn] = useState<MindState | null>(null)
  const [logging, setLogging] = useState(false)
  const [dailyAction, setDailyAction] = useState<string | null>(null)
  const [challengeCompleted, setChallengeCompleted] = useState(false)
  const [challengeText, setChallengeText] = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }

    fetch('/api/mind/mission', { headers: h })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.mission?.dailyAction) setDailyAction(d.mission.dailyAction) })
      .catch(() => {})

    fetch('/api/mind/discipline', { headers: h })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.challenge) {
          setChallengeCompleted(d.challenge.completed)
          setChallengeText(d.challenge.challenge)
        }
      })
      .catch(() => {})
  }, [])

  async function checkIn(state: MindState) {
    setCheckedIn(state)
    setLogging(true)
    try {
      const token = getToken()
      await fetch('/api/mind/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state }),
      })
    } finally {
      setLogging(false)
    }
  }

  const recommendation = checkedIn ? RECOMMENDATIONS[checkedIn] : null
  const checkedInState = checkedIn ? MIND_STATES.find((s) => s.id === checkedIn) : null

  return (
    <div className="space-y-5">

      {/* Daily brief — identity + date */}
      <div className="rounded-2xl bg-zinc-900 dark:bg-zinc-900 border border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            <p className="mt-0.5 text-lg font-bold text-white leading-tight">
              Daily Brief
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <Flame className="h-4 w-4 text-orange-400" />
              <span className="text-xl font-bold text-white">{streak}</span>
            </div>
            <p className="text-xs text-zinc-500">day streak</p>
          </div>
        </div>

        {/* State check-in */}
        {!checkedIn ? (
          <>
            <p className="mb-3 text-sm text-zinc-400">Where&apos;s your head at right now?</p>
            <div className="grid grid-cols-2 gap-2">
              {MIND_STATES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => checkIn(s.id)}
                  disabled={logging}
                  className="flex items-center gap-2.5 rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-3 text-left hover:border-zinc-600 hover:bg-zinc-800 transition-all disabled:opacity-50"
                >
                  <span className="text-lg leading-none">{s.emoji}</span>
                  <span className="text-sm font-semibold text-zinc-300">{s.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div>
            <div className={`flex items-center gap-2 mb-3`}>
              <span className="text-xl">{checkedInState?.emoji}</span>
              <span className={`text-sm font-bold ${checkedInState?.color}`}>{checkedInState?.label}</span>
              <button
                onClick={() => setCheckedIn(null)}
                className="ml-auto text-xs text-zinc-600 hover:text-zinc-400"
              >
                change
              </button>
            </div>
            <p className="text-sm leading-relaxed text-zinc-300 mb-4">{recommendation}</p>
            {checkedInState && checkedInState.section !== 'home' && (
              <button
                onClick={() => onNavigate(checkedInState.section)}
                className="flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-all"
              >
                Go to {SECTIONS.find(s => s.id === checkedInState.section)?.label}
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mission pulse */}
      {dailyAction && (
        <button
          onClick={() => onNavigate('mission')}
          className="flex w-full items-center gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <BookOpen className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-0.5">
              Today&apos;s Action
            </p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{dailyAction}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
      )}

      {/* Daily discipline challenge */}
      {challengeText && (
        <button
          onClick={() => onNavigate('discipline')}
          className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all ${
            challengeCompleted
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
          }`}
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            challengeCompleted ? 'bg-emerald-500/10' : 'bg-red-500/10'
          }`}>
            <Sword className={`h-4 w-4 ${challengeCompleted ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-0.5">
              Daily Challenge · {challengeCompleted ? 'Complete' : 'Pending'}
            </p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white line-clamp-1">{challengeText}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
      )}

      {/* Section grid */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          The System
        </p>
        <div className="grid grid-cols-2 gap-3">
          {SECTIONS.map((s) => {
            const { Icon } = s
            return (
              <button
                key={s.id}
                onClick={() => onNavigate(s.id)}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.98] transition-all"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.iconBg}`}>
                  <Icon className={`h-4.5 w-4.5 ${s.accent}`} style={{ height: '18px', width: '18px' }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">{s.label}</p>
                  <p className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-400">{s.hook}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

    </div>
  )
}
