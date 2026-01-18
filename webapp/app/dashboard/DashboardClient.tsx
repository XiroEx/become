"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import ProgressChart, { MetricData } from '@/components/ProgressChart'
import DailyCheckInModal, { MoodLevel } from '@/components/DailyCheckInModal'
import MoodCard from '@/components/MoodCard'
import { ClipboardList, Flame, Target, TrendingUp } from 'lucide-react'

interface UserProgressData {
  weightData: MetricData[]
  bmiData: MetricData[]
  moodData: MetricData[]
  currentProgram: {
    programId: string
    name: string
    currentPhase: number
    currentWeek: number
    totalWeeks: number
    nextWorkout: string
  } | null
  stats: {
    streakDays: number
    totalWorkouts: number
    thisWeekWorkouts: number
    goalProgress: number
  }
}

// Mock data for initial display
const mockData: UserProgressData = {
  weightData: [
    { date: 'Nov 1', value: 185 },
    { date: 'Nov 8', value: 183.5 },
    { date: 'Nov 15', value: 182 },
    { date: 'Nov 22', value: 181.5 },
    { date: 'Nov 29', value: 180 },
    { date: 'Dec 6', value: 179.5 },
    { date: 'Dec 13', value: 178 },
  ],
  bmiData: [
    { date: 'Nov 1', value: 26.5 },
    { date: 'Nov 8', value: 26.3 },
    { date: 'Nov 15', value: 26.1 },
    { date: 'Nov 22', value: 26.0 },
    { date: 'Nov 29', value: 25.8 },
    { date: 'Dec 6', value: 25.7 },
    { date: 'Dec 13', value: 25.5 },
  ],
  moodData: [
    { date: 'Dec 12', value: 2 },
    { date: 'Dec 13', value: 3 },
    { date: 'Dec 14', value: 3 },
    { date: 'Dec 15', value: 2 },
    { date: 'Dec 16', value: 3 },
    { date: 'Dec 17', value: 2 },
  ],
  currentProgram: {
    programId: 'become-12-week',
    name: 'BECOME — 12 Week Fat-Loss Foundation',
    currentPhase: 1,
    currentWeek: 3,
    totalWeeks: 12,
    nextWorkout: 'Day 2 - Lower Body Strength'
  },
  stats: {
    streakDays: 12,
    totalWorkouts: 25,
    thisWeekWorkouts: 3,
    goalProgress: 65
  }
}

