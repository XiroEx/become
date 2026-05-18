'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ShieldCheck,
  Users,
  Zap,
  Dumbbell,
  Flame,
  BarChart3,
  RefreshCw,
  Bell,
  Send,
} from 'lucide-react'
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
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

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

function getMoodEmoji(avg: number | null): string {
  if (avg === null) return '—'
  const rounded = Math.round(avg)
  return MOOD_EMOJI[rounded] ?? '😐'
}

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

interface ConfirmModalProps {
  onCancel: () => void
  onConfirm: () => void
  loading: boolean
}

function ConfirmModal({ onCancel, onConfirm, loading }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-zinc-900">
        <h3 className="mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Reset all onboarding?
        </h3>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          This will force all users through onboarding again. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'Resetting…' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDark, setIsDark] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const { toast, showToast } = useToast()

  // Push notification tester
  const [notifyEmail, setNotifyEmail] = useState('')
  const [notifyTitle, setNotifyTitle] = useState('')
  const [notifyBody, setNotifyBody] = useState('')
  const [notifyUrl, setNotifyUrl] = useState('/dashboard')
  const [notifySending, setNotifySending] = useState(false)

  const PRESETS = [
    { label: 'Streak at Risk', title: "Don't break your streak!", body: 'Log a workout, mood, or weight to keep it alive.', url: '/dashboard', tag: 'streak-at-risk' },
    { label: 'Workout Ready', title: "Today's workout is ready", body: 'Tap to start your session.', url: '/dashboard/calendar', tag: 'workout-reminder' },
    { label: 'Re-engagement', title: 'We miss you!', body: 'Come back and keep building your best self.', url: '/dashboard', tag: 're-engagement' },
  ] as const

  async function handleSendNotification() {
    if (!notifyTitle.trim() || !notifyBody.trim()) {
      showToast('Title and message are required', 'error')
      return
    }
    setNotifySending(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: notifyEmail.trim() || undefined, title: notifyTitle, bodyText: notifyBody, url: notifyUrl }),
      })
      const data = await res.json() as { sent?: number; subscriptions?: number; errors?: number; error?: string }
      if (!res.ok) {
        showToast(data.error ?? 'Failed to send', 'error')
      } else if (data.sent === 0) {
        showToast('No push subscriptions found for that user', 'neutral')
      } else {
        const target = notifyEmail.trim() || 'all subscribers'
        showToast(`Sent to ${data.sent} subscription${data.sent !== 1 ? 's' : ''} (${target})`, 'success')
      }
    } catch {
      showToast('Request failed', 'error')
    } finally {
      setNotifySending(false)
    }
  }

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

  async function handleResetOnboarding() {
    setResetLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/reset-onboarding', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        showToast('Onboarding reset for all users', 'success')
      } else {
        const data = await res.json() as { error?: string }
        showToast(data.error ?? 'Reset failed', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setResetLoading(false)
      setShowConfirm(false)
    }
  }

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
        Failed to load admin stats.
      </div>
    )
  }

  const onboardingPct =
    stats.users.total > 0
      ? Math.round((stats.users.onboardingCompleted / stats.users.total) * 100)
      : 0

  const moodRounded = stats.moodAvg !== null ? Math.round(stats.moodAvg * 10) / 10 : null

  return (
    <PageTransition>
      <Toast toast={toast} />

      {showConfirm && (
        <ConfirmModal
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleResetOnboarding}
          loading={resetLoading}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 dark:bg-zinc-100">
          <ShieldCheck className="h-5 w-5 text-white dark:text-zinc-900" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Admin</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Platform overview</p>
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard
          label="Total Users"
          value={stats.users.total}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Active This Week"
          value={stats.activity.activeThisWeek}
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          label="Workouts Logged"
          value={stats.activity.totalWorkoutsLogged}
          icon={<Dumbbell className="h-4 w-4" />}
        />
        <StatCard
          label="Top Streak"
          value={`${stats.activity.topStreak}d`}
          icon={<Flame className="h-4 w-4" />}
        />
      </div>

      {/* Onboarding progress */}
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Onboarding Progress
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {stats.users.onboardingCompleted} of {stats.users.total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-2 rounded-full bg-zinc-900 transition-all dark:bg-zinc-100"
            style={{ width: `${onboardingPct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{onboardingPct}% completed</p>
      </div>

      {/* Mood average */}
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Platform avg mood
        </p>
        {moodRounded !== null ? (
          <div className="flex items-center gap-3">
            <span className="text-4xl">{getMoodEmoji(moodRounded)}</span>
            <div>
              <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {moodRounded}
              </span>
              <span className="ml-1 text-sm text-zinc-500 dark:text-zinc-400">/ 5</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No mood data yet</p>
        )}
      </div>

      {/* Workout trend chart */}
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Workouts — last 30 days
          </span>
        </div>
        {stats.workoutsByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={stats.workoutsByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
          <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No workout data for this period
          </p>
        )}
      </div>

      {/* Push notification tester */}
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Test Push Notification</h2>
        </div>

        {/* Presets */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.tag}
              onClick={() => { setNotifyTitle(p.title); setNotifyBody(p.body); setNotifyUrl(p.url) }}
              className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {/* Target */}
          <input
            type="email"
            value={notifyEmail}
            onChange={e => setNotifyEmail(e.target.value)}
            placeholder="User email (leave blank to broadcast to all)"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
          />
          <input
            type="text"
            value={notifyTitle}
            onChange={e => setNotifyTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
          />
          <textarea
            value={notifyBody}
            onChange={e => setNotifyBody(e.target.value)}
            placeholder="Message body"
            rows={2}
            className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
          />
          <input
            type="text"
            value={notifyUrl}
            onChange={e => setNotifyUrl(e.target.value)}
            placeholder="URL (e.g. /dashboard)"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
          />
          <button
            onClick={handleSendNotification}
            disabled={notifySending || !notifyTitle.trim() || !notifyBody.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {notifySending ? 'Sending...' : notifyEmail.trim() ? 'Send to User' : 'Broadcast to All'}
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Quick Actions
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/admin/users"
            className="flex-1 rounded-xl bg-zinc-900 px-4 py-2.5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Manage Users
          </Link>
          <Link
            href="/dashboard/admin/analytics"
            className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-center text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            View Analytics
          </Link>
          <button
            onClick={() => setShowConfirm(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset Onboarding
          </button>
        </div>
      </div>
    </PageTransition>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  )
}
