"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import ProgressChart from '@/components/ProgressChart'
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
import NutritionSummaryCard from '@/components/nutrition/NutritionSummaryCard'
import type { FitnessGoal } from '@/models/User'
import { Card } from '@/components/ui'
import CustomizeTilesModal from '@/components/dashboard/CustomizeTilesModal'
import {
  TILE_DEFS,
  DEFAULT_TILE_IDS,
  loadTilePreference,
  type DashboardTileId,
  type DashboardTileContext,
  type UserProgressData,
} from '@/lib/dashboardTiles'

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
  const [data, setData] = useState<UserProgressData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [showCheckInModal, setShowCheckInModal] = useState(false)
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
  const [tileIds, setTileIds] = useState<DashboardTileId[]>(DEFAULT_TILE_IDS)
  const [showCustomize, setShowCustomize] = useState(false)

  // Load saved tile preference on mount (client only)
  useEffect(() => {
    setTileIds(loadTilePreference())
  }, [])

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

        // Fetch mood status
        const moodRes = await fetch('/api/mood', { headers })
        let daysSinceMood = 0
        if (moodRes.ok) {
          const { daysSinceLastEntry, todaysMood: moodFromApi } = await moodRes.json()
          daysSinceMood = daysSinceLastEntry || 0
          if (moodFromApi) {
            setTodaysMood(moodFromApi as MoodLevel)
          }
        }

        // Fetch weight status
        const weightRes = await fetch('/api/weight', { headers })
        let daysSinceWeight = 0
        let lastWeight: number | undefined = undefined
        if (weightRes.ok) {
          const { daysSinceLastEntry, lastWeight: lastWeightFromApi } = await weightRes.json()
          daysSinceWeight = daysSinceLastEntry || 0
          lastWeight = lastWeightFromApi || undefined
        }

        setCheckInInfo({ daysSinceMood, daysSinceWeight, lastWeight })

        // Show check-in modal if mood or weight is due
        if (daysSinceMood > 0 || daysSinceWeight > 0) {
          setShowCheckInModal(true)
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

        const res = await fetch('/api/progress', { headers })
        if (res.ok) {
          const progressData = await res.json()
          setData(progressData)
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

        const [logRes, goalsRes] = await Promise.all([
          fetch('/api/nutrition/log', { headers }),
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
        const res = await fetch('/api/streak', { headers: { Authorization: `Bearer ${token}` } })
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
      const [progressData] = await Promise.all([fetchProgress(), fetchNutrition(), fetchStreak(), fetchProfile()])
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

  const handleCheckInClose = (checkInData: { mood?: MoodLevel; weight?: number }) => {
    setShowCheckInModal(false)
    
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
        body: JSON.stringify({ mood })
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
  }), [data, streakData, nutritionData, weeklyAvailability, weightUnit, todaysMood, isMoodUpdating, handleMoodCardChange])

  return (
    <>
      <CustomizeTilesModal
        open={showCustomize}
        selectedIds={tileIds}
        onClose={() => setShowCustomize(false)}
        onSave={(ids) => {
          setTileIds(ids)
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

      {/* Quick Stats — 2x2 mobile / 4-up desktop. Tiles come from the
          dashboardTiles registry; user selection persists to localStorage
          and reorders via the Customize modal. */}
      <div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {tileIds.map((id) => (
            <Fragment key={id}>{TILE_DEFS[id].render(tileCtx)}</Fragment>
          ))}
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowCustomize(true)}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            <Sliders className="h-3.5 w-3.5" />
            Customize tiles
          </button>
        </div>
      </div>

      {/* Next Workout */}
      <NextWorkoutCard />

      {/* Progress Chart */}
      <ProgressChart
        weightData={data.weightData}
        bmiData={data.bmiData}
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
              href="/dashboard/programming"
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
                href={`/dashboard/programming/${data.currentProgram.programId}`}
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

            {/* Progress Bar */}
            <div className="mb-3 sm:mb-4">
              <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <Link href="/dashboard/progress#records" className="hover:text-zinc-700 dark:hover:text-zinc-200">Progress</Link>
                <span>{Math.round((data.currentProgram.currentWeek / data.currentProgram.totalWeeks) * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${(data.currentProgram.currentWeek / data.currentProgram.totalWeeks) * 100}%` }}
                />
              </div>
            </div>

            <Link
              href={`/dashboard/programming/${data.currentProgram.programId}/workout${data.currentProgram.nextWorkoutDay ? `?day=${encodeURIComponent(data.currentProgram.nextWorkoutDay)}` : ''}`}
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
            href: '/dashboard/programming',
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
    </>
  )
}
