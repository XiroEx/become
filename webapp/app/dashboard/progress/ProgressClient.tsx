'use client'

import { useState, useEffect, useCallback } from 'react'
import { Flame, Dumbbell, TrendingUp, Trophy, Clock, ChevronRight } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import ProgressChart, { type MetricData } from '@/components/ProgressChart'
import Link from 'next/link'
import { getToken } from '@/lib/clientAuth'
import type { FitnessGoal } from '@/models/User'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PB {
  name: string
  weight: number
  reps: number
  date: string
}

interface RecentWorkout {
  date: string
  programId: string
  day: string
  duration?: number
  exerciseCount: number
}

interface ProgressData {
  weightData: MetricData[]
  bmiData: MetricData[]
  moodData: MetricData[]
  stats: {
    streakDays: number
    totalWorkouts: number
    thisWeekWorkouts: number
    goalProgress: number
  }
  longestStreak: number
  pbs: PB[]
  recentWorkouts: RecentWorkout[]
  targetWeightLbs: number | null
  weeklyAvailability: number | null
  fitnessGoal?: FitnessGoal
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon }: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          {icon}
        </div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
      <p className="text-2xl font-bold text-zinc-900 dark:text-white leading-none">{value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500">{sub}</p>}
    </div>
  )
}

// ── Log Weight Inline ──────────────────────────────────────────────────────────

function LogWeightForm({ onLogged }: { onLogged: (weight: number) => void }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const w = parseFloat(value)
    if (!w || w <= 0) return
    setSaving(true)
    try {
      const token = getToken()
      const res = await fetch('/api/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ weight: w }),
      })
      if (res.ok) {
        setSaved(true)
        setValue('')
        onLogged(w)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <p className="mt-3 text-sm font-medium text-green-600 dark:text-green-400">
        Weight logged ✓
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <div className="relative flex-1 max-w-[160px]">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="50"
          max="700"
          placeholder="lbs"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
        />
      </div>
      <button
        type="submit"
        disabled={saving || !value}
        className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {saving ? '…' : 'Log'}
      </button>
    </form>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ProgressClient() {
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    try {
      const [progressRes, profileRes] = await Promise.all([
        fetch('/api/progress?detailed=1', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (progressRes.ok) {
        const d = await progressRes.json()
        if (profileRes.ok) {
          const p = await profileRes.json()
          d.fitnessGoal = p.profile?.fitnessGoal
        }
        setData(d)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // When a weight is logged inline, prepend it to the chart data
  function handleWeightLogged(weight: number) {
    if (!data) return
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    setData(prev => {
      if (!prev) return prev
      const filtered = prev.weightData.filter(d => d.date !== today)
      return { ...prev, weightData: [...filtered, { date: today, value: weight }] }
    })
  }

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
        </div>
      </PageTransition>
    )
  }

  const stats = data?.stats
  const weeklyGoal = data?.weeklyAvailability ?? 4

  return (
    <PageTransition className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Progress</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Your numbers over time</p>
      </header>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Current Streak"
          value={stats?.streakDays ?? 0}
          sub="days"
          icon={<Flame className={`h-5 w-5 ${(stats?.streakDays ?? 0) > 0 ? 'text-orange-500' : 'text-zinc-400'}`} />}
        />
        <StatCard
          label="Longest Streak"
          value={data?.longestStreak ?? 0}
          sub="days"
          icon={<Trophy className="h-5 w-5 text-yellow-500" />}
        />
        <StatCard
          label="Total Workouts"
          value={stats?.totalWorkouts ?? 0}
          icon={<Dumbbell className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="This Week"
          value={`${stats?.thisWeekWorkouts ?? 0}/${weeklyGoal}`}
          icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
        />
      </div>

      {/* Weight chart */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Weight</h2>
          {data?.targetWeightLbs && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              Goal: {data.targetWeightLbs} lbs
            </span>
          )}
        </div>
        {(data?.weightData?.length ?? 0) > 0 ? (
          <>
            <ProgressChart
              weightData={data?.weightData ?? []}
              bmiData={data?.bmiData ?? []}
              moodData={[]}
              fitnessGoal={data?.fitnessGoal}
              targetWeight={data?.targetWeightLbs ?? undefined}
              defaultChart="weight"
            />
            <LogWeightForm onLogged={handleWeightLogged} />
          </>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">No weight entries yet</p>
            <LogWeightForm onLogged={handleWeightLogged} />
          </div>
        )}
      </div>

      {/* Mood chart */}
      {(data?.moodData?.length ?? 0) > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-white">Mood</h2>
          <ProgressChart
            weightData={[]}
            bmiData={[]}
            moodData={data?.moodData ?? []}
            defaultChart="mood"
          />
        </div>
      )}

      {/* Personal Records */}
      {(data?.pbs?.length ?? 0) > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-white">Personal Records</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(data?.pbs ?? []).slice(0, 10).map((pb) => (
              <div
                key={pb.name}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{pb.name}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{pb.date}</p>
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {pb.weight} lbs
                  </p>
                  {pb.reps > 0 && (
                    <p className="text-xs text-zinc-400">× {pb.reps} reps</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Workouts */}
      {(data?.recentWorkouts?.length ?? 0) > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Recent Workouts</h2>
            <Link
              href="/dashboard/calendar"
              className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400"
            >
              Calendar <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {(data?.recentWorkouts ?? []).map((w, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  <Dumbbell className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{w.day}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{w.date}</p>
                </div>
                <div className="shrink-0 text-right">
                  {w.duration && (
                    <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <Clock className="h-3 w-3" />
                      {w.duration}m
                    </div>
                  )}
                  {w.exerciseCount > 0 && (
                    <p className="text-xs text-zinc-400">{w.exerciseCount} exercises</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — no data at all */}
      {!loading && !data?.stats?.totalWorkouts && (data?.weightData?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <Dumbbell className="mx-auto mb-3 h-10 w-10 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Your progress will show up here as you train and log weight.
          </p>
          <Link
            href="/dashboard/programming"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Find a Program <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </PageTransition>
  )
}
