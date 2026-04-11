'use client'

import { useState, useEffect } from 'react'
import {
  Wind, Eye, BookOpen, Sword, Shield, Users,
  Flame, ChevronRight, Loader2, Edit2, TrendingUp
} from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import IdentityOnboarding from '@/components/mind/IdentityOnboarding'
import type { SectionId } from '@/app/dashboard/mind/page'

// ─── Section config ────────────────────────────────────────────────────────────

interface SectionCard {
  id: SectionId
  label: string
  hook: string
  Icon: React.ElementType
  accent: string
  iconBg: string
}

const SECTIONS: SectionCard[] = [
  { id: 'state-shift',   label: 'State Shift',    hook: 'Reset in under 3 minutes',                  Icon: Wind,    accent: 'text-blue-400',    iconBg: 'bg-blue-500/10' },
  { id: 'self-image',    label: 'Self-Image',     hook: 'Reinforce who you\'re becoming',             Icon: Eye,     accent: 'text-violet-400',  iconBg: 'bg-violet-500/10' },
  { id: 'mission',       label: 'Mission',        hook: 'The reason behind everything',               Icon: BookOpen,accent: 'text-amber-400',   iconBg: 'bg-amber-500/10' },
  { id: 'discipline',    label: 'Discipline',     hook: 'Today\'s non-negotiable',                    Icon: Sword,   accent: 'text-red-400',     iconBg: 'bg-red-500/10' },
  { id: 'anti-sabotage', label: 'Anti-Sabotage',  hook: 'Kill the pattern before it kills progress',  Icon: Shield,  accent: 'text-orange-400',  iconBg: 'bg-orange-500/10' },
  { id: 'social',        label: 'Social',         hook: 'Your environment is your destiny',           Icon: Users,   accent: 'text-emerald-400', iconBg: 'bg-emerald-500/10' },
]

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

const STATE_RECS: Record<MindState, string> = {
  stressed:   'Breathe first. A 4-7-8 cycle resets your nervous system in 90 seconds.',
  distracted: 'Lock in. Focus Mode will anchor you to one thing.',
  low_energy: "Low energy is often a signal you've drifted from purpose. Read your mission.",
  locked_in:  "Don't waste it. Train, or attack your most important task right now.",
}

// ─── Data types ────────────────────────────────────────────────────────────────

interface Evolution {
  score: number
  challengesCompleted: number
  statesLogged: number
  hasMission: boolean
  startingLabel: string
}

interface Guidance {
  section: string
  reason: string
  startWith: string
}

