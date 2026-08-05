"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import NotificationOptIn from '@/components/NotificationOptIn'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import ProgressChart from '@/components/ProgressChart'
import { useTutorialMaybe } from '@redbtn/redtutorial'
import DailyCheckInModal, { MoodLevel } from '@/components/DailyCheckInModal'
import StreakMilestoneModal from '@/components/StreakMilestoneModal'
import ProgramNudgeModal, {
  NUDGE_KEY,
  type NudgeState,
  shouldShowNudge,
  recordNudgeDismiss,
} from '@/components/ProgramNudgeModal'
import { ClipboardList, TrendingUp, UtensilsCrossed, Dumbbell, ArrowRight, MessageCircle, Sliders } from 'lucide-react'
import NextWorkoutCard from '@/components/NextWorkoutCard'
import ResumeWorkoutButton from '@/components/ResumeWorkoutButton'
import NutritionSummaryCard from '@/components/nutrition/NutritionSummaryCard'
import type { FitnessGoal } from '@/models/User'
import { Card } from '@/components/ui'
import CustomizeDashboardModal from '@/components/dashboard/CustomizeDashboardModal'
import TileGrid from '@/components/dashboard/TileGrid'
import {
  type DashboardTileContext,
  type UserProgressData,
} from '@/lib/dashboardTiles'
import type { DashboardTile } from '@/lib/dashboardLayout/types'
import { readCache, writeCache } from '@/lib/clientCache'

// Cache keys for the stale-while-revalidate instant repaint on reopen. Stat
// tiles read from `data` (progress); the grid layout is owned here too.
const PROGRESS_CACHE_KEY = 'progress'
const LAYOUT_CACHE_KEY = 'dashboard.layout'

// Empty initial state — real data loads from /api/progress
const emptyData: UserProgressData = {
  weightData: [],
  bmiData: [],
  moodData: [],
  currentProgram: null,
  stats: {
    streakDays: 0,
    totalWorkouts: 0,
    thisWeekWorkouts: 0,
    goalProgress: 0
  }
}

