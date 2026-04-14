'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dumbbell, TrendingUp, Trophy, Clock, Star, ChevronDown, BarChart2, X } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import Link from 'next/link'
import { getToken } from '@/lib/clientAuth'
import type { FitnessGoal } from '@/models/User'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, ReferenceLine,
  LineChart, Line,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExerciseDetail {
  name: string
  slug?: string
  bestSet: { weight: number; reps: number } | null
  volume: number
  isPR: boolean
}

interface DetailedWorkout {
  date: string
  rawDate: string
  programId: string
  day: string
  duration?: number
  notes?: string
  totalVolume: number
  exercises: ExerciseDetail[]
}

interface WeekVolume {
  week: string
  volume: number
  workouts: number
}

interface PB {
  name: string
  weight: number
  reps: number
  date: string
}

interface ProgressData {
  weightData: Array<{ date: string; value: number }>
  stats: {
    streakDays: number
    totalWorkouts: number
    thisWeekWorkouts: number
    goalProgress: number
  }
  longestStreak: number
  pbs: PB[]
  detailedWorkouts: DetailedWorkout[]
  weeklyVolume: WeekVolume[]
  totalVolumeLbs: number
  targetWeightLbs: number | null
  weeklyAvailability: number | null
  fitnessGoal?: FitnessGoal
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M`
  if (lbs >= 1_000) return `${(lbs / 1_000).toFixed(1)}K`
  return lbs.toLocaleString()
}

// ── Volume Chart Tooltip ───────────────────────────────────────────────────────

function VolumeTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: WeekVolume }>; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      <p className="font-semibold text-zinc-900 dark:text-white">Week of {label}</p>
      {d.volume > 0
        ? <p className="text-zinc-500 dark:text-zinc-400">{fmt(d.volume)} lbs lifted</p>
        : <p className="text-zinc-500 dark:text-zinc-400">No tracked weight</p>
      }
      <p className="text-zinc-500 dark:text-zinc-400">{d.workouts} {d.workouts === 1 ? 'workout' : 'workouts'}</p>
    </div>
  )
}

// ── Weight Log Form ────────────────────────────────────────────────────────────

function LogWeightForm({ onLogged }: { onLogged: (w: number) => void }) {
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
      if (res.ok) { setSaved(true); setValue(''); onLogged(w); setTimeout(() => setSaved(false), 3000) }
    } finally { setSaving(false) }
  }

  if (saved) return <p className="text-sm font-medium text-green-600 dark:text-green-400">Weight logged ✓</p>

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="number" inputMode="decimal" step="0.1" min="50" max="700"
        placeholder="lbs" value={value} onChange={(e) => setValue(e.target.value)}
        className="w-28 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
      />
      <button
        type="submit" disabled={saving || !value}
        className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {saving ? '…' : 'Log'}
      </button>
    </form>
  )
}

// ── Workout Row (expandable) ───────────────────────────────────────────────────

function WorkoutRow({ workout, isExpanded, onToggle }: {
  workout: DetailedWorkout
  isExpanded: boolean
  onToggle: () => void
}) {
  const hasPR = workout.exercises.some((e) => e.isPR)

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <Dumbbell className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{workout.day}</p>
            {hasPR && (
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-bold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
                <Star className="h-2.5 w-2.5" /> PR
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{workout.date}</p>
        </div>
        <div className="shrink-0 text-right mr-1">
          {workout.totalVolume > 0 && (
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{fmt(workout.totalVolume)} lbs</p>
          )}
          {workout.duration && (
            <div className="flex items-center justify-end gap-0.5 text-xs text-zinc-400">
              <Clock className="h-3 w-3" />{workout.duration}m
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 dark:border-zinc-800">
              {workout.notes && (
                <div className="px-4 py-2.5 text-xs italic text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                  &ldquo;{workout.notes}&rdquo;
                </div>
              )}
              {workout.exercises.length > 0 ? workout.exercises.map((ex, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-4 py-2.5 odd:bg-zinc-50/60 dark:odd:bg-zinc-800/40"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{ex.name}</p>
                    {ex.isPR && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-yellow-500">PR</span>
                    )}
                  </div>
                  {ex.bestSet ? (
                    <p className="shrink-0 text-sm font-medium text-zinc-900 dark:text-white tabular-nums">
                      {ex.bestSet.weight} × {ex.bestSet.reps}
                    </p>
                  ) : (
                    <p className="shrink-0 text-xs text-zinc-400">bodyweight</p>
                  )}
                </div>
              )) : (
                <p className="px-4 py-3 text-xs text-zinc-400">No tracked sets recorded</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── PR Chart Modal ─────────────────────────────────────────────────────────────

function PRChartModal({ name, points, onClose }: {
  name: string
  points: { date: string; weight: number; reps: number }[]
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">{name}</h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{points.length} logged sessions</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        {points.length < 2 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Need at least 2 sessions to show a trend.</p>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={points} margin={{ left: -20, right: 8 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} interval="preserveStartEnd" className="text-zinc-400 dark:text-zinc-600" />
              <YAxis tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} className="text-zinc-400 dark:text-zinc-600" />
              <Tooltip
                formatter={(v, n) => [`${v} lbs`, 'Best weight']}
                contentStyle={{ fontSize: 11, borderRadius: 10 }}
              />
              <Line type="monotone" dataKey="weight" stroke="#18181b" strokeWidth={2} dot={{ r: 3, fill: '#18181b' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {points.length > 0 && (
          <div className="mt-3 flex justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
            <div className="text-center">
              <p className="text-xs text-zinc-400">First</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">{points[0].weight} lbs</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-zinc-400">Best</p>
              <p className="text-sm font-bold text-green-600 dark:text-green-400">{Math.max(...points.map(p => p.weight))} lbs</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-zinc-400">Sessions</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">{points.length}</p>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Activity Calendar ──────────────────────────────────────────────────────────

function ActivityCalendar({ workouts }: { workouts: DetailedWorkout[] }) {
  const workoutDays = new Set(workouts.map(w => w.rawDate.slice(0, 10)))

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{monthLabel}</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {workouts.filter(w => w.rawDate.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`).length} workouts this month
        </p>
      </div>
      <div className="mb-1.5 grid grid-cols-7 text-center">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <span key={d} className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = day === today.getDate()
          const hasWorkout = workoutDays.has(dateStr)
          return (
            <div
              key={i}
              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                hasWorkout
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : isToday
                  ? 'border border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300'
                  : 'text-zinc-400 dark:text-zinc-600'
              }`}
            >
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ProgressClient() {
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [selectedPR, setSelectedPR] = useState<string | null>(null)

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
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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

  const hasWorkouts = (data?.detailedWorkouts?.length ?? 0) > 0
  const hasVolume = (data?.weeklyVolume ?? []).some(w => w.volume > 0)
  const weeklyGoal = data?.weeklyAvailability ?? 4

  // Build per-exercise history from detailedWorkouts for PR chart
  function getPRHistory(exerciseName: string) {
    if (!data?.detailedWorkouts) return []
    return data.detailedWorkouts
      .flatMap(w => {
        const ex = w.exercises.find(e => e.name === exerciseName)
        if (!ex?.bestSet) return []
        return [{ date: w.date.slice(0, 6), weight: ex.bestSet.weight, reps: ex.bestSet.reps }]
      })
      .reverse()
  }

  return (
    <>
    <PageTransition className="space-y-6">

      {/* ── Header ── */}
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Training Log</h1>
        {data && data.stats.totalWorkouts > 0 ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {data.stats.totalWorkouts} workouts
            {data.totalVolumeLbs > 0 && <> · {fmt(data.totalVolumeLbs)} lbs lifted all-time</>}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Your full training history</p>
        )}
      </header>

      {/* ── Weekly Volume / Activity Chart ── */}
      {(data?.weeklyVolume?.length ?? 0) > 0 && (
        <div id="volume">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
              <BarChart2 className="h-4 w-4 text-zinc-400" />
              {hasVolume ? 'Weekly Volume' : 'Weekly Activity'}
            </h2>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">last 12 weeks</span>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-2 pb-2 pt-4 dark:border-zinc-800 dark:bg-zinc-900">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={data?.weeklyVolume ?? []} barSize={20} margin={{ left: -20, right: 8 }}>
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  className="text-zinc-400 dark:text-zinc-600"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => hasVolume ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)) : String(v)}
                  className="text-zinc-400 dark:text-zinc-600"
                />
                <Tooltip content={<VolumeTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar
                  dataKey={hasVolume ? 'volume' : 'workouts'}
                  radius={[4, 4, 0, 0]}
                  fill="#18181b"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Workout History ── */}
      <div id="workouts">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Workout History</h2>
          {data?.stats.thisWeekWorkouts !== undefined && (
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {data.stats.thisWeekWorkouts}/{weeklyGoal} this week
            </span>
          )}
        </div>

        {hasWorkouts ? (
          <div className="space-y-2">
            {(data?.detailedWorkouts ?? []).map((w, i) => (
              <WorkoutRow
                key={w.rawDate + i}
                workout={w}
                isExpanded={expandedIdx === i}
                onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
            <Dumbbell className="mx-auto mb-3 h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-4">
              No workouts logged yet. Start a program to build your history.
            </p>
            <Link
              href="/dashboard/programming"
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Browse Programs
            </Link>
          </div>
        )}
      </div>

      {/* ── Personal Records ── */}
      {(data?.pbs?.length ?? 0) > 0 && (
        <div id="records">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Personal Records</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(data?.pbs ?? []).slice(0, 12).map((pb) => (
              <button
                key={pb.name}
                onClick={() => setSelectedPR(pb.name)}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{pb.name}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{pb.date} · tap for history</p>
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">{pb.weight} lbs</p>
                  {pb.reps > 0 && <p className="text-xs text-zinc-400">× {pb.reps} reps</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Activity Calendar ── */}
      {hasWorkouts && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-white">This Month</h2>
          <ActivityCalendar workouts={data?.detailedWorkouts ?? []} />
        </div>
      )}

      {/* ── Body Weight ── */}
      <div id="body">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            Body Weight
          </h2>
          {data?.targetWeightLbs && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              Goal: {data.targetWeightLbs} lbs
            </span>
          )}
        </div>

        {(data?.weightData?.length ?? 0) > 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-2 pb-4 pt-4 dark:border-zinc-800 dark:bg-zinc-900">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data?.weightData ?? []} margin={{ left: -20, right: 8 }}>
                <defs>
                  <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#18181b" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#18181b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  tickLine={false} axisLine={false}
                  interval="preserveStartEnd"
                  className="text-zinc-400 dark:text-zinc-600"
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  tickLine={false} axisLine={false}
                  className="text-zinc-400 dark:text-zinc-600"
                />
                <Tooltip
                  formatter={(v) => [`${v} lbs`, 'Weight']}
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                />
                {data?.targetWeightLbs && (
                  <ReferenceLine
                    y={data.targetWeightLbs}
                    stroke="#22c55e"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: `Goal ${data.targetWeightLbs}`, fill: '#22c55e', fontSize: 10, position: 'insideTopRight' }}
                  />
                )}
                <Area
                  type="monotone" dataKey="value"
                  stroke="#18181b" strokeWidth={2}
                  fill="url(#weightGrad)"
                  dot={false} activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-2 px-2">
              <LogWeightForm onLogged={handleWeightLogged} />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">No weight logged yet</p>
            <LogWeightForm onLogged={handleWeightLogged} />
          </div>
        )}
      </div>

    </PageTransition>

      {/* ── PR History Modal ── */}
      <AnimatePresence>
        {selectedPR && (
          <PRChartModal
            name={selectedPR}
            points={getPRHistory(selectedPR)}
            onClose={() => setSelectedPR(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