export default function DashboardClient() {
  const [data, setData] = useState<UserProgressData>(mockData)
  const [loading, setLoading] = useState(true)
  const [showCheckInModal, setShowCheckInModal] = useState(true) // DEBUG: always show
  const [todaysMood, setTodaysMood] = useState<MoodLevel | null>(null)
  const [isMoodUpdating, setIsMoodUpdating] = useState(false)
  const [checkInInfo, setCheckInInfo] = useState({ 
    daysSinceMood: 0,
    daysSinceWeight: 0,
    lastWeight: undefined as number | undefined
  })

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
      } catch (error) {
        console.error('Failed to check check-in status:', error)
      }
    }

    // Fetch user progress data
    async function fetchProgress() {
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
        }
      } catch (error) {
        console.error('Failed to fetch progress:', error)
        // Keep mock data on error
      } finally {
        setLoading(false)
      }
    }

    // Initialize dashboard
    async function init() {
      await checkCheckInStatus()
      await fetchProgress()
    }

    init()
  }, [])

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

  // Handle mood change from the MoodCard
  const handleMoodCardChange = async (mood: MoodLevel) => {
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
        setTodaysMood(mood)
        
        // Update mood data in chart
        const todayFormatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        setData(prev => {
          // Check if today already exists in mood data
          const existingIndex = prev.moodData.findIndex(d => d.date === todayFormatted)
          if (existingIndex >= 0) {
            const newMoodData = [...prev.moodData]
            newMoodData[existingIndex] = { date: todayFormatted, value: mood }
            return { ...prev, moodData: newMoodData }
          } else {
            return { ...prev, moodData: [...prev.moodData, { date: todayFormatted, value: mood }] }
          }
        })
      }
    } catch (error) {
      console.error('Failed to update mood:', error)
    } finally {
      setIsMoodUpdating(false)
    }
  }

  return (
    <>
      <DailyCheckInModal 
        isOpen={showCheckInModal} 
        onClose={handleCheckInClose}
        daysSinceMood={checkInInfo.daysSinceMood}
        daysSinceWeight={checkInInfo.daysSinceWeight}
        lastWeight={checkInInfo.lastWeight}
      />
      
      <PageTransition className="space-y-4 sm:space-y-6">
      {/* Header */}
      <header className="mb-2 sm:mb-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Dashboard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">Track your fitness journey</p>
      </header>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:gap-3 sm:p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30 sm:h-10 sm:w-10">
            <Flame className="h-4 w-4 text-orange-600 dark:text-orange-400 sm:h-5 sm:w-5" />
          </div>
          <div>
            <p className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">{data.stats.streakDays}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Day Streak</p>
          </div>
        </div>
        
        {/* Today's Mood Card - replaces Workouts */}
        <MoodCard 
          currentMood={todaysMood} 
          onMoodChange={handleMoodCardChange}
          isUpdating={isMoodUpdating}
        />
        
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:gap-3 sm:p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30 sm:h-10 sm:w-10">
            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400 sm:h-5 sm:w-5" />
          </div>
          <div>
            <p className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">{data.stats.thisWeekWorkouts}/4</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">This Week</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:gap-3 sm:p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30 sm:h-10 sm:w-10">
            <Target className="h-4 w-4 text-purple-600 dark:text-purple-400 sm:h-5 sm:w-5" />
          </div>
          <div>
            <p className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">{data.stats.goalProgress}%</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Goal</p>
          </div>
        </div>
      </div>

      {/* Progress Chart */}
      <ProgressChart
        weightData={data.weightData}
        bmiData={data.bmiData}
        moodData={data.moodData}
      />

      {/* Current Program & Mindset - side by side on desktop, stacked on mobile */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Current Program */}
        {data.currentProgram && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
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
                <span>Progress</span>
                <span>{Math.round((data.currentProgram.currentWeek / data.currentProgram.totalWeeks) * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div 
                  className="h-full bg-linear-to-r from-green-500 to-emerald-600 transition-all duration-300"
                  style={{ width: `${(data.currentProgram.currentWeek / data.currentProgram.totalWeeks) * 100}%` }}
                />
              </div>
            </div>

            <Link
              href={`/dashboard/programming/${data.currentProgram.programId}/workout`}
              className="flex w-full items-center justify-between gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              <span className="text-left">Continue: {data.currentProgram.nextWorkout}</span>
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}

        {/* Mindset Card */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
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

          {/* Mood Summary */}
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800 sm:mb-4">
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
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white dark:border-zinc-800 ${
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
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Link 
          href="/dashboard/programming" 
          className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <ClipboardList className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-zinc-900 dark:text-white">All Programs</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Browse training plans</p>
          </div>
          <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        <Link 
          href="/dashboard/nutrition" 
          className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <svg className="h-5 w-5 text-zinc-600 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-zinc-900 dark:text-white">Nutrition</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Track meals & macros</p>
          </div>
          <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        <Link 
          href="/dashboard/progress" 
          className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <TrendingUp className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-zinc-900 dark:text-white">Progress</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Log weight & measurements</p>
          </div>
          <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        <Link 
          href="/dashboard/chat" 
          className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <svg className="h-5 w-5 text-zinc-600 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-zinc-900 dark:text-white">Connect</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Chat with trainers</p>
          </div>
          <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </PageTransition>
    </>
  )
}
