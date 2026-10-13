'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Trash2 } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import PageTransition from '@/components/PageTransition'
import StreakManager from '@/components/admin/StreakManager'

interface UserDetail {
  _id: string
  name: string
  email: string
  role: 'user' | 'trainer' | 'admin'
  onboardingCompleted?: boolean
  createdAt?: string
  profile?: {
    fitnessGoal?: string
    experienceLevel?: string
    age?: number
    biologicalSex?: string
    equipmentAccess?: string[]
    injuryNotes?: string
    weeklyAvailability?: number
  }
}

interface WorkoutLog {
  date: string
  programId?: string
  completed: boolean
  duration?: number | null
}

interface ActiveProgram {
  programId: string
  programName: string
  completedWorkouts?: number
  totalWorkouts?: number
  status?: string
}

interface WeightEntry {
  date: string
  weight: number
}

interface MoodEntry {
  date: string
  mood: 1 | 2 | 3 | 4 | 5
}

interface UserProgress {
  weightHistory: WeightEntry[]
  moodHistory: MoodEntry[]
  workoutLogs: WorkoutLog[]
  activePrograms: ActiveProgram[]
  streakDays: number
  longestStreak: number
  totalWorkouts: number
  lastActivityDate?: string | null
}

interface MindData {
  chapter: number
  xp: number
  selfDeclaredCount: number
  visionCompleted: boolean
  identityStatement: string | null
  chaptersUnlocked: number
}

const MOOD_EMOJI: Record<number, string> = {
  1: '😞',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😄',
}