interface IdentityData {
  profile: { futureSelf: string; currentSelf: string; primaryObstacle: string; startingPoint: string; onboardingCompleted: boolean } | null
  evolution: Evolution | null
  guidance: Guidance | null
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: (section: SectionId) => void
  streak: number
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function MindHub({ onNavigate, streak }: Props) {
  const [identity, setIdentity] = useState<IdentityData>({ profile: null, evolution: null, guidance: null })
  const [loading, setLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const [checkedIn, setCheckedIn] = useState<MindState | null>(null)
  const [logging, setLogging] = useState(false)
  const [dailyAction, setDailyAction] = useState<string | null>(null)
  const [challengeCompleted, setChallengeCompleted] = useState(false)
  const [challengeText, setChallengeText] = useState<string | null>(null)

  async function loadIdentity() {
    const token = getToken()
    if (!token) { setLoading(false); return }
    const h = { Authorization: `Bearer ${token}` }

    const [identityRes, missionRes, disciplineRes] = await Promise.all([
      fetch('/api/mind/identity', { headers: h }),
      fetch('/api/mind/mission', { headers: h }),
      fetch('/api/mind/discipline', { headers: h }),
    ])

    const [identityData, missionData, disciplineData] = await Promise.all([
      identityRes.ok ? identityRes.json() : null,
      missionRes.ok ? missionRes.json() : null,
      disciplineRes.ok ? disciplineRes.json() : null,
    ])

    if (identityData?.profile?.onboardingCompleted) {
      setIdentity({ profile: identityData.profile, evolution: identityData.evolution, guidance: identityData.guidance })
      setShowOnboarding(false)
    } else {
      setShowOnboarding(true)
    }

    if (missionData?.mission?.dailyAction) setDailyAction(missionData.mission.dailyAction)
    if (disciplineData?.challenge) {
      setChallengeCompleted(disciplineData.challenge.completed)
      setChallengeText(disciplineData.challenge.challenge)
    }
    setLoading(false)
  }

  useEffect(() => { loadIdentity() }, [])

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

  function onboardingComplete() {
    setShowOnboarding(false)
    setLoading(true)
    loadIdentity()
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  // ─── Onboarding ───────────────────────────────────────────────────────────────

  if (showOnboarding) {
    return (
      <div>
        <div className="mb-6 rounded-2xl bg-zinc-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            Before anything else
          </p>
          <p className="text-lg font-bold text-white leading-snug">
            You are not your current circumstances.
          </p>
          <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
            You are who you&apos;re choosing to become. This takes 60 seconds. Answer honestly — the system calibrates to you.
          </p>
        </div>
        <IdentityOnboarding onComplete={onboardingComplete} />
      </div>
    )
  }

  // ─── Hub ─────────────────────────────────────────────────────────────────────

  const { profile, evolution, guidance } = identity
  const score = evolution?.score ?? 0
  const progressPct = Math.min(score, 100)

  const checkedInState = checkedIn ? MIND_STATES.find((s) => s.id === checkedIn) : null
  const guidanceSection = SECTIONS.find((s) => s.id === guidance?.section)

  return (
    <div className="space-y-4">

      {/* Identity card */}
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                {evolution?.startingLabel ?? 'Your Identity'}
              </span>
              <div className="flex items-center gap-1">
                <Flame className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs font-bold text-orange-400">{streak}d</span>
              </div>
            </div>
            <p className="text-base font-bold text-white leading-snug line-clamp-3">
              {profile?.futureSelf}
            </p>
          </div>
          <button
            onClick={() => setShowOnboarding(true)}
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Evolution bar */}
        <div className="px-5 pb-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                Evolution
              </span>
            </div>
            <span className="text-xs font-bold text-zinc-400">{score} pts</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-zinc-500 to-white transition-all duration-700"
              style={{ width: `${Math.max(progressPct, 2)}%` }}
            />
          </div>
          <div className="mt-2 flex gap-3">
            {[
              { label: 'Challenges', value: evolution?.challengesCompleted ?? 0 },
              { label: 'Check-ins', value: evolution?.statesLogged ?? 0 },
              { label: 'Mission', value: evolution?.hasMission ? '✓' : '—' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-sm font-bold text-zinc-300">{s.value}</p>
                <p className="text-xs text-zinc-600">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Guidance — where to start */}
      {guidance && guidanceSection && (
        <button
          onClick={() => onNavigate(guidance.section as SectionId)}
          className="flex w-full items-start gap-4 rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-left hover:border-zinc-600 transition-all"
        >
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${guidanceSection.iconBg}`}>
            <guidanceSection.Icon className={`h-4 w-4 ${guidanceSection.accent}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-0.5">
              Start Here
            </p>
            <p className="text-sm font-bold text-white leading-tight mb-1">{guidanceSection.label}</p>
            <p className="text-xs leading-snug text-zinc-400">{guidance.startWith}</p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
        </button>
      )}

      {/* State check-in */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        {!checkedIn ? (
          <>
            <p className="mb-1 text-sm font-bold text-zinc-900 dark:text-white">
              Where&apos;s your head right now?
            </p>
            <p className="mb-4 text-xs text-zinc-500">
              Be honest. Your next move depends on it.
            </p>
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
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{checkedInState?.emoji}</span>
              <span className={`text-sm font-bold ${checkedInState?.color}`}>{checkedInState?.label}</span>
              <button onClick={() => setCheckedIn(null)} className="ml-auto text-xs text-zinc-400 hover:text-zinc-600">
                change
              </button>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {STATE_RECS[checkedIn]}
            </p>
            {checkedInState && checkedInState.section !== 'home' && (
              <button
                onClick={() => onNavigate(checkedInState.section)}
                className="flex items-center gap-2 rounded-xl bg-zinc-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900"
              >
                Go to {SECTIONS.find(s => s.id === checkedInState.section)?.label}
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Mission + discipline quick glance */}
      <div className="grid grid-cols-2 gap-3">
        {dailyAction && (
          <button
            onClick={() => onNavigate('mission')}
            className="flex flex-col gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10">
              <BookOpen className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-0.5">Today&apos;s Action</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white line-clamp-2 leading-snug">{dailyAction}</p>
            </div>
          </button>
        )}
        {challengeText && (
          <button
            onClick={() => onNavigate('discipline')}
            className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all ${
              challengeCompleted
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${challengeCompleted ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <Sword className={`h-4 w-4 ${challengeCompleted ? 'text-emerald-400' : 'text-red-400'}`} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-0.5">
                Challenge · {challengeCompleted ? '✓' : 'Pending'}
              </p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white line-clamp-2 leading-snug">{challengeText}</p>
            </div>
          </button>
        )}
      </div>

      {/* The System */}
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
                  <Icon className={`h-4 w-4 ${s.accent}`} />
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
