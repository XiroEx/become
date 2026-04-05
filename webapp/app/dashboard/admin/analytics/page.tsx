'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import PageTransition from '@/components/PageTransition'

interface AdminStats {
  users: {
    total: number
    newThisWeek: number
    newThisMonth: number
    byRole: { user: number; trainer: number; admin: number }
    onboardingCompleted: number
  }
  activity: {
    totalWorkoutsLogged: number
    activeThisWeek: number
    activeThisMonth: number
    avgStreakDays: number
    topStreak: number
  }
  workoutsByDay: Array<{ date: string; count: number }>
  moodAvg: number | null
}

const MOOD_EMOJI: Record<number, string> = {
  1: '😞',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😄',
}

function getMoodEmoji(avg: number): string {
  return MOOD_EMOJI[Math.round(avg)] ?? '😐'
}

function getMoodLabel(avg: number): string {
  if (avg >= 4.5) return 'Excellent mood across the platform!'
  if (avg >= 4) return 'Feeling pretty good!'
  if (avg >= 3) return 'Doing okay overall.'
  if (avg >= 2) return 'Could be better.'
  return 'Struggling a bit.'
}

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '0%'
  return `${Math.round((num / denom) * 100)}%`
}

export default function AdminAnalyticsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem('token')
      if (!token) return
      try {
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json() as AdminStats
          setStats(data)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const chartStroke = isDark ? '#e4e4e7' : '#18181b'
  const chartFill = isDark ? '#27272a' : '#f4f4f5'
  const chartAxis = '#71717a'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Failed to load analytics.
      </div>
    )
  }

  const total = stats.users.total
  const roleEntries: Array<{ label: string; count: number; color: string }> = [
    { label: 'Users', count: stats.users.byRole.user, color: 'bg-zinc-400' },
    { label: 'Trainers', count: stats.users.byRole.trainer, color: 'bg-blue-500' },
    { label: 'Admins', count: stats.users.byRole.admin, color: 'bg-red-500' },
  ]

  const onboardingPct =
    total > 0 ? Math.round((stats.users.onboardingCompleted / total) * 100) : 0

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Analytics</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Platform-wide metrics</p>
      </div>

      {/* User stats row */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard label="Total Users" value={stats.users.total} />
        <StatCard label="New This Week" value={stats.users.newThisWeek} />
        <StatCard label="New This Month" value={stats.users.newThisMonth} />
        <StatCard label="Onboarding %" value={`${onboardingPct}%`} />
      </div>

      {/* Activity row */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard label="Active (7d)" value={stats.activity.activeThisWeek} />
        <StatCard label="Active (30d)" value={stats.activity.activeThisMonth} />
        <StatCard label="Avg Streak" value={`${stats.activity.avgStreakDays}d`} />
        <StatCard label="Top Streak" value={`${stats.activity.topStreak}d`} />
      </div>

      {/* Workout trend chart */}
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Workout Trend — Last 30 Days
        </h2>
        {stats.workoutsByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={stats.workoutsByDay}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#3f3f46' : '#e4e4e7'} />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tick={{ fontSize: 10, fill: chartAxis }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: chartAxis }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#18181b' : '#fff',
                  border: `1px solid ${isDark ? '#3f3f46' : '#e4e4e7'}`,
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: isDark ? '#e4e4e7' : '#18181b',
                }}
                labelFormatter={(label: string) => formatChartDate(label)}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={chartStroke}
                fill={chartFill}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No workout data in this period
          </p>
        )}
      </div>

      {/* Role breakdown */}
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Role Breakdown
        </h2>
        <div className="flex flex-col gap-3">
          {roleEntries.map((entry) => {
            const rolePct = total > 0 ? (entry.count / total) * 100 : 0
            return (
              <div key={entry.label}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{entry.label}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {entry.count} ({pct(entry.count, total)})
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-2 rounded-full ${entry.color} transition-all`}
                    style={{ width: `${rolePct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mood overview */}
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Mood Overview
        </h2>
        {stats.moodAvg !== null ? (
          <div className="flex flex-col items-center py-4">
            <span className="text-5xl">{getMoodEmoji(stats.moodAvg)}</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {Math.round(stats.moodAvg * 10) / 10}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">/ 5</span>
            </div>
            <p className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Platform average
            </p>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
              {getMoodLabel(stats.moodAvg)}
            </p>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No mood data available
          </p>
        )}
      </div>

      {/* Engagement funnel */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Engagement Funnel
        </h2>
        <div className="flex items-center justify-between gap-2">
          <FunnelStep
            label="Total Users"
            value={stats.users.total}
            pctLabel="100%"
            width="100%"
          />
          <span className="shrink-0 text-zinc-300 dark:text-zinc-600">→</span>
          <FunnelStep
            label="Onboarded"
            value={stats.users.onboardingCompleted}
            pctLabel={pct(stats.users.onboardingCompleted, total)}
            width={pct(stats.users.onboardingCompleted, total)}
          />
          <span className="shrink-0 text-zinc-300 dark:text-zinc-600">→</span>
          <FunnelStep
            label="Active (30d)"
            value={stats.activity.activeThisMonth}
            pctLabel={pct(stats.activity.activeThisMonth, total)}
            width={pct(stats.activity.activeThisMonth, total)}
          />
        </div>
      </div>
    </PageTransition>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  )
}

function FunnelStep({
  label,
  value,
  pctLabel,
  width,
}: {
  label: string
  value: number
  pctLabel: string
  width: string
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-2 rounded-full bg-zinc-900 transition-all dark:bg-zinc-100"
          style={{ width }}
        />
      </div>
      <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">{value}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">{pctLabel}</span>
    </div>
  )
}
