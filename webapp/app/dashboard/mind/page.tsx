'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import PageTransition from '@/components/PageTransition'
import SleepTabComponent from '@/components/mind/SleepTab'
import JournalTabComponent from '@/components/mind/JournalTab'
import {
  Wind,
  Target,
  Heart,
  Moon,
  Sun,
  ScanLine,
  Flame,
  Trophy,
  CheckCircle2,
  Leaf,
  PenLine,
} from 'lucide-react'
import { STREAK_MILESTONES } from '@/lib/streakConstants'
import type { FitnessGoal } from '@/models/User'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'meditation' | 'sleep' | 'motivation' | 'journal'

interface Tab {
  id: TabId
  label: string
  Icon: React.ElementType
}

const TABS: Tab[] = [
  { id: 'meditation', label: 'Meditation', Icon: Leaf },
  { id: 'sleep', label: 'Sleep', Icon: Moon },
  { id: 'motivation', label: 'Motivation', Icon: Flame },
  { id: 'journal', label: 'Journal', Icon: PenLine },
]

// ---------------------------------------------------------------------------
// Meditation types + data
// ---------------------------------------------------------------------------

interface MeditationCategory {
  id: string
  name: string
  Icon: React.ElementType
  color: string
  bgColor: string
  durations: number[]
}

const MEDITATION_CATEGORIES: MeditationCategory[] = [
  {
    id: 'breathing',
    name: 'Breathing',
    Icon: Wind,
    color: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20',
    durations: [3, 5, 10],
  },
  {
    id: 'focus',
    name: 'Focus',
    Icon: Target,
    color: 'text-violet-500 dark:text-violet-400',
    bgColor: 'bg-violet-50 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/20',
    durations: [5, 10, 20],
  },
  {
    id: 'stress',
    name: 'Stress Relief',
    Icon: Heart,
    color: 'text-rose-500 dark:text-rose-400',
    bgColor: 'bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20',
    durations: [5, 10, 15],
  },
  {
    id: 'sleep-prep',
    name: 'Sleep Prep',
    Icon: Moon,
    color: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/20',
    durations: [10, 15, 20],
  },
  {
    id: 'morning',
    name: 'Morning Routine',
    Icon: Sun,
    color: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20',
    durations: [5, 10],
  },
  {
    id: 'body-scan',
    name: 'Body Scan',
    Icon: ScanLine,
    color: 'text-emerald-500 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20',
    durations: [10, 20],
  },
]

// ---------------------------------------------------------------------------
// Motivation quotes
// ---------------------------------------------------------------------------

const MOTIVATION_QUOTES = [
  "The only bad workout is the one that didn't happen.",
  "Progress, not perfection.",
  "Your body can stand almost anything. It's your mind you have to convince.",
  "Discipline is doing what needs to be done, even when you don't feel like doing it.",
  "Every rep is a vote for the person you want to become.",
  "Strength doesn't come from what you can do. It comes from overcoming the things you once thought you couldn't.",
  "You don't have to be extreme, just consistent.",
  "The pain you feel today will be the strength you feel tomorrow.",
  "Small daily improvements are the key to staggering long-term results.",
  "Champions aren't made in the gyms. Champions are made from something they have deep inside them.",
  "Push yourself, because no one else is going to do it for you.",
  "Wake up with determination. Go to bed with satisfaction.",
  "It never gets easier. You just get stronger.",
  "The harder you work for something, the greater you'll feel when you achieve it.",
  "Don't stop when you're tired. Stop when you're done.",
  "Fitness is not about being better than someone else. It's about being better than you used to be.",
  "Train insane or remain the same.",
  "Success is usually the culmination of controlling failure.",
  "The body achieves what the mind believes.",
  "Take care of your body. It's the only place you have to live.",
  "One workout at a time. One day at a time.",
  "Be stronger than your strongest excuse.",
  "Results happen over time, not overnight. Work hard, stay consistent, and be patient.",
]

// ---------------------------------------------------------------------------
// Goal-specific copy
// ---------------------------------------------------------------------------

const GOAL_COPY: Record<
  FitnessGoal,
  { headline: string; subtext: string }
