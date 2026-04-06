'use client'

import { useState, useEffect } from 'react'
import PageTransition from '@/components/PageTransition'
import MeditationTabComponent from '@/components/mind/MeditationTab'
import SleepTabComponent from '@/components/mind/SleepTab'
import JournalTabComponent from '@/components/mind/JournalTab'
import {
  Moon,
  Sun,
  Flame,
  Trophy,
  CheckCircle2,
  Leaf,
  PenLine,
} from 'lucide-react'
import { STREAK_MILESTONES } from '@/lib/streakConstants'
import type { FitnessGoal } from '@/models/User'

// ---------------------------------------------------------------------------
// Tabs
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

const GOAL_COPY: Record<FitnessGoal, { headline: string; subtext: string }> = {
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
// Helpers
// ---------------------------------------------------------------------------

function getDayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
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

    fetch('/api/profile', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.profile?.fitnessGoal) {
          setFitnessGoal(data.profile.fitnessGoal as FitnessGoal)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingGoal(false))

    fetch('/api/streak', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setStreakData(data) })
      .catch(() => {})
      .finally(() => setLoadingStreak(false))
  }, [])

  const quote = MOTIVATION_QUOTES[getDayOfYear() % MOTIVATION_QUOTES.length]

  const nextMilestone =
    streakData?.nextMilestone ??
    STREAK_MILESTONES.find((m) => m > (streakData?.streakDays ?? 0)) ??
    null

  const milestoneProgress =
    nextMilestone && streakData ? Math.min(streakData.streakDays / nextMilestone, 1) : 0

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
            {nextMilestone && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-zinc-500">
                  <span>{streakData.streakDays} / {nextMilestone} days to next milestone</span>
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
            {streakData.streakFreezes > 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                {streakData.streakFreezes} streak freeze{streakData.streakFreezes !== 1 ? 's' : ''} available
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
          {['Completed a workout', 'Logged mood', 'Hit protein goal'].map((label) => (
            <div
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab components
// ---------------------------------------------------------------------------

const MeditationTab = MeditationTabComponent
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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Mind</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Mental wellness and mindfulness.</p>
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