export default function DashboardClient() {
  // Seed progress synchronously from cache so stat tiles paint last-known
  // values instantly on a reopen; only a cold first-ever load (no cache) shows
  // the loading skeleton.
  const [data, setData] = useState<UserProgressData>(
    () => readCache<UserProgressData>(PROGRESS_CACHE_KEY) ?? emptyData,
  )
  const [loading, setLoading] = useState(
    () => readCache<UserProgressData>(PROGRESS_CACHE_KEY) === null,
  )
  const [showCheckInModal, setShowCheckInModal] = useState(false)
  // The check-in is DUE but must wait its turn: a brand-new member lands here
  // with the onboarding tour running, and the modal was rendering straight over
  // it — the tour card sat behind a dialog the member had to dismiss first.
  const [checkInDue, setCheckInDue] = useState(false)
  const [todaysMood, setTodaysMood] = useState<MoodLevel | null>(null)
  const [isMoodUpdating, setIsMoodUpdating] = useState(false)
  const [checkInInfo, setCheckInInfo] = useState({
    daysSinceMood: 0,
    daysSinceWeight: 0,
    lastWeight: undefined as number | undefined
  })
  const [nutritionData, setNutritionData] = useState<{
    calories: { consumed: number; goal: number }
    protein: { current: number; goal: number }
    carbs: { current: number; goal: number }
    fats: { current: number; goal: number }
    water: { current: number; goal: number }
  } | null>(null)
  const [streakData, setStreakData] = useState<{
    streakDays: number
    longestStreak: number
    streakFreezes: number
    milestonesReached: number[]
    activityToday: boolean
    nextMilestone: number | null
  } | null>(null)
  const [milestoneCelebration, setMilestoneCelebration] = useState<number | null>(null)
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal | undefined>(undefined)
  const [weeklyAvailability, setWeeklyAvailability] = useState<number>(4)
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs')
  const [showNudge, setShowNudge] = useState(false)
  const [layout, setLayout] = useState<DashboardTile[] | null>(
    () => readCache<DashboardTile[]>(LAYOUT_CACHE_KEY),
  )
  const [showCustomize, setShowCustomize] = useState(false)

  useEffect(() => {
    // Check days since last mood and weight entries
    async function checkCheckInStatus() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          return
        }

        const headers: HeadersInit = {
          'Authorization': `Bearer ${token}`
        }

        // One authoritative answer from the server. This used to be two calls
        // whose day-counters were OR'd together on the client, which meant
        // logging only your weight left the mood counter above zero and the
        // check-in came straight back — the complaint members were raising.
        // /api/checkin owns the rule now: both halves closes the day, "Skip for
        // Today" closes the day, and only a genuinely partial check-in gets the
        // 8-hour window.
        const res = await fetch(`/api/checkin?tz=${new Date().getTimezoneOffset()}`, { headers })
        if (!res.ok) return

        const status = await res.json()

        if (status.todaysMood) {
          setTodaysMood(status.todaysMood as MoodLevel)
        }

        setCheckInInfo({
          daysSinceMood: status.daysSinceMood ?? 0,
          daysSinceWeight: status.daysSinceWeight ?? 0,
          lastWeight: status.lastWeight ?? undefined,
        })

        if (status.due) {
          setCheckInDue(true)
        }
      } catch (error) {
        console.error('Failed to check check-in status:', error)
      }
    }

    // Fetch user progress data — returns raw response for reuse in nudge check
    async function fetchProgress(): Promise<UserProgressData | null> {
      try {
        const token = localStorage.getItem('token')
        const headers: HeadersInit = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const res = await fetch(`/api/progress?tz=${new Date().getTimezoneOffset()}`, { headers })
        if (res.ok) {
          const progressData = await res.json()
          setData(progressData)
          writeCache(PROGRESS_CACHE_KEY, progressData)
          return progressData
        }
        return null
      } catch (error) {
        console.error('Failed to fetch progress:', error)
        return null
      } finally {
        setLoading(false)
      }
    }

    // Fetch nutrition data for today
    async function fetchNutrition() {
      try {
        const token = localStorage.getItem('token')
        const headers: HeadersInit = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const tz = new Date().getTimezoneOffset()
        const [logRes, goalsRes] = await Promise.all([
          fetch(`/api/nutrition/log?tz=${tz}`, { headers }),
          fetch('/api/nutrition/goals', { headers })
        ])

        if (logRes.ok && goalsRes.ok) {
          const logData = await logRes.json()
          const goalsData = await goalsRes.json()

          // logData.water may be an object {current, goal} or a number
          const waterCurrent = typeof logData.water === 'object' ? logData.water?.current ?? 0 : logData.water ?? 0
          const totals = logData.dailyTotals || {}

          setNutritionData({
            calories: { consumed: totals.calories || logData.calories || 0, goal: goalsData.calories || 2000 },
            protein: { current: totals.protein || logData.protein || 0, goal: goalsData.protein || 150 },
            carbs: { current: totals.carbs || logData.carbs || 0, goal: goalsData.carbs || 250 },
            fats: { current: totals.fats || logData.fats || 0, goal: goalsData.fats || 65 },
            water: { current: waterCurrent, goal: goalsData.waterGoal || goalsData.water || 96 }
          })
        }
      } catch (error) {
        console.error('Failed to fetch nutrition data:', error)
        // Don't break dashboard if nutrition API fails
      }
    }

    // Fetch streak data
    async function fetchStreak() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await fetch(`/api/streak?tz=${new Date().getTimezoneOffset()}`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = await res.json()
          setStreakData(data)
        }
      } catch {
        // non-critical
      }
    }

    // Fetch user profile for goal-aware UI framing
    async function fetchProfile() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const profileData = await res.json()
          if (profileData.profile?.fitnessGoal) {
            setFitnessGoal(profileData.profile.fitnessGoal as FitnessGoal)
          }
          if (profileData.profile?.weeklyAvailability) {
            setWeeklyAvailability(profileData.profile.weeklyAvailability)
          }
          if (profileData.profile?.weightUnit === 'kg' || profileData.profile?.weightUnit === 'lbs') {
            setWeightUnit(profileData.profile.weightUnit)
          }
        }
      } catch {
        // non-critical
      }
    }

    // Fetch the unified dashboard tile layout (source of truth for the grid).
    // Owned here so a save in the customizer can update it in place without a
    // full reload.
    async function fetchLayout() {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/dashboard/layout', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (res.ok) {
          const json = await res.json()
          const nextLayout = json.layout ?? []
          setLayout(nextLayout)
          writeCache(LAYOUT_CACHE_KEY, nextLayout)
        } else {
          // Keep any cached layout rather than blanking the grid on a transient
          // failure; only fall back to empty if we have nothing cached.
          setLayout((prev) => prev ?? [])
        }
      } catch {
        setLayout((prev) => prev ?? [])
      }
    }

    // Check whether to show the program nudge modal
    function checkProgramNudge(hasProgram: boolean) {
      if (hasProgram) return // already enrolled — never show
      try {
        const raw = localStorage.getItem(NUDGE_KEY)
        const state: NudgeState | null = raw ? JSON.parse(raw) : null
        if (shouldShowNudge(state)) setShowNudge(true)
      } catch {
        setShowNudge(true) // on parse error, just show it
      }
    }

    // Initialize dashboard
    async function init() {
      await checkCheckInStatus()
      const [progressData] = await Promise.all([
        fetchProgress(),
        fetchNutrition(),
        fetchStreak(),
        fetchProfile(),
        fetchLayout(),
      ])
      checkProgramNudge(!!progressData?.currentProgram)
    }

    init()
  }, [])

  function handleNudgeDismiss() {
    setShowNudge(false)
    try {
      const raw = localStorage.getItem(NUDGE_KEY)
      const current: NudgeState | null = raw ? JSON.parse(raw) : null
      localStorage.setItem(NUDGE_KEY, JSON.stringify(recordNudgeDismiss(current)))
    } catch {}
  }

  // Hold the daily check-in behind the onboarding tour. `ready` guards the brief
  // window where tutorial progress is still loading — opening during it would
  // flash the modal and then get covered by the tour that starts a beat later.
  // Once the tour finishes (or there is no tour), the queued check-in opens, so
  // a new member sees the tutorial first and the check-in immediately after.
  const tutorial = useTutorialMaybe()
  const tutorialBusy = !!tutorial && (!tutorial.ready || !!tutorial.active)

  useEffect(() => {
    if (checkInDue && !tutorialBusy) {
      setShowCheckInModal(true)
      setCheckInDue(false)

      // Stamp "we asked" on the SERVER, not in localStorage. iOS gives a
      // home-screen PWA its own storage container, so the old local stamp meant
      // checking in from the installed app still re-prompted in Safari.
      const token = localStorage.getItem('token')
      fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'shown', tz: new Date().getTimezoneOffset() }),
      }).catch(() => {})
    }
  }, [checkInDue, tutorialBusy])

  const handleCheckInClose = (checkInData: { mood?: MoodLevel; weight?: number }) => {
    setShowCheckInModal(false)
    setCheckInDue(false)

    const todayFormatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    
    if (checkInData.mood) {
      setTodaysMood(checkInData.mood)
      // Update mood data in state for chart
      setData(prev => ({
        ...prev,
        moodData: [...prev.moodData, { date: todayFormatted, value: checkInData.mood! }]
      }))
    }
    
    if (checkInData.weight) {
      // Update weight data in state for chart
      setData(prev => ({
        ...prev,
        weightData: [...prev.weightData, { date: todayFormatted, value: checkInData.weight! }]
      }))
    }
  }

  // Handle mood change from the MoodCard. Memoized so the dashboard tile
  // context doesn't change identity on every render.
  const handleMoodCardChange = useCallback(async (mood: MoodLevel) => {
    setIsMoodUpdating(true)
    
    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch('/api/mood', {
        method: 'POST',
        headers,
        body: JSON.stringify({ mood, tz: new Date().getTimezoneOffset() })
      })

      if (res.ok) {
        const resData = await res.json()
        setTodaysMood(mood)

        // Update mood data in chart
        const todayFormatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        setData(prev => {
          const existingIndex = prev.moodData.findIndex(d => d.date === todayFormatted)
          if (existingIndex >= 0) {
            const newMoodData = [...prev.moodData]
            newMoodData[existingIndex] = { date: todayFormatted, value: mood }
            return { ...prev, moodData: newMoodData }
          } else {
            return { ...prev, moodData: [...prev.moodData, { date: todayFormatted, value: mood }] }
          }
        })

        // Update streak state + check milestone
        if (resData.streak) {
          setStreakData(prev => prev ? {
            ...prev,
            streakDays: resData.streak.streakDays,
            activityToday: true,
          } : prev)
          if (resData.streak.newMilestone) {
            setMilestoneCelebration(resData.streak.newMilestone)
          }
        }
      }
    } catch (error) {
      console.error('Failed to update mood:', error)
    } finally {
      setIsMoodUpdating(false)
    }
  }, [])

  // Build the context object passed to each tile's render fn. Memoized so
  // tiles don't re-render on unrelated state changes.
  const tileCtx = useMemo<DashboardTileContext>(() => ({
    data,
    streakData,
    nutritionData: nutritionData
      ? {
          calories: nutritionData.calories,
          protein: nutritionData.protein,
          carbs: nutritionData.carbs,
          fats: nutritionData.fats,
          water: nutritionData.water,
        }
      : null,
    weeklyAvailability,
    weightUnit,
    todaysMood,
    isMoodUpdating,
    onMoodChange: handleMoodCardChange,
    // Stat tiles render a shimmer instead of zeros/dashes while the first
    // progress load is in flight. A cache hit clears `loading` synchronously on
    // mount, so reopens never show the skeleton.
    loading,
  }), [data, streakData, nutritionData, weeklyAvailability, weightUnit, todaysMood, isMoodUpdating, handleMoodCardChange, loading])

  return (
    <>
      <CustomizeDashboardModal
        open={showCustomize}
        layout={layout ?? []}
        onClose={() => setShowCustomize(false)}
        onSaved={(nextLayout) => {
          setLayout(nextLayout)
          setShowCustomize(false)
        }}
      />

      <DailyCheckInModal
        isOpen={showCheckInModal}
        onClose={handleCheckInClose}
        daysSinceMood={checkInInfo.daysSinceMood}
        daysSinceWeight={checkInInfo.daysSinceWeight}
        lastWeight={checkInInfo.lastWeight}
        weightUnit={weightUnit}
      />

      <StreakMilestoneModal
        milestone={milestoneCelebration}
        streakDays={streakData?.streakDays ?? data.stats.streakDays}
        onClose={() => setMilestoneCelebration(null)}
      />

      <ProgramNudgeModal
        open={showNudge}
        fitnessGoal={fitnessGoal ?? null}
        onExplore={handleNudgeDismiss}
      />
      
      <PageTransition className="space-y-4 sm:space-y-6">
      {/* Header */}
      <header className="mb-2 sm:mb-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Dashboard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">Track your fitness journey</p>
      </header>

      {/* Unified tile grid — one themed grid rendering stat + metric +
          smart-rotating tiles (and dashboard-surface suggestion cards) from
          the user's saved layout. Replaces the old separate StatTile grid and
          the dark IntelligenceRotator block. */}
      <div data-tour="dashboard-tiles">
        <TileGrid layout={layout} statContext={tileCtx} />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            data-tour="customize-tiles"
            onClick={() => setShowCustomize(true)}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            <Sliders className="h-3.5 w-3.5" />
            Customize tiles
          </button>
        </div>
      </div>

      {/* Resume Active Workout — only renders when there's an in-progress
          workout log for today; quietly disappears once it's completed. */}
      <ResumeWorkoutButton />

      {/* Next Workout */}
      <NextWorkoutCard />

      {/* Progress Chart */}
      <ProgressChart
        weightData={data.weightData}
        bmiData={data.bmiData}
        bodyFatData={data.bodyFatData}
        leanMassData={data.leanMassData}
        moodData={data.moodData}
        fitnessGoal={fitnessGoal}
      />

      {/* Nutrition Summary */}
      {nutritionData && (
        <NutritionSummaryCard
          calories={nutritionData.calories}
          protein={nutritionData.protein}
          carbs={nutritionData.carbs}
          fats={nutritionData.fats}
          water={nutritionData.water}
        />
      )}

      {/* First-time empty state — no program, no workouts yet */}
      {!loading && !data.currentProgram && data.stats.totalWorkouts === 0 && (
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
              <Dumbbell className="h-6 w-6 text-zinc-500 dark:text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-zinc-900 dark:text-white">No program yet</h3>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                Browse programs and enroll when you&apos;re ready.
              </p>
            </div>
            <Link
              href="/dashboard/workout"
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Browse
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>
      )}

      {/* Current Program & Mindset - side by side on desktop, stacked on mobile */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Current Program */}
        {data.currentProgram && (
          <Card>
            <div className="mb-3 flex items-center justify-between sm:mb-4">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white sm:text-lg">Current Program</h2>
              <Link
                href={`/dashboard/workout/${data.currentProgram.programId}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                View
              </Link>
            </div>

            <div className="mb-3 sm:mb-4">
              <h3 className="font-medium text-zinc-900 dark:text-white">{data.currentProgram.name}</h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Phase {data.currentProgram.currentPhase} • Week {data.currentProgram.currentWeek} of {data.currentProgram.totalWeeks}
              </p>
            </div>

            {/* Progress Bar — session-based (completed/total) so it matches the
                workout hub's %. Falls back to the week ratio only when session
                counts aren't available. */}
            {(() => {
              const cp = data.currentProgram
              const pct = (cp.totalWorkouts && cp.totalWorkouts > 0 && cp.completedWorkouts != null)
                ? Math.round((cp.completedWorkouts / cp.totalWorkouts) * 100)
                : Math.round((cp.currentWeek / cp.totalWeeks) * 100)
              return (
                <div className="mb-3 sm:mb-4">
                  <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <Link href="/dashboard/progress#records" className="hover:text-zinc-700 dark:hover:text-zinc-200">Progress</Link>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className="h-full bg-green-500 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })()}

            <Link
              href={`/dashboard/workout/${data.currentProgram.programId}/workout${data.currentProgram.nextWorkoutDay ? `?day=${encodeURIComponent(data.currentProgram.nextWorkoutDay)}` : ''}`}
              className="flex w-full items-center justify-between gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              <span className="text-left">Continue: {data.currentProgram.nextWorkout}</span>
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </Card>
        )}

        {/* Mindset Card */}
        <Card>
          <div className="mb-3 flex items-center justify-between sm:mb-4">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white sm:text-lg">Mindset</h2>
            <Link
              href="/dashboard/mind"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              View
            </Link>
          </div>

          <div className="mb-3 sm:mb-4">
            <h3 className="font-medium text-zinc-900 dark:text-white">Daily Reflection</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Track your mental wellness journey
            </p>
          </div>

          {/* Mood Summary — flat tinted nested block (no border). Padding
              tightened from p-3 to p-2.5 so it doesn't read as another card. */}
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/50 sm:mb-4">
            <div className="flex -space-x-1">
              {data.moodData.slice(-3).map((mood, idx) => {
                const moodColors: Record<number, string> = {
                  1: 'bg-red-400',
                  2: 'bg-orange-400',
                  3: 'bg-amber-400',
                  4: 'bg-lime-400',
                  5: 'bg-emerald-400'
                }
                const moodEmojis: Record<number, string> = {
                  1: '😞',
                  2: '😕',
                  3: '😐',
                  4: '🙂',
                  5: '😊'
                }
                return (
                  <div
                    key={idx}
                    className={`flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                      moodColors[mood.value] || 'bg-zinc-400'
                    }`}
                  >
                    <span className="text-sm">
                      {moodEmojis[mood.value] || '😐'}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {data.moodData.length > 0 ? `${data.moodData.length} mood entries` : 'No entries yet'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Last 7 days</p>
            </div>
          </div>

          <Link
            href="/dashboard/mind"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200 sm:py-3"
          >
            <span>Explore Mindset</span>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </Card>
      </div>

      {/* Quick Links — 4-tile grid. Visually identical except icon + label.
          Card primitive, hover swap on border (not shadow elevation). */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {[
          {
            href: '/dashboard/workout',
            icon: <ClipboardList className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />,
            title: 'All Programs',
            description: 'Browse training plans',
          },
          {
            href: '/dashboard/nutrition',
            icon: <UtensilsCrossed className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />,
            title: 'Nutrition',
            description: nutritionData
              ? `${nutritionData.calories.consumed.toLocaleString()} / ${nutritionData.calories.goal.toLocaleString()} cal today`
              : 'Track meals & macros',
          },
          {
            href: '/dashboard/progress',
            icon: <TrendingUp className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />,
            title: 'Progress',
            description: 'Log weight & measurements',
          },
          {
            href: '/dashboard/chat',
            icon: <MessageCircle className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />,
            title: 'Connect',
            description: 'Chat with trainers',
          },
        ].map((link) => (
          <Card
            key={link.href}
            as={Link}
            href={link.href}
            className="flex items-center gap-3 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
              {link.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-zinc-900 dark:text-white">{link.title}</h3>
              <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{link.description}</p>
            </div>
            <svg className="h-5 w-5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Card>
        ))}
      </div>
    </PageTransition>
    <NotificationOptIn />
    </>
  )
}