const ROLE_COLORS: Record<string, string> = {
  user: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
  trainer: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  admin: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString()
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

export default function AdminUserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params?.userId as string

  const [user, setUser] = useState<UserDetail | null>(null)
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [mind, setMind] = useState<MindData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDark, setIsDark] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [roleUpdating, setRoleUpdating] = useState(false)
  const [mindChapter, setMindChapter] = useState(1)
  const [mindXp, setMindXp] = useState(0)
  const [mindSaving, setMindSaving] = useState(false)

  useEffect(() => {
    setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    async function load() {
      if (!userId) return
      const token = localStorage.getItem('token')
      if (!token) return
      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json() as { user: UserDetail; progress: UserProgress | null; mind: MindData | null }
          setUser(data.user)
          setProgress(data.progress)
          setMind(data.mind)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Sync editable Mind controls when the user's data loads.
  useEffect(() => {
    if (mind) {
      setMindChapter(mind.chapter)
      setMindXp(mind.xp)
    }
  }, [mind])

  async function saveMind() {
    setMindSaving(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/mind-progress', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, chapter: mindChapter, xp: mindXp }),
      })
      if (res.ok) {
        const data = (await res.json()) as { chapter: number; xp: number }
        setMind((prev) => (prev ? { ...prev, chapter: data.chapter, xp: data.xp } : prev))
        setToast({ message: `Set Ch.${data.chapter} · ${data.xp} XP`, type: 'success' })
      } else {
        setToast({ message: 'Failed to update Mind progress', type: 'error' })
      }
    } catch {
      setToast({ message: 'Failed to update Mind progress', type: 'error' })
    } finally {
      setMindSaving(false)
    }
  }

  async function patchUser(body: Record<string, unknown>) {
    const token = localStorage.getItem('token')
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return res
  }

  async function handleRoleChange(role: 'user' | 'trainer' | 'admin') {
    setRoleUpdating(true)
    try {
      const res = await patchUser({ role })
      if (res.ok) {
        const data = await res.json() as { user: UserDetail }
        setUser((prev) => prev ? { ...prev, role: data.user.role } : prev)
        setToast({ message: `Role updated to ${role}`, type: 'success' })
      } else {
        setToast({ message: 'Failed to update role', type: 'error' })
      }
    } finally {
      setRoleUpdating(false)
    }
  }

  async function handleResetOnboarding() {
    const res = await patchUser({ onboardingCompleted: false })
    if (res.ok) {
      setUser((prev) => prev ? { ...prev, onboardingCompleted: false } : prev)
      setToast({ message: 'Onboarding reset', type: 'success' })
    } else {
      setToast({ message: 'Failed to reset onboarding', type: 'error' })
    }
  }

  async function handleDelete() {
    if (!user || deleteInput !== user.email) return
    setDeleteLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        router.push('/dashboard/admin/users')
      } else {
        const data = await res.json() as { error?: string }
        setToast({ message: data.error ?? 'Failed to delete', type: 'error' })
        setShowDeleteConfirm(false)
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  const chartAxis = '#71717a'
  const chartStroke = isDark ? '#e4e4e7' : '#18181b'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">
        User not found
      </div>
    )
  }

  const profileFields: [string, string | number | string[] | undefined][] = [
    ['fitnessGoal', user.profile?.fitnessGoal],
    ['experienceLevel', user.profile?.experienceLevel],
    ['age', user.profile?.age],
    ['biologicalSex', user.profile?.biologicalSex],
    ['equipmentAccess', user.profile?.equipmentAccess?.join(', ')],
    ['weeklyAvailability', user.profile?.weeklyAvailability ? `${user.profile.weeklyAvailability}x/week` : undefined],
    ['injuryNotes', user.profile?.injuryNotes],
  ]

  const weightData = (progress?.weightHistory ?? []).map((e) => ({
    date: new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: e.weight,
  }))

  return (
    <PageTransition>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-zinc-900">
            <h3 className="mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Delete account?
            </h3>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              This cannot be undone. Type{' '}
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {user.email}
              </span>{' '}
              to confirm.
            </p>
            <input
              type="email"
              placeholder={user.email}
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className="mb-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-red-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteInput('')
                }}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteInput !== user.email || deleteLoading}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{user.name}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role]}`}
              >
                {user.role}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Joined {formatDate(user.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile card */}
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Profile</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {profileFields.map(([key, val]) => (
            <div key={key}>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">{formatLabel(key)}</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {val !== undefined && val !== '' ? String(val) : '—'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats row */}
      {progress && (
        <div className="mb-4 flex gap-3">
          {[
            { label: 'Workouts', value: progress.totalWorkouts },
            { label: 'Streak', value: `${progress.streakDays}d` },
            { label: 'Best Streak', value: `${progress.longestStreak}d` },
          ].map((s) => (
            <div
              key={s.label}
              className="flex-1 rounded-2xl border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{s.value}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Active Programs */}
      {progress && progress.activePrograms.length > 0 && (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Active Programs
          </h2>
          <div className="flex flex-col gap-3">
            {progress.activePrograms.map((prog, i) => {
              const total = prog.totalWorkouts ?? 0
              const completed = prog.completedWorkouts ?? 0
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0
              return (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">
                      {prog.programName}
                    </span>
                    {prog.status && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        {prog.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {completed}/{total}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent Workouts */}
      {progress && progress.workoutLogs.length > 0 && (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Recent Workouts
          </h2>
          <div className="flex flex-col gap-2">
            {progress.workoutLogs.slice(0, 5).map((log, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{log.completed ? '✅' : '⬜'}</span>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {formatDate(log.date)}
                  </span>
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {log.duration ? `${log.duration}min` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weight chart */}
      {weightData.length > 0 && (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Weight History
          </h2>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={weightData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#3f3f46' : '#e4e4e7'} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: chartAxis }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: chartAxis }}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#18181b' : '#fff',
                  border: `1px solid ${isDark ? '#3f3f46' : '#e4e4e7'}`,
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: isDark ? '#e4e4e7' : '#18181b',
                }}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke={chartStroke}
                strokeWidth={2}
                dot={{ r: 3, fill: chartStroke }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Mood timeline */}
      {progress && progress.moodHistory.length > 0 && (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Mood Timeline
          </h2>
          <div className="flex flex-wrap gap-2">
            {progress.moodHistory.slice(-10).map((entry, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className="text-xl">{MOOD_EMOJI[entry.mood] ?? '😐'}</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {new Date(entry.date).toLocaleDateString('en-US', {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mind Progression */}
      {mind && (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Mind Progression</h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: 'Chapter', value: `${mind.chapter} of 5` },
              { label: 'XP', value: mind.xp },
              { label: 'Vision', value: mind.visionCompleted ? '✓ Built' : 'Not yet' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-2.5 text-center">
                <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{s.value}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Editable XP / level (admin) */}
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
            <label className="flex flex-col text-xs text-zinc-500 dark:text-zinc-400">
              Chapter
              <select
                value={mindChapter}
                onChange={(e) => setMindChapter(Number(e.target.value))}
                className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {[1, 2, 3, 4, 5].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col text-xs text-zinc-500 dark:text-zinc-400">
              XP
              <input
                type="number"
                min={0}
                value={mindXp}
                onChange={(e) => setMindXp(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <button
              onClick={saveMind}
              disabled={mindSaving}
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              {mindSaving ? 'Saving…' : 'Set'}
            </button>
          </div>
          {mind.identityStatement && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-0.5">Identity Statement</p>
              <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-snug">
                I am the kind of person who {mind.identityStatement}
              </p>
            </div>
          )}
          {mind.selfDeclaredCount > 0 && (
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Self-declared early readiness {mind.selfDeclaredCount}× across their journey
            </p>
          )}
        </div>
      )}

      {/* Streaks — view, credit, repair (audited) */}
      <StreakManager userId={userId} />

      {/* Actions */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Admin Actions
        </h2>

        {/* Role selector */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Role
          </label>
          <select
            value={user.role}
            onChange={(e) => handleRoleChange(e.target.value as 'user' | 'trainer' | 'admin')}
            disabled={roleUpdating}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-100"
          >
            <option value="user">User</option>
            <option value="trainer">Trainer</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {/* Reset onboarding */}
        <button
          onClick={handleResetOnboarding}
          className="mb-3 w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Reset Onboarding
        </button>

        {/* Delete */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          <Trash2 className="h-4 w-4" />
          Delete User
        </button>
      </div>
    </PageTransition>
  )
}