> = {
  lose_weight: {
    headline: "You're on a fat loss journey.",
    subtext: 'Every rep counts. Every choice matters. Keep showing up.',
  },
  gain_muscle: {
    headline: 'Building strength takes consistency.',
    subtext: 'Stay the course. Progressive overload adds up.',
  },
  maintain: {
    headline: 'Maintenance is an achievement.',
    subtext: 'Showing up every day is the work. Keep going.',
  },
  improve_performance: {
    headline: 'Performance gains come from discipline.',
    subtext: 'Recovery, consistency, and focus are your edge.',
  },
  general_health: {
    headline: 'Every healthy choice is an investment.',
    subtext: 'In yourself. In your future. Keep stacking wins.',
  },
}

// ---------------------------------------------------------------------------
// Breathing animation phases (inhale 4s → hold 2s → exhale 4s → hold 2s)
// ---------------------------------------------------------------------------

type BreathPhase = 'inhale' | 'hold-in' | 'exhale' | 'hold-out'

const BREATH_PHASES: { phase: BreathPhase; label: string; duration: number }[] =
  [
    { phase: 'inhale', label: 'Inhale', duration: 4000 },
    { phase: 'hold-in', label: 'Hold', duration: 2000 },
    { phase: 'exhale', label: 'Exhale', duration: 4000 },
    { phase: 'hold-out', label: 'Hold', duration: 2000 },
  ]

// ---------------------------------------------------------------------------
// Helper: format seconds as MM:SS
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Helper: day of year
// ---------------------------------------------------------------------------

function getDayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// ---------------------------------------------------------------------------
// MEDITATION TAB
// ---------------------------------------------------------------------------

function MeditationTab() {
  const [selectedCategory, setSelectedCategory] =
    useState<MeditationCategory | null>(null)
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [sessionCount, setSessionCount] = useState(0)

  // Breathing animation state
  const [breathPhaseIndex, setBreathPhaseIndex] = useState(0)
  const [breathProgress, setBreathProgress] = useState(0) // 0–1 within phase

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const breathIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load session count from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('become_meditation_sessions')
    if (stored) setSessionCount(parseInt(stored, 10) || 0)
  }, [])

  // Countdown timer
  useEffect(() => {
    if (sessionStarted && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            // Session complete — increment count
            const newCount = sessionCount + 1
            setSessionCount(newCount)
            localStorage.setItem(
              'become_meditation_sessions',
              String(newCount),
            )
            setSessionStarted(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [sessionStarted, isPaused, sessionCount])

  // Breathing cycle
  useEffect(() => {
    if (sessionStarted && !isPaused) {
      const phase = BREATH_PHASES[breathPhaseIndex]
      const tickMs = 50
      const steps = phase.duration / tickMs
      let currentStep = 0

      breathIntervalRef.current = setInterval(() => {
        currentStep++
        setBreathProgress(currentStep / steps)
        if (currentStep >= steps) {
          clearInterval(breathIntervalRef.current!)
          setBreathPhaseIndex((prev) => (prev + 1) % BREATH_PHASES.length)
          setBreathProgress(0)
        }
      }, tickMs)
    }
    return () => {
      if (breathIntervalRef.current) clearInterval(breathIntervalRef.current)
    }
  }, [sessionStarted, isPaused, breathPhaseIndex])

  const handleSelectCategory = (cat: MeditationCategory) => {
    setSelectedCategory(cat)
    setSelectedDuration(null)
    setSessionStarted(false)
  }

  const handleStartSession = () => {
    if (!selectedDuration) return
    setTimeLeft(selectedDuration * 60)
    setSessionStarted(true)
    setIsPaused(false)
    setBreathPhaseIndex(0)
    setBreathProgress(0)
  }

  const handleReset = useCallback(() => {
    setSessionStarted(false)
    setIsPaused(false)
    if (selectedDuration) setTimeLeft(selectedDuration * 60)
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (breathIntervalRef.current) clearInterval(breathIntervalRef.current)
    setBreathPhaseIndex(0)
    setBreathProgress(0)
  }, [selectedDuration])

  const handleEndSession = () => {
    setSelectedCategory(null)
    setSelectedDuration(null)
    setSessionStarted(false)
    setIsPaused(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (breathIntervalRef.current) clearInterval(breathIntervalRef.current)
  }

  // Breathing circle scale: 0.6 (rest) → 1.0 (full inhale)
  const currentPhase = BREATH_PHASES[breathPhaseIndex]
  let circleScale = 0.6
  if (currentPhase.phase === 'inhale') {
    circleScale = 0.6 + breathProgress * 0.4
  } else if (currentPhase.phase === 'hold-in') {
    circleScale = 1.0
  } else if (currentPhase.phase === 'exhale') {
    circleScale = 1.0 - breathProgress * 0.4
  } else {
    circleScale = 0.6
  }

  // If a category is selected, show the session panel
  if (selectedCategory) {
    const { Icon, color, bgColor } = selectedCategory
    return (
      <div className="space-y-4">
        {/* Session panel */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl border ${bgColor}`}
            >
              <Icon className={`h-6 w-6 ${color}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {selectedCategory.name}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose a duration</p>
            </div>
          </div>

          {/* Duration chips */}
          <div className="mb-6 flex flex-wrap gap-2">
            {selectedCategory.durations.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setSelectedDuration(d)
                  setSessionStarted(false)
                  setTimeLeft(d * 60)
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  selectedDuration === d
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {d} min
              </button>
            ))}
          </div>

          {/* Timer + breathing guide */}
          {selectedDuration && (
            <div className="flex flex-col items-center gap-6">
              {/* Breathing circle */}
              <div className="relative flex h-40 w-40 items-center justify-center">
                {/* Outer glow ring */}
                <div
                  className={`absolute inset-0 rounded-full transition-opacity duration-300 ${
                    sessionStarted && !isPaused ? 'opacity-30' : 'opacity-10'
                  }`}
                  style={{
                    background:
                      'radial-gradient(circle, rgb(99,102,241) 0%, transparent 70%)',
                    transform: `scale(${circleScale + 0.3})`,
                    transition: 'transform 50ms linear',
                  }}
                />
                {/* Main circle */}
                <div
                  className="flex h-28 w-28 items-center justify-center rounded-full bg-indigo-500/20 border-2 border-indigo-500/40"
                  style={{
                    transform: `scale(${circleScale})`,
                    transition: 'transform 50ms linear',
                  }}
                >
                  <span className="text-3xl font-mono font-bold text-zinc-900 dark:text-white">
                    {sessionStarted ? formatTime(timeLeft) : formatTime(selectedDuration * 60)}
                  </span>
                </div>
              </div>

              {/* Breath phase label */}
              {sessionStarted && !isPaused && (
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300 tracking-widest uppercase">
                  {currentPhase.label}
                </p>
              )}

              {/* Controls */}
              <div className="flex items-center gap-3">
                {!sessionStarted ? (
                  <button
                    onClick={handleStartSession}
                    className="rounded-xl bg-zinc-900 dark:bg-white px-8 py-3 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-100 active:scale-95 transition-all"
                  >
                    Start
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setIsPaused((p) => !p)}
                      className="rounded-xl bg-zinc-200 dark:bg-zinc-700 px-6 py-3 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-zinc-300 dark:hover:bg-zinc-600 active:scale-95 transition-all"
                    >
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      onClick={handleReset}
                      className="rounded-xl bg-zinc-100 dark:bg-zinc-800 px-6 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 transition-all"
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* End session */}
          <div className="mt-6 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <button
              onClick={handleEndSession}
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              ← Back to categories
            </button>
            {sessionCount > 0 && (
              <span className="text-xs text-zinc-500">
                {sessionCount} session{sessionCount !== 1 ? 's' : ''} completed
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Category grid
  return (
    <div className="space-y-4">
      {sessionCount > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center gap-2">
          <span className="text-indigo-500">✦</span>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold text-zinc-900 dark:text-white">{sessionCount}</span>{' '}
            meditation session{sessionCount !== 1 ? 's' : ''} completed
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MEDITATION_CATEGORIES.map((cat) => {
          const { Icon, color, bgColor } = cat
          return (
            <button
              key={cat.id}
              onClick={() => handleSelectCategory(cat)}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 active:scale-95 transition-all"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl border ${bgColor}`}
              >
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{cat.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {cat.durations.map((d) => (
                    <span
                      key={d}
                      className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400"
                    >
                      {d}m
                    </span>
                  ))}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MOTIVATION TAB
// ---------------------------------------------------------------------------

interface StreakData {
  streakDays: number
  longestStreak: number
  streakFreezes: number
  milestonesReached: number[]
  activityToday: boolean
  nextMilestone: number | null
}

function MotivationTab() {
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal | undefined>(undefined)
  const [streakData, setStreakData] = useState<StreakData | null>(null)
  const [loadingGoal, setLoadingGoal] = useState(true)
  const [loadingStreak, setLoadingStreak] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoadingGoal(false)
      setLoadingStreak(false)
      return
    }
    const headers = { Authorization: `Bearer ${token}` }

    // Fetch profile
    fetch('/api/profile', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.profile?.fitnessGoal) {
          setFitnessGoal(data.profile.fitnessGoal as FitnessGoal)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingGoal(false))

    // Fetch streak
    fetch('/api/streak', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStreakData(data)
      })
      .catch(() => {})
      .finally(() => setLoadingStreak(false))
  }, [])

  // Pick today's quote deterministically
  const quote = MOTIVATION_QUOTES[getDayOfYear() % MOTIVATION_QUOTES.length]

  // Streak progress to next milestone
  const nextMilestone =
    streakData?.nextMilestone ??
    STREAK_MILESTONES.find(
      (m) => m > (streakData?.streakDays ?? 0),
    ) ??
    null

  const milestoneProgress =
    nextMilestone && streakData
      ? Math.min(streakData.streakDays / nextMilestone, 1)
      : 0

  return (
    <div className="space-y-4">
      {/* Daily affirmation */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-800 p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Daily Affirmation
        </p>
        <blockquote className="text-lg font-medium leading-snug text-zinc-900 dark:text-white">
          &ldquo;{quote}&rdquo;
        </blockquote>
      </div>

      {/* Your Goal card */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Your Goal
        </p>
        {loadingGoal ? (
          <div className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        ) : fitnessGoal ? (
          <>
            <p className="text-base font-semibold text-zinc-900 dark:text-white">
              {GOAL_COPY[fitnessGoal].headline}
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {GOAL_COPY[fitnessGoal].subtext}
            </p>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Set a fitness goal to get personalised motivation.
            </p>
            <a
              href="/dashboard/profile"
              className="ml-4 shrink-0 rounded-lg bg-zinc-900 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Set goal
            </a>
          </div>
        )}
      </div>

      {/* Streak card */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Current Streak
          </p>
        </div>
        {loadingStreak ? (
          <div className="space-y-2">
            <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-2 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ) : streakData ? (
          <>
            <div className="mb-3 flex items-end gap-2">
              <span className="text-4xl font-bold text-zinc-900 dark:text-white">
                {streakData.streakDays}
              </span>
              <span className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
                day{streakData.streakDays !== 1 ? 's' : ''}
              </span>
              {streakData.activityToday && (
                <span className="mb-1 ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Active today
                </span>
              )}
            </div>

            {/* Milestone progress bar */}
            {nextMilestone && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-zinc-500">
                  <span>
                    {streakData.streakDays} / {nextMilestone} days to next milestone
                  </span>
                  <span>{Math.round(milestoneProgress * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-orange-400 transition-all duration-500"
                    style={{ width: `${milestoneProgress * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Freeze count */}
            {streakData.streakFreezes > 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                {streakData.streakFreezes} streak freeze
                {streakData.streakFreezes !== 1 ? 's' : ''} available
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">No streak data yet. Log a workout to start!</p>
        )}
      </div>

      {/* Weekly wins */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Weekly Wins
          </p>
        </div>
        <p className="mb-3 text-xs text-zinc-500">This week</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Completed a workout' },
            { label: 'Logged mood' },
            { label: 'Hit protein goal' },
          ].map(({ label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Real Sleep and Journal tabs — imported from components/mind/
const SleepTab = SleepTabComponent
const JournalTab = JournalTabComponent

// ---------------------------------------------------------------------------
// MAIN PAGE
// ---------------------------------------------------------------------------

export default function MindPage() {
  const [activeTab, setActiveTab] = useState<TabId>('meditation')

  return (
    <PageTransition className="flex flex-col">
      {/* Page header */}
      <header className="mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
          Mind
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Mental wellness and mindfulness.
        </p>
      </header>

      {/* Sticky tab bar — -mx-3 matches layout's px-3 padding exactly */}
      <div className="sticky top-0 z-10 -mx-3 mb-5 px-3 pb-3 pt-1 sm:-mx-6 sm:px-6 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md">
        <div className="flex gap-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/80 p-1">
          {TABS.map((tab) => {
            const { Icon } = tab
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all sm:text-sm ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1">
        {activeTab === 'meditation' && <MeditationTab />}
        {activeTab === 'sleep' && <SleepTab />}
        {activeTab === 'motivation' && <MotivationTab />}
        {activeTab === 'journal' && <JournalTab />}
      </div>
    </PageTransition>
  )
}
